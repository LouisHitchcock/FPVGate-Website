# FPVGate v1.5.4 Release Notes

**Release Date:** January 23, 2026  
**Type:** Minor - New board support and docs updates

## What's New in v1.5.4

### New: Seeed Studio XIAO ESP32S3 (Official)
- Added official firmware target `SeeedXIAOESP32S3` (8MB)
- Pin map: RSSI D2/GPIO3, DATA D4/GPIO5, SELECT D5/GPIO6, CLOCK D3/GPIO4, SD CS D1/GPIO2, SCK D8/GPIO7, MOSI D9/GPIO8, MISO D10/GPIO9, Mode D0/GPIO1, Buzzer D4/GPIO5, NeoPixel D7/GPIO44
- RGB LED support enabled (FastLED) with default NeoPixel on D7
- Docs: Added wiring diagrams and updated website/flasher to include XIAO S3

### Deprecated/Removed
- ESP32-C3 is no longer supported (removed from docs and website)

## Supported Hardware
- ESP32-S3 DevKitC-1 (8MB) — Recommended
- ESP32-S3 Super Mini (4MB) — Supported
- Seeed Studio XIAO ESP32S3 (8MB) — Supported
- LilyGO T-Energy S3 — Advanced (via source build)

## Installation

### Web Flasher (Recommended)
Use https://fpvgate.xyz/flasher.html and select your board and version.

### Command Line
Download board-specific binaries from the release assets and flash with esptool:
```bash
# ESP32-S3 DevKitC-1 (8MB)
esptool.py --chip esp32s3 --port COM3 write_flash -z \
  0x0 ESP32S3-8MB-bootloader.bin \
  0x8000 ESP32S3-8MB-partitions.bin \
  0x10000 ESP32S3-8MB-firmware.bin \
  0x410000 ESP32S3-8MB-littlefs.bin

# ESP32-S3 Super Mini (4MB)
esptool.py --chip esp32s3 --port COM3 write_flash -z \
  0x0 ESP32S3-SuperMini-4MB-bootloader.bin \
  0x8000 ESP32S3-SuperMini-4MB-partitions.bin \
  0x10000 ESP32S3-SuperMini-4MB-firmware.bin \
  0x290000 ESP32S3-SuperMini-4MB-littlefs.bin

# Seeed Studio XIAO ESP32S3 (8MB)
esptool.py --chip esp32s3 --port COM3 write_flash -z \
  0x0 SeeedXIAO-ESP32S3-bootloader.bin \
  0x8000 SeeedXIAO-ESP32S3-partitions.bin \
  0x10000 SeeedXIAO-ESP32S3-firmware.bin \
  0x410000 SeeedXIAO-ESP32S3-littlefs.bin
```

## Notes
- Settings are preserved across upgrades.
- If you use the web flasher, it automatically writes all parts at the correct offsets.

## Links
- Website: https://fpvgate.xyz
- Docs: https://github.com/LouisHitchcock/FPVGate/tree/main/docs
- Issues: https://github.com/LouisHitchcock/FPVGate/issues
