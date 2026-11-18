# Installing C5MK 1.3.0

Choose the package by receiver wiring. The standard C5MK AIO uses c5mkaio (C5 TX GPIO11 and RX GPIO12). Legacy XIAO D5/D4 uses xiaoc5 (TX GPIO24, RX GPIO23). Standard Waveshare C5-Zero uses c5zero (TX GPIO4, RX GPIO5).

Use the C5 USB port. With esptool 5.1 or newer, detect capacity and make a full flash backup before writing. Replace PORT and SIZE with your serial port and detected capacity in bytes.

    python -m esptool --chip esp32c5 --port PORT flash-id
    python -m esptool --chip esp32c5 --port PORT read-flash 0 SIZE backup.bin
    python -m esptool --chip esp32c5 --port PORT write-flash 0x2000 bootloader.bin 0x8000 partitions.bin 0xf000 ota_data_initial.bin 0x20000 firmware.bin

After restart, confirm the matching C5 board identity, live RSSI and a deliberate pass. For the AIO also verify a cold start on the intended power source. If the receiver goes offline, consult the known limitation in RELEASE_NOTES.md.
