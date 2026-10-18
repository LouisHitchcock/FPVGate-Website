# C5 radio firmware

All twelve selections are listed in `manifest.json`, which `c5-radio.js` loads.

The single-pilot SPI builds (FPVGateC5RX) are locally compiled, pinned alpha
snapshots of the same commit, **not published upstream releases**. They are in
`alpha-20261008/`; the Mini build was added on 2026-10-15.

The multi-pilot UART/USB builds (FPVGateC5MK) are the published
[v1.2.1 release](https://github.com/LouisHitchcock/FPVGateC5MK/releases/tag/v1.2.1),
copied unchanged from that tag's `release/<board>/` folders into `c5mk-v1.2.1/`.
(`c5mk-v1.1.0/` and `c5mk-v1.2.0/` are earlier releases, no longer listed.)
The [v1.2.2-rc.1 release candidate](https://github.com/LouisHitchcock/FPVGateC5MK/releases/tag/v1.2.2-rc.1)
(`4541938`) is offered beside it as its own firmware choice for every board
(`mkrc-*` keys), copied the same way into `c5mk-v1.2.2-rc.1/`. It changes only
direct USB timing with RotorHazard; the UART link is as in 1.2.1.
From 1.1.0 the C5 has two app slots, and FPVGate 1.9.0-Multi-Alpha-3 and later can
update it over the UART link. A C5 flashed with the earlier 2026-10-08 MK alpha
must be reflashed here once before the gate can update it.

The same MK images also expose eight native RH serial receivers over USB,
without an S3 or plugin. Configure the serial port in RH once and restart it.
Waveshare USB is tested; physical XIAO USB validation is pending. See the
[USB setup guide](https://github.com/LouisHitchcock/FPVGateC5MK/blob/v1.2.1/docs/USB_ROTORHAZARD.md).

| Selection | Source | Environment | Pins on C5 |
|---|---|---|---|
| XIAO Single Pilot / SPI | FPVGateC5RX `572a82b3c2e2a4549c5210ca5aadfb78cdb093f1` | `xiaoc5` (adaptation below) | CLK 23 / D4, DATA 24 / D5, SEL 1 / D0, RSSI 10 / D10 |
| Waveshare C5-Zero Single Pilot / SPI | same RX commit | `waveshare_c5_zero` | CLK 4, DATA 5, SEL 6, RSSI 10 |
| Waveshare C5-WIFI6-KIT / C5-DevKitC-1 Single Pilot / SPI | the C5-Zero image | `waveshare_c5_zero` | CLK 4, DATA 5, SEL 6, RSSI 10 |
| Waveshare C5-MINI-KIT Single Pilot / SPI | same RX commit | `waveshare_c5_mini` (adaptation below) | CLK 4, DATA 5, SEL 1, RSSI 10 |
| XIAO Multi Pilot / UART or USB | FPVGateC5MK `v1.2.1` (`8a9245a`) | `xiaoc5` | RX 23 / D4, TX 24 / D5 (UART only) |
| Waveshare C5-Zero Multi Pilot / UART or USB | same MK release | `c5zero` | RX 4, TX 5 (UART only) |
| Waveshare C5-WIFI6-KIT / C5-DevKitC-1 Multi Pilot | the C5-Zero image | `c5zero` | RX 4, TX 5 (UART only) |
| Waveshare C5-MINI-KIT Multi Pilot | the C5-Zero image | `c5zero` | RX 4, TX 5 (UART only) |

The WIFI6-KIT and MINI-KIT selections reuse the C5-Zero images (`ALIASES` in the
packager): the ESP32-C5-DevKitC-1 layout, which Waveshare's C5-WIFI6-KIT follows,
has GPIO4, 5, 6 and 10 on its headers, and the C5-MINI-KIT has GPIO4, 5 and 10.
Neither firmware drives any other board pin. These boards report themselves as the
C5-Zero, so FPVGate updates them with the C5-Zero image. The MINI-KIT has no GPIO6
on its headers, so its SPI build moves SEL to GPIO1. None of the three has been
tested on hardware yet. Some MINI-KITs carry ESP32-C5 revision v1.2, which esptool
5.1.0's flasher stub mishandled on the bench; if web flashing fails, flash those
with `esptool --no-stub`.

To package a later MK release, check out its tag, set `MK_TAG` in
`scripts/package_c5_alpha.py`, and run it with `--mk MK_CHECKOUT` only. For a
release candidate, set `MK_RC_TAG` and use `--mk-rc MK_CHECKOUT`. The script
checks the checkout is at the tag and each image's version and board.

## Sources and build changes

- [FPVGateC5RX source](https://github.com/LouisHitchcock/FPVGateC5RX/tree/572a82b3c2e2a4549c5210ca5aadfb78cdb093f1)
- [FPVGateC5MK v1.2.1 release](https://github.com/LouisHitchcock/FPVGateC5MK/releases/tag/v1.2.1)
- [Seeed pin definitions](https://github.com/espressif/arduino-esp32/blob/master/variants/XIAO_ESP32C5/pins_arduino.h)
- [Espressif ESP32-C5-DevKitC-1 header pins](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c5/esp32-c5-devkitc-1/user_guide.html)
- [Waveshare ESP32-C5-WIFI6-KIT](https://docs.waveshare.com/ESP32-C5-WIFI6-KIT) and [ESP32-C5-MINI-KIT](https://docs.waveshare.com/ESP32-C5-MINI-KIT) pinouts

The RX builds were made in detached worktrees. Existing development checkouts were not edited.
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

For the Waveshare C5-MINI-KIT, built on 2026-10-15 from the same commit, it adds:

```ini
[env:waveshare_c5_mini]
build_flags =
    ${env.build_flags}
    -DPIN_RX5808_CLK=4 -DPIN_RX5808_DATA=5 -DPIN_RX5808_SEL=1 -DPIN_RSSI_SDM=10
```

GPIO1 is on the Mini's headers and isn't a strapping, USB or console pin. That
build pinned the platform URL to 55.03.35 and took `boot_app0.bin` from the
installed Arduino framework, byte-identical to the one already published.

Build environment: pioarduino Espressif32 **55.3.35**, PlatformIO **6.1.18**,
RISC-V toolchain **14.2.0+20251107**, esptool **5.1.0**.
RX: Arduino **3.3.5**, Arduino libraries **5.5.0+sha.9bb7aa84fe**.
The local toolchain required `platform_packages = toolchain-riscv32-esp @ symlink://...`
pointing at the installed 14.2.0 toolchain. This changes tool discovery, not
firmware code.

For rebuilding RX, use the above platform version rather than allowing the
upstream `stable` URL to resolve to a newer toolchain:

```text
pio run -d RX_CHECKOUT/firmware -e waveshare_c5_zero -e xiaoc5
```

Copy Arduino 3.3.5's `tools/partitions/boot_app0.bin` into
`RX_CHECKOUT/firmware/boot_app0.bin`, then run:

```text
python scripts/package_c5_alpha.py --rx RX_CHECKOUT
node scripts/test_c5_flasher.mjs
```

The packager checks source commits and ESP32-C5 image headers, and for MK the
release tag and each image's version and board. The manifest records the size and
SHA-256 of every binary. The flasher test also checks that each MK partition table
has two app slots and its OTA data where the flasher writes it.

## Flash layout

| Image | SPI / RX | UART / MK 1.1.0 and later |
|---|---|---|
| Bootloader | `0x2000` | `0x2000` |
| Partitions | `0x8000` | `0x8000` |
| OTA boot selector / OTA data | `0xe000` | `0xf000` |
| Application | `0x10000` | `0x20000` (first of two slots) |

RX offsets come from Arduino 3.3.5's `tools/pioarduino-build.py` and the PlatformIO
board defaults. MK offsets come from its partition table and the release's
`release/README.md`. The C5
bootloader is at **0x2000**, unlike the S3 flasher's 0x0. Flash header mode/frequency/
size are kept as compiled. No filesystem image is required.

## Website and verification

`c5-radio.js`, `c5-flasher.js` and `c5-radio.css` are isolated from the timer flasher.
Firmware is hosted locally; SHA-256 is checked before opening the transport.
The chip must identify as ESP32-C5 before erase/write; written images are MD5-verified
using esptool-js. The C5 page at `c5.html#flasher` hosts its own controls and wiring
guide; `flasher.html` hosts the S3 timer flasher. C5 controls are locked during
flashing, and a page-leave warning protects an active C5 operation. Old
`flasher.html#c5-radio` bookmarks redirect to the C5 page.

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

Local preview: http://127.0.0.1:8000/c5.html#flasher
and http://127.0.0.1:8000/print-files.html.

Firmware project licences are included alongside this document. See the pinned
upstream licensing/provenance documents for third-party framework licensing.
