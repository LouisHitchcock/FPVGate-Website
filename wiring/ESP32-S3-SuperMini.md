# ESP32-S3 Super Mini (4MB Flash) - Wiring Diagram

**Compact form factor for FPVGate**

## Pin Configuration

```
ESP32-S3        RX5808           SD Card          Optional
GPIO3    ────── RSSI             
GPIO6    ────── CH1 (DATA)       
GPIO7    ────── CH2 (SELECT)     
GPIO4    ────── CH3 (CLOCK)      
GPIO8    ────────────────────── CS
GPIO2    ────────────────────── SCK
GPIO10   ────────────────────── MOSI
GPIO9    ────────────────────── MISO
GPIO1    ─────────────────────────────────── LED (External)
GPIO48   ─────────────────────────────────── WS2812 RGB LED
GPIO5    ─────────────────────────────────── Buzzer (3.3V-5V)
GPIO0    ─────────────────────────────────── Battery Voltage (via divider)
GPIO1    ─────────────────────────────────── Mode Switch
GND      ────── GND           ─── GND      ─── GND
5V       ────── +5V           ─── 5V       ─── 5V
```

## Component Requirements

| Component | Required | Notes |
|-----------|----------|-------|
| **ESP32-S3 Super Mini** | Yes | 4MB Flash variant |
| **RX5808 Module** | Yes | 5.8GHz receiver ([SPI mod required](https://sheaivey.github.io/rx5808-pro-diversity/docs/rx5808-spi-mod.html)) |
| **MicroSD Card** | Yes | FAT32, 1GB+ for audio storage |
| **5V Power Supply** | Yes | 18650 battery + 5V regulator recommended |
| **WS2812 RGB LEDs** | Optional | 1-2 LEDs for visual feedback (GPIO48) |
| **External LED** | Optional | Single LED for basic status (GPIO1) |
| **Active Buzzer** | Optional | 3.3V-5V for audio beeps (GPIO5) |
| **Mode Switch** | Optional | LOW=WiFi, HIGH=RotorHazard mode (GPIO1) |

## Pin Details

### RX5808 Module
- **RSSI (GPIO3)**: Analog signal strength input
- **CH1/DATA (GPIO6)**: SPI data line
- **CH2/SELECT (GPIO7)**: SPI chip select
- **CH3/CLOCK (GPIO4)**: SPI clock

### SD Card (SPI)
- **CS (GPIO8)**: Chip select
- **SCK (GPIO2)**: SPI clock
- **MOSI (GPIO10)**: Master out, slave in
- **MISO (GPIO9)**: Master in, slave out

### Visual Feedback
- **GPIO48**: WS2812/NeoPixel RGB LED (addressable)
- **GPIO1**: External single LED (basic status)

### Audio & Control
- **GPIO5**: Active buzzer output
- **GPIO1**: Mode selection switch (LOW=WiFi, HIGH=RotorHazard)
- **GPIO0**: Battery voltage input (requires 2:1 voltage divider for LiPo monitoring)

## Power Supply

The ESP32-S3 Super Mini requires a stable 5V power supply:
- **Recommended**: 18650 battery (3.7V) + 5V boost converter
- **USB Power**: Can be powered via USB-C for testing (not suitable for field use)
- **Current Draw**: ~200-400mA typical, up to 500mA peak with WiFi active

## Notes

- **Compact Design**: Smaller footprint than DevKitC-1, ideal for portable builds
- **4MB Flash**: Limited storage compared to 8MB variant - sufficient for standard use
- **SD Card**: Ensure FAT32 formatting and proper 5V power for reliable operation
- **RX5808 SPI Mod**: Required for frequency control - [See guide](https://sheaivey.github.io/rx5808-pro-diversity/docs/rx5808-spi-mod.html)
- **RGB LED**: Uses RMT peripheral on ESP32-S3 - compatible with WS2812/WS2812B/SK6812
- **Battery Monitoring**: Requires 2:1 voltage divider (100K/100K resistors) from battery to GPIO0

## References

- [ESP32-S3 Super Mini Documentation](https://www.espboards.dev/esp32/esp32-s3-super-mini/)
- [Complete Hardware Guide](../HARDWARE_GUIDE.md)
