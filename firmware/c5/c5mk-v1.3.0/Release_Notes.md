# C5MK v1.3.0

C5MK 1.3.0 pairs with [FPVGate v1.9.0](https://github.com/LouisHitchcock/FPVGate/releases/tag/v1.9.0) and adds a dedicated receiver image for the standard FPVGate C5MK AIO.

- Native USB RotorHazard and FPVGate UART now share the 95 ms rolling median and matching pass-admission defaults. Wire protocol 3 is unchanged. No general timing-accuracy improvement is claimed.
- Existing receiver LED patterns show waiting, connection, traffic and radio faults. See the status guide in the source repository.

| Package | Receiver wiring | C5 TX / RX |
| --- | --- | --- |
| c5mkaio | Standard FPVGate C5MK AIO, XIAO D6/D7 | GPIO11 / GPIO12 |
| xiaoc5 | Legacy XIAO C5, D5/D4 | GPIO24 / GPIO23 |
| c5zero | Standard Waveshare C5-Zero wiring | GPIO4 / GPIO5 |

## Installation and recovery

Use your board's package and the [web flasher](https://fpvgate.xyz/c5.html), or the C5's own USB port with esptool 5.1 or later. Detect the actual flash capacity and back up the flash before a full install. The board packages contain bootloader, partitions, OTA initialisation and application images. Use the S3 C5 updater only when the C5 is online and reports the matching board identity. After installing, check the identity, live RSSI, a deliberate test pass and normal standalone cold starts.

One AIO reproduced loss of RSSI after a cold start powered from S3 USB alone. Entering C5 BOOT mode and then restarting the C5 restored operation on that unit. The cause and an automatic recovery remain unverified. The earlier shared-median USB soak did not pass its full fixture run, and independent multi-transmitter qualification remains open.

The separate Waveshare GPIO11/12 wiring build has separate provenance and requires its own hardware qualification. It is outside the three standard images in this release.
