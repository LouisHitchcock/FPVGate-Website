# Seeed Studio XIAO ESP32S3 (8MB) - Wiring Diagram

## Pin Configuration
```
XIAO ESP32S3    RX5808              SD Card (SPI)        Optional
D2 (GPIO3)  ─── RSSI             D1 (GPIO2) ─── CS     
D4 (GPIO5)  ─── CH1 (DATA)       D8 (GPIO7) ─── SCK    
D5 (GPIO6)  ─── CH2 (SELECT)     D9 (GPIO8) ─── MOSI   
D3 (GPIO4)  ─── CH3 (CLOCK)      D10 (GPIO9) ── MISO   
D0 (GPIO1)  ───────────────── Mode Switch               
D4 (GPIO5)  ───────────────── Buzzer (+)               
D7 (GPIO44) ───────────────── NeoPixel DIN             
GND         ─── GND              GND       ─── GND     
5V (VUSB)   ─── +5V              3V3/5V    ─── VCC     
```

Notes
- Power LEDs from VUSB (5V) or 3V3; add 330 Ω series resistor on DIN and 470–1000 µF cap across supply.
- SD wiring matches the official `SeeedXIAOESP32S3` firmware target.
