# Changelog - v1.6.1

## [1.6.1] - 2026-02-14

### Upgrade Notes
- **No config reset required** - Firmware automatically migrates from v10 to v11
- **Hostname simplified** - All timers now use `fpvgate.local` (removed timerNumber-based hostnames)
- **iOS Safari users** - The hostname system has been fixed for full iOS compatibility

### Added - Multi-Pilot Race Analysis
- **Current Lap Timer** - Real-time display showing elapsed time since last gate crossing
- **Race Analysis Charts** - New charts for multi-pilot sync modes:
  - Lap Times Chart (SVG line chart comparing all pilots)
  - Consistency Chart (box-and-whisker plot per pilot)
- **Multi-Pilot Race History** - Races saved with all pilots' data in Master mode
- **Race History Charts** - Lap Times and Consistency charts available in race history detail view

### Added - Race Synchronization Features
- **Redesigned Sync UI** - New multi-pilot race view with side-by-side pilot comparison
- **TTS Format Override** - Custom speech format for sync modes with all pilots announced
- **Speech Keepalive** - Prevents mobile browsers from stopping TTS during long races
- **Master Hostname Storage** - Slave devices remember their master's address

### Added - Documentation
- Comprehensive Race Synchronization guide in USER_GUIDE.md
- Technical architecture documentation in FEATURES.md
- Multi-Timer Setup quick start in GETTING_STARTED.md
- Updated all hardware pin references for ESP32-S3 DevKit
- Fixed wiring diagram for buzzer connection

### Improved - Mobile Experience
- **Settings Modal** - New horizontal scrollable navigation for better mobile usability
- **Race Button Sizing** - Improved spacing and sizing on mobile devices
- **iOS Safari Compatibility** - Hostname requests redirect to IP for full iOS support

### Improved - Race Synchronization
- Header badges showing PERSONAL/MASTER/SLAVE mode
- Remote pilot TTS announcements in Master mode
- Sync state persists and loads correctly on page refresh
- Better sync device management UI

### Fixed
- **Start Race button hanging** - Fixed issue preventing race start on mobile
- **Mobile audio announcer** - Fixed CORS and SSE issues breaking TTS on mobile
- **ESP32-S3 DevKit pins** - Corrected pin configurations (RGB LED: GPIO5, Buzzer: GPIO6)
- Updated all documentation to reflect correct pin mappings

### Technical Changes
- Config version bumped from 10 to 11 (automatic migration)
- Added `masterHostname` field for slave mode configuration
- Removed legacy `timerNumber`-based hostname system
- Simplified hostname to always use `fpvgate.local`
