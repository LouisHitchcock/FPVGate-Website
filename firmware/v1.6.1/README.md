# FPVGate v1.6.1 Release

**Release Date:** February 14, 2026

## Upgrade Notes
- **No config reset required** - Firmware automatically migrates settings
- **Hostname simplified** - All timers now use `fpvgate.local`
- **iOS Safari users** - Full compatibility restored with hostname fixes

## What's New

### Multi-Pilot Race Analysis
- **Current Lap Timer** - Real-time display showing elapsed time since last gate crossing
- **Race Analysis Charts** - Lap Times and Consistency charts for multi-pilot comparison
- **Multi-Pilot Race History** - Races saved with all pilots' data in Master mode

### Race Synchronization Enhancements
- Redesigned sync UI with multi-pilot race view
- TTS format override for sync modes with all pilots announced
- Speech keepalive prevents mobile TTS interruption
- Slave devices remember master hostname

### Mobile Improvements
- Fixed Start Race button hanging on mobile
- Fixed CORS and SSE issues breaking mobile audio announcer
- New horizontal scrollable settings navigation
- Improved race button spacing and sizing

### iOS Safari Compatibility
- Hostname requests redirect to IP for full iOS support
- Simplified hostname to always use `fpvgate.local`
- Removed legacy timerNumber-based hostname system

### Documentation Overhaul
- Comprehensive Race Synchronization guide
- Technical architecture documentation
- Updated hardware pin references for ESP32-S3 DevKit
- Fixed wiring diagram for buzzer connection

### Bug Fixes
- Corrected ESP32-S3 DevKit pin configurations (RGB LED: GPIO5, Buzzer: GPIO6)

## Installation

### Web Flasher (Recommended)
Visit https://fpvgate.xyz/flasher.html

### Manual Flash
```
esptool.py --chip esp32s3 --port [COM_PORT] write_flash \
  0x0 [board]_bootloader.bin \
  0x8000 [board]_partitions.bin \
  0x10000 [board]_firmware.bin \
  0x410000 [board]_filesystem.bin
```

## SD Card Setup
Extract SD_Card.zip to your microSD card root for voice files.

## Documentation
- [User Guide](https://github.com/LouisHitchcock/FPVGate/blob/main/docs/USER_GUIDE.md)
- [Hardware Guide](https://github.com/LouisHitchcock/FPVGate/blob/main/docs/HARDWARE_GUIDE.md)
