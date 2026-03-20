// FPVGate Web Flasher
// Version: 2026-02-03 - New standardized firmware structure
const GITHUB_API = 'https://api.github.com/repos/LouisHitchcock/FPVGate/releases';
const BOARDS_CONFIG_URL = 'https://raw.githubusercontent.com/LouisHitchcock/FPVGate/main/boards.json';

// Board configurations with standardized structure
// Maps board ID -> firmware directory, file prefix, chip family, and flash offsets
const BOARD_CONFIGS = {
    esp32s3: {
        name: 'ESP32-S3 DevKitC-1 (8MB)',
        chipFamily: 'ESP32-S3',
        firmwareDir: 'ESP32S3-Devkit-C1',
        filePrefix: 'S3_Devkit',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 },
            { path: 'filesystem.bin', offset: 0x410000 }
        ]
    },
    esp32s3supermini: {
        name: 'ESP32-S3 Super Mini (4MB)',
        chipFamily: 'ESP32-S3',
        firmwareDir: 'ESP32S3-SuperMini',
        filePrefix: 'S3_SuperMini',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 },
            { path: 'filesystem.bin', offset: 0x290000 }
        ]
    },
    seeedxiaos3: {
        name: 'Seeed Studio XIAO ESP32S3 (8MB)',
        chipFamily: 'ESP32-S3',
        firmwareDir: 'XIAO-S3',
        filePrefix: 'XIAO_S3',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 },
            { path: 'filesystem.bin', offset: 0x410000 }
        ]
    },
    esp32c3: {
        name: 'ESP32-C3',
        chipFamily: 'ESP32-C3',
        firmwareDir: 'ESP32C3',
        filePrefix: 'ESP32C3',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 }
        ]
    },
    lilygo: {
        name: 'LilyGO T-Energy S3',
        chipFamily: 'ESP32-S3',
        firmwareDir: 'LilyGo-T-Energy-S3',
        filePrefix: 'LilyGo_T_Energy_S3',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 },
            { path: 'filesystem.bin', offset: 0x410000 }
        ]
    },
    xiaos3plus: {
        name: 'XIAO ESP32S3 Plus (16MB Flash)',
        chipFamily: 'ESP32-S3',
        firmwareDir: 'XIAO-S3-Plus',
        filePrefix: 'XIAO_S3_Plus',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 },
            { path: 'filesystem.bin', offset: 0x410000 }
        ]
    },
    fpvgateaiov3: {
        name: 'FPVGate AIO V3 (8MB)',
        chipFamily: 'ESP32-S3',
        firmwareDir: 'FPVGate-AIO-V3',
        filePrefix: 'FPVGate_AIO_V3',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 },
            { path: 'filesystem.bin', offset: 0x410000 }
        ]
    },
    wavesharelcd2: {
        name: 'Waveshare ESP32-S3-LCD-2 (16MB Flash)',
        chipFamily: 'ESP32-S3',
        firmwareDir: 'Waveshare-ESP32-S3-LCD-2',
        filePrefix: 'Waveshare_LCD2',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 },
            { path: 'filesystem.bin', offset: 0x410000 }
        ]
    },
    novablade: {
        name: 'NovaBlade (16MB Flash)',
        chipFamily: 'ESP32-S3',
        firmwareDir: 'NovaBlade',
        filePrefix: 'NovaBlade',
        parts: [
            { path: 'bootloader.bin', offset: 0x0 },
            { path: 'partitions.bin', offset: 0x8000 },
            { path: 'firmware.bin', offset: 0x10000 },
            { path: 'filesystem.bin', offset: 0x410000 }
        ]
    }
};

let releases = [];
let selectedBoard = null;
let selectedVersion = null;
let betaMode = false;
let preReleaseMode = false;
let preReleaseVersions = [];
let flashOptions = {
    eraseFlash: false,
    verifyFlash: true
};
let customFirmware = {
    firmware: null,
    filesystem: null
};
let currentFileType = null;

// Board configurations - will be loaded from GitHub
let ALL_BOARDS = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('FPVGate Flasher v2026-02-03 - Standardized firmware structure');
    await loadBoardConfigurations();
    await loadReleases();
    setupEventListeners();
    setupBetaMode();
    setupPreReleaseMode();
    setupCustomFirmwareUpload();
    setupEraseFlashButton();
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
        { value: 'seeedxiaos3', label: 'Seeed Studio XIAO ESP32S3 (8MB) - Recommended', expert_mode: 0 },
        { value: 'esp32s3', label: 'ESP32-S3 DevKitC-1 (8MB Flash)', expert_mode: 0 },
        { value: 'esp32s3supermini', label: 'ESP32-S3 Super Mini (4MB Flash)', expert_mode: 1 },
        { value: 'esp32c3', label: 'ESP32-C3', expert_mode: 1 },
        { value: 'lilygo', label: 'LilyGO T-Energy S3', expert_mode: 1 },
        { value: 'xiaos3plus', label: 'XIAO ESP32S3 Plus (16MB Flash)', expert_mode: 1 },
        { value: 'fpvgateaiov3', label: 'FPVGate AIO V3 (8MB) - Coming Soon', expert_mode: 1 },
        { value: 'wavesharelcd2', label: 'Waveshare ESP32-S3-LCD-2 (16MB Flash)', expert_mode: 1 },
        { value: 'novablade', label: 'NovaBlade (16MB Flash)', expert_mode: 1 }
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
        releases = data.filter(release => !release.draft && !release.prerelease && release.assets.length > 0);
        
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
        
        // Track board selection
        if (window.fpvgateAnalytics && selectedBoard) {
            window.fpvgateAnalytics.track('board_selected', {
                board: selectedBoard
            });
        }
    });
    
    versionSelect.addEventListener('change', (e) => {
        const version = e.target.value;
        // Check if this is a pre-release version
        const preRelease = preReleaseVersions.find(v => v.tag === version);
        if (preRelease) {
            selectedVersion = {
                tag_name: preRelease.tag,
                published_at: preRelease.date,
                prerelease: true,
                isLocalPreRelease: true
            };
        } else {
            selectedVersion = releases.find(r => r.tag_name === version);
        }
        updateVersionInfo();
        updateFlashSection();
        
        // Track version selection
        if (window.fpvgateAnalytics && selectedVersion) {
            window.fpvgateAnalytics.track('version_selected', {
                version: selectedVersion.tag_name
            });
        }
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
}

// Prepare the custom flash button
let flashButtonReady = false;

async function prepareFlashButton() {
    const connectButton = document.getElementById('connect-button');
    const loadingSection = document.getElementById('loading-section');
    const flashSection = document.getElementById('flash-section');
    
    loadingSection.style.display = 'none';
    flashSection.style.display = 'block';
    
    // Only add listener once
    if (!flashButtonReady) {
        connectButton.addEventListener('click', async () => {
            await startFlashing();
        });
        flashButtonReady = true;
    }
}

// Generate ESP Web Tools manifest
function generateManifest() {
    const boardConfig = BOARD_CONFIGS[selectedBoard];
    const version = selectedVersion.tag_name;
    
    // Use new standardized firmware structure
    // firmware/v1.5.7/ESP32S3-Devkit-C1/S3_Devkit_bootloader.bin
    // Pre-release firmware uses preRelease/ folder instead of firmware/
    const baseUrl = new URL(window.location.href);
    const firmwareFolder = selectedVersion.isLocalPreRelease ? 'preRelease' : 'firmware';
    const firmwareBaseUrl = new URL(`${firmwareFolder}/${version}/${boardConfig.firmwareDir}/`, baseUrl).href;
    
    // Map parts to local firmware URLs with standardized naming
    const parts = boardConfig.parts.map(part => {
        return {
            path: `${firmwareBaseUrl}${boardConfig.filePrefix}_${part.path}`,
            offset: part.offset
        };
    });
    
    // Build the manifest object
    const manifest = {
        name: `FPVGate ${version}`,
        version: version,
        home_assistant_domain: 'esphome',
        new_install_prompt_erase: true,
        builds: [
            {
                chipFamily: boardConfig.chipFamily,
                parts: parts
            }
        ]
    };
    
    console.log('Generated manifest:', manifest);
    return manifest;
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
        
        // Track expert mode toggle
        if (window.fpvgateAnalytics) {
            window.fpvgateAnalytics.track('expert_mode_toggled', {
                enabled: betaMode
            });
        }
        
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

// Pre-Release Mode Setup
function setupPreReleaseMode() {
    const preReleaseModeToggle = document.getElementById('prerelease-mode');
    const versionSelect = document.getElementById('version-select');

    preReleaseModeToggle.addEventListener('change', async (e) => {
        preReleaseMode = e.target.checked;

        // Track pre-release mode toggle
        if (window.fpvgateAnalytics) {
            window.fpvgateAnalytics.track('prerelease_mode_toggled', {
                enabled: preReleaseMode
            });
        }

        if (preReleaseMode) {
            await loadPreReleaseVersions();
        } else {
            removePreReleaseVersions();
        }
    });
}

// Store original release options so we can restore them
let savedReleaseOptions = null;

// Load pre-release versions from local index.json
async function loadPreReleaseVersions() {
    const versionSelect = document.getElementById('version-select');

    try {
        const response = await fetch('preRelease/index.json');
        if (!response.ok) throw new Error('Failed to fetch pre-release index');

        const data = await response.json();
        preReleaseVersions = data.versions || [];

        // Save the current release options before replacing
        savedReleaseOptions = versionSelect.innerHTML;

        // Clear dropdown and populate with pre-release versions only
        versionSelect.innerHTML = '<option value="">Choose pre-release version...</option>';

        if (preReleaseVersions.length === 0) {
            versionSelect.innerHTML = '<option value="">No pre-release versions available</option>';
            selectedVersion = null;
            updateVersionInfo();
            updateFlashSection();
            return;
        }

        preReleaseVersions.forEach(version => {
            const option = document.createElement('option');
            option.value = version.tag;
            option.textContent = `${version.tag} (Pre-Release)`;
            option.dataset.date = version.date || '';
            option.dataset.notes = version.notes || '';
            versionSelect.appendChild(option);
        });

        // Reset current selection
        selectedVersion = null;
        updateVersionInfo();
        updateFlashSection();

    } catch (error) {
        console.error('Error loading pre-release versions:', error);
    }
}

// Restore original release versions in dropdown
function removePreReleaseVersions() {
    const versionSelect = document.getElementById('version-select');

    // Restore the saved release options
    if (savedReleaseOptions) {
        versionSelect.innerHTML = savedReleaseOptions;
        savedReleaseOptions = null;
    }

    // Re-select latest stable
    if (releases.length > 0) {
        const latestStable = releases.find(r => !r.prerelease) || releases[0];
        versionSelect.value = latestStable.tag_name;
        selectedVersion = latestStable;
    } else {
        selectedVersion = null;
    }

    preReleaseVersions = [];
    updateVersionInfo();
    updateFlashSection();
}

// Setup flash option toggles
function setupEraseFlashButton() {
    const eraseToggle = document.getElementById('erase-flash-toggle');
    const verifyToggle = document.getElementById('verify-flash-toggle');
    
    if (eraseToggle) {
        eraseToggle.addEventListener('change', (e) => {
            flashOptions.eraseFlash = e.target.checked;
        });
    }
    
    if (verifyToggle) {
        verifyToggle.addEventListener('change', (e) => {
            flashOptions.verifyFlash = e.target.checked;
        });
    }
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

// Start the flashing process
async function startFlashing() {
    const connectButton = document.getElementById('connect-button');
    const flashProgress = document.getElementById('flash-progress');
    const progressTitle = document.getElementById('progress-title');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressLog = document.getElementById('progress-log');
    const postFlashActions = document.getElementById('post-flash-actions');
    const errorSection = document.getElementById('error-section');
    
    // Hide button, show progress
    connectButton.style.display = 'none';
    flashProgress.style.display = 'block';
    postFlashActions.style.display = 'none';
    errorSection.style.display = 'none';
    
    // Reset progress
    progressBar.style.width = '0%';
    progressBar.textContent = '';
    progressLog.innerHTML = '';
    
    try {
        const manifest = generateManifest();
        
        // Import and create flasher
        const { CustomESPFlasher } = await import('./esp-flasher.js');
        const flasher = new CustomESPFlasher();
        
        // Setup event handlers
        flasher.setHandlers({
            onProgress: (percent, status) => {
                progressBar.style.width = `${percent}%`;
                progressBar.textContent = `${percent}%`;
                progressStatus.textContent = status;
            },
            onLog: (message) => {
                const logEntry = document.createElement('div');
                logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
                progressLog.appendChild(logEntry);
                progressLog.scrollTop = progressLog.scrollHeight;
            },
            onError: (error) => {
                progressTitle.textContent = 'Flash Failed';
                progressTitle.style.color = 'var(--error-color)';
                showError(error.message);
                connectButton.style.display = 'block';
                
                // Track flash failure
                if (window.fpvgateAnalytics) {
                    window.fpvgateAnalytics.track('flash_failed', {
                        board: selectedBoard,
                        version: selectedVersion.tag_name,
                        expert_mode: betaMode,
                        error_message: error.message
                    });
                }
            },
            onComplete: () => {
                progressTitle.textContent = 'Flash Complete!';
                progressTitle.style.color = 'var(--success-color)';
                postFlashActions.style.display = 'block';
                
                // Track flash success
                if (window.fpvgateAnalytics) {
                    window.fpvgateAnalytics.track('flash_complete', {
                        board: selectedBoard,
                        version: selectedVersion.tag_name,
                        expert_mode: betaMode
                    });
                }
            }
        });
        
        // Track flash start
        if (window.fpvgateAnalytics) {
            window.fpvgateAnalytics.track('flash_started', {
                board: selectedBoard,
                version: selectedVersion.tag_name,
                expert_mode: betaMode,
                erase_flash: flashOptions.eraseFlash,
                verify_flash: flashOptions.verifyFlash
            });
        }
        
        // Connect to device
        progressTitle.textContent = 'Connecting to Device...';
        await flasher.connect();
        
        // Flash firmware
        progressTitle.textContent = 'Flashing Firmware...';
        await flasher.flash(manifest, flashOptions.eraseFlash);
        
        // Disconnect
        await flasher.disconnect();
        
    } catch (error) {
        console.error('Flash error:', error);
        progressTitle.textContent = 'Flash Failed';
        progressTitle.style.color = 'var(--error-color)';
        showError(error.message || 'An error occurred during flashing');
        connectButton.style.display = 'block';
        
        // Track flash failure (catch-all)
        if (window.fpvgateAnalytics) {
            window.fpvgateAnalytics.track('flash_failed', {
                board: selectedBoard,
                version: selectedVersion?.tag_name,
                expert_mode: betaMode,
                error_message: error.message || 'Unknown error'
            });
        }
    }
}

// Post-Flash Actions
function setupPostFlashActions() {
    const openDeviceBtn = document.getElementById('open-device');
    
    openDeviceBtn.addEventListener('click', () => {
        // Try fpvgate.local first, fallback to IP
        window.open('http://fpvgate.local', '_blank');
        setTimeout(() => {
            // Fallback option
            if (!confirm('If fpvgate.local didn\'t work, click OK to try 192.168.4.1')) {
                return;
            }
            window.open('http://192.168.4.1', '_blank');
        }, 2000);
    });
}

// Check if browser supports Web Serial
if (!navigator.serial) {
    document.addEventListener('DOMContentLoaded', () => {
        const warningDiv = document.getElementById('browser-warning');
        warningDiv.style.display = 'block';
        warningDiv.className = 'alert alert-error';
    });
}

// Make removeCustomFile available globally
window.removeCustomFile = removeCustomFile;
