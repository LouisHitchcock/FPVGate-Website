# Pre-Release Firmware

This folder holds pre-release firmware builds that are not yet published as official GitHub releases.

## Adding a New Pre-Release

1. Create a version folder (e.g. `v1.6.3-pre-1/`)
2. Inside that folder, create board subfolders matching the names used in `/firmware/` releases:
   - `ESP32S3-Devkit-C1/`
   - `ESP32S3-SuperMini/`
   - `XIAO-S3/`
   - `LilyGo-T-Energy-S3/`
   - etc.
3. Place the compiled `.bin` files in each board folder using the standard naming convention:
   - `{prefix}_bootloader.bin`
   - `{prefix}_partitions.bin`
   - `{prefix}_firmware.bin`
   - `{prefix}_filesystem.bin`
4. Update `index.json` in this directory to include the new version:

```json
{
    "versions": [
        {
            "tag": "v1.6.3-pre-1",
            "date": "2026-03-01",
            "notes": "Brief description of what this pre-release contains"
        }
    ]
}
```

## Removing a Pre-Release

1. Delete the version folder
2. Remove the entry from `index.json`

## Folder Structure Example

```
preRelease/
  index.json
  README.md
  v1.6.3-pre-1/
    ESP32S3-Devkit-C1/
      S3_Devkit_bootloader.bin
      S3_Devkit_partitions.bin
      S3_Devkit_firmware.bin
      S3_Devkit_filesystem.bin
    XIAO-S3/
      XIAO_S3_bootloader.bin
      XIAO_S3_partitions.bin
      XIAO_S3_firmware.bin
      XIAO_S3_filesystem.bin
```
