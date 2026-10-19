"""Package the C5 builds for same-origin hosting. No downloads or flashing.

Usage: python scripts/package_c5_alpha.py [--rx RX_CHECKOUT] [--mk MK_CHECKOUT]
                                          [--mk-rc MK_RC_CHECKOUT]

--rx packages the pinned FPVGateC5RX alpha from its PlatformIO builds: only the
board targets built in that checkout, so already published RX images are kept
unless rebuilt on purpose. --mk packages FPVGateC5MK from the release/<board>/
files of a checkout at MK_TAG, and --mk-rc the release candidate at MK_RC_TAG,
offered as its own firmware choice beside it. Any can be given alone; the
others' entries in firmware/c5/manifest.json are kept. Boards wired like the Waveshare C5-Zero reuse
its images (ALIASES). See firmware/c5/README.md.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'firmware/c5/manifest.json'
RX_DEST = ROOT / 'firmware/c5/alpha-20261008'
RX_SHA = '572a82b3c2e2a4549c5210ca5aadfb78cdb093f1'
MK_TAG = 'v1.2.3'
MK_RC_TAG = 'v1.2.2-rc.3'
# (manifest key, PlatformIO environment, board)
RX_BUILDS = [('rx-xiao', 'xiaoc5', 'xiao'), ('rx-zero', 'waveshare_c5_zero', 'zero'),
             ('rx-mini', 'waveshare_c5_mini', 'mini')]
# Boards that use another board's images unchanged: the ESP32-C5-DevKitC-1
# layout (Waveshare ESP32-C5-WIFI6-KIT) has the C5-Zero's GPIO4/5/6/10, and the
# Waveshare ESP32-C5-MINI-KIT its GPIO4/5 for the MK link. Neither firmware uses
# any other board pin.
ALIASES = {'rx-devkit': ('rx-zero', 'devkit'), 'mk-devkit': ('mk-zero', 'devkit'), 'mk-mini': ('mk-zero', 'mini'),
           'mkrc-devkit': ('mkrc-zero', 'devkit'), 'mkrc-mini': ('mkrc-zero', 'mini')}
ORDER = ['rx-xiao', 'rx-zero', 'rx-devkit', 'rx-mini', 'mk-xiao', 'mk-zero', 'mk-devkit', 'mk-mini',
         'mkrc-xiao', 'mkrc-zero', 'mkrc-devkit', 'mkrc-mini']


def head(checkout, rev='HEAD'):
    return subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', rev], text=True).strip()


def add_parts(entry, parts, dest):
    for offset, source in parts:
        content = source.read_bytes()
        if source.name in ('bootloader.bin', 'firmware.bin'):
            assert content[0] == 0xe9 and int.from_bytes(content[12:14], 'little') == 23, f'{source}: not ESP32-C5'
        target = dest / source.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        entry['parts'].append(dict(path=target.relative_to(ROOT).as_posix(), offset=offset,
                                   size=len(content), sha256=hashlib.sha256(content).hexdigest()))
    return entry


def package_rx(rx):
    if head(rx) != RX_SHA:
        raise ValueError(f'FPVGateC5RX: expected {RX_SHA}, got {head(rx)}')
    builds = {}
    for key, environment, board in RX_BUILDS:
        build_dir = rx / 'firmware/.pio/build' / environment
        if not (build_dir / 'firmware.bin').exists():
            continue  # not rebuilt here: keep the published image
        # PlatformIO's Arduino OTA boot selector at 0xe000.
        parts = [(0x2000, build_dir / 'bootloader.bin'), (0x8000, build_dir / 'partitions.bin'),
                 (0xe000, rx / 'firmware/boot_app0.bin'), (0x10000, build_dir / 'firmware.bin')]
        entry = dict(project='FPVGateC5RX', commit=RX_SHA, environment=environment,
                     board=board, mode='spi', version='Alpha · 2026-10-08', parts=[])
        builds[key] = add_parts(entry, parts, RX_DEST / key)
    return builds


def package_mk(mk, tag=MK_TAG, prefix='mk'):
    commit = head(mk)
    if commit != head(mk, f'{tag}^{{commit}}'):
        raise ValueError(f'FPVGateC5MK: checkout is not at {tag}')
    if subprocess.check_output(['git', '-C', str(mk), 'status', '--porcelain', 'release'], text=True).strip():
        raise ValueError('FPVGateC5MK: release/ has uncommitted changes')
    builds = {}
    dest = ROOT / f'firmware/c5/c5mk-{tag}'
    for key, environment, board in [(f'{prefix}-xiao', 'xiaoc5', 'xiao'), (f'{prefix}-zero', 'c5zero', 'zero')]:
        release = mk / 'release' / environment
        # Two app slots for updates through FPVGate, so OTA data at 0xf000 and
        # the first app at 0x20000.
        parts = [(0x2000, release / 'bootloader.bin'), (0x8000, release / 'partitions.bin'),
                 (0xf000, release / 'ota_data_initial.bin'), (0x20000, release / 'firmware.bin')]
        image_version = parts[3][1].read_bytes()[48:80].split(b'\0')[0].decode()
        assert image_version == f'{tag[1:]}+{environment}', f'{release}: image is {image_version}'
        entry = dict(project='FPVGateC5MK', commit=commit, tag=tag, environment=environment,
                     board=board, mode='uart', usb_timing=True, version=tag[1:], parts=[])
        builds[key] = add_parts(entry, parts, dest / key)
    return builds


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--rx', type=Path)
    parser.add_argument('--mk', type=Path)
    parser.add_argument('--mk-rc', type=Path)
    args = parser.parse_args()
    if not args.rx and not args.mk and not args.mk_rc:
        parser.error('give --rx, --mk, --mk-rc or several')
    builds = json.loads(MANIFEST.read_text(encoding='utf-8'))['builds'] if MANIFEST.exists() else {}
    if args.rx:
        builds.update(package_rx(args.rx.resolve()))
    if args.mk:
        builds.update(package_mk(args.mk.resolve()))
    if args.mk_rc:
        builds.update(package_mk(args.mk_rc.resolve(), MK_RC_TAG, 'mkrc'))
    for key, (source, board) in ALIASES.items():
        if source in builds:
            builds[key] = dict(builds[source], board=board)
    builds = {key: builds[key] for key in ORDER if key in builds}
    MANIFEST.write_text(json.dumps(dict(builds=builds), indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(builds)} C5 builds to {MANIFEST.relative_to(ROOT)}')
