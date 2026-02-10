// FPVGate SD Card Setup Tool
// Downloads SD_Card.zip from local firmware folder and extracts to user's SD card

const GITHUB_API = 'https://api.github.com/repos/LouisHitchcock/FPVGate/releases';

let releases = [];
let selectedVersion = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('FPVGate SD Card Setup Tool');
    
    // Check browser support
    if (!('showDirectoryPicker' in window)) {
        showBrowserWarning();
    }
    
    await loadReleases();
    setupEventListeners();
});

// Show browser warning for unsupported browsers
function showBrowserWarning() {
    const warningDiv = document.getElementById('browser-warning');
    warningDiv.style.display = 'block';
    warningDiv.className = 'alert alert-error';
}

// Load releases from GitHub API
async function loadReleases() {
    const versionSelect = document.getElementById('version-select');
    
    try {
        const response = await fetch(GITHUB_API);
        if (!response.ok) throw new Error('Failed to fetch releases');
        
        const data = await response.json();
        
        // Filter releases that have SD_Card.zip asset
        releases = data.filter(release => {
            if (release.draft) return false;
            const hasSDCard = release.assets.some(asset => 
                asset.name === 'SD_Card.zip' || asset.name.toLowerCase().includes('sd_card')
            );
            return hasSDCard;
        });
        
        if (releases.length === 0) {
            // Fallback: show all releases with assets
            releases = data.filter(release => !release.draft && release.assets.length > 0);
        }
        
        // Populate version dropdown
        versionSelect.innerHTML = '<option value="">Choose version...</option>';
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
            updateDownloadLink();
        }
        
    } catch (error) {
        console.error('Error loading releases:', error);
        showError('Failed to load versions. Please try again later.');
        versionSelect.innerHTML = '<option value="">Failed to load versions</option>';
    }
}

// Setup event listeners
function setupEventListeners() {
    const versionSelect = document.getElementById('version-select');
    const selectFolderButton = document.getElementById('select-folder-button');
    
    versionSelect.addEventListener('change', (e) => {
        const version = e.target.value;
        selectedVersion = releases.find(r => r.tag_name === version);
        updateVersionInfo();
        updateSetupSection();
    });
    
    selectFolderButton.addEventListener('click', startSetup);
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

// Update setup section visibility
function updateSetupSection() {
    const setupSection = document.getElementById('setup-section');
    const errorSection = document.getElementById('error-section');
    
    errorSection.style.display = 'none';
    
    if (selectedVersion) {
        setupSection.style.display = 'block';
        document.getElementById('selected-version').textContent = selectedVersion.tag_name;
    } else {
        setupSection.style.display = 'none';
    }
}

// Start the SD card setup process
async function startSetup() {
    const selectFolderButton = document.getElementById('select-folder-button');
    const setupProgress = document.getElementById('setup-progress');
    const progressTitle = document.getElementById('progress-title');
    const progressBar = document.getElementById('progress-bar');
    const progressLog = document.getElementById('progress-log');
    const postSetupActions = document.getElementById('post-setup-actions');
    const errorSection = document.getElementById('error-section');
    
    try {
        // Request folder access
        const dirHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'desktop'
        });
        
        // Hide button, show progress
        selectFolderButton.style.display = 'none';
        setupProgress.style.display = 'block';
        postSetupActions.style.display = 'none';
        errorSection.style.display = 'none';
        
        // Reset progress
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        progressLog.innerHTML = '';
        
        log(progressLog, `Selected folder: ${dirHandle.name}`);
        
        // Download SD_Card.zip from local firmware folder (same origin, no CORS)
        progressTitle.textContent = 'Downloading SD Card Files...';
        const version = selectedVersion.tag_name;
        const sdCardUrl = `${window.location.origin}/firmware/${version}/SD_Card.zip`;
        log(progressLog, `Downloading from ${sdCardUrl}...`);
        updateProgress(progressBar, 10);
        
        const response = await fetch(sdCardUrl);
        if (!response.ok) {
            throw new Error(`SD_Card.zip not found for ${version}. Try a different version.`);
        }
        
        const zipData = await response.arrayBuffer();
        updateProgress(progressBar, 30);
        log(progressLog, 'Download complete');
        
        // Extract ZIP file
        progressTitle.textContent = 'Extracting Files...';
        log(progressLog, 'Extracting ZIP archive...');
        
        const zip = await JSZip.loadAsync(zipData);
        const files = Object.keys(zip.files);
        log(progressLog, `Found ${files.length} items in archive`);
        updateProgress(progressBar, 30);
        
        // Write files to SD card
        progressTitle.textContent = 'Writing Files...';
        const totalFiles = files.filter(f => !zip.files[f].dir).length;
        let processedFiles = 0;
        
        for (const filePath of files) {
            const zipEntry = zip.files[filePath];
            
            // Skip if it's a directory entry
            if (zipEntry.dir) {
                continue;
            }
            
            // Get the file content
            const content = await zipEntry.async('arraybuffer');
            
            // Write the file
            await writeFile(dirHandle, filePath, content, progressLog);
            
            processedFiles++;
            const progress = 30 + Math.round((processedFiles / totalFiles) * 65);
            updateProgress(progressBar, progress);
        }
        
        // Complete
        updateProgress(progressBar, 100);
        progressTitle.textContent = 'Setup Complete!';
        progressTitle.style.color = 'var(--success-color)';
        log(progressLog, `Successfully wrote ${processedFiles} files to SD card`);
        postSetupActions.style.display = 'block';
        
    } catch (error) {
        console.error('Setup error:', error);
        
        // Handle user cancellation gracefully
        if (error.name === 'AbortError') {
            selectFolderButton.style.display = 'block';
            setupProgress.style.display = 'none';
            return;
        }
        
        progressTitle.textContent = 'Setup Failed';
        progressTitle.style.color = 'var(--error-color)';
        showError(error.message || 'An error occurred during setup');
        selectFolderButton.style.display = 'block';
    }
}

// Write a file to the directory
async function writeFile(dirHandle, filePath, content, progressLog) {
    // Normalize path separators and remove leading slash/dot
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\.?\//, '');
    const parts = normalizedPath.split('/').filter(p => p.length > 0);
    
    if (parts.length === 0) return;
    
    // Navigate/create directories
    let currentDir = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
        try {
            currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
        } catch (e) {
            console.error(`Failed to create directory ${parts[i]}:`, e);
            throw new Error(`Failed to create folder: ${parts[i]}`);
        }
    }
    
    // Write the file
    const fileName = parts[parts.length - 1];
    try {
        const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    } catch (e) {
        console.error(`Failed to write file ${fileName}:`, e);
        throw new Error(`Failed to write file: ${fileName}`);
    }
}

// Utility functions
function updateProgress(progressBar, percent) {
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = `${percent}%`;
}

function log(container, message) {
    const entry = document.createElement('div');
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

function showError(message) {
    const errorSection = document.getElementById('error-section');
    const errorMessage = document.getElementById('error-message');
    
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
