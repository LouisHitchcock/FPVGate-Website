# FPVGate v1.5.7 - Release Notes

**Release Date:** February 7, 2026

## On Screen Displays
- Added OSD section in settings
- Quick actions to open and copy URLs for horizontal and vertical OSD
- Added OBS browser source setup guidance

## Theme Improvements
- Added custom theme with configurable colors
- Grouped preset themes for easier selection

## Other Changes
- Updated firmware update entry to open the web flasher
- Removed RSSI detection UI block from the settings menu

## Installation Notes

### Firmware Upload
This release includes firmware and filesystem images for supported boards.

### Upload Methods
#### PlatformIO
```bash
pio run -e [board_name] -t upload --upload-port [COM_PORT]
pio run -e [board_name] -t uploadfs --upload-port [COM_PORT]
```

#### ESP Flash Download Tool
- Firmware: `0x10000` - `FPVGate_v1.5.7_[board]_firmware.bin`
- Filesystem: `0x410000` - `FPVGate_v1.5.7_[board]_filesystem.bin`

#### esptool.py
```bash
esptool.py --chip esp32s3 --port [COM_PORT] erase_flash
esptool.py --chip esp32s3 --port [COM_PORT] --baud 460800 write_flash 0x10000 FPVGate_v1.5.7_[board]_firmware.bin 0x410000 FPVGate_v1.5.7_[board]_filesystem.bin
```

## Breaking Changes
None

**Full Changelog:** https://github.com/LouisHitchcock/FPVGate/compare/v1.5.6...v1.5.7
