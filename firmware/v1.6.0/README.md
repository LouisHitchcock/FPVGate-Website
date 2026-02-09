# FPVGate v1.6.0 Release Binaries

## Installation Instructions

### Firmware Files
The firmware files (`*_firmware.bin`) contain the main program code.

### Filesystem Files
The filesystem files (`*_filesystem.bin`) contain the web interface and configuration.

### Board Selection
Choose the binary that matches your hardware:
- **ESP32S3** - Generic ESP32-S3 boards
- **ESP32S3SuperMini** - ESP32-S3 Super Mini boards
- **SeeedXIAOESP32S3** - Seeed Studio XIAO ESP32S3
- **LilyGOTEnergyS3** - LilyGO T-Energy S3
- **LicardoTimerS3** - Licardo Timer S3
- **LicardoTimerC3** - Licardo Timer C3
- **ESP32C3** - Generic ESP32-C3 boards

### Upload Methods

#### Method 1: PlatformIO (Recommended)
```bash
# Upload firmware
pio run -e [board_name] -t upload --upload-port [COM_PORT]

# Upload filesystem
pio run -e [board_name] -t uploadfs --upload-port [COM_PORT]
```

#### Method 2: ESP Flash Download Tool
1. Download ESP Flash Download Tool from Espressif
2. Select your chip type (ESP32-S3 or ESP32-C3)
3. Add binaries:
   - Firmware: `0x10000` - `FPVGate_v1.6.0_[board]_firmware.bin`
   - Filesystem: `0x410000` - `FPVGate_v1.6.0_[board]_filesystem.bin`
4. Click "Start" to flash

#### Method 3: esptool.py
```bash
# Erase flash first (recommended)
esptool.py --chip esp32s3 --port [COM_PORT] erase_flash

# Flash firmware and filesystem
esptool.py --chip esp32s3 --port [COM_PORT] --baud 460800 write_flash 0x10000 FPVGate_v1.6.0_[board]_firmware.bin 0x410000 FPVGate_v1.6.0_[board]_filesystem.bin
```

## Audio Files (Separate Download)

### Default Voice (Sarah)
- Included in the firmware filesystem
- No additional download required

### Alternative Voices
- `sounds_matilda` - Matilda voice (ElevenLabs - Warm Female)
- `sounds_rachel` - Rachel voice
- `sounds_adam` - Adam voice
- `sounds_antoni` - Antoni voice

Download alternative voice files separately and copy to SD card root directory, then select in FPVGate settings.

## What's New in v1.6.0

See `CHANGELOG.md` for full details.

### Highlights
- Race Synchronization System for multi-timer setups
- Master/Slave mode indicators in UI header
- Beep volume control slider
- Simplified sync architecture for better reliability

## Support

- **Documentation:** https://fpvgate.com/docs
- **GitHub:** https://github.com/LouisHitchcock/FPVGate
- **Issues:** https://github.com/LouisHitchcock/FPVGate/issues

---

**Version:** v1.6.0
**Release Date:** February 9, 2026
