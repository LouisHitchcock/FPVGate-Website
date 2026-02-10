// SD Card Setup - Separate section on Flasher Page
// Has its own version selector

const SDCARD_GITHUB_API = 'https://api.github.com/repos/LouisHitchcock/FPVGate/releases';
let sdcardReleases = [];

document.addEventListener('DOMContentLoaded', () => {
    setupSDCardSection();
});

async function setupSDCardSection() {
    const versionSelect = document.getElementById('sdcard-version-select');
    const sdcardSetupButton = document.getElementById('sdcard-setup-button');
    
    // Load releases for SD card section
    await loadSDCardReleases();
    
    // Update SD card section when version changes
    versionSelect.addEventListener('change', updateSDCardSection);
    
    // Setup button click handler
    sdcardSetupButton.addEventListener('click', startSDCardSetup);
}

async function loadSDCardReleases() {
    const versionSelect = document.getElementById('sdcard-version-select');
    
    try {
        const response = await fetch(SDCARD_GITHUB_API);
        if (!response.ok) throw new Error('Failed to fetch releases');
        
        const data = await response.json();
        sdcardReleases = data.filter(release => !release.draft && release.assets.length > 0);
        
        versionSelect.innerHTML = '<option value="">Choose version...</option>';
        sdcardReleases.forEach(release => {
            const option = document.createElement('option');
            option.value = release.tag_name;
            option.textContent = `${release.tag_name}${release.prerelease ? ' (Pre-release)' : ''}${release.tag_name === sdcardReleases[0].tag_name ? ' (Latest)' : ''}`;
            versionSelect.appendChild(option);
        });
        
        // Auto-select latest stable
        if (sdcardReleases.length > 0) {
            const latestStable = sdcardReleases.find(r => !r.prerelease) || sdcardReleases[0];
            versionSelect.value = latestStable.tag_name;
            updateSDCardSection();
        }
    } catch (error) {
        console.error('Error loading SD card releases:', error);
        versionSelect.innerHTML = '<option value="">Failed to load versions</option>';
    }
}

function updateSDCardSection() {
    const versionSelect = document.getElementById('sdcard-version-select');
    const sdcardReady = document.getElementById('sdcard-ready');
    const sdcardDownload = document.getElementById('sdcard-download');
    
    const version = versionSelect.value;
    
    if (version) {
        sdcardReady.style.display = 'block';
        sdcardDownload.href = `${window.location.origin}/firmware/${version}/SD_Card.zip`;
    } else {
        sdcardReady.style.display = 'none';
    }
}

async function startSDCardSetup() {
    const versionSelect = document.getElementById('sdcard-version-select');
    const version = versionSelect.value;
    
    if (!version) {
        alert('Please select a version first.');
        return;
    }
    
    const sdcardReady = document.getElementById('sdcard-ready');
    const sdcardProgress = document.getElementById('sdcard-progress');
    const progressTitle = document.getElementById('sdcard-progress-title');
    const progressBar = document.getElementById('sdcard-progress-bar');
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
            const proceed = confirm(`Warning: "${dirHandle.name}" looks like a system folder.\n\nAre you sure this is your SD card?`);
            if (!proceed) return;
        }
        
        const confirmed = confirm(`Extract to: ${dirHandle.name}\n\nIs this your SD card?`);
        if (!confirmed) return;
        
        // Show progress
        sdcardReady.style.display = 'none';
        sdcardProgress.style.display = 'block';
        sdcardComplete.style.display = 'none';
        sdcardError.style.display = 'none';
        
        progressTitle.textContent = 'Downloading...';
        updateProgress(progressBar, 10);
        
        // Download SD_Card.zip
        const sdCardUrl = `${window.location.origin}/firmware/${version}/SD_Card.zip`;
        const response = await fetch(sdCardUrl);
        if (!response.ok) {
            throw new Error(`SD_Card.zip not found for ${version}.`);
        }
        
        const zipData = await response.arrayBuffer();
        updateProgress(progressBar, 30);
        
        // Extract ZIP
        progressTitle.textContent = 'Extracting...';
        const zip = await JSZip.loadAsync(zipData);
        const files = Object.keys(zip.files);
        
        // Detect root folder to strip
        const rootFolder = detectRootFolder(files);
        
        // Write files
        progressTitle.textContent = 'Writing...';
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
            const progress = 30 + Math.round((processedFiles / totalFiles) * 70);
            updateProgress(progressBar, progress);
        }
        
        // Complete
        updateProgress(progressBar, 100);
        sdcardProgress.style.display = 'none';
        sdcardComplete.style.display = 'block';
        
    } catch (error) {
        console.error('SD Card setup error:', error);
        
        if (error.name === 'AbortError') {
            sdcardReady.style.display = 'block';
            sdcardProgress.style.display = 'none';
            return;
        }
        
        sdcardProgress.style.display = 'none';
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
}
