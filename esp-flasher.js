// Custom ESP32 Flasher using esptool-js library
// This provides inline flashing progress without popups

import { ESPLoader, Transport } from 'https://unpkg.com/esptool-js@0.4.1/bundle.js';

export class CustomESPFlasher {
    constructor() {
        this.port = null;
        this.transport = null;
        this.esploader = null;
        this.onProgress = null;
        this.onLog = null;
        this.onError = null;
        this.onComplete = null;
    }

    // Set up event handlers
    setHandlers({ onProgress, onLog, onError, onComplete }) {
        this.onProgress = onProgress;
        this.onLog = onLog;
        this.onError = onError;
        this.onComplete = onComplete;
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

    // Connect to ESP32 device
    async connect() {
        try {
            this.log('Requesting serial port...');
            this.updateProgress(5, 'Requesting port access');

            // Request serial port
            this.port = await navigator.serial.requestPort();
            
            this.log('Opening serial port...');
            this.updateProgress(10, 'Opening port');

            // Create transport
            this.transport = new Transport(this.port, true);

            // Create ESP loader
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

            this.log('Connecting to device...');
            this.updateProgress(20, 'Detecting chip');

            const chip = await this.esploader.main();
            
            this.log(`Connected to ${chip}`);
            this.updateProgress(25, `Connected to ${chip}`);

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
