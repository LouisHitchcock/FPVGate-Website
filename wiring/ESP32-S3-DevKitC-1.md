# ESP32-S3 DevKitC-1 (8MB Flash) - Wiring Diagram

**Recommended board for FPVGate**

## Pin Configuration

```
ESP32-S3        RX5808           SD Card          Optional
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
GPIO1    ─────────────────────────────────── Battery Voltage (via divider)
GPIO9    ─────────────────────────────────── Mode Switch
GND      ────── GND           ─── GND      ─── GND
5V       ────── +5V           ─── 5V       ─── 5V
```

## Component Requirements

| Component | Required | Notes |
|-----------|----------|-------|
| **ESP32-S3-DevKitC-1** | Yes | 8MB Flash variant |
| **RX5808 Module** | Yes | 5.8GHz receiver ([SPI mod required](https://sheaivey.github.io/rx5808-pro-diversity/docs/rx5808-spi-mod.html)) |
| **MicroSD Card** | Yes | FAT32, 1GB+ for audio storage |
| **5V Power Supply** | Yes | 18650 battery + 5V regulator recommended |
| **WS2812 RGB LEDs** | Optional | 1-2 LEDs for visual feedback (GPIO48) |
| **External LED** | Optional | Single LED for basic status (GPIO2) |
| **Active Buzzer** | Optional | 3.3V-5V for audio beeps (GPIO5) |
| **Mode Switch** | Optional | LOW=WiFi, HIGH=RotorHazard mode (GPIO9) |

## Pin Details

### RX5808 Module
- **RSSI (GPIO4)**: Analog signal strength input
- **CH1/DATA (GPIO10)**: SPI data line
- **CH2/SELECT (GPIO11)**: SPI chip select
- **CH3/CLOCK (GPIO12)**: SPI clock

### SD Card (SPI)
- **CS (GPIO39)**: Chip select
- **SCK (GPIO36)**: SPI clock
- **MOSI (GPIO35)**: Master out, slave in
- **MISO (GPIO37)**: Master in, slave out

### Visual Feedback
- **GPIO48**: WS2812/NeoPixel RGB LED (addressable)
- **GPIO2**: External single LED (basic status)

### Audio & Control
- **GPIO5**: Active buzzer output
- **GPIO9**: Mode selection switch (LOW=WiFi, HIGH=RotorHazard)
- **GPIO1**: Battery voltage input (requires 2:1 voltage divider for LiPo monitoring)

## Power Supply

The ESP32-S3 DevKitC-1 requires a stable 5V power supply:
- **Recommended**: 18650 battery (3.7V) + 5V boost converter
- **USB Power**: Can be powered via USB-C for testing (not suitable for field use)
- **Current Draw**: ~200-400mA typical, up to 500mA peak with WiFi active

## Notes

- **GPIO3 Strapping Pin**: Avoid using GPIO3 for RSSI - causes boot issues!
- **SD Card**: Ensure FAT32 formatting and proper 5V power for reliable operation
- **RX5808 SPI Mod**: Required for frequency control - [See guide](https://sheaivey.github.io/rx5808-pro-diversity/docs/rx5808-spi-mod.html)
- **RGB LED**: Uses RMT peripheral on ESP32-S3 - compatible with WS2812/WS2812B/SK6812
- **Battery Monitoring**: Requires 2:1 voltage divider (100K/100K resistors) from battery to GPIO1

## References

- [ESP32-S3 DevKitC-1 Documentation](https://docs.keyestudio.com/projects/ESP32-S3/en/latest/1.Introduction.html)
- [Complete Hardware Guide](../HARDWARE_GUIDE.md)
