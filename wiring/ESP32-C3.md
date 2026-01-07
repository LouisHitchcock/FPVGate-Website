# ESP32-C3 - Wiring Diagram

**Expert mode - RISC-V based ESP32 variant**

## Pin Configuration

```
ESP32-C3        RX5808           SD Card          Optional
GPIO3    ────── RSSI             
GPIO6    ────── CH1 (DATA)       
GPIO7    ────── CH2 (SELECT)     
GPIO4    ────── CH3 (CLOCK)      
GPIO8    ────────────────────── CS
GPIO2    ────────────────────── SCK
GPIO10   ────────────────────── MOSI
GPIO9    ────────────────────── MISO
GPIO1    ─────────────────────────────────── LED (External)
GPIO5    ─────────────────────────────────── Buzzer (3.3V-5V)
GPIO0    ─────────────────────────────────── Battery Voltage (via divider)
GPIO1    ─────────────────────────────────── Mode Switch
GND      ────── GND           ─── GND      ─── GND
5V       ────── +5V           ─── 5V       ─── 5V
```

## Component Requirements

| Component | Required | Notes |
|-----------|----------|-------|
| **ESP32-C3** | Yes | RISC-V based variant |
| **RX5808 Module** | Yes | 5.8GHz receiver ([SPI mod required](https://sheaivey.github.io/rx5808-pro-diversity/docs/rx5808-spi-mod.html)) |
| **MicroSD Card** | Yes | FAT32, 1GB+ for audio storage |
| **5V Power Supply** | Yes | USB power or any 5V power source |
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
- **GPIO1**: External single LED (basic status)

### Audio & Control
- **GPIO5**: Active buzzer output
- **GPIO1**: Mode selection switch (LOW=WiFi, HIGH=RotorHazard)
- **GPIO0**: Battery voltage input (requires 2:1 voltage divider for LiPo monitoring)

## Power Supply

The ESP32-C3 requires a stable 5V power supply:
- **USB Power**: Easiest option - powered via USB-C port
- **External 5V**: Any regulated 5V power source (battery pack, bench supply, etc.)
- **Current Draw**: ~150-300mA typical, up to 400mA peak with WiFi active

## Notes

- **RISC-V Architecture**: Uses RISC-V core instead of Xtensa (ESP32/ESP32-S3)
- **USB CDC**: Built-in USB Serial/JTAG support (no external USB-UART bridge needed)
- **No RGB LED Support**: This board configuration does not include WS2812 RGB LED support
- **Limited GPIO**: Fewer GPIO pins available compared to ESP32-S3
- **SD Card**: Ensure FAT32 formatting and proper 5V power for reliable operation
- **RX5808 SPI Mod**: Required for frequency control - [See guide](https://sheaivey.github.io/rx5808-pro-diversity/docs/rx5808-spi-mod.html)
- **Battery Monitoring**: Requires 2:1 voltage divider (100K/100K resistors) from battery to GPIO0

## Expert Mode Notice

The ESP32-C3 is marked as **Expert Mode** because:
- Different architecture (RISC-V) may have compatibility considerations
- No RGB LED support in current configuration
- Fewer community builds and testing compared to ESP32-S3 variants
- Recommended for users comfortable with troubleshooting

## References

- [ESP32-C3 Documentation](https://www.espressif.com/en/products/socs/esp32-c3)
- [Complete Hardware Guide](../HARDWARE_GUIDE.md)
