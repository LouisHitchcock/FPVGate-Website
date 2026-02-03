# Migrate Existing Firmware to New Structure
# This script reorganizes existing firmware files into the standardized directory structure

param(
    [Parameter(Mandatory=$false)]
    [string]$FirmwareDir = ".\firmware",
    
    [Parameter(Mandatory=$false)]
    [switch]$DryRun
)

# Board configuration mapping
$BoardConfigs = @{
    'ESP32S3-Devkit-C1' = @{
        Patterns = @('ESP32S3-8MB', 'ESP32S3_8MB', 'FPVGate_v.*_ESP32S3_')
        Prefix = 'S3_Devkit'
    }
    'ESP32S3-Supermini' = @{
        Patterns = @('ESP32S3-SuperMini', 'ESP32S3SuperMini', 'FPVGate_v.*_ESP32S3SuperMini_')
        Prefix = 'S3_Supermini'
    }
    'XIAO-S3' = @{
        Patterns = @('SeeedXIAO-ESP32S3', 'SeeedXIAO', 'FPVGate_v.*_SeeedXIAOESP32S3_')
        Prefix = 'XIAO_S3'
    }
    'LilyGO-T-Energy-S3' = @{
        Patterns = @('LilyGO', 'FPVGate_v.*_LilyGOTEnergyS3_')
        Prefix = 'LilyGO'
    }
    'ESP32C3' = @{
        Patterns = @('ESP32C3')
        Prefix = 'ESP32C3'
    }
    'ESP32C6' = @{
        Patterns = @('ESP32C6')
        Prefix = 'ESP32C6'
    }
}

# File type mapping
$FileTypeMapping = @{
    'bootloader' = 'bootloader.bin'
    'partitions' = 'partitions.bin'
    'firmware' = 'firmware.bin'
    'littlefs' = 'filesystem.bin'
    'filesystem' = 'filesystem.bin'
}

function Get-BoardFromFilename {
    param([string]$Filename)
    
    foreach ($board in $BoardConfigs.Keys) {
        foreach ($pattern in $BoardConfigs[$board].Patterns) {
            if ($Filename -match $pattern) {
                return $board
            }
        }
    }
    return $null
}

function Get-FileType {
    param([string]$Filename)
    
    $lowerName = $Filename.ToLower()
    
    if ($lowerName -match 'bootloader') { return 'bootloader' }
    if ($lowerName -match 'partition') { return 'partitions' }
    if ($lowerName -match 'littlefs') { return 'filesystem' }
    if ($lowerName -match 'filesystem') { return 'filesystem' }
    if ($lowerName -match 'firmware') { return 'firmware' }
    
    return $null
}

function Migrate-Version {
    param(
        [string]$VersionPath,
        [string]$Version
    )
    
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "Migrating $Version" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    # Get all .bin files
    $binFiles = Get-ChildItem -Path $VersionPath -Filter "*.bin"
    
    if ($binFiles.Count -eq 0) {
        Write-Host "  No .bin files found, skipping" -ForegroundColor Yellow
        return
    }
    
    # Create board directories
    $boardDirs = @{}
    foreach ($board in $BoardConfigs.Keys) {
        $boardPath = Join-Path $VersionPath $board
        if (-not $DryRun) {
            if (-not (Test-Path $boardPath)) {
                New-Item -ItemType Directory -Path $boardPath -Force | Out-Null
            }
        }
        $boardDirs[$board] = $boardPath
    }
    
    # Process each file
    $processed = @()
    $skipped = @()
    
    foreach ($file in $binFiles) {
        $filename = $file.Name
        
        # Identify board and file type
        $board = Get-BoardFromFilename $filename
        $fileType = Get-FileType $filename
        
        if ($board -and $fileType) {
            $prefix = $BoardConfigs[$board].Prefix
            $standardName = $FileTypeMapping[$fileType]
            $newFilename = "${prefix}_${standardName}"
            $targetPath = Join-Path $boardDirs[$board] $newFilename
            
            # Check if target already exists
            if (Test-Path $targetPath) {
                Write-Host "  [SKIP] $filename -> $board/$newFilename (already exists)" -ForegroundColor Yellow
                $skipped += $filename
            } else {
                if ($DryRun) {
                    Write-Host "  [DRY RUN] Would move: $filename -> $board/$newFilename" -ForegroundColor Gray
                } else {
                    Copy-Item -Path $file.FullName -Destination $targetPath -Force
                    Write-Host "  [OK] $filename -> $board/$newFilename" -ForegroundColor Green
                }
                $processed += $filename
            }
        } else {
            Write-Host "  [WARN] Could not identify: $filename (board=$board, type=$fileType)" -ForegroundColor Yellow
            $skipped += $filename
        }
    }
    
    # Handle release files
    $releaseFiles = @{
        'sd_card_contents.zip' = 'SD_Card.zip'
        'README.txt' = 'Release_Notes.txt'
        'README.md' = 'Release_Notes.txt'
    }
    
    foreach ($sourceFile in $releaseFiles.Keys) {
        $sourcePath = Join-Path $VersionPath $sourceFile
        if (Test-Path $sourcePath) {
            $targetFile = $releaseFiles[$sourceFile]
            $targetPath = Join-Path $VersionPath $targetFile
            
            if (Test-Path $targetPath) {
                Write-Host "  [SKIP] $sourceFile -> $targetFile (already exists)" -ForegroundColor Yellow
            } else {
                if ($DryRun) {
                    Write-Host "  [DRY RUN] Would copy: $sourceFile -> $targetFile" -ForegroundColor Gray
                } else {
                    Copy-Item -Path $sourcePath -Destination $targetPath -Force
                    Write-Host "  [OK] $sourceFile -> $targetFile" -ForegroundColor Green
                }
            }
        }
    }
    
    # Create Supported_Boards.txt
    $supportedBoardsPath = Join-Path $VersionPath "Supported_Boards.txt"
    if (-not (Test-Path $supportedBoardsPath)) {
        $supportedBoards = @()
        foreach ($board in $BoardConfigs.Keys) {
            $boardPath = Join-Path $VersionPath $board
            if (Test-Path $boardPath) {
                $hasBootloader = Test-Path (Join-Path $boardPath "*bootloader.bin")
                $hasFirmware = Test-Path (Join-Path $boardPath "*firmware.bin")
                if ($hasBootloader -and $hasFirmware) {
                    $supportedBoards += $board
                }
            }
        }
        
        if ($supportedBoards.Count -gt 0) {
            if ($DryRun) {
                Write-Host "  [DRY RUN] Would create Supported_Boards.txt with $($supportedBoards.Count) boards" -ForegroundColor Gray
            } else {
                $content = "Supported Boards in this Release:`n"
                $content += "=" * 40 + "`n`n"
                foreach ($board in $supportedBoards) {
                    $content += "- $board`n"
                }
                $content | Out-File -FilePath $supportedBoardsPath -Encoding utf8 -Force
                Write-Host "  [OK] Created Supported_Boards.txt" -ForegroundColor Green
            }
        }
    }
    
    Write-Host "`n  Summary: $($processed.Count) files processed, $($skipped.Count) skipped" -ForegroundColor Cyan
}

# Main execution
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "Firmware Migration Script" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "`n** DRY RUN MODE - No files will be modified **`n" -ForegroundColor Yellow
}

$firmwarePath = Resolve-Path $FirmwareDir
Write-Host "Firmware directory: $firmwarePath`n"

# Get all version directories
$versions = Get-ChildItem -Path $firmwarePath -Directory | Where-Object { $_.Name -match '^v\d+\.\d+\.\d+' } | Sort-Object Name

if ($versions.Count -eq 0) {
    Write-Host "No version directories found!" -ForegroundColor Red
    exit 1
}

Write-Host "Found $($versions.Count) versions to migrate:`n"
foreach ($version in $versions) {
    Write-Host "  - $($version.Name)"
}

# Migrate each version
foreach ($version in $versions) {
    Migrate-Version -VersionPath $version.FullName -Version $version.Name
}

Write-Host "`n=======================================" -ForegroundColor Cyan
Write-Host "Migration Complete!" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "`nThis was a dry run. Run again without -DryRun to apply changes." -ForegroundColor Yellow
} else {
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "  1. Review the migrated firmware structure"
    Write-Host "  2. Run validation: python scripts/validate_firmware_endpoints.py --local-only"
    Write-Host "  3. Delete old .bin files from version root directories"
    Write-Host "  4. Commit and push changes"
}
