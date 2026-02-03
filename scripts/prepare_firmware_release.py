#!/usr/bin/env python3
"""
FPVGate Firmware Release Preparation Script

This script takes a raw FPVGate release directory and reformats it into
the standardized structure for the fpvgate-website repository.

Usage:
    python prepare_firmware_release.py <input_dir> <version> [--output <output_dir>]

Example:
    python prepare_firmware_release.py ./raw_release v1.5.7 --output ./firmware/v1.5.7
"""

import os
import sys
import shutil
import argparse
from pathlib import Path
from typing import Dict, List

# Board configuration mapping
# Maps: internal_id -> (directory_name, file_prefix, display_name)
BOARD_CONFIGS = {
    'esp32s3_supermini': {
        'dir': 'ESP32S3-Supermini',
        'prefix': 'S3_Supermini',
        'patterns': ['ESP32S3SuperMini', 'ESP32S3-SuperMini', 'supermini'],
    },
    'esp32s3_devkit': {
        'dir': 'ESP32S3-Devkit-C1',
        'prefix': 'S3_Devkit',
        'patterns': ['ESP32S3-8MB', 'ESP32S3_8MB', 'devkit'],
    },
    'xiao_s3': {
        'dir': 'XIAO-S3',
        'prefix': 'XIAO_S3',
        'patterns': ['SeeedXIAO', 'XIAO', 'xiao'],
    },
}

STANDARD_FILES = {
    'firmware': 'firmware.bin',
    'bootloader': 'bootloader.bin',
    'partitions': 'partitions.bin',
    'filesystem': 'filesystem.bin',
    'littlefs': 'filesystem.bin',  # Rename littlefs to filesystem
}

RELEASE_FILES = ['SD_Card.zip', 'sd_card_contents.zip', 'README.txt', 'README.md']


class FirmwarePreparationError(Exception):
    """Custom exception for firmware preparation errors"""
    pass


def identify_board(filename: str) -> str | None:
    """
    Identify which board a file belongs to based on filename patterns.
    
    Args:
        filename: The filename to analyze
        
    Returns:
        Board ID or None if no match
    """
    filename_lower = filename.lower()
    
    for board_id, config in BOARD_CONFIGS.items():
        for pattern in config['patterns']:
            if pattern.lower() in filename_lower:
                return board_id
    
    return None


def identify_file_type(filename: str) -> str | None:
    """
    Identify the type of firmware file.
    
    Args:
        filename: The filename to analyze
        
    Returns:
        File type identifier or None
    """
    filename_lower = filename.lower()
    
    if 'bootloader' in filename_lower:
        return 'bootloader'
    elif 'partition' in filename_lower:
        return 'partitions'
    elif 'firmware' in filename_lower:
        return 'firmware'
    elif 'littlefs' in filename_lower or 'filesystem' in filename_lower:
        return 'filesystem'
    
    return None


def prepare_release(input_dir: Path, version: str, output_dir: Path) -> None:
    """
    Prepare a firmware release by reorganizing files into standardized structure.
    
    Args:
        input_dir: Directory containing raw release files
        version: Version string (e.g., 'v1.5.7')
        output_dir: Target directory for organized files
    """
    if not input_dir.exists():
        raise FirmwarePreparationError(f"Input directory does not exist: {input_dir}")
    
    # Create output directory structure
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Create board subdirectories
    board_dirs = {}
    for board_id, config in BOARD_CONFIGS.items():
        board_dir = output_dir / config['dir']
        board_dir.mkdir(exist_ok=True)
        board_dirs[board_id] = board_dir
    
    # Track processed files
    processed_files = []
    unprocessed_files = []
    
    # Process all files in input directory
    for file_path in input_dir.glob('*'):
        if not file_path.is_file():
            continue
        
        filename = file_path.name
        
        # Check if it's a release-level file (SD card, README, etc.)
        if any(pattern.lower() in filename.lower() for pattern in RELEASE_FILES):
            # Handle SD card zip file
            if 'sd_card' in filename.lower() or 'sd card' in filename.lower():
                dest = output_dir / 'SD_Card.zip'
            elif filename.lower().endswith('.txt'):
                dest = output_dir / 'Release_Notes.txt'
            elif filename.lower().endswith('.md'):
                dest = output_dir / 'Release_Notes.txt'
            else:
                dest = output_dir / filename
            
            shutil.copy2(file_path, dest)
            processed_files.append(f"✓ Copied release file: {filename} -> {dest.name}")
            continue
        
        # Identify board and file type
        board_id = identify_board(filename)
        file_type = identify_file_type(filename)
        
        if board_id and file_type:
            board_config = BOARD_CONFIGS[board_id]
            standard_name = STANDARD_FILES[file_type]
            target_filename = f"{board_config['prefix']}_{standard_name}"
            target_path = board_dirs[board_id] / target_filename
            
            shutil.copy2(file_path, target_path)
            processed_files.append(f"✓ {filename} -> {board_config['dir']}/{target_filename}")
        else:
            unprocessed_files.append(f"⚠ Skipped (could not identify): {filename}")
    
    # Create Supported_Boards.txt
    create_supported_boards_file(output_dir, board_dirs)
    
    # Print summary
    print(f"\n{'='*70}")
    print(f"Firmware Release Preparation Complete: {version}")
    print(f"{'='*70}\n")
    
    print(f"Output directory: {output_dir}\n")
    
    print("Processed Files:")
    for msg in processed_files:
        print(f"  {msg}")
    
    if unprocessed_files:
        print("\nUnprocessed Files:")
        for msg in unprocessed_files:
            print(f"  {msg}")
    
    print(f"\n{'='*70}")
    
    # Validate the structure
    validate_release_structure(output_dir, version)


def create_supported_boards_file(output_dir: Path, board_dirs: Dict[str, Path]) -> None:
    """Create Supported_Boards.txt listing all boards with firmware in this release."""
    supported_boards = []
    
    for board_id, board_dir in board_dirs.items():
        # Check if board has at least bootloader and firmware
        has_bootloader = any((board_dir / f).exists() for f in board_dir.glob('*bootloader.bin'))
        has_firmware = any((board_dir / f).exists() for f in board_dir.glob('*firmware.bin'))
        
        if has_bootloader and has_firmware:
            config = BOARD_CONFIGS[board_id]
            supported_boards.append(config['dir'])
    
    if supported_boards:
        boards_file = output_dir / 'Supported_Boards.txt'
        with open(boards_file, 'w') as f:
            f.write("Supported Boards in this Release:\n")
            f.write("=" * 40 + "\n\n")
            for board in supported_boards:
                f.write(f"- {board}\n")
        
        print(f"✓ Created Supported_Boards.txt with {len(supported_boards)} boards")


def validate_release_structure(output_dir: Path, version: str) -> None:
    """
    Validate that the release structure is correct and complete.
    
    Args:
        output_dir: Directory to validate
        version: Version string
    """
    print(f"\n{'='*70}")
    print("Validating Release Structure")
    print(f"{'='*70}\n")
    
    errors = []
    warnings = []
    
    # Check for required release files
    if not (output_dir / 'Supported_Boards.txt').exists():
        warnings.append("⚠ Missing Supported_Boards.txt")
    
    if not (output_dir / 'Release_Notes.txt').exists():
        warnings.append("⚠ Missing Release_Notes.txt (consider adding release notes)")
    
    # Check each board directory
    for board_id, config in BOARD_CONFIGS.items():
        board_dir = output_dir / config['dir']
        
        if not board_dir.exists():
            warnings.append(f"⚠ Board directory not found: {config['dir']}")
            continue
        
        # Check for required files
        required_files = ['bootloader.bin', 'partitions.bin', 'firmware.bin']
        prefix = config['prefix']
        
        for req_file in required_files:
            expected_file = board_dir / f"{prefix}_{req_file}"
            if not expected_file.exists():
                errors.append(f"✗ Missing required file: {config['dir']}/{prefix}_{req_file}")
        
        # Check for filesystem (optional but recommended)
        filesystem_file = board_dir / f"{prefix}_filesystem.bin"
        if not filesystem_file.exists():
            warnings.append(f"⚠ No filesystem file for: {config['dir']}")
    
    # Print results
    if errors:
        print("ERRORS:")
        for error in errors:
            print(f"  {error}")
    
    if warnings:
        print("\nWARNINGS:")
        for warning in warnings:
            print(f"  {warning}")
    
    if not errors and not warnings:
        print("✓ Release structure is valid and complete!")
    elif not errors:
        print("\n✓ Release structure is valid (with warnings)")
    else:
        print("\n✗ Release structure has errors that must be fixed")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description='Prepare FPVGate firmware release for fpvgate-website repository',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Prepare release v1.5.7 from downloads folder
  python prepare_firmware_release.py ~/Downloads/fpvgate_v1.5.7 v1.5.7
  
  # Specify custom output directory
  python prepare_firmware_release.py ./raw_release v1.5.7 --output ./firmware/v1.5.7
  
  # Dry run (validate only, no copying)
  python prepare_firmware_release.py ./raw_release v1.5.7 --dry-run
        """
    )
    
    parser.add_argument('input_dir', type=Path, help='Directory containing raw release files')
    parser.add_argument('version', help='Version string (e.g., v1.5.7)')
    parser.add_argument('--output', type=Path, help='Output directory (default: ./firmware/<version>)')
    parser.add_argument('--dry-run', action='store_true', help='Validate input without copying files')
    
    args = parser.parse_args()
    
    # Set default output directory
    if args.output is None:
        args.output = Path('./firmware') / args.version
    
    try:
        if args.dry_run:
            print("DRY RUN MODE - No files will be copied\n")
        
        prepare_release(args.input_dir, args.version, args.output)
        
        print(f"\n✓ Success! Release {args.version} is ready to commit.")
        print(f"\nNext steps:")
        print(f"  1. Review the files in: {args.output}")
        print(f"  2. Add release notes if needed: {args.output / 'Release_Notes.txt'}")
        print(f"  3. Commit and push to trigger auto-deployment")
        
    except FirmwarePreparationError as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}", file=sys.stderr)
        raise


if __name__ == '__main__':
    main()
