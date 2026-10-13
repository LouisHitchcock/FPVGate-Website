"""Package the C5 builds for same-origin hosting. No downloads or flashing.

Usage: python scripts/package_c5_alpha.py [--rx RX_CHECKOUT] [--mk MK_CHECKOUT]

--rx packages the pinned FPVGateC5RX alpha from its PlatformIO builds (run
PlatformIO for both board targets first). --mk packages FPVGateC5MK from the
release/<board>/ files of a checkout at MK_TAG. Either can be given alone; the
other's entries in firmware/c5/manifest.json are kept. See firmware/c5/README.md.
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
MK_TAG = 'v1.2.0'
MK_DEST = ROOT / f'firmware/c5/c5mk-{MK_TAG}'


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
    for key, environment, board in [('rx-xiao', 'xiaoc5', 'xiao'), ('rx-zero', 'waveshare_c5_zero', 'zero')]:
        build_dir = rx / 'firmware/.pio/build' / environment
        # PlatformIO's Arduino OTA boot selector at 0xe000.
        parts = [(0x2000, build_dir / 'bootloader.bin'), (0x8000, build_dir / 'partitions.bin'),
                 (0xe000, rx / 'firmware/boot_app0.bin'), (0x10000, build_dir / 'firmware.bin')]
        entry = dict(project='FPVGateC5RX', commit=RX_SHA, environment=environment,
                     board=board, mode='spi', version='Alpha · 2026-10-08', parts=[])
        builds[key] = add_parts(entry, parts, RX_DEST / key)
    return builds


def package_mk(mk):
    commit = head(mk)
    if commit != head(mk, f'{MK_TAG}^{{commit}}'):
        raise ValueError(f'FPVGateC5MK: checkout is not at {MK_TAG}')
    if subprocess.check_output(['git', '-C', str(mk), 'status', '--porcelain', 'release'], text=True).strip():
        raise ValueError('FPVGateC5MK: release/ has uncommitted changes')
    builds = {}
    for key, environment, board in [('mk-xiao', 'xiaoc5', 'xiao'), ('mk-zero', 'c5zero', 'zero')]:
        release = mk / 'release' / environment
        # Two app slots for updates through FPVGate, so OTA data at 0xf000 and
        # the first app at 0x20000.
        parts = [(0x2000, release / 'bootloader.bin'), (0x8000, release / 'partitions.bin'),
                 (0xf000, release / 'ota_data_initial.bin'), (0x20000, release / 'firmware.bin')]
        image_version = parts[3][1].read_bytes()[48:80].split(b'\0')[0].decode()
        assert image_version == f'{MK_TAG[1:]}+{environment}', f'{release}: image is {image_version}'
        entry = dict(project='FPVGateC5MK', commit=commit, tag=MK_TAG, environment=environment,
                     board=board, mode='uart', usb_timing=True, version=MK_TAG[1:], parts=[])
        builds[key] = add_parts(entry, parts, MK_DEST / key)
    return builds


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--rx', type=Path)
    parser.add_argument('--mk', type=Path)
    args = parser.parse_args()
    if not args.rx and not args.mk:
        parser.error('give --rx, --mk or both')
    builds = json.loads(MANIFEST.read_text(encoding='utf-8'))['builds'] if MANIFEST.exists() else {}
    if args.rx:
        builds.update(package_rx(args.rx.resolve()))
    if args.mk:
        builds.update(package_mk(args.mk.resolve()))
    order = ['rx-xiao', 'rx-zero', 'mk-xiao', 'mk-zero']
    builds = {key: builds[key] for key in order if key in builds}
    MANIFEST.write_text(json.dumps(dict(builds=builds), indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(builds)} C5 builds to {MANIFEST.relative_to(ROOT)}')
