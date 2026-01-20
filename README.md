# FPVGate Website

Official website and web-based flasher for [FPVGate](https://github.com/LouisHitchcock/FPVGate) - Personal FPV Lap Timer for ESP32-S3.

[![Ko-fi](https://img.shields.io/badge/Support%20on-Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/louishitchcock)

## Features

- **Homepage**: Project information, features, supported hardware
- **Documentation**: Screenshots, getting started guide, hardware requirements
- **Web Flasher** ([https://fpvgate.xyz/flasher.html](https://fpvgate.xyz/flasher.html)): Browser-based firmware flasher using esptool-js
  - No command line or software installation required
  - Automatic release detection from GitHub
  - Multi-board support:
    - ESP32-S3 DevKitC-1 (8MB Flash) - Recommended
    - ESP32-S3 Super Mini (4MB Flash)
    - ESP32-C3
    - LilyGO T-Energy S3
    - ESP32-C6
  - Version picker with latest/stable releases
  - One-click flashing via Web Serial API
  - Full chip erase option
  - Flash verification

## Technology

- Pure HTML/CSS/JavaScript
- [esptool-js](https://github.com/espressif/esptool-js) for firmware flashing
- GitHub API for automatic release detection
- GitHub Pages for hosting
- GitHub Actions for automated firmware syncing from releases

## Development

### Local Testing

Simply open `index.html` in a web browser. For full functionality (Web Serial API), use a local server:

```bash
# Python 3
python -m http.server 8000

# Node.js (http-server)
npx http-server
```

Then navigate to `http://localhost:8000`

### Requirements

- Modern browser with Web Serial API support (Chrome, Edge, Opera)
- Internet connection for GitHub API and ESP Web Tools

## How It Works

1. **Release Detection**: Fetches latest releases from FPVGate GitHub repository via API
2. **Firmware Hosting**: GitHub Actions automatically syncs board-specific firmware binaries from releases to the website repository
3. **Board Selection**: User selects their board type from supported options
4. **Version Selection**: User selects firmware version (auto-selects latest stable)
5. **Local File Loading**: Firmware binaries are loaded from website-hosted files to avoid CORS issues
6. **Flashing**: esptool-js handles the actual flashing via Web Serial API with real-time progress updates

## Binary Structure

Firmware binaries are organized by board type with the following naming convention:
- `[BOARD_PREFIX]-bootloader.bin`
- `[BOARD_PREFIX]-partitions.bin`
- `[BOARD_PREFIX]-firmware.bin`
- `[BOARD_PREFIX]-littlefs.bin`

### Flash Offsets by Board

**ESP32-S3 DevKitC-1 (8MB Flash):**
- `0x0` - bootloader.bin
- `0x8000` - partitions.bin
- `0x10000` - firmware.bin
- `0x410000` - littlefs.bin

**ESP32-S3 Super Mini (4MB Flash):**
- `0x0` - bootloader.bin
- `0x8000` - partitions.bin
- `0x10000` - firmware.bin
- `0x210000` - littlefs.bin

**ESP32-C3:**
- `0x0` - bootloader.bin
- `0x8000` - partitions.bin
- `0x10000` - firmware.bin
- `0x210000` - littlefs.bin

**LilyGO T-Energy S3:**
- `0x0` - bootloader.bin
- `0x8000` - partitions.bin
- `0x10000` - firmware.bin
- `0x410000` - littlefs.bin

## Deployment

This site is automatically deployed to GitHub Pages when pushed to the main branch.

## License

Licensed under CC BY-NC-SA 4.0, matching the FPVGate project license.

## Links

- [FPVGate Repository](https://github.com/LouisHitchcock/FPVGate)
- [Documentation](https://github.com/LouisHitchcock/FPVGate/tree/main/docs)
- [Issues](https://github.com/LouisHitchcock/FPVGate/issues)
- [Support Development](https://ko-fi.com/louishitchcock)
