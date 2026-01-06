// FPVGate Web Flasher
const GITHUB_API = 'https://api.github.com/repos/LouisHitchcock/FPVGate/releases';
const GITHUB_RELEASE_BASE = 'https://github.com/LouisHitchcock/FPVGate/releases/download';
const BOARDS_CONFIG_URL = 'https://raw.githubusercontent.com/LouisHitchcock/FPVGate/main/boards.json';

// Board configurations
const BOARD_CONFIGS = {
    esp32s3: {
        name: 'ESP32-S3 DevKitC-1 (8MB)',
        chipFamily: 'ESP32-S3',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 },
            { path: 'littlefs.bin', offset: 0x410000 }
        ]
    },
    esp32s3supermini: {
        name: 'ESP32-S3 Super Mini (4MB)',
        chipFamily: 'ESP32-S3',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 },
            { path: 'littlefs.bin', offset: 0x210000 }
        ]
    },
    esp32c3: {
        name: 'ESP32-C3',
        chipFamily: 'ESP32-C3',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 }
        ]
    },
    lilygo: {
        name: 'LilyGO T-Energy S3',
        chipFamily: 'ESP32-S3',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 },
            { path: 'littlefs.bin', offset: 0x410000 }
        ]
    },
    esp32c6: {
        name: 'ESP32-C6',
        chipFamily: 'ESP32-C6',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 }
        ]
    }
};

let releases = [];
let selectedBoard = null;
let selectedVersion = null;
let betaMode = false;
let customFirmware = {
    firmware: null,
    filesystem: null
};
let currentFileType = null;

// Board configurations - will be loaded from GitHub
let ALL_BOARDS = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadBoardConfigurations();
    await loadReleases();
    setupEventListeners();
    setupBetaMode();
    setupCustomFirmwareUpload();
    setupPostFlashActions();
});

// Load board configurations from GitHub
async function loadBoardConfigurations() {
    try {
        const response = await fetch(BOARDS_CONFIG_URL);
        if (!response.ok) {
            console.warn('Failed to fetch board config, using defaults');
            useFallbackBoards();
            return;
        }
        
        const config = await response.json();
        
        // Load all boards
        if (config.boards) {
            ALL_BOARDS = config.boards;
        }
        
        // Populate standard boards (expert_mode: 0) in dropdown
        populateBoards();
        
    } catch (error) {
        console.error('Error loading board configurations:', error);
        useFallbackBoards();
    }
}

// Fallback board configurations if GitHub fetch fails
function useFallbackBoards() {
    ALL_BOARDS = [
        { value: 'esp32s3', label: 'ESP32-S3 DevKitC-1 (8MB Flash) - Recommended', expert_mode: 0 },
        { value: 'esp32s3supermini', label: 'ESP32-S3 Super Mini (4MB Flash)', expert_mode: 0 },
        { value: 'esp32c3', label: 'ESP32-C3', expert_mode: 1 },
        { value: 'esp32c6', label: 'ESP32-C6', expert_mode: 1 },
        { value: 'lilygo', label: 'LilyGO T-Energy S3', expert_mode: 1 }
    ];
    
    populateBoards();
}

// Populate boards in the dropdown based on expert mode
function populateBoards() {
    const boardSelect = document.getElementById('board-select');
    
    // Clear existing options except the first one
    while (boardSelect.options.length > 1) {
        boardSelect.remove(1);
    }
    
    // Add standard boards (expert_mode: 0)
    ALL_BOARDS.filter(b => b.expert_mode === 0).forEach(board => {
        const option = document.createElement('option');
        option.value = board.value;
        option.textContent = board.label;
        boardSelect.appendChild(option);
    });
}

// Load releases from GitHub API
async function loadReleases() {
    const versionSelect = document.getElementById('version-select');
    
    try {
        const response = await fetch(GITHUB_API);
        if (!response.ok) throw new Error('Failed to fetch releases');
        
        const data = await response.json();
        releases = data.filter(release => !release.draft && release.assets.length > 0);
        
        // Populate version dropdown
        versionSelect.innerHTML = '<option value="">Choose firmware version...</option>';
        releases.forEach(release => {
            const option = document.createElement('option');
            option.value = release.tag_name;
            option.textContent = `${release.tag_name}${release.prerelease ? ' (Pre-release)' : ''}${release.tag_name === releases[0].tag_name ? ' (Latest)' : ''}`;
            versionSelect.appendChild(option);
        });
        
        // Auto-select latest stable release
        if (releases.length > 0) {
            const latestStable = releases.find(r => !r.prerelease) || releases[0];
            versionSelect.value = latestStable.tag_name;
            selectedVersion = latestStable;
            updateVersionInfo();
        }
        
    } catch (error) {
        console.error('Error loading releases:', error);
        showError('Failed to load firmware versions. Please try again later.');
        versionSelect.innerHTML = '<option value="">Failed to load versions</option>';
    }
}

// Setup event listeners
function setupEventListeners() {
    const boardSelect = document.getElementById('board-select');
    const versionSelect = document.getElementById('version-select');
    
    boardSelect.addEventListener('change', (e) => {
        selectedBoard = e.target.value;
        updateFlashSection();
    });
    
    versionSelect.addEventListener('change', (e) => {
        const version = e.target.value;
        selectedVersion = releases.find(r => r.tag_name === version);
        updateVersionInfo();
        updateFlashSection();
    });
}

// Update version info display
function updateVersionInfo() {
    const versionInfo = document.getElementById('version-info');
    
    if (selectedVersion) {
        const date = new Date(selectedVersion.published_at).toLocaleDateString();
        versionInfo.textContent = `Released: ${date}${selectedVersion.prerelease ? ' (Pre-release)' : ''}`;
    } else {
        versionInfo.textContent = '';
    }
}

// Update flash section visibility and content
function updateFlashSection() {
    const flashSection = document.getElementById('flash-section');
    const errorSection = document.getElementById('error-section');
    
    errorSection.style.display = 'none';
    
    if (selectedBoard && selectedVersion) {
        flashSection.style.display = 'block';
        updateFlashInfo();
        prepareFlashButton();
    } else {
        flashSection.style.display = 'none';
    }
}

// Update flash information display
function updateFlashInfo() {
    const boardConfig = BOARD_CONFIGS[selectedBoard];
    
    document.getElementById('selected-board').textContent = boardConfig.name;
    document.getElementById('selected-version').textContent = selectedVersion.tag_name;
    document.getElementById('flash-description').textContent = 
        `Ready to flash ${selectedVersion.tag_name} firmware for ${boardConfig.name}`;
}

// Prepare the ESP Web Tools flash button
async function prepareFlashButton() {
    const installButton = document.getElementById('install-button');
    const loadingSection = document.getElementById('loading-section');
    const flashSection = document.getElementById('flash-section');
    
    loadingSection.style.display = 'block';
    flashSection.style.display = 'none';
    
    try {
        const manifest = await generateManifest();
        
        // Set manifest on the install button
        installButton.manifest = manifest;
        
        loadingSection.style.display = 'none';
        flashSection.style.display = 'block';
        
    } catch (error) {
        console.error('Error preparing flash:', error);
        showError('Failed to prepare firmware. Please try again.');
        loadingSection.style.display = 'none';
    }
}

// Generate ESP Web Tools manifest
async function generateManifest() {
    const boardConfig = BOARD_CONFIGS[selectedBoard];
    const version = selectedVersion.tag_name;
    
    // Build the manifest object
    const manifest = {
        name: `FPVGate ${version}`,
        version: version,
        home_assistant_domain: 'esphome',
        new_install_prompt_erase: true,
        builds: [
            {
                chipFamily: boardConfig.chipFamily,
                parts: boardConfig.parts.map(part => ({
                    path: `${GITHUB_RELEASE_BASE}/${version}/${part.path}`,
                    offset: part.offset
                }))
            }
        ]
    };
    
    return JSON.stringify(manifest);
}

// Show error message
function showError(message) {
    const errorSection = document.getElementById('error-section');
    const errorMessage = document.getElementById('error-message');
    
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
}

// Expert Mode Setup
function setupBetaMode() {
    const betaModeToggle = document.getElementById('beta-mode');
    const betaOnlySections = document.querySelectorAll('.beta-only');
    const boardSelect = document.getElementById('board-select');
    
    betaModeToggle.addEventListener('change', (e) => {
        betaMode = e.target.checked;
        
        // Show/hide expert-only sections
        betaOnlySections.forEach(section => {
            section.style.display = betaMode ? 'block' : 'none';
        });
        
        // Add/remove expert board options (expert_mode: 1)
        if (betaMode) {
            ALL_BOARDS.filter(b => b.expert_mode === 1).forEach(board => {
                const option = document.createElement('option');
                option.value = board.value;
                option.textContent = board.label;
                option.className = 'expert-board-option';
                boardSelect.appendChild(option);
            });
        } else {
            // Remove expert board options
            const expertOptions = boardSelect.querySelectorAll('.expert-board-option');
            expertOptions.forEach(opt => opt.remove());
            
            // Reset selection if expert board was selected
            const currentValue = boardSelect.value;
            const selectedBoardObj = ALL_BOARDS.find(b => b.value === currentValue);
            if (selectedBoardObj && selectedBoardObj.expert_mode === 1) {
                boardSelect.value = '';
                selectedBoard = null;
                updateFlashSection();
            }
        }
    });
}

// Custom Firmware Upload
function setupCustomFirmwareUpload() {
    const fileInput = document.getElementById('file-input');
    const uploadFirmwareBtn = document.getElementById('upload-firmware');
    const uploadFilesystemBtn = document.getElementById('upload-filesystem');
    
    if (!uploadFirmwareBtn || !uploadFilesystemBtn) return;
    
    // Setup upload button click handlers
    uploadFirmwareBtn.addEventListener('click', () => {
        currentFileType = 'firmware';
        fileInput.click();
    });
    
    uploadFilesystemBtn.addEventListener('click', () => {
        currentFileType = 'filesystem';
        fileInput.click();
    });
    
    // Handle file selection
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && currentFileType) {
            const reader = new FileReader();
            reader.onload = (event) => {
                customFirmware[currentFileType] = {
                    name: file.name,
                    data: event.target.result
                };
                updateUploadedFilesList();
            };
            reader.readAsArrayBuffer(file);
        }
        fileInput.value = ''; // Reset input
    });
}

function updateUploadedFilesList() {
    const listDiv = document.getElementById('uploaded-files');
    listDiv.innerHTML = '';
    
    Object.keys(customFirmware).forEach(type => {
        if (customFirmware[type]) {
            const item = document.createElement('div');
            item.className = 'uploaded-file-item';
            item.innerHTML = `
                <span><strong>${type}:</strong> ${customFirmware[type].name}</span>
                <button class="btn-remove" onclick="removeCustomFile('${type}')">×</button>
            `;
            listDiv.appendChild(item);
        }
    });
}

function removeCustomFile(type) {
    customFirmware[type] = null;
    updateUploadedFilesList();
}

// Post-Flash Actions
function setupPostFlashActions() {
    const openDeviceBtn = document.getElementById('open-device');
    const installButton = document.getElementById('install-button');
    
    openDeviceBtn.addEventListener('click', () => {
        // Try www.fpvgate.xyz first, fallback to IP
        window.open('http://www.fpvgate.xyz', '_blank');
        setTimeout(() => {
            // Fallback option
            if (!confirm('If www.fpvgate.xyz didn\'t work, click OK to try 192.168.4.1')) {
                return;
            }
            window.open('http://192.168.4.1', '_blank');
        }, 2000);
    });
    
    // Listen for flash completion
    if (installButton) {
        installButton.addEventListener('state-changed', (e) => {
            if (e.detail && e.detail.state === 'installed') {
                document.getElementById('post-flash-actions').style.display = 'block';
            }
        });
    }
}

// Check if browser supports Web Serial
if (!navigator.serial) {
    document.addEventListener('DOMContentLoaded', () => {
        const alertDiv = document.querySelector('.alert-info');
        alertDiv.className = 'alert alert-error';
        alertDiv.innerHTML = '<strong>Browser Not Supported!</strong><br>Please use Chrome, Edge, or Opera browser to flash your device.';
    });
}

// Make removeCustomFile available globally
window.removeCustomFile = removeCustomFile;
