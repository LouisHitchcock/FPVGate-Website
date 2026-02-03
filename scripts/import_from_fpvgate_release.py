#!/usr/bin/env python3
"""
Import Binaries from FPVGate Release Folder

This script copies firmware binaries from the FPVGate/release directory
to the fpvgate-website firmware directory with proper structure.
"""

import shutil
import re
from pathlib import Path
from typing import Dict, Set

# Source and destination
FPVGATE_RELEASE = Path('C:/Users/Louis/Desktop/Code/FPVGate/release')
WEBSITE_FIRMWARE = Path('C:/Users/Louis/Desktop/Code/fpvgate-website/firmware')

# Board mapping (same as fetch script)
BOARD_MAPPING = {
    'ESP32S3-8MB': {
        'dir': 'ESP32S3-Devkit-C1',
        'prefix': 'S3_Devkit',
        'patterns': ['ESP32S3-8MB', 'ESP32S3_8MB'],
    },
    'ESP32S3-SuperMini-4MB': {
        'dir': 'ESP32S3-Supermini',
        'prefix': 'S3_Supermini',
        'patterns': ['ESP32S3-SuperMini', 'SuperMini'],
    },
    'SeeedXIAO-ESP32S3': {
        'dir': 'XIAO-S3',
        'prefix': 'XIAO_S3',
        'patterns': ['SeeedXIAO', 'XIAO'],
    },
    'LilyGO-T-Energy-S3': {
        'dir': 'LilyGO-T-Energy-S3',
        'prefix': 'LilyGO',
        'patterns': ['LilyGO'],
    },
    'ESP32C3': {
        'dir': 'ESP32C3',
        'prefix': 'ESP32C3',
        'patterns': ['ESP32C3'],
    },
    'ESP32C6': {
        'dir': 'ESP32C6',
        'prefix': 'ESP32C6',
        'patterns': ['ESP32C6'],
    },
}

FILE_TYPES = ['bootloader', 'partitions', 'firmware', 'littlefs', 'filesystem']


def identify_board(filename: str) -> str:
    """Identify board from filename."""
    filename_lower = filename.lower()
    
    for board_key, config in BOARD_MAPPING.items():
        for pattern in config['patterns']:
            if pattern.lower() in filename_lower:
                return board_key
    
    return None


def identify_file_type(filename: str) -> str:
    """Identify file type from filename."""
    filename_lower = filename.lower()
    
    for file_type in FILE_TYPES:
        if file_type in filename_lower:
            return 'filesystem' if file_type in ['littlefs', 'filesystem'] else file_type
    
    return None


def process_version(version: str, dry_run: bool = False) -> None:
    """Process a single version."""
    source_dir = FPVGATE_RELEASE / version
    dest_dir = WEBSITE_FIRMWARE / version
    
    if not source_dir.exists():
        print(f"⊘ {version}: Source directory not found")
        return
    
    print(f"\n{'='*70}")
    print(f"Processing {version}")
    print(f"{'='*70}")
    
    # Get all .bin files
    bin_files = list(source_dir.glob('*.bin'))
    
    if not bin_files:
        print(f"  ⚠ No .bin files found")
        return
    
    # Organize files by board
    boards_found = {}
    generic_files = []  # Files without board prefix (assume DevKit C1)
    
    for bin_file in bin_files:
        board = identify_board(bin_file.name)
        file_type = identify_file_type(bin_file.name)
        
        if not file_type:
            continue
        
        if board:
            if board not in boards_found:
                boards_found[board] = {}
            boards_found[board][file_type] = bin_file
        else:
            # Generic file (no board prefix) - assume DevKit C1
            generic_files.append((file_type, bin_file))
    
    # If we have generic files, assign them to DevKit C1
    if generic_files:
        devkit_key = 'ESP32S3-8MB'
        if devkit_key not in boards_found:
            boards_found[devkit_key] = {}
        for file_type, bin_file in generic_files:
            boards_found[devkit_key][file_type] = bin_file
    
    if not boards_found:
        print(f"  ⚠ No identifiable board files found")
        return
    
    print(f"  Found boards: {', '.join(boards_found.keys())}")
    
    if dry_run:
        print(f"  [DRY RUN] Would create {len(boards_found)} board directories")
        return
    
    # Create destination directory
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy files for each board
    copied_count = 0
    for board_key, files in boards_found.items():
        board_config = BOARD_MAPPING[board_key]
        board_dir = dest_dir / board_config['dir']
        board_dir.mkdir(exist_ok=True)
        
        for file_type, source_file in files.items():
            target_name = f"{board_config['prefix']}_{file_type}.bin"
            target_path = board_dir / target_name
            
            shutil.copy2(source_file, target_path)
            print(f"  ✓ {source_file.name} -> {board_config['dir']}/{target_name}")
            copied_count += 1
    
    # Copy release-level files
    for file_name in ['sd_card_contents.zip', 'README.txt', 'RELEASE_NOTES.md']:
        source_file = source_dir / file_name
        if source_file.exists():
            if file_name == 'sd_card_contents.zip':
                dest_file = dest_dir / 'SD_Card.zip'
            elif file_name in ['README.txt', 'RELEASE_NOTES.md']:
                dest_file = dest_dir / 'Release_Notes.txt'
            else:
                dest_file = dest_dir / file_name
            
            shutil.copy2(source_file, dest_file)
            print(f"  ✓ Copied {file_name}")
    
    # Create Supported_Boards.txt
    board_beta = {
        'ESP32S3-8MB': False,
        'ESP32S3-SuperMini-4MB': False,
        'SeeedXIAO-ESP32S3': False,
        'LilyGO-T-Energy-S3': True,
        'ESP32C3': True,
        'ESP32C6': True,
    }
    
    board_ids = {
        'ESP32S3-8MB': 'esp32s3_devkit',
        'ESP32S3-SuperMini-4MB': 'esp32s3_supermini',
        'SeeedXIAO-ESP32S3': 'xiao_s3',
        'LilyGO-T-Energy-S3': 'lilygo',
        'ESP32C3': 'esp32c3',
        'ESP32C6': 'esp32c6',
    }
    
    board_names = {
        'ESP32S3-8MB': 'ESP32-S3 DevKitC-1 (8MB)',
        'ESP32S3-SuperMini-4MB': 'ESP32-S3 Super Mini (4MB)',
        'SeeedXIAO-ESP32S3': 'Seeed Studio XIAO ESP32S3',
        'LilyGO-T-Energy-S3': 'LilyGO T-Energy S3',
        'ESP32C3': 'ESP32-C3',
        'ESP32C6': 'ESP32-C6',
    }
    
    # Sort boards: non-beta first
    sorted_boards = sorted(boards_found.keys(), key=lambda b: (board_beta.get(b, True), b))
    
    with open(dest_dir / 'Supported_Boards.txt', 'w') as f:
        f.write('# Supported Boards for this Release\n')
        f.write('# Format: [board_id] Board Name (beta: yes/no)\n')
        f.write('=' * 60 + '\n\n')
        for board_key in sorted_boards:
            board_id = board_ids[board_key]
            board_name = board_names[board_key]
            beta_flag = 'yes' if board_beta.get(board_key, True) else 'no'
            f.write(f'[{board_id}] {board_name} (beta: {beta_flag})\n')
    
    print(f"  ✓ Created Supported_Boards.txt")
    print(f"\n  Summary: {copied_count} files copied, {len(boards_found)} boards")


def clean_legacy_files(dry_run: bool = False) -> None:
    """Clean up legacy .bin files from version root directories."""
    print(f"\n{'='*70}")
    print("Cleaning Legacy Files")
    print(f"{'='*70}\n")
    
    cleaned_count = 0
    
    for version_dir in WEBSITE_FIRMWARE.iterdir():
        if not version_dir.is_dir():
            continue
        
        # Find .bin files in root of version directory (not in board subdirs)
        root_bins = list(version_dir.glob('*.bin'))
        
        if root_bins:
            print(f"{version_dir.name}: Found {len(root_bins)} legacy .bin files")
            
            if not dry_run:
                for bin_file in root_bins:
                    bin_file.unlink()
                    print(f"  ✗ Removed {bin_file.name}")
                cleaned_count += len(root_bins)
            else:
                print(f"  [DRY RUN] Would remove {len(root_bins)} files")
    
    if cleaned_count > 0:
        print(f"\n✓ Cleaned up {cleaned_count} legacy files")
    elif not dry_run:
        print("\n✓ No legacy files found")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Import firmware from FPVGate release folder')
    parser.add_argument('--versions', nargs='+', help='Specific versions to process (e.g., v1.5.0 v1.5.1)')
    parser.add_argument('--all', action='store_true', help='Process all versions')
    parser.add_argument('--clean-only', action='store_true', help='Only clean legacy files')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done')
    
    args = parser.parse_args()
    
    print(f"{'='*70}")
    print("FPVGate Binary Import Tool")
    print(f"{'='*70}\n")
    
    if args.dry_run:
        print("** DRY RUN MODE **\n")
    
    # Clean legacy files if requested
    if args.clean_only or args.all:
        clean_legacy_files(args.dry_run)
    
    if args.clean_only:
        return
    
    # Process versions
    versions_to_process = []
    
    if args.all:
        # Get all versions from FPVGate release folder
        versions_to_process = [d.name for d in FPVGATE_RELEASE.iterdir() if d.is_dir()]
    elif args.versions:
        versions_to_process = args.versions
    else:
        # Default: process missing/incomplete versions
        print("Auto-detecting missing versions...\n")
        for release_dir in FPVGATE_RELEASE.iterdir():
            if not release_dir.is_dir():
                continue
            
            version = release_dir.name
            website_dir = WEBSITE_FIRMWARE / version
            
            # Check if version is missing or has no board directories
            if not website_dir.exists():
                versions_to_process.append(version)
            else:
                # Check if it has board directories
                board_dirs = [d for d in website_dir.iterdir() if d.is_dir()]
                if len(board_dirs) == 0:
                    versions_to_process.append(version)
    
    if not versions_to_process:
        print("No versions to process")
        return
    
    print(f"Processing {len(versions_to_process)} versions:\n")
    
    for version in sorted(versions_to_process):
        process_version(version, args.dry_run)
    
    if not args.dry_run:
        print(f"\n{'='*70}")
        print("Import Complete!")
        print(f"{'='*70}")
        print("\nNext steps:")
        print("  1. Validate: python scripts/validate_firmware_endpoints.py --local-only")
        print("  2. Test locally: python -m http.server 8000")


if __name__ == '__main__':
    main()
