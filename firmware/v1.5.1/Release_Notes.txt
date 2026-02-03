# FPVGate v1.5.1 Release Notes

**Release Date:** January 6, 2026  
**Version:** 1.5.1  
**Type:** Patch Release - Bug Fixes & Improvements

---

## What's New in v1.5.1

This patch release focuses on improving device accessibility, expanding hardware support, and enhancing the web flasher experience.

### Major Changes

#### Device Domain Change
- **Changed device domain from fpvgate.xyz to fpvgate.local**
- Separates public website (https://fpvgate.xyz) from device interface
- Fixes captive portal conflicts and improves device accessibility
- Users can now access device at `http://fpvgate.local` or `http://192.168.4.1`
- All documentation updated with new domain

#### New Hardware Support
- **LilyGO T-Energy S3** - Full support with battery monitoring
- **ESP32-C3** - USB CDC support with proper build flags
- **ESP32-S3 Super Mini** - Compact 4MB Flash variant support

#### Web Flasher Configuration
- Added `boards.json` for dynamic board configuration
- Boards can be marked as standard or expert-only
- Enables web-based flasher to display appropriate board options
- Supports future board additions without website code changes

---

### Hardware Improvements

#### LilyGO T-Energy S3 Support
- Added battery voltage monitoring via GPIO 3
- Implemented SD card support with correct pin mappings
- Battery calibration and voltage reporting
- Proper power management for battery operation

#### Platform Configuration Centralization
- Consolidated platform feature defines in `config.h`
- Improved build consistency across different ESP32 variants
- Better hardware detection during self-tests

---

### Bug Fixes

#### Fixed Captive Portal Domain Conflict
- Device no longer conflicts with public website domain
- Captive portal properly redirects detection URLs (MSN.com, etc.)
- Improved first-connection experience for users

#### Fixed TTS Translation Keys
- Resolved multi-language support issues for voice announcements
- Proper translation key handling across different locales

#### Fixed Case-Sensitive Include
- Corrected `RX5808.h` include for Linux/Mac compatibility
- Improves cross-platform build reliability

---

## Technical Details

### Modified Files
- `lib/WEBSERVER/webserver.cpp` - Captive portal domain update
- `config.h` - Centralized platform defines
- `platformio.ini` - Added LILYGO_TENERGY_S3 and ESP32C3 configurations
- `README.md`, `QUICKSTART.md`, `docs/*` - Documentation updates
- `data/index.html` - Device web interface domain references
- `boards.json` - New web flasher configuration file

### New Files
- `boards.json` - Dynamic board configuration for web flasher

---

## License Change Note

**Important:** FPVGate changed license from MIT to **CC BY-NC-SA 4.0** in v1.5.0.

This means:
- ✓ Free for personal/educational use
- ✓ Modifications allowed with attribution
- ✗ Commercial use requires permission
- ✗ No proprietary derivatives

---

## Installation

### Option A: Web Flasher (Easiest)

Visit https://fpvgate.xyz/flasher.html and follow the on-screen instructions to flash directly from your browser.

### Option B: Flash Prebuilt Binaries

1. Download the release binaries from the [releases page](https://github.com/LouisHitchcock/FPVGate/releases/tag/v1.5.1)
2. Connect your ESP32-S3 via USB
3. Flash using esptool.py:

```bash
esptool.py --chip esp32s3 --port COM3 write_flash -z \
  0x0 bootloader.bin \
  0x8000 partitions.bin \
  0x10000 firmware.bin \
  0x410000 littlefs.bin
```

Replace `COM3` with your actual COM port (Windows) or `/dev/ttyUSB0` (Linux/Mac).

### Option C: Build from Source

```bash
git clone https://github.com/LouisHitchcock/FPVGate.git
cd FPVGate
git checkout v1.5.1
pio run -e ESP32S3 -t upload
pio run -e ESP32S3 -t uploadfs
```

---

## Important Notes

### Breaking Changes
None - this release is fully backwards compatible with v1.5.0 configurations.

### Device URL Change
If you bookmarked the old device URL:
- **Old:** `http://www.fpvgate.xyz` or `http://fpvgate.xyz`
- **New:** `http://fpvgate.local` or `http://192.168.4.1`

The captive portal will automatically redirect you when connecting to the device WiFi.

### Upgrade Path
If upgrading from v1.5.0:
1. Flash new firmware (includes domain change)
2. Flash new filesystem (optional, only if using new features)
3. Access device at new URL: `http://fpvgate.local`
4. Your existing config will be preserved

---

## Links

- **Public Website:** https://fpvgate.xyz
- **Web Flasher:** https://fpvgate.xyz/flasher.html
- **GitHub Repository:** https://github.com/LouisHitchcock/FPVGate
- **Documentation:** https://github.com/LouisHitchcock/FPVGate/tree/main/docs
- **Issue Tracker:** https://github.com/LouisHitchcock/FPVGate/issues
- **Discussions:** https://github.com/LouisHitchcock/FPVGate/discussions

---

## Supported Hardware

### Recommended
- **ESP32-S3 DevKitC-1 (8MB Flash)** - Full features

### Supported
- **ESP32-S3 Super Mini (4MB Flash)** - Compact design
- **LilyGO T-Energy S3** - Battery powered with integrated charging
- **ESP32-C3** - Budget option with USB CDC

### Required Components
- RX5808 Module (SPI modded)
- MicroSD Card (FAT32)
- 5V Power Supply (or battery for T-Energy S3)

---

## Full Changelog

```
4ebc15a Change device domain from fpvgate.xyz to fpvgate.local
72df6a1 Update boards.json to use expert_mode flag
5fc9212 Add boards.json for web flasher configuration
d47179d Add USB CDC build flags for ESP32C3 support
7706f2b Centralize platform feature defines in config.h
cad73f5 Add LILYGO_TENERGY_S3 to all platform checks
fe16492 Fix T-Energy S3 SD card support and battery calibration
4cd7699 Fix T-Energy S3 battery pin to GPIO 3
4376366 Add battery monitoring support and LilyGO T-Energy S3 board
96b4795 Fix TTS translation keys for multi-language support
1c25244 Fix case-sensitive include for RX5808.h
21abfbe Update workflows to only build ESP32-S3 variants
72043cd Add GitHub Actions workflows for automated releases
```

---

**Made with care for the FPV community**  
FPVGate is open source (CC BY-NC-SA 4.0) and built by pilots, for pilots.
