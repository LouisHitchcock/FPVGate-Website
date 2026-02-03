#!/usr/bin/env python3
"""
Fetch All FPVGate Releases

This script fetches all releases from the FPVGate repository and prepares them
for the fpvgate-website using the standardized directory structure.

It automatically:
- Downloads all release assets
- Identifies supported boards from available binaries
- Creates proper directory structure
- Generates Supported_Boards.txt with beta flags
- Validates each release

Usage:
    python fetch_all_releases.py [--start-version v1.5.0] [--dry-run]
"""

import argparse
import json
import os
import sys
import tempfile
import shutil
from pathlib import Path
from typing import Dict, List, Set, Optional
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# Try to import requests for better HTTP handling
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    print("Note: 'requests' library not available, using urllib instead")
    print("Install with: pip install requests\n")

GITHUB_API = 'https://api.github.com/repos/LouisHitchcock/FPVGate/releases'

# Board configuration with patterns to detect from release asset names
BOARD_CONFIGS = {
    'esp32s3_devkit': {
        'dir': 'ESP32S3-Devkit-C1',
        'prefix': 'S3_Devkit',
        'patterns': ['ESP32S3-8MB', 'ESP32S3_8MB', 'FPVGate_v.*_ESP32S3_(?!SuperMini)'],
        'display_name': 'ESP32-S3 DevKitC-1 (8MB)',
        'beta': False,
    },
    'esp32s3_supermini': {
        'dir': 'ESP32S3-Supermini',
        'prefix': 'S3_Supermini',
        'patterns': ['ESP32S3-SuperMini', 'ESP32S3SuperMini', 'FPVGate_v.*_ESP32S3SuperMini'],
        'display_name': 'ESP32-S3 Super Mini (4MB)',
        'beta': False,
    },
    'xiao_s3': {
        'dir': 'XIAO-S3',
        'prefix': 'XIAO_S3',
        'patterns': ['SeeedXIAO-ESP32S3', 'SeeedXIAO', 'FPVGate_v.*_SeeedXIAOESP32S3'],
        'display_name': 'Seeed Studio XIAO ESP32S3',
        'beta': False,
    },
    'lilygo': {
        'dir': 'LilyGO-T-Energy-S3',
        'prefix': 'LilyGO',
        'patterns': ['LilyGO', 'FPVGate_v.*_LilyGOTEnergyS3'],
        'display_name': 'LilyGO T-Energy S3',
        'beta': True,  # Expert mode board
    },
    'esp32c3': {
        'dir': 'ESP32C3',
        'prefix': 'ESP32C3',
        'patterns': ['ESP32C3'],
        'display_name': 'ESP32-C3',
        'beta': True,  # Expert mode board
    },
    'esp32c6': {
        'dir': 'ESP32C6',
        'prefix': 'ESP32C6',
        'patterns': ['ESP32C6'],
        'display_name': 'ESP32-C6',
        'beta': True,  # Expert mode board
    },
}

FILE_TYPE_PATTERNS = {
    'bootloader': ['bootloader'],
    'partitions': ['partition'],
    'firmware': ['firmware'],
    'filesystem': ['littlefs', 'filesystem'],
}


def fetch_releases() -> List[Dict]:
    """Fetch all releases from FPVGate repository."""
    print("Fetching releases from FPVGate repository...")
    
    if REQUESTS_AVAILABLE:
        response = requests.get(GITHUB_API, timeout=30)
        response.raise_for_status()
        releases = response.json()
    else:
        req = Request(GITHUB_API, headers={'User-Agent': 'fpvgate-website-script'})
        with urlopen(req, timeout=30) as response:
            releases = json.loads(response.read().decode())
    
    # Filter out drafts
    releases = [r for r in releases if not r.get('draft', False)]
    
    print(f"Found {len(releases)} releases")
    return releases


def identify_board_from_filename(filename: str) -> Optional[str]:
    """Identify board from asset filename."""
    import re
    filename_lower = filename.lower()
    
    for board_id, config in BOARD_CONFIGS.items():
        for pattern in config['patterns']:
            if re.search(pattern.lower(), filename_lower):
                return board_id
    
    return None


def identify_file_type(filename: str) -> Optional[str]:
    """Identify file type from filename."""
    filename_lower = filename.lower()
    
    for file_type, patterns in FILE_TYPE_PATTERNS.items():
        for pattern in patterns:
            if pattern in filename_lower:
                return file_type
    
    return None


def download_file(url: str, dest: Path, filename: str) -> bool:
    """Download a file from URL to destination."""
    try:
        if REQUESTS_AVAILABLE:
            response = requests.get(url, stream=True, timeout=60)
            response.raise_for_status()
            
            with open(dest, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
        else:
            req = Request(url, headers={'User-Agent': 'fpvgate-website-script'})
            with urlopen(req, timeout=60) as response:
                with open(dest, 'wb') as f:
                    shutil.copyfileobj(response, f)
        
        print(f"  ✓ Downloaded {filename} ({dest.stat().st_size} bytes)")
        return True
        
    except (URLError, HTTPError, Exception) as e:
        print(f"  ✗ Failed to download {filename}: {str(e)}")
        return False


def detect_boards_in_release(assets: List[Dict]) -> Set[str]:
    """Detect which boards are supported in a release based on available binaries."""
    boards_with_files = {}
    
    # Check each asset
    for asset in assets:
        if not asset['name'].endswith('.bin'):
            continue
        
        board_id = identify_board_from_filename(asset['name'])
        file_type = identify_file_type(asset['name'])
        
        if board_id and file_type:
            if board_id not in boards_with_files:
                boards_with_files[board_id] = set()
            boards_with_files[board_id].add(file_type)
    
    # A board is considered supported if it has at least bootloader, partitions, and firmware
    required_files = {'bootloader', 'partitions', 'firmware'}
    supported_boards = set()
    
    for board_id, files in boards_with_files.items():
        if required_files.issubset(files):
            supported_boards.add(board_id)
    
    return supported_boards


def create_supported_boards_file(output_dir: Path, supported_boards: Set[str]) -> None:
    """Create Supported_Boards.txt with board list and beta flags."""
    if not supported_boards:
        return
    
    boards_file = output_dir / 'Supported_Boards.txt'
    
    # Sort boards: non-beta first, then beta
    sorted_boards = sorted(
        supported_boards,
        key=lambda b: (BOARD_CONFIGS[b]['beta'], BOARD_CONFIGS[b]['display_name'])
    )
    
    content = "# Supported Boards for this Release\n"
    content += "# Format: [board_id] Board Name (beta: yes/no)\n"
    content += "=" * 60 + "\n\n"
    
    for board_id in sorted_boards:
        config = BOARD_CONFIGS[board_id]
        beta_flag = "yes" if config['beta'] else "no"
        content += f"[{board_id}] {config['display_name']} (beta: {beta_flag})\n"
    
    with open(boards_file, 'w') as f:
        f.write(content)
    
    print(f"  ✓ Created Supported_Boards.txt with {len(supported_boards)} boards")


def prepare_release(release: Dict, output_base: Path, dry_run: bool = False) -> bool:
    """
    Prepare a single release.
    
    Args:
        release: Release data from GitHub API
        output_base: Base firmware directory
        dry_run: If True, only show what would be done
        
    Returns:
        True if successful, False otherwise
    """
    version = release['tag_name']
    output_dir = output_base / version
    
    print(f"\n{'='*70}")
    print(f"Processing {version}")
    print(f"{'='*70}")
    
    if output_dir.exists() and not dry_run:
        print(f"  ⚠ Version {version} already exists, skipping...")
        return True
    
    # Detect supported boards
    assets = release.get('assets', [])
    if not assets:
        print(f"  ⚠ No assets found for {version}, skipping...")
        return False
    
    supported_boards = detect_boards_in_release(assets)
    
    if not supported_boards:
        print(f"  ⚠ No supported boards detected in {version}, skipping...")
        return False
    
    print(f"  Detected {len(supported_boards)} supported boards:")
    for board_id in supported_boards:
        config = BOARD_CONFIGS[board_id]
        beta_str = " (BETA)" if config['beta'] else ""
        print(f"    - {config['display_name']}{beta_str}")
    
    if dry_run:
        print(f"  [DRY RUN] Would create {output_dir} with {len(supported_boards)} boards")
        return True
    
    # Create directory structure
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Create board directories
    board_dirs = {}
    for board_id in supported_boards:
        board_dir = output_dir / BOARD_CONFIGS[board_id]['dir']
        board_dir.mkdir(exist_ok=True)
        board_dirs[board_id] = board_dir
    
    # Download and organize assets
    downloaded_count = 0
    
    for asset in assets:
        asset_name = asset['name']
        asset_url = asset['browser_download_url']
        
        # Handle release-level files
        if asset_name.lower() == 'sd_card_contents.zip' or 'sd_card' in asset_name.lower():
            dest = output_dir / 'SD_Card.zip'
            if download_file(asset_url, dest, asset_name):
                downloaded_count += 1
            continue
        
        if asset_name.lower() in ['readme.txt', 'readme.md']:
            dest = output_dir / 'Release_Notes.txt'
            if download_file(asset_url, dest, asset_name):
                downloaded_count += 1
            continue
        
        # Handle board-specific binaries
        if asset_name.endswith('.bin'):
            board_id = identify_board_from_filename(asset_name)
            file_type = identify_file_type(asset_name)
            
            if board_id and board_id in supported_boards and file_type:
                config = BOARD_CONFIGS[board_id]
                
                # Determine target filename
                if file_type == 'filesystem':
                    target_name = f"{config['prefix']}_filesystem.bin"
                else:
                    target_name = f"{config['prefix']}_{file_type}.bin"
                
                dest = board_dirs[board_id] / target_name
                if download_file(asset_url, dest, asset_name):
                    downloaded_count += 1
    
    # Create Supported_Boards.txt
    create_supported_boards_file(output_dir, supported_boards)
    
    # Create release notes if not present
    release_notes_path = output_dir / 'Release_Notes.txt'
    if not release_notes_path.exists():
        with open(release_notes_path, 'w') as f:
            f.write(f"FPVGate {version}\n")
            f.write("=" * 60 + "\n\n")
            f.write(f"Published: {release.get('published_at', 'Unknown')}\n")
            f.write(f"Prerelease: {release.get('prerelease', False)}\n\n")
            if release.get('body'):
                f.write(release['body'])
    
    print(f"\n  ✓ Successfully prepared {version} ({downloaded_count} files downloaded)")
    return True


def main():
    parser = argparse.ArgumentParser(
        description='Fetch and prepare all FPVGate releases',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Fetch all releases
  python fetch_all_releases.py
  
  # Fetch releases starting from v1.5.0
  python fetch_all_releases.py --start-version v1.5.0
  
  # Dry run to see what would be done
  python fetch_all_releases.py --dry-run
        """
    )
    
    parser.add_argument('--firmware-dir', type=Path, default=Path('./firmware'),
                       help='Firmware directory (default: ./firmware)')
    parser.add_argument('--start-version', type=str,
                       help='Start from this version (e.g., v1.5.0)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Show what would be done without downloading')
    parser.add_argument('--force', action='store_true',
                       help='Re-download existing versions')
    
    args = parser.parse_args()
    
    print(f"{'='*70}")
    print("FPVGate Release Fetcher")
    print(f"{'='*70}\n")
    
    if args.dry_run:
        print("** DRY RUN MODE - No files will be downloaded **\n")
    
    try:
        # Fetch releases
        releases = fetch_releases()
        
        # Filter by start version if specified
        if args.start_version:
            filtered_releases = []
            start_found = False
            for release in reversed(releases):  # Oldest to newest
                if release['tag_name'] == args.start_version:
                    start_found = True
                if start_found:
                    filtered_releases.append(release)
            
            releases = list(reversed(filtered_releases))
            print(f"\nFiltered to {len(releases)} releases starting from {args.start_version}")
        
        # Prepare each release
        success_count = 0
        skip_count = 0
        fail_count = 0
        
        for release in releases:
            if args.force or not (args.firmware_dir / release['tag_name']).exists():
                if prepare_release(release, args.firmware_dir, args.dry_run):
                    success_count += 1
                else:
                    fail_count += 1
            else:
                skip_count += 1
                print(f"\n⊘ Skipping {release['tag_name']} (already exists)")
        
        # Summary
        print(f"\n{'='*70}")
        print("Summary")
        print(f"{'='*70}")
        print(f"Total releases: {len(releases)}")
        print(f"Successfully prepared: {success_count}")
        print(f"Skipped (already exist): {skip_count}")
        print(f"Failed: {fail_count}")
        
        if args.dry_run:
            print("\n** This was a dry run. Run without --dry-run to download files. **")
        else:
            print("\nNext steps:")
            print("  1. Validate: python scripts/validate_firmware_endpoints.py --local-only")
            print("  2. Test locally: python -m http.server 8000")
            print("  3. Commit and push changes")
        
        print(f"\n{'='*70}")
        
        sys.exit(0 if fail_count == 0 else 1)
        
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
