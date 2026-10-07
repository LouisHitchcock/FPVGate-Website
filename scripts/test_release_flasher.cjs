const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const boards = {
    esp32s3: 'ESP32S3',
    fpvgateaio: 'FPVGateAIO',
    fpvgatesolo: 'FPVGateSolo',
    seeedxiaos3: 'SeeedXIAOESP32S3',
    xiaos3plus: 'XIAOS3Plus'
};

function flasherContext() {
    const elements = new Map();
    const context = vm.createContext({
        URL, console: { log() {}, error() {} }, navigator: { serial: {} },
        window: { location: { href: 'https://fpvgate.xyz/flasher.html' } },
        document: {
            addEventListener() {},
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, { style: {}, textContent: '' });
                return elements.get(id);
            }
        }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'flasher.js'), 'utf8'), context);
    return context;
}

test('v1.8.3 manifests point to all 20 images with matching partition offsets', () => {
    const context = flasherContext();
    for (const [id, directory] of Object.entries(boards)) {
        vm.runInContext(`selectedBoard = '${id}'; selectedVersion = { tag_name: 'v1.8.3' };`, context);
        assert.equal(vm.runInContext('updateFlashInfo()', context), true);
        const manifest = vm.runInContext('generateManifest()', context);
        const parts = manifest.builds[0].parts;
        assert.deepEqual(Array.from(parts, p => p.offset), [0, 0x8000, 0x10000, id === 'xiaos3plus' ? 0x610000 : 0x410000]);
        for (const part of parts) {
            const url = new URL(part.path);
            assert.equal(url.origin, 'https://fpvgate.xyz');
            assert.equal(path.posix.dirname(url.pathname), `/firmware/v1.8.3/${directory}`);
            assert.ok(fs.statSync(path.join(root, url.pathname)).size > 0);
        }
        const partitionData = fs.readFileSync(path.join(root, 'firmware/v1.8.3', directory, 'partitions.bin'));
        let filesystem;
        for (let offset = 0; offset + 32 <= partitionData.length && partitionData.readUInt16LE(offset) === 0x50aa; offset += 32) {
            if (partitionData[offset + 2] === 1 && partitionData[offset + 3] === 0x82) {
                filesystem = { offset: partitionData.readUInt32LE(offset + 4), size: partitionData.readUInt32LE(offset + 8) };
            }
        }
        assert.ok(filesystem);
        assert.equal(parts[3].offset, filesystem.offset);
        assert.equal(fs.statSync(path.join(root, 'firmware/v1.8.3', directory, 'littlefs.bin')).size, filesystem.size);
        const firmware = fs.readFileSync(path.join(root, 'firmware/v1.8.3', directory, 'firmware.bin'));
        assert.ok(firmware.includes(Buffer.from('1.8.3\0')));
    }
});

test('unsupported v1.8.3 boards cannot start flashing', () => {
    const context = flasherContext();
    for (const id of ['esp32s3supermini', 'lilygo', 'esp32c3', 'wavesharelcd2', 'novablade']) {
        vm.runInContext(`selectedBoard = '${id}'; selectedVersion = { tag_name: 'v1.8.3' }; updateFlashSection();`, context);
        assert.equal(context.document.getElementById('flash-section').style.display, 'none');
        assert.match(context.document.getElementById('error-message').textContent, /has no build/);
    }
});

test('older firmware and pre-release manifests keep their existing paths', () => {
    const context = flasherContext();
    for (const [tag, prerelease, suffix] of [
        ['v1.7.2', false, 'firmware/v1.7.2/FPVGate-AIO-V3/FPVGate_AIO_V3_filesystem.bin'],
        ['v1.7.3', false, 'firmware/v1.7.3/FPVGateAIO/littlefs.bin'],
        ['v1.8.0-rc-3', true, 'preRelease/v1.8.0-rc-3/FPVGateAIO/littlefs.bin']
    ]) {
        vm.runInContext(`selectedBoard = 'fpvgateaio'; selectedVersion = { tag_name: '${tag}', isLocalPreRelease: ${prerelease} };`, context);
        assert.equal(vm.runInContext('generateManifest().builds[0].parts[3].path', context), `https://fpvgate.xyz/${suffix}`);
        assert.ok(fs.existsSync(path.join(root, suffix)));
    }
});

test('SD ZIP and refreshed flasher script references are present', () => {
    const zip = fs.readFileSync(path.join(root, 'firmware/v1.8.3/SD_Card.zip'));
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.ok(zip.includes(Buffer.from('voice_default_en')));
    assert.match(fs.readFileSync(path.join(root, 'flasher.html'), 'utf8'), /flasher\.js\?v=1\.8\.3/);
    assert.match(fs.readFileSync(path.join(root, 'flasher.js'), 'utf8'), /import\('\.\/esp-flasher\.js\?v=1\.8\.3'\)/);
});

for (const mode of ['existing bootloader', 'previously authorised USB replacement', 'first-time USB replacement']) {
    test(`shared flasher connects through ${mode}`, async () => {
        const bootloader = { getInfo: () => ({ usbVendorId: 0x303a }), async close() {} };
        const networkPort = { getInfo: () => ({ usbVendorId: 0x2886 }), async close() {} };
        let picks = 0;
        let notices = 0;
        let nowCalls = 0;
        const context = vm.createContext({
            console: { log() {} }, setTimeout,
            Date: mode === 'first-time USB replacement' ? { now: () => nowCalls++ === 0 ? 0 : 9000 } : Date,
            navigator: { serial: {
                async requestPort(options) {
                    picks++;
                    if (picks === 1) return mode === 'existing bootloader' ? bootloader : networkPort;
                    assert.equal(options.filters[0].usbVendorId, 0x303a);
                    return bootloader;
                },
                async getPorts() { return [bootloader]; }
            } },
            Transport: class {
                constructor(port) { this.port = port; }
                async disconnect() {}
            },
            ESPLoader: class {
                constructor(options) { this.transport = options.transport; }
                async main() {
                    if (this.transport.port === networkPort) throw new Error('USB device disconnected');
                    return 'ESP32-S3';
                }
            }
        });
        const source = fs.readFileSync(path.join(root, 'esp-flasher.js'), 'utf8')
            .replace(/^import .*;\r?\n/m, '').replace('export class CustomESPFlasher', 'class CustomESPFlasher');
        vm.runInContext(source, context);
        const flasher = vm.runInContext('new CustomESPFlasher()', context);
        flasher.setHandlers({ onNeedsPort: () => notices++ });
        assert.equal(await flasher.connect(), 'ESP32-S3');
        assert.equal(flasher.port, bootloader);
        assert.equal(picks, mode === 'first-time USB replacement' ? 2 : 1);
        assert.equal(notices, mode === 'first-time USB replacement' ? 1 : 0);
    });
}
