# FPVGate v1.7.0 Release

**Release Date:** March 20, 2026

## Upgrade Notes
- **Config reset recommended** - Config version bumped from 14 to 16
- New board targets: FPVGate AIO V3, XIAO ESP32S3 Plus
- RotorHazard integration requires the companion plugin from `rh-plugin/`

## What's New

### RotorHazard Integration
- Bidirectional race start/stop between FPVGate and RotorHazard
- NTP-style clock synchronization with RTT monitoring
- Automatic lap submission to RH via HTTP POST
- Companion RH plugin included (`rh-plugin/fpvgate/`)
- New "RotorHazard" mode in Sync settings with host IP, node seat, and connection status

### I2S Speaker Audio Announcer (MAX98357A)
- Play race announcements through an attached I2S DAC speaker
- Non-blocking MP3 playback from SD card with 16-slot queue
- Countdown, lap times, race start/stop announcements
- Speaker toggle in settings (only shown on hardware with I2S support)
- Wiring: BCLK=GPIO16, LRC=GPIO17, DOUT=GPIO18 (DevKitC-1)

### New Board Support
- **FPVGate AIO V3** - Upcoming official hardware release coming soon
- **XIAO ESP32S3 Plus** - 16MB flash variant

### Other Changes
- Centralized NUM_LEDS per board in config.h
- Removed ESP32-C3 board definitions
- Updated contributors and documentation

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
- [RH Plugin Setup](https://github.com/LouisHitchcock/FPVGate/blob/main/rh-plugin/README.md)
