# FPVGate v1.5.3 Release Notes

**Release Date:** January 18, 2026  
**Type:** Patch Release - Bug Fixes

## What's New in v1.5.3

### Bug Fixes

#### Lap Analysis Data Persistence
- **Fixed data disappearing after race ends**: Lap analysis data now persists when switching between tabs after stopping a race
  - Previously, lap data was cleared immediately when the race stopped
  - Users can now review "Lap History" and "Fastest Round" charts after race completion
  - Data only clears when explicitly clicking "Clear Laps" button
  - Maintains analysis visibility for post-race review

#### Gate 1 Exclusion from Analysis Charts
- **Fixed Gate 1 appearing in lap analysis**: Gate 1 is now properly excluded from lap analysis visualizations
  - "Lap History" chart now only shows actual racing laps (Lap 1, 2, 3...)
  - "Fastest Round (3 Laps)" correctly excludes Gate 1 from calculations
  - Lap numbering is now accurate (Gate 1 not mislabeled as Lap 1)
  - Statistics boxes already correctly excluded Gate 1, now charts match

### Technical Changes

#### Modified Files
- `data/script.js`
  - `stopRace()` function: Removed premature clearing of `lapTimes` array
  - `renderLapHistory()` function: Added Gate 1 filtering using `slice(1)`
  - `renderFastestRound()` function: Added Gate 1 filtering for 3-lap analysis
  - Improved comments explaining lap data persistence behavior

## Supported Hardware

- **ESP32-S3 DevKitC-1** (8MB Flash) - Recommended
- **ESP32-S3 Super Mini** (4MB Flash) - Compact
- **ESP32-C3** - Expert mode
- **LilyGO T-Energy S3** - Expert mode with integrated battery

## Installation

### Web Flasher (Recommended)
Visit **https://fpvgate.xyz/flasher.html** and follow the on-screen instructions.

### Command Line
Download board-specific binaries from the [releases page](https://github.com/LouisHitchcock/FPVGate/releases) and flash:
```bash
esptool.py --chip esp32s3 --port COM3 write_flash -z \
  0x0 [BOARD]-bootloader.bin \
  0x8000 [BOARD]-partitions.bin \
  0x10000 [BOARD]-firmware.bin \
  0x410000 [BOARD]-littlefs.bin
```

## Upgrade Notes

- This is a direct upgrade from v1.5.2
- No configuration reset required
- All existing settings will be preserved
- Only filesystem (littlefs.bin) changed - firmware unchanged

## Known Issues

None reported for this release.

## Contributors

- Louis Hitchcock (@LouisHitchcock)

## Links

- **Website**: https://fpvgate.xyz
- **Documentation**: https://github.com/LouisHitchcock/FPVGate/tree/main/docs
- **Issues**: https://github.com/LouisHitchcock/FPVGate/issues
