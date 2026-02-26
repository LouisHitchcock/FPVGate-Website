# FPVGate v1.6.2 Release

**Release Date:** February 26, 2026

## Upgrade Notes
- **No config reset required** - Firmware automatically migrates settings
- Waveshare ESP32-S3-LCD-2 board now available under Expert Mode in the web flasher

## What's New

### Waveshare ESP32-S3-LCD-2 Support
- New board target with 16MB flash (Expert Mode only)
- Full wiring documentation included

### Calibration Wizard - Ignore Regions
- Mark noisy RSSI sections to exclude from threshold calculation
- Visual overlay for selecting ignore regions on the calibration chart
- Automatic threshold recalculation with warning flow
- Manual peak-marking fallback and re-record option

### Novacore Receiver Filter Tuning
- Per-filter toggles: Kalman, Median, Moving Average, EMA, Step Limiter
- Tuning sliders for Kalman Q, EMA Alpha, and Step Max
- Dynamic filter reconfiguration when switching receiver types

### Debug RSSI Overlay
- Real-time RSSI debug chart in diagnostics
- Persistent debug mode toggle

### Cleanup
- Removed QUICKSTART.md, LicardoTimer target, and unused release workflow
- Hardware docs updated: Seeed XIAO recommended, Super Mini not recommended

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
