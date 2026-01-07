# LilyGO T-Energy S3 - Wiring Diagram

**Expert mode - Integrated battery management**

## Pin Configuration

```
T-Energy S3     RX5808           SD Card          Optional
GPIO4    ────── RSSI             
GPIO10   ────── CH1 (DATA)       
GPIO11   ────── CH2 (SELECT)     
GPIO12   ────── CH3 (CLOCK)      
GPIO39   ────────────────────── CS
GPIO36   ────────────────────── SCK
GPIO35   ────────────────────── MOSI
GPIO37   ────────────────────── MISO
GPIO2    ─────────────────────────────────── LED (External)
GPIO48   ─────────────────────────────────── WS2812 RGB LED
GPIO5    ─────────────────────────────────── Buzzer (3.3V-5V)
GPIO3    ─────────────────────────────────── Battery Voltage (Built-in)
GPIO9    ─────────────────────────────────── Mode Switch
GND      ────── GND           ─── GND      ─── GND
5V       ────── +5V           ─── 5V       ─── 5V
```

## Component Requirements

| Component | Required | Notes |
|-----------|----------|-------|
| **LilyGO T-Energy S3** | Yes | Integrated battery management |
| **RX5808 Module** | Yes | 5.8GHz receiver ([SPI mod required](https://sheaivey.github.io/rx5808-pro-diversity/docs/rx5808-spi-mod.html)) |
| **MicroSD Card** | Yes | FAT32, 1GB+ for audio storage |
| **18650 Battery** | Optional | Built-in battery holder and charging |
| **WS2812 RGB LEDs** | Optional | 1-2 LEDs for visual feedback (GPIO48) |
| **External LED** | Optional | Single LED for basic status (GPIO2) |
| **Active Buzzer** | Optional | 3.3V-5V for audio beeps (GPIO5) |
| **Mode Switch** | Optional | LOW=WiFi, HIGH=RotorHazard mode (GPIO9) |

## Pin Details

### RX5808 Module
- **RSSI (GPIO4)**: Analog signal strength input (same as DevKitC-1)
- **CH1/DATA (GPIO10)**: SPI data line (same as DevKitC-1)
- **CH2/SELECT (GPIO11)**: SPI chip select (same as DevKitC-1)
- **CH3/CLOCK (GPIO12)**: SPI clock (same as DevKitC-1)

### SD Card (SPI)
- **CS (GPIO39)**: Chip select (same as DevKitC-1)
- **SCK (GPIO36)**: SPI clock (same as DevKitC-1)
- **MOSI (GPIO35)**: Master out, slave in (same as DevKitC-1)
- **MISO (GPIO37)**: Master in, slave out (same as DevKitC-1)

### Visual Feedback
- **GPIO48**: WS2812/NeoPixel RGB LED (addressable)
- **GPIO2**: External single LED (basic status)

### Audio & Control
- **GPIO5**: Active buzzer output
- **GPIO9**: Mode selection switch (LOW=WiFi, HIGH=RotorHazard)
- **GPIO3**: Battery voltage input (built-in 2:1 divider - no external resistors needed!)

## Power Supply

The LilyGO T-Energy S3 has integrated battery management:
- **Built-in 18650 Holder**: Single 18650 cell (3.7V nominal)
- **USB-C Charging**: Built-in charging circuit (1A charge current)
- **5V Boost Converter**: Internal boost to 5V for system power
- **Battery Monitoring**: Built-in voltage divider on GPIO3 (no external components needed)
- **Current Draw**: ~200-400mA typical, up to 500mA peak with WiFi active

## Unique Features

### Built-in Battery Management
- **Charging IC**: Integrated TP4054 or similar for safe Li-ion charging
- **Protection**: Over-charge, over-discharge, over-current protection
- **LED Indicators**: Built-in charge status LEDs on board
- **No External Components**: Battery voltage divider already included

### Pin Compatibility
The T-Energy S3 uses the **same pinout** as ESP32-S3 DevKitC-1 for most peripherals:
- RX5808 connections identical (GPIO4, 10, 11, 12)
- SD card connections identical (GPIO39, 36, 35, 37)
- Only difference: Battery monitoring on GPIO3 instead of GPIO1

## Notes

- **Battery Required**: Designed for portable/field use with 18650 cell
- **SD Card**: Ensure FAT32 formatting and proper 5V power for reliable operation
- **RX5808 SPI Mod**: Required for frequency control - [See guide](https://sheaivey.github.io/rx5808-pro-diversity/docs/rx5808-spi-mod.html)
- **RGB LED**: Uses RMT peripheral on ESP32-S3 - compatible with WS2812/WS2812B/SK6812
- **No External Divider**: Battery voltage divider is built-in (100K/100K on GPIO3)
- **Charging**: Connect USB-C to charge - red LED indicates charging, green/blue indicates full

## Expert Mode Notice

The LilyGO T-Energy S3 is marked as **Expert Mode** because:
- Less common board - fewer community builds and documentation
- Battery management requires understanding Li-ion safety
- Requires specific T-Energy S3 board definition
- Recommended for users building portable lap timers

## References

- [LilyGO T-Energy S3 Documentation](https://github.com/Xinyuan-LilyGO/T-Energy)
- [Complete Hardware Guide](../HARDWARE_GUIDE.md)
- [LilyGO T-Energy S3 Verification](../LILYGO_TENERGY_S3_VERIFICATION.md)
