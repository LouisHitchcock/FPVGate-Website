# FPVGate v1.6.0 - Website Release Assets

## Release Information
- **Version:** 1.6.0
- **Release Date:** February 9, 2026
- **GitHub Release:** https://github.com/LouisHitchcock/FPVGate/releases/tag/v1.6.0

## Firmware Binaries (14 files)

### ESP32-S3 Boards (7 firmware + 7 filesystem)

**Firmware Files:**
1. `FPVGate_v1.6.0_ESP32S3_firmware.bin` (1.19 MB)
2. `FPVGate_v1.6.0_ESP32S3SuperMini_firmware.bin` (1.19 MB)
3. `FPVGate_v1.6.0_SeeedXIAOESP32S3_firmware.bin` (1.18 MB)
4. `FPVGate_v1.6.0_LilyGOTEnergyS3_firmware.bin` (1.18 MB)
5. `FPVGate_v1.6.0_LicardoTimerS3_firmware.bin` (1.19 MB)
6. `FPVGate_v1.6.0_LicardoTimerC3_firmware.bin` (1.27 MB)
7. `FPVGate_v1.6.0_ESP32C3_firmware.bin` (1.27 MB)

**Filesystem Files:**
1. `FPVGate_v1.6.0_ESP32S3_filesystem.bin` (1.00 MB)
2. `FPVGate_v1.6.0_ESP32S3SuperMini_filesystem.bin` (1.38 MB)
3. `FPVGate_v1.6.0_SeeedXIAOESP32S3_filesystem.bin` (1.00 MB)
4. `FPVGate_v1.6.0_LilyGOTEnergyS3_filesystem.bin` (1.00 MB)
5. `FPVGate_v1.6.0_LicardoTimerS3_filesystem.bin` (1.00 MB)
6. `FPVGate_v1.6.0_LicardoTimerC3_filesystem.bin` (1.38 MB)
7. `FPVGate_v1.6.0_ESP32C3_filesystem.bin` (1.38 MB)

## Audio Assets

**SD Card Contents:**
- `sd_card.zip` (15.3 MB)
- Contains default voice files and SD card structure
- Includes alternative voice packs (Matilda, Rachel, Adam, Antoni)
- Extract to SD card root directory

## Documentation

1. `README.md` - Installation instructions and board selection guide
2. `CHANGELOG.md` - Detailed changelog with all improvements and fixes

## Key Features to Highlight on Website

### New in v1.6.0: Race Synchronization System
- Multi-timer synchronization for distributed race timing setups
- WebSocket-based real-time sync between master and slave timers
- Master/Slave mode indicators in the UI header
- Synchronized race start, stop, and lap events

### Audio Controls
- Beep volume control slider in settings
- Independent browser audio volume adjustment

## Website Changelog Summary

```
# FPVGate v1.6.0 (February 9, 2026)

## New Features
- Race Synchronization System for multi-timer setups
- Master/Slave mode indicators in UI header
- Beep volume control slider in settings

## Improvements
- Simplified race sync architecture
- Enhanced status indicators for connection state

[View Full Changelog](https://github.com/LouisHitchcock/FPVGate/releases/tag/v1.6.0)
```

## Migration Notes from v1.5.7

- Fully backwards compatible
- No breaking changes
