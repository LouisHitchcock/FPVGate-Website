# Changelog - v1.6.2

## [1.6.2] - 2026-02-26

### Upgrade Notes
- **No config reset required** - Firmware automatically migrates to config v14
- Waveshare ESP32-S3-LCD-2 board now available under Expert Mode in the web flasher

### Added - Hardware
- **Waveshare ESP32-S3-LCD-2 (16MB Flash)** - New board support (Expert Mode)
  - Custom PlatformIO target with 16MB flash configuration
  - Wiring documentation in `docs/wiring/Waveshare-ESP32-S3-LCD-2.md`

### Added - Calibration Wizard
- **Ignore Regions** - Mark noisy sections of RSSI data to exclude from threshold calculation
  - Visual overlay on calibration chart to select ignore regions
  - Automatic threshold recalculation after applying ignore regions
  - Warning flow when ignored data significantly affects results
  - Manual peak-marking fallback when auto-detection fails
  - Re-record option from results screen

### Added - Novacore Receiver Support
- **Per-Filter Toggles** - Enable/disable individual signal processing filters
  - Kalman filter (default: on)
  - Median filter (default: off)
  - Moving Average filter (default: off)
  - EMA filter (default: off)
  - Step Limiter (default: on)
- **Tuning Sliders** - Adjustable filter parameters
  - Kalman Q (process noise, default: 200)
  - EMA Alpha (smoothing factor, default: 15)
  - Step Max (max step size, default: 20)
- Dynamic Kalman filter reconfiguration when receiver type changes

### Added - Diagnostics
- **Debug RSSI Overlay** - Real-time RSSI debug chart in diagnostics
- **Debug Mode Toggle** - Persistent debug mode flag via localStorage

### Changed
- Config version bumped from 13 to 14 (automatic migration)
- Added `receiverRadio` config field (0 = RX5808, 1 = Novacore)
- Hardware docs updated: Seeed XIAO ESP32S3 recommended, Super Mini not recommended
- README updated with badges, recent updates, and Discord link
- Test scripts moved to `tools/` directory

### Removed
- Removed QUICKSTART.md (consolidated into existing docs)
- Removed LicardoTimer board target
- Removed unused `release.yml` GitHub Actions workflow
- Cleaned up dead `LicardoTimer.ini` reference from `platformio.ini`
