# Seeed Studio XIAO ESP32S3 (8MB) - Wiring Diagram

## Pin Configuration
```
XIAO ESP32S3    RX5808              SD Card (SPI)        Optional
D2 (GPIO3)  ─── RSSI             D1 (GPIO2) ─── CS     
D4 (GPIO5)  ─── CH1 (DATA)       D8 (GPIO7) ─── SCK    
D5 (GPIO6)  ─── CH2 (SELECT)     D9 (GPIO8) ─── MOSI   
D3 (GPIO4)  ─── CH3 (CLOCK)      D10 (GPIO9) ── MISO   
D6 (GPIO6)  ───────────────── Buzzer (+)               
D7 (GPIO44) ───────────────── NeoPixel DIN
GND         ─── GND              GND       ─── GND     
3V3         ─── +5V/VCC (power)  3V3       ─── VCC     
```

## Component Requirements

| Component | Required | Notes |
|-----------|----------|-------|
| **Seeed Studio XIAO ESP32S3** | Yes | 8MB Flash variant |
| **RX5808 Module** | Yes | 5.8GHz receiver ([SPI mod required](https://sheaivey.github.io/rx5808-pro-diversity/docs/rx5808-spi-mod.html)) |
| **Micro SD Card Reader (3.3V)** | Yes | SPI-mode module for audio storage; must use a 3.3V-logic reader (e.g. "Micro SD Card Adapter" with built-in level shifter) |
| **MicroSD Card** | Yes | FAT32, 1GB+ for audio files |
| **5V Power Supply** | Yes | USB-C power or any 5V source |
| **WS2812 RGB LEDs** | Optional | 1-2 LEDs for visual feedback (D7) |
| **Active Buzzer** | Optional | 3.3V-5V for audio beeps (D6) |

## Notes
- Power LEDs from VUSB (5V) or 3V3; add 330 Ω series resistor on DIN and 470–1000 µF cap across supply.
- SD wiring matches the official `SeeedXIAOESP32S3` firmware target.
