"""Package the pinned C5 builds for same-origin hosting. No downloads or flashing.

Usage: python scripts/package_c5_alpha.py RX_CHECKOUT MK_CHECKOUT
Run PlatformIO for both board targets in each checkout first. See firmware/c5/README.md.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'firmware/c5/alpha-20261008'
RX_SHA = '572a82b3c2e2a4549c5210ca5aadfb78cdb093f1'
MK_SHA = 'c8a02c70beb14e7f417cb99d82da0f0b9aaa2803'


def package(rx, mk):
    builds = {}
    for key, checkout, project, commit, subdir, environment, board, mode in [
        ('rx-xiao', rx, 'FPVGateC5RX', RX_SHA, 'firmware', 'xiaoc5', 'xiao', 'spi'),
        ('rx-zero', rx, 'FPVGateC5RX', RX_SHA, 'firmware', 'waveshare_c5_zero', 'zero', 'spi'),
        ('mk-xiao', mk, 'FPVGateC5MK', MK_SHA, 'multipilot', 'xiaoc5', 'xiao', 'uart'),
        ('mk-zero', mk, 'FPVGateC5MK', MK_SHA, 'multipilot', 'c5zero', 'zero', 'uart'),
    ]:
        actual = subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], text=True).strip()
        if actual != commit:
            raise ValueError(f'{project}: expected {commit}, got {actual}')
        build_dir = checkout / subdir / '.pio/build' / environment
        parts = [(0x2000, build_dir / 'bootloader.bin'),
                 (0x8000, build_dir / 'partitions.bin'),
                 (0x10000, build_dir / 'firmware.bin')]
        if mode == 'uart':
            args = json.loads((build_dir / 'flasher_args.json').read_text())
            assert int(args['bootloader']['offset'], 16) == 0x2000
            assert int(args['partition-table']['offset'], 16) == 0x8000
            assert int(args['app']['offset'], 16) == 0x10000
        else:
            # PlatformIO's Arduino OTA boot selector at 0xe000.
            parts.insert(2, (0xe000, rx / 'firmware/boot_app0.bin'))
        entry = dict(project=project, commit=commit, environment=environment,
                     board=board, mode=mode, version='Alpha · 2026-10-08', parts=[])
        for offset, source in parts:
            content = source.read_bytes()
            if source.name in ('bootloader.bin', 'firmware.bin'):
                assert content[0] == 0xe9 and int.from_bytes(content[12:14], 'little') == 23, f'{source}: not ESP32-C5'
            target = DEST / key / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            entry['parts'].append(dict(path=target.relative_to(ROOT).as_posix(), offset=offset,
                                       size=len(content), sha256=hashlib.sha256(content).hexdigest()))
        builds[key] = entry
    (DEST / 'manifest.json').write_text(json.dumps(dict(builds=builds), indent=2) + '\n', encoding='utf-8')
    print(f'Packaged {len(builds)} C5 builds into {DEST}')


if __name__ == '__main__':
    package(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
