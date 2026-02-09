# FPVGate v1.6.0 - Release Notes

**Release Date:** February 9, 2026

## Race Synchronization System
- Multi-timer synchronization for distributed race timing setups
- WebSocket-based real-time sync between master and slave timers
- Master/Slave mode indicators in the UI header
- Automatic discovery and connection management
- Synchronized race start, stop, and lap events across all connected timers

## Audio Controls
- Beep volume control slider in settings
- Independent browser audio volume adjustment
- Persistent volume settings across sessions

## Other Changes
- Simplified race sync architecture for better reliability
- Enhanced status indicators for connection state

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
- Firmware: `0x10000` - `FPVGate_v1.6.0_[board]_firmware.bin`
- Filesystem: `0x410000` - `FPVGate_v1.6.0_[board]_filesystem.bin`

#### esptool.py
```bash
esptool.py --chip esp32s3 --port [COM_PORT] erase_flash
esptool.py --chip esp32s3 --port [COM_PORT] --baud 460800 write_flash 0x10000 FPVGate_v1.6.0_[board]_firmware.bin 0x410000 FPVGate_v1.6.0_[board]_filesystem.bin
```

## Breaking Changes
None

**Full Changelog:** https://github.com/LouisHitchcock/FPVGate/compare/v1.5.7...v1.6.0
