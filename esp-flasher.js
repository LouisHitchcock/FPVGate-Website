// Custom ESP32 Flasher using esptool-js library
// This provides inline flashing progress without popups

import { ESPLoader, Transport } from 'https://unpkg.com/esptool-js@0.4.1/bundle.js';

// Espressif's own USB vendor id. A board exposing this is talking through the
// chip's built-in USB-serial-JTAG, which is what the ROM bootloader uses.
const ESPRESSIF_VID = 0x303A;

// How long to wait for the bootloader device to appear after a reset, and how
// often to look for it.
const REENUMERATE_TIMEOUT_MS = 8000;
const REENUMERATE_POLL_MS = 250;

/*
 * Why this file is more complicated than "open port, flash it".
 *
 * From 1.8.0 the AIO runs USB networking, which means TinyUSB with a composite
 * device (Seeed vid 0x2886) carrying both the RNDIS network interface and the
 * serial console. Entering the bootloader still works exactly as before:
 * esptool toggles DTR/RTS, the firmware sees the pattern and calls
 * usb_persist_restart(RESTART_BOOTLOADER).
 *
 * The catch is in the Arduino core. On ESP32-S3 that function calls
 * usb_switch_to_cdc_jtag() before restarting, so the board comes back as a
 * DIFFERENT USB device, Espressif vid 0x303A, and the SerialPort we were
 * holding no longer exists. esptool reports the port as not functioning and
 * gives up, even though the reset it asked for worked perfectly.
 *
 * Boards running 1.7.3 and earlier used ARDUINO_USB_MODE=1, which is already
 * the 0x303A serial-JTAG device, so their identity does not change on reset and
 * none of this applies. Which device is in front of us therefore depends on the
 * firmware currently installed, not on the version being flashed.
 */

export class CustomESPFlasher {
    constructor() {
        this.port = null;
        this.transport = null;
        this.esploader = null;
        this.onProgress = null;
        this.onLog = null;
        this.onError = null;
        this.onComplete = null;
        this.onNeedsPort = null;
    }

    // Set up event handlers
    setHandlers({ onProgress, onLog, onError, onComplete, onNeedsPort }) {
        this.onProgress = onProgress;
        this.onLog = onLog;
        this.onError = onError;
        this.onComplete = onComplete;
        // Called when the board has re-enumerated and the user must pick it
        // again, so the UI can explain the second dialog before it appears.
        this.onNeedsPort = onNeedsPort;
    }

    log(message) {
        if (this.onLog) {
            this.onLog(message);
        }
        console.log(message);
    }

    updateProgress(percent, status) {
        if (this.onProgress) {
            this.onProgress(percent, status);
        }
    }

    // True if this port is the chip's built-in serial-JTAG, meaning either the
    // ROM bootloader or pre-1.8.0 firmware. Such a port keeps its identity
    // across a reset, so no reconnection is needed.
    isEspressifPort(port) {
        try {
            return (port && port.getInfo ? port.getInfo() : {}).usbVendorId === ESPRESSIF_VID;
        } catch (e) {
            return false;
        }
    }

    // Attach esptool to a port. Separated from connect() so it can be repeated
    // against the replacement port after a re-enumeration.
    async attach(port) {
        this.port = port;
        this.transport = new Transport(port, true);
        this.esploader = new ESPLoader({
            transport: this.transport,
            baudrate: 115200,
            romBaudrate: 115200,
            terminal: {
                clean: () => {},
                writeLine: (msg) => this.log(msg),
                write: (msg) => this.log(msg)
            },
            enableTracing: false
        });
        return await this.esploader.main();
    }

    // Find the bootloader device that replaced the one we were talking to.
    // Web Serial grants permission per device, so a board whose 0x303A identity
    // has been seen before is returned silently. A first-time board needs one
    // more picker, filtered so only the right device is offered.
    async awaitBootloaderPort() {
        const deadline = Date.now() + REENUMERATE_TIMEOUT_MS;
        while (Date.now() < deadline) {
            const granted = await navigator.serial.getPorts();
            const match = granted.find((p) => this.isEspressifPort(p) && p !== this.port);
            if (match) {
                this.log('Found the bootloader device automatically.');
                return match;
            }
            await new Promise((r) => setTimeout(r, REENUMERATE_POLL_MS));
        }

        this.log('The board has reconnected in bootloader mode under a new identity.');
        this.log('Select it in the dialog to continue. This is only needed the first');
        this.log('time you flash this board on this computer.');
        if (this.onNeedsPort) {
            this.onNeedsPort();
        }
        return await navigator.serial.requestPort({
            filters: [{ usbVendorId: ESPRESSIF_VID }]
        });
    }

    async releaseTransport() {
        try {
            if (this.transport) await this.transport.disconnect();
        } catch (e) { /* the device has already gone */ }
        try {
            if (this.port) await this.port.close();
        } catch (e) { /* the device has already gone */ }
        this.transport = null;
        this.esploader = null;
    }

    // Connect to ESP32 device
    async connect() {
        try {
            this.log('Requesting serial port...');
            this.updateProgress(5, 'Requesting port access');

            const selected = await navigator.serial.requestPort();
            const startedInBootloaderMode = this.isEspressifPort(selected);

            this.log('Opening serial port...');
            this.updateProgress(10, 'Opening port');
            this.log('Connecting to device...');
            this.updateProgress(20, 'Detecting chip');

            let chip;
            try {
                chip = await this.attach(selected);
            } catch (error) {
                // A board already on the serial-JTAG device keeps its identity
                // across a reset, so a failure there is a genuine failure and
                // there is nothing to reconnect to.
                if (startedInBootloaderMode) throw error;

                this.log('Initial connection failed: ' + error.message);
                this.log('That is expected on a board running USB networking, because');
                this.log('entering the bootloader changes its USB identity. Reconnecting...');
                this.updateProgress(15, 'Reconnecting after reset');

                await this.releaseTransport();
                const bootPort = await this.awaitBootloaderPort();
                chip = await this.attach(bootPort);
            }

            this.log('Connected to ' + chip);
            this.updateProgress(25, 'Connected to ' + chip);

            return chip;

        } catch (error) {
            this.log(`Connection error: ${error.message}`);
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }

    // Flash firmware to device
    async flash(manifest, eraseAll = false) {
        try {
            if (!this.esploader) {
                throw new Error('Not connected to device');
            }

            // Erase flash if requested
            if (eraseAll) {
                this.log('Erasing entire flash...');
                this.updateProgress(30, 'Erasing flash');
                await this.esploader.eraseFlash();
                this.log('Flash erased');
                this.updateProgress(40, 'Flash erased');
            } else {
                this.updateProgress(40, 'Preparing firmware');
            }

            // Prepare file data
            this.log('Downloading firmware files...');
            this.updateProgress(45, 'Loading firmware');

            const fileArray = await Promise.all(
                manifest.builds[0].parts.map(async (part) => {
                    this.log(`Downloading ${part.path}...`);
                    const response = await fetch(part.path);
                    if (!response.ok) {
                        throw new Error(`Failed to download ${part.path}: ${response.statusText}`);
                    }
                    const data = await response.arrayBuffer();
                    const fileName = part.path.split('/').pop();
                    this.log(`Downloaded ${fileName} (${data.byteLength} bytes)`);
                    return {
                        data: data,
                        address: part.offset
                    };
                })
            );

            this.log('Starting flash write...');
            this.updateProgress(50, 'Writing firmware');

            // Write all files to flash at once
            const totalSize = fileArray.reduce((sum, file) => sum + file.data.byteLength, 0);
            
            this.log('Flashing all firmware files...');
            
            // Convert ArrayBuffers to binary strings
            const formattedFiles = fileArray.map(file => {
                const uint8Array = new Uint8Array(file.data);
                let binaryString = '';
                for (let i = 0; i < uint8Array.length; i++) {
                    binaryString += String.fromCharCode(uint8Array[i]);
                }
                return {
                    data: binaryString,
                    address: file.address
                };
            });
            
            // Flash all files with progress tracking
            await this.esploader.writeFlash({
                fileArray: formattedFiles,
                flashSize: 'keep',
                flashMode: 'keep',
                flashFreq: 'keep',
                eraseAll: false,
                compress: true,
                reportProgress: (fileIndex, written, total) => {
                    const overallProgress = 50 + ((written / total) * 45);
                    const fileName = manifest.builds[0].parts[fileIndex]?.path.split('/').pop() || 'firmware';
                    this.updateProgress(
                        Math.round(overallProgress),
                        `Writing ${fileName} (${Math.round((written / total) * 100)}%)`
                    );
                }
            });
            
            this.log('All firmware files written successfully');

            this.log('Firmware flashed successfully!');
            this.updateProgress(95, 'Resetting device');

            // Hard reset the device
            await this.esploader.hardReset();

            this.log('Device reset complete');
            this.updateProgress(100, 'Complete');

            if (this.onComplete) {
                this.onComplete();
            }

        } catch (error) {
            this.log(`Flash error: ${error.message}`);
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }

    // Disconnect from device
    async disconnect() {
        try {
            if (this.transport) {
                await this.transport.disconnect();
            }
            if (this.port) {
                await this.port.close();
            }
            this.port = null;
            this.transport = null;
            this.esploader = null;
            this.log('Disconnected');
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    }
}
