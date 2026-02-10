// SD Card Setup - Integrated into Flasher Page
// Uses the version selected in the flasher dropdown

document.addEventListener('DOMContentLoaded', () => {
    setupSDCardSection();
});

function setupSDCardSection() {
    const versionSelect = document.getElementById('version-select');
    const sdcardReady = document.getElementById('sdcard-ready');
    const sdcardVersion = document.getElementById('sdcard-version');
    const sdcardDownload = document.getElementById('sdcard-download');
    const sdcardSetupButton = document.getElementById('sdcard-setup-button');
    const gotoSdcard = document.getElementById('goto-sdcard');
    const openDeviceFinal = document.getElementById('open-device-final');
    
    // Update SD card section when version changes
    versionSelect.addEventListener('change', updateSDCardSection);
    
    // Initial update
    updateSDCardSection();
    
    // Setup button click handler
    sdcardSetupButton.addEventListener('click', startSDCardSetup);
    
    // Scroll to SD card section after flash
    if (gotoSdcard) {
        gotoSdcard.addEventListener('click', () => {
            document.getElementById('sdcard-section').scrollIntoView({ behavior: 'smooth' });
        });
    }
    
    // Open device interface
    if (openDeviceFinal) {
        openDeviceFinal.addEventListener('click', () => {
            window.open('http://fpvgate.local', '_blank');
        });
    }
}

function updateSDCardSection() {
    const versionSelect = document.getElementById('version-select');
    const sdcardReady = document.getElementById('sdcard-ready');
    const sdcardVersion = document.getElementById('sdcard-version');
    const sdcardDownload = document.getElementById('sdcard-download');
    
    const version = versionSelect.value;
    
    if (version) {
        sdcardReady.style.display = 'block';
        sdcardVersion.textContent = version;
        sdcardDownload.href = `${window.location.origin}/firmware/${version}/SD_Card.zip`;
    } else {
        sdcardReady.style.display = 'none';
    }
}

async function startSDCardSetup() {
    const versionSelect = document.getElementById('version-select');
    const version = versionSelect.value;
    
    if (!version) {
        alert('Please select a firmware version first.');
        return;
    }
    
    const sdcardReady = document.getElementById('sdcard-ready');
    const sdcardProgress = document.getElementById('sdcard-progress');
    const progressTitle = document.getElementById('sdcard-progress-title');
    const progressBar = document.getElementById('sdcard-progress-bar');
    const progressLog = document.getElementById('sdcard-progress-log');
    const sdcardComplete = document.getElementById('sdcard-complete');
    const sdcardError = document.getElementById('sdcard-error');
    const sdcardErrorMessage = document.getElementById('sdcard-error-message');
    
    try {
        // Request folder access
        const dirHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'desktop'
        });
        
        // Safety check
        const folderName = dirHandle.name.toLowerCase();
        const dangerousFolders = ['windows', 'program files', 'program files (x86)', 'users', 'system32', 'appdata', 'documents', 'desktop', 'downloads', 'pictures', 'videos', 'music'];
        
        if (dangerousFolders.includes(folderName)) {
            const proceed = confirm(`Warning: You selected "${dirHandle.name}" which appears to be a system folder.\n\nAre you sure this is your SD card?`);
            if (!proceed) return;
        }
        
        const confirmed = confirm(`You selected: ${dirHandle.name}\n\nFPVGate SD card files will be extracted here.\n\nIs this your SD card?`);
        if (!confirmed) return;
        
        // Show progress
        sdcardReady.style.display = 'none';
        sdcardProgress.style.display = 'block';
        sdcardComplete.style.display = 'none';
        sdcardError.style.display = 'none';
        
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        progressLog.innerHTML = '';
        
        log(progressLog, `Selected folder: ${dirHandle.name}`);
        
        // Download SD_Card.zip
        progressTitle.textContent = 'Downloading SD Card Files...';
        const sdCardUrl = `${window.location.origin}/firmware/${version}/SD_Card.zip`;
        log(progressLog, `Downloading from ${sdCardUrl}...`);
        updateProgress(progressBar, 10);
        
        const response = await fetch(sdCardUrl);
        if (!response.ok) {
            throw new Error(`SD_Card.zip not found for ${version}.`);
        }
        
        const zipData = await response.arrayBuffer();
        updateProgress(progressBar, 30);
        log(progressLog, 'Download complete');
        
        // Extract ZIP
        progressTitle.textContent = 'Extracting Files...';
        log(progressLog, 'Extracting ZIP archive...');
        
        const zip = await JSZip.loadAsync(zipData);
        const files = Object.keys(zip.files);
        log(progressLog, `Found ${files.length} items in archive`);
        
        // Detect root folder to strip
        const rootFolder = detectRootFolder(files);
        if (rootFolder) {
            log(progressLog, `Stripping root folder: ${rootFolder}`);
        }
        
        // Write files
        progressTitle.textContent = 'Writing Files...';
        const totalFiles = files.filter(f => !zip.files[f].dir).length;
        let processedFiles = 0;
        
        for (const filePath of files) {
            const zipEntry = zip.files[filePath];
            if (zipEntry.dir) continue;
            
            let targetPath = filePath;
            if (rootFolder && filePath.startsWith(rootFolder)) {
                targetPath = filePath.substring(rootFolder.length);
            }
            if (!targetPath) continue;
            
            const content = await zipEntry.async('arraybuffer');
            await writeFile(dirHandle, targetPath, content);
            
            processedFiles++;
            const progress = 30 + Math.round((processedFiles / totalFiles) * 65);
            updateProgress(progressBar, progress);
        }
        
        // Complete
        updateProgress(progressBar, 100);
        progressTitle.textContent = 'Setup Complete!';
        progressTitle.style.color = 'var(--success-color)';
        log(progressLog, `Successfully wrote ${processedFiles} files to SD card`);
        sdcardComplete.style.display = 'block';
        
    } catch (error) {
        console.error('SD Card setup error:', error);
        
        if (error.name === 'AbortError') {
            sdcardReady.style.display = 'block';
            sdcardProgress.style.display = 'none';
            return;
        }
        
        progressTitle.textContent = 'Setup Failed';
        progressTitle.style.color = 'var(--error-color)';
        sdcardErrorMessage.textContent = error.message;
        sdcardError.style.display = 'block';
        sdcardReady.style.display = 'block';
    }
}

// Helper functions
function detectRootFolder(files) {
    const nonEmptyFiles = files.filter(f => f && f.length > 0);
    if (nonEmptyFiles.length === 0) return null;
    
    const firstComponents = nonEmptyFiles.map(f => {
        const parts = f.replace(/\\/g, '/').split('/').filter(p => p.length > 0);
        return parts[0] || null;
    }).filter(c => c !== null);
    
    if (firstComponents.length === 0) return null;
    
    const firstFolder = firstComponents[0];
    if (firstComponents.every(c => c === firstFolder)) {
        return firstFolder + '/';
    }
    return null;
}

async function writeFile(dirHandle, filePath, content) {
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\.?\//, '');
    const parts = normalizedPath.split('/').filter(p => p.length > 0);
    if (parts.length === 0) return;
    
    let currentDir = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
    }
    
    const fileName = parts[parts.length - 1];
    const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
}

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
