# FPVGate v1.8.3 Release Notes

October 7, 2026

This release adds USB networking, updates from the settings screen and a Visual Marshal for editing laps. It also improves web UI loading times.

v1.8.3 is the first stable release in the 1.8 series, following 1.8.0-rc-2 and 1.8.0-rc-3. Versions 1.8.0, 1.8.1 and 1.8.2 were not released.

## Upgrading from 1.7.x

**Upgrading from 1.7.x requires a full wired flash. Over-the-air will not work for this upgrade.**

The partition layout on 8MB boards has changed. An over-the-air update leaves the old 1MB filesystem partition in place, which is too small for this release.

Use the [web flasher](https://fpvgate.xyz/flasher.html), or flash all four files over USB using the instructions below. After this upgrade, you can update over the air. Gates running a 1.8.0 release candidate already have the new partition layout and can update over the air.

Race history on the SD card is kept. You do not need to change the SD card files.

## What's New in v1.8.3

### USB Networking

Connect the gate to your computer over USB-C and open `http://192.168.7.1` to use the web UI without WiFi. This works on all supported boards with Windows or Linux. macOS is not supported. USB networking replaces the USB serial (CDC) connection.

### Over-the-Air Updates

The settings screen can install firmware and filesystem files from your computer or download a release from fpvgate.xyz. There is also an option to show pre-release builds. Firmware is installed before the filesystem.

### Visual Marshal

Open a race from history to review its recorded RSSI graph and correct lap times. Drag a crossing marker to move it, click near a peak to add a missed crossing, or adjust the Enter/Exit thresholds and recalculate the laps.

The race details and graph are now on the same screen. You can still enter laps manually for races without a recorded RSSI trace.

### Faster Web UI

Compressed web assets reduce the initial download from 788KB to about 190KB. In tests on the FPVGate AIO and ESP32-S3 DevKitC-1, a full page load took about 2 seconds instead of 7. Loading failures with several browser connections have been fixed, and the saved theme is applied before the page appears.

### Bigger Filesystem

On 8MB boards, the filesystem has grown from 1MB to 3.875MB. The new partition layout also reserves space for crash dumps.

### System Information Endpoint

`/api/system/info` reports the board, chip, partition layout and application slot sizes for update tools.

## Fixes

- Race history now shows the newest races first.
- Battery monitoring on the Seeed XIAO ESP32S3 now reads D0 (GPIO1). The previous pin had no ADC channel and could cause false low-battery alerts. This board needs an external 100K/100K voltage divider from the battery to D0.
- Fixed loss of internet access when connected over USB by removing the gate's DNS advertisement.
- Moved Marshal SD card writes out of the lap loop and reduced memory use when reading RSSI data.

## Removed

- USB serial (CDC), replaced by USB networking.
- Unused I2S audio code on the DevKitC-1, saving 129KB of flash.
- Unused mode-switch pin definitions that conflicted with battery sensing on the AIO and XIAO.

## Supported Hardware

| Board | Flash | Firmware environment |
|---|---|---|
| FPVGate AIO V3 (XIAO ESP32S3) | 8MB | `FPVGateAIO` |
| FPVGate Solo (XIAO ESP32S3) | 8MB | `FPVGateSolo` |
| Seeed Studio XIAO ESP32S3 | 8MB | `SeeedXIAOESP32S3` |
| ESP32-S3 DevKitC-1 | 8MB | `ESP32S3` |
| XIAO ESP32S3 Plus | 16MB | `XIAOS3Plus` |

## Installation

### Web Flasher (Recommended)

Open the [web flasher](https://fpvgate.xyz/flasher.html) and select your board and v1.8.3.

### Command Line

Download your board's four binaries and its `FLASH_INSTRUCTIONS.txt` from the release assets, then flash all four in one command:

```bash
# 8MB boards (AIO, Solo, Seeed XIAO ESP32S3, DevKitC-1)
esptool.py --chip esp32s3 --port COM3 --baud 460800 write_flash -z \
  0x0      <BOARD>-bootloader.bin \
  0x8000   <BOARD>-partitions.bin \
  0x10000  <BOARD>-firmware.bin \
  0x410000 <BOARD>-littlefs.bin

# XIAO ESP32S3 Plus (16MB)
esptool.py --chip esp32s3 --port COM3 --baud 460800 write_flash -z \
  0x0      XIAOS3Plus-bootloader.bin \
  0x8000   XIAOS3Plus-partitions.bin \
  0x10000  XIAOS3Plus-firmware.bin \
  0x610000 XIAOS3Plus-littlefs.bin
```

### SD Card

Existing cards need no changes. For a new card, download `SD_Card.rar` from the [v1.7.3 release](https://github.com/LouisHitchcock/FPVGate/releases/tag/v1.7.3) and extract it to the root of a FAT32 card (max 32 GB).

## Links

- Website: [https://fpvgate.xyz](https://fpvgate.xyz)
- Docs: [https://github.com/LouisHitchcock/FPVGate/tree/main/docs](https://github.com/LouisHitchcock/FPVGate/tree/main/docs)
- USB networking: [docs/USB_NETWORKING.md](https://github.com/LouisHitchcock/FPVGate/blob/main/docs/USB_NETWORKING.md)
- Issues: [https://github.com/LouisHitchcock/FPVGate/issues](https://github.com/LouisHitchcock/FPVGate/issues)
- Discord: [https://discord.com/invite/XwammuWCCj](https://discord.com/invite/XwammuWCCj)
