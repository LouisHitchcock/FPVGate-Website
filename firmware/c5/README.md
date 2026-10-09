# C5 radio alpha — staged 2026-10-08

These are locally compiled, pinned alpha snapshots, **not published upstream releases**.
Neither upstream repository had GitHub release assets when this feature was prepared.
No board was physically flashed during website validation.

| Selection | Source | Environment | Pins on C5 |
|---|---|---|---|
| XIAO Single Pilot / SPI | FPVGateC5RX `572a82b3c2e2a4549c5210ca5aadfb78cdb093f1` | `xiaoc5` (adaptation below) | CLK 23 / D4, DATA 24 / D5, SEL 1 / D0, RSSI 10 / D10 |
| Waveshare Single Pilot / SPI | same RX commit | `waveshare_c5_zero` | CLK 4, DATA 5, SEL 6, RSSI 10 |
| XIAO Multi Pilot / UART | FPVGateC5MK `c8a02c70beb14e7f417cb99d82da0f0b9aaa2803` | `xiaoc5` | RX 23 / D4, TX 24 / D5 |
| Waveshare Multi Pilot / UART | same MK commit | `c5zero` | RX 4, TX 5 |

## Sources and build changes

- [FPVGateC5RX source](https://github.com/LouisHitchcock/FPVGateC5RX/tree/572a82b3c2e2a4549c5210ca5aadfb78cdb093f1)
- [FPVGateC5MK source](https://github.com/LouisHitchcock/FPVGateC5MK/tree/c8a02c70beb14e7f417cb99d82da0f0b9aaa2803)
- [Seeed pin definitions](https://github.com/espressif/arduino-esp32/blob/master/variants/XIAO_ESP32C5/pins_arduino.h)

Both were built in detached worktrees. Existing development checkouts were not edited.
No firmware C++ was changed. RX has no upstream XIAO target; the website build adds
this target to `firmware/platformio.ini`:

```ini
[env:xiaoc5]
build_flags =
    ${env.build_flags}
    -DPIN_RX5808_CLK=23 -DPIN_RX5808_DATA=24 -DPIN_RX5808_SEL=1 -DPIN_RSSI_SDM=10
```

This is an untested-on-hardware XIAO SPI pin adaptation, explicitly labelled in the UI.
The selected GPIOs are exposed on XIAO headers and avoid strapping, USB and console pins.
Use the website's wiring table for this build, not the upstream Waveshare pin table.

Build environment: pioarduino Espressif32 **55.3.35**, PlatformIO **6.1.18**,
RISC-V toolchain **14.2.0+20251107**, esptool **5.1.0**.
RX: Arduino **3.3.5**, Arduino libraries **5.5.0+sha.9bb7aa84fe**.
MK: ESP-IDF **5.5.1**. Both MK SRAM boundary checks passed.
The local toolchain required `platform_packages = toolchain-riscv32-esp @ symlink://...`
pointing at the installed 14.2.0 toolchain, as documented in the existing MK checkout's
machine-local configuration. This changes tool discovery, not firmware code.

For rebuilding, use the above platform version rather than allowing the upstream
`stable` URL to resolve to a newer toolchain. Build both targets:

```text
pio run -d RX_CHECKOUT/firmware -e waveshare_c5_zero -e xiaoc5
pio run -d MK_CHECKOUT/multipilot -e c5zero -e xiaoc5
```

Copy Arduino 3.3.5's `tools/partitions/boot_app0.bin` into
`RX_CHECKOUT/firmware/boot_app0.bin`, then run:

```text
python scripts/package_c5_alpha.py RX_CHECKOUT MK_CHECKOUT
node scripts/test_c5_flasher.mjs
```

The packager checks source commits, ESP32-C5 image headers and MK-generated flash
arguments. The manifest records the size and SHA-256 of every binary.

## Flash layout

| Image | Offset | SPI / RX | UART / MK |
|---|---|---|---|
| Bootloader | `0x2000` | yes | yes |
| Partitions | `0x8000` | yes | yes |
| OTA boot selector | `0xe000` | yes | no |
| Application | `0x10000` | yes | yes |

RX offsets come from Arduino 3.3.5's `tools/pioarduino-build.py` and the PlatformIO
board defaults. MK offsets come from each build's `flasher_args.json`. The C5
bootloader is at **0x2000**, unlike the S3 flasher's 0x0. Flash header mode/frequency/
size are kept as compiled. No filesystem image is required.

## Website and verification

`c5-radio.js`, `c5-flasher.js` and `c5-radio.css` are isolated from the timer flasher.
Firmware is hosted locally; SHA-256 is checked before opening the transport.
The chip must identify as ESP32-C5 before erase/write; written images are MD5-verified
using esptool-js. Mode switching is disabled while either flasher is busy.

Pinned C5-only dependencies live in `vendor/c5`: esptool-js 0.7.0 (Apache-2.0) and
SparkMD5 3.0.2 (MIT), with their licences. The existing timer's 0.4.1 import is unchanged.
Upstream change history: https://github.com/espressif/esptool-js/blob/v0.7.0/CHANGELOG.md

The browser test requires an external Playwright installation; the site itself has
no package manager or build step. Set `PLAYWRIGHT_MODULE` to that installation and,
if needed, `CHROMIUM_PATH` to the browser executable. With the server on port 8000:

```text
node scripts/test_c5_browser.cjs
```

Before deploying, bench-test all four combinations: chip detection, erase, verified
write, power-cycle boot, SPI tuning/RSSI and UART pilot readings. In particular, the
new XIAO SPI mapping has not been exercised on hardware. Deployment remains manual
for this staged work: nothing has been pushed or published.

Validation completed on 2026-10-08: all four builds compile; all packaged SHA-256,
image-region overlap and application partition-fit checks pass; mocked transport
tests pass. Following the Uint8Array bug fix, all four builds also pass the actual
esptool-js 0.7.0 writeFlash method, compression and MD5 verification with simulated
serial operations. Firmware and checksum callbacks now retain byte-array data;
progress accounts for compressed transfer sizes. Chromium tests pass for all four choices, wiring, real HTTP binary
downloads, vendor module imports, cancellation, mode/state preservation, busy
locking, failed catalog retry, and dark/light/mobile layouts. The merged 3D viewer
renders. Existing firmware validation checked 176 files with no errors (26 warnings
for incomplete older board folders and the pre-existing v1.8.0-test directory).

Local preview: http://127.0.0.1:8000/flasher.html#c5-radio
and http://127.0.0.1:8000/print-files.html.

Firmware project licences are included alongside this document. See the pinned
upstream licensing/provenance documents for third-party framework licensing.
