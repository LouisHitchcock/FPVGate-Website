# Firmware Structure Migration Guide

This guide documents the transition from the old automated firmware sync system to the new manual, standardized firmware structure.

## What Changed

### Old System (Pre-2026-02-03)
- ❌ GitHub Actions automatically synced firmware from FPVGate releases
- ❌ Mixed naming conventions: `ESP32S3-8MB-firmware.bin`, `FPVGate_v1.5.6_ESP32S3_firmware.bin`
- ❌ All binaries in flat version directory
- ❌ Metadata files (`versions.json`, `latest.json`)
- ❌ Dependency on FPVGate repository structure

### New System (2026-02-03+)
- ✅ Manual firmware preparation and commit
- ✅ Standardized naming: `S3_Devkit_firmware.bin`, `S3_Supermini_filesystem.bin`
- ✅ Board-specific subdirectories
- ✅ Self-contained with validation scripts
- ✅ Independent from FPVGate repository
- ✅ Legacy version support

## Benefits

1. **Reliability:** Manual control eliminates sync failures and race conditions
2. **Consistency:** Standardized file naming prevents confusion
3. **Maintainability:** Clear structure makes debugging easier
4. **Legacy Support:** Old versions remain accessible indefinitely
5. **Validation:** Built-in validation prevents broken releases
6. **Independence:** No dependency on external repository structure changes

## Migration Steps

### 1. Migrate Existing Firmware (One-Time)

Run the migration script to convert existing firmware to the new structure:

```powershell
# Preview changes (dry run)
.\scripts\migrate_existing_firmware.ps1 -DryRun

# Apply migration
.\scripts\migrate_existing_firmware.ps1
```

This will create board subdirectories and copy files with standardized names.

### 2. Validate Migration

```bash
python scripts/validate_firmware_endpoints.py --local-only
```

Fix any errors reported by the validation script.

### 3. Clean Up Old Files

After validating the migration, you can safely delete the old .bin files from the version root directories:

```powershell
# Be careful - review files before deleting
Get-ChildItem firmware\v*\*.bin | Remove-Item -WhatIf

# Once confirmed, remove -WhatIf to actually delete
# Get-ChildItem firmware\v*\*.bin | Remove-Item
```

### 4. Test Locally

```bash
python -m http.server 8000
```

Navigate to `http://localhost:8000/flasher.html` and test:
- Select a board
- Select a version (try an old version)
- Check browser console for manifest URLs
- Verify paths match new structure

### 5. Commit Changes

```bash
git add firmware/ flasher.js scripts/ AGENTS.md
git commit -m "Migrate to standardized firmware structure

- Reorganize firmware into board-specific subdirectories
- Standardize file naming (S3_Devkit_firmware.bin, etc.)
- Add firmware preparation and validation scripts
- Remove GitHub Actions sync workflow
- Update documentation"

git push origin main
```

### 6. Validate Deployment

After GitHub Pages deploys (~2-3 minutes):

```bash
python scripts/validate_firmware_endpoints.py --base-url https://fpvgate.xyz
```

## New Workflow for Future Releases

### When FPVGate Releases a New Version

1. **Download assets** from GitHub release to local directory

2. **Prepare release:**
   ```bash
   python scripts/prepare_firmware_release.py ~/Downloads/fpvgate_v1.5.8 v1.5.8
   ```

3. **Validate structure:**
   ```bash
   python scripts/validate_firmware_endpoints.py --local-only
   ```

4. **Test locally:**
   ```bash
   python -m http.server 8000
   # Visit http://localhost:8000/flasher.html
   ```

5. **Commit and push:**
   ```bash
   git add firmware/v1.5.8
   git commit -m "Add firmware v1.5.8"
   git push origin main
   ```

6. **Validate deployment:**
   ```bash
   python scripts/validate_firmware_endpoints.py --base-url https://fpvgate.xyz
   ```

## File Structure Comparison

### Before
```
firmware/v1.5.6/
├── ESP32S3-8MB-bootloader.bin
├── ESP32S3-8MB-firmware.bin
├── ESP32S3-8MB-littlefs.bin
├── ESP32S3-8MB-partitions.bin
├── ESP32S3-SuperMini-4MB-bootloader.bin
├── ESP32S3-SuperMini-4MB-firmware.bin
├── ESP32S3-SuperMini-4MB-littlefs.bin
├── ESP32S3-SuperMini-4MB-partitions.bin
├── FPVGate_v1.5.6_ESP32S3_firmware.bin
├── FPVGate_v1.5.6_ESP32S3SuperMini_firmware.bin
├── sd_card_contents.zip
└── (20+ files with mixed naming)
```

### After
```
firmware/v1.5.6/
├── SD_Card.zip
├── Supported_Boards.txt
├── Release_Notes.txt
├── ESP32S3-Devkit-C1/
│   ├── S3_Devkit_bootloader.bin
│   ├── S3_Devkit_partitions.bin
│   ├── S3_Devkit_firmware.bin
│   └── S3_Devkit_filesystem.bin
├── ESP32S3-Supermini/
│   ├── S3_Supermini_bootloader.bin
│   ├── S3_Supermini_partitions.bin
│   ├── S3_Supermini_firmware.bin
│   └── S3_Supermini_filesystem.bin
└── XIAO-S3/
    ├── XIAO_S3_bootloader.bin
    ├── XIAO_S3_partitions.bin
    ├── XIAO_S3_firmware.bin
    └── XIAO_S3_filesystem.bin
```

## Board Configuration Mapping

| Board ID | Directory | File Prefix | Notes |
|----------|-----------|-------------|-------|
| esp32s3 | ESP32S3-Devkit-C1 | S3_Devkit | 8MB Flash, filesystem @ 0x410000 |
| esp32s3supermini | ESP32S3-Supermini | S3_Supermini | 4MB Flash, filesystem @ 0x290000 |
| seeedxiaos3 | XIAO-S3 | XIAO_S3 | 8MB Flash, filesystem @ 0x410000 |
| lilygo | LilyGO-T-Energy-S3 | LilyGO | 8MB Flash, filesystem @ 0x410000 |
| esp32c3 | ESP32C3 | ESP32C3 | No filesystem partition |
| esp32c6 | ESP32C6 | ESP32C6 | No filesystem partition |

## Troubleshooting

### Old URLs Not Working After Migration

**Problem:** Users getting 404 errors on old firmware URLs

**Solution:** Both old and new files exist during migration. Don't delete old files until you've verified new structure works.

### Validation Script Fails

**Problem:** `validate_firmware_endpoints.py` reports missing files

**Solution:**
1. Check migration script output for skipped files
2. Verify file patterns in `BOARD_CONFIGS` match your firmware names
3. Manually copy any files that weren't automatically migrated

### Flasher Not Finding Firmware

**Problem:** Flasher shows error when trying to flash

**Solution:**
1. Check browser console for actual URL being requested
2. Verify URL matches new structure: `firmware/v1.5.7/ESP32S3-Devkit-C1/S3_Devkit_firmware.bin`
3. Ensure `flasher.js` BOARD_CONFIGS has correct `firmwareDir` and `filePrefix`

### PowerShell Script Won't Run

**Problem:** "Execution policy" error

**Solution:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Rollback Plan

If you need to rollback to the old system:

1. Revert commits:
   ```bash
   git revert HEAD~3..HEAD
   git push origin main
   ```

2. Re-enable sync workflow:
   ```bash
   git restore .github/workflows/sync-firmware.yml
   git commit -m "Restore sync workflow"
   git push origin main
   ```

Note: The new structure is backward compatible - old firmware versions still work with the flasher.

## Support

For issues or questions:
- Check `scripts/README.md` for detailed workflow documentation
- Review `AGENTS.md` for technical architecture details
- Open an issue on GitHub
