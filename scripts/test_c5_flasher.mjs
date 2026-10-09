// Run with node scripts/test_c5_flasher.mjs. No connected device is touched.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { flashC5, loadC5Firmware, calculateC5MD5 } from '../c5-flasher.js';
import { ESPLoader as ActualESPLoader } from '../vendor/c5/esptool-js-0.7.0.js';
import { inflateSync } from 'node:zlib';
import vm from 'node:vm';

vm.runInNewContext(await readFile(new URL('../vendor/c5/spark-md5-3.0.2.js', import.meta.url), 'utf8'), { window: globalThis });
const md5Input = new Uint8Array([0, 97, 98, 99, 255]);
assert.equal(calculateC5MD5(md5Input.subarray(1, 4)), '900150983cd24fb0d6963f7d28e17f72');

globalThis.location = new URL('http://localhost:8000/flasher.html');
const manifest = JSON.parse(await readFile(new URL('../firmware/c5/alpha-20261008/manifest.json', import.meta.url)));
const fetchFile = async url => new Response(await readFile(new URL(`..${url.pathname}`, import.meta.url)));
for (const [key, build] of Object.entries(manifest.builds)) {
    const files = await loadC5Firmware(build, fetchFile);
    for (const file of files) assert.ok(file.data instanceof Uint8Array);
    assert.equal(files.length, build.mode === 'spi' ? 4 : 3);
    assert.deepEqual(files.map(f => f.address), build.mode === 'spi' ? [8192, 32768, 57344, 65536] : [8192, 32768, 65536]);
    for (let i = 0; i < files.length - 1; i++) assert.ok(files[i].address + files[i].data.length <= files[i + 1].address, 'Flash images must not overlap');
    const partitions = Buffer.from(files[1].data, 'binary');
    let appPartition;
    for (let offset = 0; offset < partitions.length && partitions.readUInt16LE(offset) === 0x50aa; offset += 32) {
        if (partitions[offset + 2] === 0 && partitions.readUInt32LE(offset + 4) === 0x10000) appPartition = partitions.readUInt32LE(offset + 8);
    }
    assert.ok(appPartition && files.at(-1).data.length <= appPartition, 'Application must fit its partition at 0x10000');
    console.log(`PASS ${key}: binary sizes, SHA-256 and offsets`);
}
const build = manifest.builds['mk-xiao'];
const events = [];
let chip = 'ESP32-C5';
let failWrite = false;
class Transport { async disconnect() { events.push('disconnect'); } }
class ESPLoader {
    constructor() { this.chip = { CHIP_NAME: chip }; }
    async main() { events.push('connect'); }
    async eraseFlash() { events.push('erase'); }
    async writeFlash(options) {
        events.push('write');
        assert.equal(options.flashMode, 'keep');
        assert.equal(options.eraseAll, false);
        for (const file of options.fileArray) assert.ok(file.data instanceof Uint8Array);
        assert.equal(options.calculateMD5Hash(new Uint8Array([97, 98, 99])), '900150983cd24fb0d6963f7d28e17f72');
        if (failWrite) throw new Error('Verification failed');
        options.reportProgress(0, 50, 100);
    }
}
const deps = { library: { Transport, ESPLoader }, fetchFile, md5: data => createHash('md5').update(data, 'binary').digest('hex') };
const config = { port: {}, build, erase: true, onStatus() {}, onLog() {}, onProgress(value) { if (value === 100) events.push('complete'); } };
await flashC5(config, deps);
assert.deepEqual(events.splice(0), ['connect', 'erase', 'write', 'complete', 'disconnect']);
await flashC5({ ...config, erase: false }, deps);
assert.deepEqual(events.splice(0), ['connect', 'write', 'complete', 'disconnect']);
chip = 'ESP32-S3';
await assert.rejects(flashC5(config, deps), /not ESP32-C5/);
assert.deepEqual(events.splice(0), ['connect', 'disconnect']);
chip = 'ESP32-C5'; failWrite = true;
await assert.rejects(flashC5(config, deps), /Verification failed/);
assert.deepEqual(events.splice(0), ['connect', 'erase', 'write', 'disconnect']);
await assert.rejects(flashC5(config, { ...deps, fetchFile: async () => new Response('corrupt') }), /integrity/);
assert.deepEqual(events.splice(0), []);
await assert.rejects(loadC5Firmware(build, async () => new Response('', { status: 404 })), /HTTP 404/);
const external = { parts: [{ ...build.parts[0], path: 'https://example.com/file.bin' }] };
await assert.rejects(loadC5Firmware(external), /hosted on this site/);
console.log('PASS erase option, wrong chip protection, failed write cleanup, corrupt/missing files and same-origin enforcement');

// Use the shipped library's writeFlash, compression and MD5 verification.
// Only serial/chip operations are simulated. No USB device is accessed.
class ActualWriteLoader extends ESPLoader {
    constructor() { super(); this.IS_STUB = true; this.FLASH_WRITE_SIZE = 16384; }
    debug() {}
    info() {}
    async _updateImageFlashParams(data) { return data; }
    timeoutPerMb() { return 3000; }
    async flashDeflBegin(size, compressedSize) { this.blocks = []; return Math.ceil(compressedSize / this.FLASH_WRITE_SIZE); }
    async flashDeflBlock(data) { this.blocks.push(data); }
    async flashDeflFinish() {}
    async flashMd5sum() { return createHash('md5').update(inflateSync(Buffer.concat(this.blocks))).digest('hex'); }
    async writeFlash(options) { return ActualESPLoader.prototype.writeFlash.call(this, options); }
}
failWrite = false;
for (const [id, firmware] of Object.entries(manifest.builds)) {
    const progress = [];
    await flashC5({ ...config, build: firmware, onProgress: value => progress.push(value) }, {
        library: { Transport, ESPLoader: ActualWriteLoader }, fetchFile, md5: calculateC5MD5
    });
    assert.equal(progress.at(-1), 100);
    assert.ok(progress.includes(99));
    assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]));
    console.log(`PASS real esptool-js writeFlash, compression and MD5: ${id}`);
}
