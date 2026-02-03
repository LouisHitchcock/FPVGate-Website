# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**FPVGate Website** is a static website and web-based firmware flasher for the FPVGate ESP32-based FPV lap timer project. The site is hosted on GitHub Pages and includes:
- Homepage and documentation pages
- Browser-based firmware flasher using esptool-js and Web Serial API
- Automated firmware syncing from the main FPVGate repository via GitHub Actions

**Related Repository:** [LouisHitchcock/FPVGate](https://github.com/LouisHitchcock/FPVGate) (main firmware project)

## Development Commands

### Local Testing
```bash
# Serve locally with Python
python -m http.server 8000

# Or with Node.js
npx http-server
```

Then navigate to `http://localhost:8000`

**Note:** Web Serial API (required for flashing) only works in Chromium-based browsers (Chrome, Edge, Opera).

### Deployment
- **Automatic**: Pushes to `main` branch trigger GitHub Actions deployment to GitHub Pages
- **Manual**: Use the "Deploy to GitHub Pages" workflow dispatch in `.github/workflows/deploy.yml`

### Firmware Management
**This repository uses manual firmware management for maximum reliability:**

1. **Prepare new release:**
   ```bash
   python scripts/prepare_firmware_release.py ~/Downloads/release_files v1.5.7
   ```

2. **Validate structure:**
   ```bash
   python scripts/validate_firmware_endpoints.py --local-only
   ```

3. **Commit and push:**
   ```bash
   git add firmware/v1.5.7
   git commit -m "Add firmware v1.5.7"
   git push origin main
   ```

See `scripts/README.md` for detailed workflow documentation.

## Architecture

### Core Components

**Static Website (Pure HTML/CSS/JS)**
- `index.html` - Homepage with project features and hardware information
- `docs.html` - Documentation and getting started guide
- `flasher.html` - Web-based firmware flasher interface
- `styles.css` - Global styles with CSS animations

**Flasher System (flasher.js + esp-flasher.js)**
- `flasher.js` - Main flasher logic, board configuration, version selection, GitHub API integration
- `esp-flasher.js` - Custom ESPLoader wrapper using esptool-js library (v0.4.1) for Web Serial API flashing
- `BOARD_CONFIGS` object in flasher.js defines flash offsets and partitions for each supported board

**Dynamic Board Configuration**
- Boards are fetched from `boards.json` in the FPVGate repository at runtime
- Boards split into "standard" (`expert_mode: 0`) and "expert" (`expert_mode: 1`) categories
- Fallback hardcoded boards if GitHub fetch fails
- See `BOARD_CONFIG.md` for detailed documentation

**Analytics Tracking**
- `analytics-tracker.js` - Privacy-focused event tracking (flash events, board selections, page views)
- Sends events to Cloudflare Worker endpoint: `https://fpvgate-analytics.fpvgate-analytics.workers.dev`

**Wiring Diagrams**
- `wiring-loader.js` - Dynamically loads board-specific wiring diagrams from `wiring/` directory
- Simple markdown-to-HTML converter for rendering diagrams
- `docs.html` uses this to display board-specific wiring instructions

**Animations**
- `animations.js` - Intersection Observer-based scroll animations for homepage

### Firmware Binary Structure

**Standardized Directory Structure (v2026-02-03):**
```
firmware/
└── v1.5.7/
    ├── SD_Card.zip
    ├── Supported_Boards.txt
    ├── Release_Notes.txt
    ├── ESP32S3-Devkit-C1/
    │   ├── S3_Devkit_bootloader.bin (0x0)
    │   ├── S3_Devkit_partitions.bin (0x8000)
    │   ├── S3_Devkit_firmware.bin (0x10000)
    │   └── S3_Devkit_filesystem.bin (0x410000)
    ├── ESP32S3-Supermini/
    │   ├── S3_Supermini_bootloader.bin (0x0)
    │   ├── S3_Supermini_partitions.bin (0x8000)
    │   ├── S3_Supermini_firmware.bin (0x10000)
    │   └── S3_Supermini_filesystem.bin (0x290000)
    └── XIAO-S3/
        ├── XIAO_S3_bootloader.bin (0x0)
        ├── XIAO_S3_partitions.bin (0x8000)
        ├── XIAO_S3_firmware.bin (0x10000)
        └── XIAO_S3_filesystem.bin (0x410000)
```

**Key Changes from Previous Structure:**
- Firmware organized in board-specific subdirectories
- Standardized file naming: `[PREFIX]_[type].bin`
- Renamed `littlefs.bin` to `filesystem.bin`
- Release-level files at version root (SD_Card.zip, Release_Notes.txt)

### GitHub Actions Workflows

**deploy.yml**
- Deploys entire repo to GitHub Pages on push to `main`
- Uses official GitHub Pages actions
- Automatically triggers when firmware is committed

### Data Flow

1. **Board Selection:** `flasher.js` fetches `boards.json` from FPVGate repo → populates board dropdown
2. **Version Selection:** Queries GitHub API for FPVGate releases → populates version dropdown
3. **Manifest Generation:** Selected board + version → `flasher.js` uses BOARD_CONFIGS to build firmware URLs:
   - Example: `firmware/v1.5.7/ESP32S3-Devkit-C1/S3_Devkit_bootloader.bin`
4. **Flashing:** `esp-flasher.js` downloads binaries from local URLs and flashes via Web Serial API
5. **Analytics:** Track events (board selected, flash started, flash completed/failed) → send to Cloudflare Worker

## Important Files

- `scripts/README.md` - **Firmware management workflow and utility scripts**
- `scripts/prepare_firmware_release.py` - Standardize and organize new firmware releases
- `scripts/validate_firmware_endpoints.py` - Validate all firmware files and endpoints
- `BOARD_CONFIG.md` - Documents dynamic board configuration system
- `SETUP.md` - GitHub Pages setup instructions and troubleshooting
- `boards.json.example` - Example board configuration JSON structure
- `ANALYTICS_SUMMARY.md` - Analytics implementation details
- `CNAME` - Custom domain configuration (fpvgate.xyz)

## Key Constraints

- **No Build Step:** Pure static HTML/CSS/JS - no bundlers, transpilers, or package managers
- **CORS Limitations:** Firmware binaries must be hosted on same domain (fpvgate-website repo) to avoid CORS issues
- **Web Serial API:** Only works in Chromium browsers, requires HTTPS or localhost
- **ESP32 Flash Offsets:** Must match PlatformIO partition table in FPVGate firmware - incorrect offsets will brick devices
- **Manual Firmware Management:** No automatic syncing from FPVGate repo - firmware must be manually prepared and committed for maximum reliability and version stability

## Adding New Board Support

1. Add board to `boards.json` in FPVGate repository
2. Add board configuration to `BOARD_CONFIGS` in `flasher.js` with:
   - `firmwareDir`: Directory name (e.g., `ESP32S2`)
   - `filePrefix`: File prefix (e.g., `S2`)
   - `chipFamily`: ESP chip family
   - `parts`: Flash offsets array
3. Update board patterns in `scripts/prepare_firmware_release.py` and `scripts/validate_firmware_endpoints.py`
4. Verify partition table offsets match between PlatformIO config and `flasher.js` BOARD_CONFIGS

## Testing the Flasher

1. Navigate to `http://localhost:8000/flasher.html`
2. Select a board from dropdown (triggers board configuration load)
3. Select a version from dropdown (triggers firmware URL construction)
4. Click "Connect & Flash Device" (requires ESP32 connected via USB)
5. Monitor browser console for detailed flash progress and errors
6. Check analytics events are firing correctly (network tab)

## Common Issues

- **Versions not loading:** GitHub API rate limit or CORS issue - check browser console
- **Flash fails:** Incorrect flash offsets in BOARD_CONFIGS or corrupted binary download
- **Web Serial not available:** Wrong browser (use Chrome/Edge) or not HTTPS/localhost
- **Board not in dropdown:** Check `boards.json` fetch succeeded and board has `expert_mode: 0` (or enable Expert Mode)
