# Changelog - v1.7.0

## [1.7.0] - 2026-03-20

### Upgrade Notes
- **Config reset recommended** - Config version bumped from 14 to 16 for new RotorHazard and speaker fields
- New board targets: FPVGate AIO V3, XIAO ESP32S3 Plus
- RotorHazard integration requires the companion RH plugin (included in `rh-plugin/`)

### Added - RotorHazard Integration
- **Bidirectional Race Control** - FPVGate and RotorHazard can start/stop races in sync
  - FPVGate race start sends stage + start commands to RH
  - FPVGate race stop sends stop command to RH
  - RH race events (stage, start, stop) are relayed back to FPVGate
- **NTP-Style Clock Synchronization** - Sub-millisecond timing alignment between FPVGate and RH
  - Automatic periodic clock sync (every 30 seconds)
  - Manual sync trigger from the web UI
  - Round-trip time (RTT) display for sync quality monitoring
- **Lap Submission** - Gate crossings are submitted to RH as laps via HTTP POST
  - Configurable node/seat index (0-7) to match RH heat assignment
  - Lap queue with up to 8 pending events to handle network delays
- **RotorHazard Companion Plugin** - `rh-plugin/fpvgate/` Python plugin for RH server
  - Receives laps via `POST /fpvgate/lap` and records them via `rhapi.race.lap_add()`
  - Relays RH race lifecycle events back to FPVGate
  - Auto-detects FPVGate IP from incoming requests
- **Web UI** - New "RotorHazard" role option in Sync settings
  - RH Host IP configuration
  - Node seat selector (0-7)
  - Connection status badge with live refresh
  - Clock sync status with RTT display
  - RotorHazard mode banner in race header

### Added - I2S Speaker Audio Announcer (MAX98357A)
- **Hardware Audio Output** - Play race announcements through an attached I2S speaker
  - Countdown, race start/stop, lap announcements, and race complete audio
  - Non-blocking MP3 playback from SD card via ESP8266Audio library
  - Playback queue (16 slots) for seamless sequential announcements
  - Volume control (0.0-1.0)
  - Number speech synthesis (0-99) for natural lap time announcements
  - Lap format support: full (pilot + lap + time), lap+time, time-only
  - Gate 1 and consecutive-lap announcement modes
- **Speaker Toggle** - Enable/disable I2S output in settings (only shown on supported hardware)
- **Wiring** - I2S pins on ESP32-S3 DevKitC-1: BCLK=GPIO16, LRC=GPIO17, DOUT=GPIO18

### Added - Hardware
- **FPVGate AIO V3** - New All-In-One board target (upcoming official hardware release coming soon)
  - Custom pin mapping: RGB on D7 (GPIO44), 3 LEDs, RX5808 on D2-D5, buzzer on D6
  - Mode switch on D0 (GPIO1), SD card on D1/D8/D9/D10
- **XIAO ESP32S3 Plus** - New board definition with 16MB flash
  - Custom pin mapping optimized for the Plus variant
- **Centralized NUM_LEDS** - Each board now defines its own LED count in config.h
  - AIO V3: 3 LEDs, all other boards: 2 LEDs

### Changed
- Config version bumped from 14 to 16 (automatic migration)
- New config fields: `speakerEnabled`, `rhEnabled`, `rhHostIP[32]`, `rhNodeIndex`
- `HAS_I2S_AUDIO` feature flag for boards with I2S pins defined
- `HAS_SD_CARD_SUPPORT` and `HAS_RGB_LED` flags updated for new boards
- Updated CONTRIBUTORS.md with racefpv's latest contributions

### Removed
- Removed ESP32-C3 board pin definitions from config.h
- Removed external antenna mentions from documentation
