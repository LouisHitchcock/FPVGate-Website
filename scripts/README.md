# FPVGate Website Scripts

This directory contains utility scripts for managing firmware releases and validating the website structure.

## Scripts Overview

### 1. prepare_firmware_release.py

Prepares a new firmware release by reorganizing files into the standardized directory structure.

**Usage:**
```bash
python prepare_firmware_release.py <input_dir> <version> [--output <output_dir>]
```

**Example:**
```bash
# Prepare release v1.5.7 from downloads folder
python prepare_firmware_release.py ~/Downloads/fpvgate_release_v1.5.7 v1.5.7

# Specify custom output directory
python prepare_firmware_release.py ./raw_release v1.5.7 --output ./firmware/v1.5.7
```

**What it does:**
- Identifies board types from filenames
- Renames files to standardized format (`S3_Devkit_firmware.bin`, etc.)
- Organizes files into board-specific subdirectories
- Creates `Supported_Boards.txt` listing available boards
- Validates the structure before completion

**Supported Boards:**
- ESP32S3-Devkit-C1 (prefix: `S3_Devkit`)
- ESP32S3-Supermini (prefix: `S3_Supermini`)
- XIAO-S3 (prefix: `XIAO_S3`)
- LilyGO-T-Energy-S3 (prefix: `LilyGO`)
- ESP32C3 (prefix: `ESP32C3`)
- ESP32C6 (prefix: `ESP32C6`)

### 2. validate_firmware_endpoints.py

Validates that all firmware files exist and are accessible, both locally and via HTTP.

**Usage:**
```bash
python validate_firmware_endpoints.py [--base-url <url>] [--local-only]
```

**Example:**
```bash
# Validate local files only
python validate_firmware_endpoints.py --local-only

# Validate local files and HTTP endpoints (after deployment)
python validate_firmware_endpoints.py --base-url https://fpvgate.xyz
```

**What it does:**
- Checks all firmware files exist in correct locations
- Validates file sizes (detects empty or suspiciously small files)
- Optionally tests HTTP endpoints (requires `requests` library)
- Generates detailed report of errors and warnings
- Verifies board ID mapping matches flasher.js expectations

**Dependencies:**
```bash
# For HTTP validation (optional)
pip install requests
```

### 3. migrate_existing_firmware.ps1 (PowerShell)

One-time migration script to convert existing firmware from old structure to new standardized structure.

**Usage:**
```powershell
# Dry run (preview changes)
.\migrate_existing_firmware.ps1 -DryRun

# Apply migration
.\migrate_existing_firmware.ps1
```

**What it does:**
- Scans all version directories for firmware files
- Identifies board and file type from old naming conventions
- Copies files to new structure with standardized names
- Creates `Supported_Boards.txt` for each version
- Renames release files (`sd_card_contents.zip` -> `SD_Card.zip`)

## Workflow: Adding a New Firmware Release

### Step 1: Download Release Assets

Download all release assets from the FPVGate GitHub release to a local directory.

### Step 2: Prepare the Release

```bash
cd fpvgate-website
python scripts/prepare_firmware_release.py ~/Downloads/fpvgate_v1.5.7 v1.5.7
```

This will create `firmware/v1.5.7/` with the standardized structure.

### Step 3: Validate the Structure

```bash
python scripts/validate_firmware_endpoints.py --local-only
```

Review any errors or warnings. Fix issues before proceeding.

### Step 4: Test Locally

```bash
python -m http.server 8000
```

Navigate to `http://localhost:8000/flasher.html` and test:
- Board selection dropdown
- Version selection dropdown  
- Firmware manifest generation (check browser console)

### Step 5: Commit and Push

```bash
git add firmware/v1.5.7
git commit -m "Add firmware v1.5.7"
git push origin main
```

The GitHub Pages deployment workflow will automatically trigger.

### Step 6: Validate Deployment

After deployment completes (~2-3 minutes), validate HTTP endpoints:

```bash
python scripts/validate_firmware_endpoints.py --base-url https://fpvgate.xyz
```

## Standardized Firmware Structure

```
firmware/
├── v1.5.7/
│   ├── SD_Card.zip
│   ├── Supported_Boards.txt
│   ├── Release_Notes.txt
│   ├── ESP32S3-Devkit-C1/
│   │   ├── S3_Devkit_bootloader.bin
│   │   ├── S3_Devkit_partitions.bin
│   │   ├── S3_Devkit_firmware.bin
│   │   └── S3_Devkit_filesystem.bin
│   ├── ESP32S3-Supermini/
│   │   ├── S3_Supermini_bootloader.bin
│   │   ├── S3_Supermini_partitions.bin
│   │   ├── S3_Supermini_firmware.bin
│   │   └── S3_Supermini_filesystem.bin
│   └── XIAO-S3/
│       ├── XIAO_S3_bootloader.bin
│       ├── XIAO_S3_partitions.bin
│       ├── XIAO_S3_firmware.bin
│       └── XIAO_S3_filesystem.bin
└── v1.5.8/
    └── (same structure)
```

## Troubleshooting

### Script Won't Run (Python)

Make sure Python 3.8+ is installed:
```bash
python --version
```

### ModuleNotFoundError

Install missing dependencies:
```bash
pip install requests
```

### Permission Denied (Windows)

If PowerShell script won't run, enable execution:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### File Pattern Not Matched

If the preparation script doesn't recognize a board, check the patterns in `BOARD_CONFIGS` and add new patterns as needed.

### Validation Fails After Deployment

- Wait 2-3 minutes for GitHub Pages deployment to complete
- Check the Actions tab on GitHub for deployment status
- Verify files were committed correctly: `git log --stat`
- Clear browser cache and try again

## Maintenance

### Adding a New Board

1. Update `BOARD_CONFIGS` in all three scripts with:
   - Directory name (e.g., `ESP32S2`)
   - File prefix (e.g., `S2`)
   - Filename patterns for identification
   
2. Update `flasher.js` BOARD_CONFIGS with new board

3. Update `boards.json` in FPVGate repository

### Changing File Structure

If the firmware structure changes, update:
- `prepare_firmware_release.py` - file organization logic
- `validate_firmware_endpoints.py` - validation rules
- `flasher.js` - manifest generation
- This README - documentation and examples
