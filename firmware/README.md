# FPVGate Firmware Repository

This directory contains firmware binaries for the FPVGate web flasher.

## Structure

```
firmware/
├── v1.5.0/
│   ├── bootloader.bin
│   ├── partitions.bin
│   ├── firmware.bin
│   └── littlefs.bin
├── versions.json    # List of all available versions
└── latest.json      # Points to the latest stable version
```

## Automatic Sync

Firmware binaries are automatically synced from the [FPVGate repository](https://github.com/LouisHitchcock/FPVGate) using GitHub Actions.

The sync workflow:
- Runs daily to check for new releases
- Can be manually triggered via GitHub Actions
- Can be triggered by the FPVGate repo when a new release is published

## Manual Sync

To manually trigger a firmware sync:
1. Go to the Actions tab in this repository
2. Select "Sync Firmware from FPVGate"
3. Click "Run workflow"

## Adding Support for New Versions

New versions are automatically detected and downloaded. Each version gets its own directory with all required binaries.
