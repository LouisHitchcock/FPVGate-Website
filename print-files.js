/**
 * 3D print files page: lists the parts in print-files/parts.json and renders
 * the selected STL with three.js so builders can inspect it before printing.
 *
 * three.js is loaded from a CDN through the import map in print-files.html,
 * keeping the site free of a build step.
 */
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MANIFEST_URL = 'print-files/parts.json';
const FILES_BASE = 'print-files/';

const PRINT_LABELS = {
    material: 'Material',
    layerHeight: 'Layer height',
    infill: 'Infill',
    supports: 'Supports',
    notes: 'Notes'
};

const els = {
    list: document.getElementById('parts-list'),
    viewer: document.getElementById('part-viewer'),
    stage: document.getElementById('viewer-stage'),
    status: document.getElementById('viewer-status'),
    name: document.getElementById('part-name'),
    build: document.getElementById('part-build'),
    description: document.getElementById('part-description'),
    dims: document.getElementById('part-dims'),
    settings: document.getElementById('part-settings'),
    download: document.getElementById('part-download'),
    resetBtn: document.getElementById('viewer-reset'),
    wireBtn: document.getElementById('viewer-wireframe')
};

let parts = [];
let activeId = null;
let loadToken = 0;

/* --------------------------------------------------------------------------
   Scene
   -------------------------------------------------------------------------- */

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
els.stage.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.addEventListener('change', render);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
scene.add(keyLight);
// Keep the key light over the viewer's shoulder so faces never go flat black.
camera.add(keyLight);
keyLight.position.set(1, 1.5, 1);
scene.add(camera);

const material = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
let mesh = null;
let grid = null;
let home = null;

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyTheme() {
    scene.background = new THREE.Color(cssVar('--surface-inset'));
    material.color.set(cssVar('--accent-fill'));
    if (grid) {
        grid.material.color.set(cssVar('--rule-strong'));
    }
    render();
}

function render() {
    renderer.render(scene, camera);
}

function resize() {
    const { clientWidth: w, clientHeight: h } = els.stage;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
}

function setStatus(text) {
    els.status.textContent = text || '';
    els.status.hidden = !text;
}

function frame(size) {
    const radius = size.length() / 2;
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
    const target = new THREE.Vector3(0, size.y / 2, 0);
    const direction = new THREE.Vector3(1, 0.8, 1.2).normalize();

    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.minDistance = radius * 0.5;
    controls.maxDistance = distance * 5;

    home = { position: target.clone().addScaledVector(direction, distance * 1.1), target };
    resetView();
}

function resetView() {
    if (!home) return;
    camera.position.copy(home.position);
    controls.target.copy(home.target);
    controls.update();
    render();
}

function clearModel() {
    if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh = null;
    }
    if (grid) {
        scene.remove(grid);
        grid.geometry.dispose();
        grid.material.dispose();
        grid = null;
    }
    home = null;
    render();
}

function showModel(geometry) {
    clearModel();

    // STL exports are Z-up in millimetres; three.js is Y-up.
    geometry.rotateX(-Math.PI / 2);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const center = box.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -box.min.y, -center.z);
    geometry.computeBoundingBox();
    // Some exporters write zeroed facet normals, which render solid black.
    geometry.computeVertexNormals();

    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Grid in 10 mm squares, sized to the part like a print bed would be.
    const span = Math.ceil((Math.max(size.x, size.z) * 1.6) / 10) * 10;
    grid = new THREE.GridHelper(span, span / 10);
    grid.material.transparent = true;
    grid.material.opacity = 0.6;
    scene.add(grid);

    // Report in print-bed terms: X x Y footprint, Z height.
    els.dims.textContent = `${fmt(size.x)} × ${fmt(size.z)} × ${fmt(size.y)} mm`;

    applyTheme();
    frame(size);
}

function fmt(n) {
    return n >= 100 ? n.toFixed(0) : n.toFixed(1);
}

/* --------------------------------------------------------------------------
   Parts list and details
   -------------------------------------------------------------------------- */

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

function renderList() {
    const groups = new Map();
    for (const part of parts) {
        if (!groups.has(part.build)) groups.set(part.build, []);
        groups.get(part.build).push(part);
    }

    els.list.innerHTML = [...groups].map(([build, items]) => `
        <div class="parts-group">
            <h3>${escapeHtml(build)}</h3>
            ${items.map(part => `
                <button type="button" class="parts-item" data-part="${escapeHtml(part.id)}">
                    <span class="parts-item-name">${escapeHtml(part.name)}</span>
                    ${(part.quantity || 1) > 1 ? `<span class="parts-item-qty">×${part.quantity}</span>` : ''}
                </button>
            `).join('')}
        </div>
    `).join('');

    els.list.addEventListener('click', e => {
        const btn = e.target.closest('[data-part]');
        if (btn) select(btn.dataset.part, true);
    });
}

function renderDetails(part) {
    els.name.textContent = part.name;
    els.build.textContent = part.build;
    els.description.textContent = part.description || '';
    els.description.hidden = !part.description;

    const rows = [['Quantity', String(part.quantity || 1)]];
    for (const [key, label] of Object.entries(PRINT_LABELS)) {
        if (part.print && part.print[key]) rows.push([label, part.print[key]]);
    }
    els.settings.innerHTML = rows.map(([k, v]) =>
        `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`
    ).join('');

    const url = FILES_BASE + part.file;
    els.download.href = url;
    els.download.setAttribute('download', part.file.split('/').pop());
}

function select(id, updateHash) {
    const part = parts.find(p => p.id === id) || parts[0];
    if (!part || part.id === activeId) return;
    activeId = part.id;

    els.list.querySelectorAll('[data-part]').forEach(btn => {
        const on = btn.dataset.part === part.id;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    if (updateHash) history.replaceState(null, '', '#' + part.id);
    renderDetails(part);
    loadModel(part);
}

function loadModel(part) {
    const token = ++loadToken;
    els.dims.textContent = '';
    setStatus('Loading model…');

    new STLLoader().load(
        FILES_BASE + part.file,
        geometry => {
            if (token !== loadToken) return geometry.dispose();
            setStatus('');
            showModel(geometry);
        },
        progress => {
            if (token !== loadToken || !progress.total) return;
            setStatus(`Loading model… ${Math.round((progress.loaded / progress.total) * 100)}%`);
        },
        () => {
            if (token !== loadToken) return;
            clearModel();
            setStatus('Could not load this model. You can still download the STL.');
        }
    );
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */

async function init() {
    try {
        const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        parts = ((await res.json()).parts || []).filter(p => p.id && p.name && p.file);
    } catch (err) {
        console.error('Failed to load print file manifest:', err);
        els.list.innerHTML = '<p class="parts-empty">Could not load the parts list. Please try again later.</p>';
        els.viewer.hidden = true;
        return;
    }

    if (!parts.length) {
        els.list.innerHTML = '<p class="parts-empty">No print files have been published yet. Check back soon, or ask in the Discord.</p>';
        els.viewer.hidden = true;
        return;
    }

    parts.forEach(p => { p.build = p.build || 'Other'; });
    renderList();
    resize();
    select(decodeURIComponent(location.hash.slice(1)), false);
}

new ResizeObserver(resize).observe(els.stage);
new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
});
window.addEventListener('hashchange', () => select(decodeURIComponent(location.hash.slice(1)), false));

els.resetBtn.addEventListener('click', resetView);
els.download.addEventListener('click', () => {
    if (window.fpvgateAnalytics) window.fpvgateAnalytics.track('print_file_download', { part: activeId });
});
els.wireBtn.addEventListener('click', () => {
    material.wireframe = !material.wireframe;
    els.wireBtn.setAttribute('aria-pressed', material.wireframe ? 'true' : 'false');
    render();
});

applyTheme();
init();
