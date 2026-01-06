# Board Configuration System

## Overview

The FPVGate web flasher dynamically fetches supported board configurations from the main FPVGate repository. This allows you to add or remove board support without updating the website code.

## How It Works

1. **On page load**, the website fetches `boards.json` from:
   ```
   https://raw.githubusercontent.com/LouisHitchcock/FPVGate/main/boards.json
   ```

2. **Boards are split into two categories:**
   - `standard_boards` - Always visible in the board selector
   - `expert_boards` - Only visible when "Expert Mode" is enabled

3. **If the fetch fails**, the website uses hardcoded fallback boards to ensure it still works

## Setup in FPVGate Repository

### 1. Create `boards.json` in the FPVGate repo root:

```json
{
  "boards": [
    {
      "value": "esp32s3",
      "label": "ESP32-S3 DevKitC-1 (8MB Flash) - Recommended",
      "expert_mode": 0
    },
    {
      "value": "esp32s3supermini",
      "label": "ESP32-S3 Super Mini (4MB Flash)",
      "expert_mode": 0
    },
    {
      "value": "esp32c3",
      "label": "ESP32-C3",
      "expert_mode": 1
    },
    {
      "value": "esp32c6",
      "label": "ESP32-C6",
      "expert_mode": 1
    },
    {
      "value": "lilygo",
      "label": "LilyGO T-Energy S3",
      "expert_mode": 1
    }
  ]
}
```

### 2. Board Configuration Object

Each board needs:
- **`value`**: Unique identifier (used in BOARD_CONFIGS in flasher.js)
- **`label`**: Display name shown to users
- **`expert_mode`**: `0` for standard boards (always visible), `1` for expert boards (only visible in Expert Mode)

### 3. Adding a New Board

1. Add the board to `boards.json` in the appropriate category
2. Add the board configuration to `BOARD_CONFIGS` in `flasher.js` (in the fpvgate-website repo)
3. Build and upload binaries to the GitHub release with matching filenames

Example adding ESP32-S2:

**In FPVGate/boards.json:**
```json
{
  "boards": [
    ...
    {
      "value": "esp32s2",
      "label": "ESP32-S2",
      "expert_mode": 1
    }
  ]
}
```

**In fpvgate-website/flasher.js:**
```javascript
const BOARD_CONFIGS = {
  ...
  esp32s2: {
    name: 'ESP32-S2',
    chipFamily: 'ESP32-S2',
    parts: [
      { path: 'bootloader.bin', offset: 0x1000 },
      { path: 'partitions.bin', offset: 0x8000 },
      { path: 'firmware.bin', offset: 0x10000 }
    ]
  }
};
```

### 4. Binary File Requirements

For each release, ensure binaries are named:
- `bootloader.bin`
- `partitions.bin`
- `firmware.bin`
- `littlefs.bin` (or `filesystem.bin` for 4MB boards)

The website automatically constructs URLs like:
```
https://github.com/LouisHitchcock/FPVGate/releases/download/v1.5.0/bootloader.bin
```

## Benefits

✅ **Easy Updates** - Add board support by editing one JSON file  
✅ **No Website Redeployment** - Changes take effect immediately  
✅ **Version Control** - Track board support changes in the main repo  
✅ **Graceful Degradation** - Fallback boards if fetch fails  
✅ **Centralized** - One source of truth for supported hardware

## Example Use Cases

**Promoting a board from Expert to Standard:**
Change `"expert_mode": 1` to `"expert_mode": 0` in `boards.json`

**Deprecating a board:**
Remove it from `boards.json` - it will no longer appear in the flasher

**Beta testing a new board:**
Add it with `"expert_mode": 1` for testing, then change to `0` when stable
