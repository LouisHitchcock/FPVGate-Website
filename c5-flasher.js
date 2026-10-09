// Dedicated C5 transport. Do not change the timer's esp-flasher.js dependency.
export async function loadC5Firmware(build, fetchFile = fetch) {
    const files = await Promise.all(build.parts.map(async part => {
        const url = new URL(part.path, location.href);
        if (url.origin !== location.origin) throw new Error('C5 firmware must be hosted on this site.');
        const response = await fetchFile(url);
        if (!response.ok) throw new Error(`Cannot download ${part.path} (HTTP ${response.status}).`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        if (bytes.length !== part.size || hash !== part.sha256) throw new Error(`Firmware integrity check failed: ${part.path}. Reload and try again.`);
        return { address: part.offset, data: bytes };
    }));
    return files;
}

export function calculateC5MD5(data) {
    // esptool-js 0.7 passes bytes, possibly a view into a larger buffer.
    return globalThis.SparkMD5.ArrayBuffer.hash(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}

export async function flashC5({ port, build, erase, onStatus, onProgress, onLog }, dependencies = {}) {
    let transport;
    try {
        onStatus('Downloading and checking firmware…');
        const files = await loadC5Firmware(build, dependencies.fetchFile);
        const { ESPLoader, Transport } = dependencies.library || await import('./vendor/c5/esptool-js-0.7.0.js');
        if (!dependencies.md5) await import('./vendor/c5/spark-md5-3.0.2.js');
        const md5 = dependencies.md5 || calculateC5MD5;
        transport = new Transport(port, false);
        const loader = new ESPLoader({
            transport, baudrate: 115200,
            terminal: { clean() {}, write: onLog, writeLine: onLog }
        });
        onStatus('Connecting to C5 bootloader…');
        await loader.main();
        if (loader.chip?.CHIP_NAME !== 'ESP32-C5') {
            throw new Error(`Connected chip is ${loader.chip?.CHIP_NAME || 'unknown'}, not ESP32-C5. No firmware was written. Select your C5 radio USB port.`);
        }
        onLog(`Target checked: ESP32-C5. Build: ${build.project} ${build.version} (${build.environment}).`);
        if (erase) {
            onStatus('Erasing C5 flash…');
            await loader.eraseFlash();
        }
        onStatus('Writing and verifying C5 firmware…');
        const totalBytes = files.reduce((sum, file) => sum + file.data.length, 0);
        await loader.writeFlash({
            fileArray: files, flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep',
            eraseAll: false, compress: true,
            calculateMD5Hash: md5,
            reportProgress(index, written, total) {
                const previous = files.slice(0, index).reduce((sum, file) => sum + file.data.length, 0);
                // The library reports compressed bytes for each file.
                const current = total > 0 ? files[index].data.length * written / total : 0;
                onProgress(Math.min(99, Math.floor((previous + current) / totalBytes * 100)));
            }
        });
        // Power cycling is explicit in the UI; no reset races after verification.
        onProgress(100);
        onStatus('Firmware written and verified. Power cycle your C5 radio.');
    } finally {
        if (transport) {
            try { await transport.disconnect(); } catch (error) { onLog(`USB cleanup: ${error.message}`); }
        } else {
            try { if (port.readable || port.writable) await port.close(); } catch (_) { /* already closed */ }
        }
    }
}
