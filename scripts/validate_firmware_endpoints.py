#!/usr/bin/env python3
"""
FPVGate Firmware Endpoint Validation Script

This script validates that all firmware files in the repository are accessible
and can be downloaded. It checks both local files and simulates the web URLs
that will be used by the flasher.

Usage:
    python validate_firmware_endpoints.py [--base-url <url>] [--local-only]

Example:
    python validate_firmware_endpoints.py --base-url https://fpvgate.xyz
"""

import argparse
import sys
from pathlib import Path
from typing import List, Dict, Tuple
import hashlib

# Try to import requests for HTTP validation
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    print("Warning: 'requests' library not available. HTTP validation disabled.")
    print("Install with: pip install requests\n")


# Board configuration (must match prepare_firmware_release.py)
BOARD_CONFIGS = {
    'esp32s3_supermini': {
        'dir': 'ESP32S3-Supermini',
        'prefix': 'S3_Supermini',
        'id': 'esp32s3supermini',
    },
    'esp32s3_devkit': {
        'dir': 'ESP32S3-Devkit-C1',
        'prefix': 'S3_Devkit',
        'id': 'esp32s3',
    },
    'xiao_s3': {
        'dir': 'XIAO-S3',
        'prefix': 'XIAO_S3',
        'id': 'seeedxiaos3',
    },
}

REQUIRED_FILES = ['bootloader.bin', 'partitions.bin', 'firmware.bin']
OPTIONAL_FILES = ['filesystem.bin']


class ValidationError:
    def __init__(self, version: str, board: str, file: str, error: str):
        self.version = version
        self.board = board
        self.file = file
        self.error = error
    
    def __str__(self):
        return f"[{self.version}/{self.board}] {self.file}: {self.error}"


class ValidationResult:
    def __init__(self):
        self.errors: List[ValidationError] = []
        self.warnings: List[str] = []
        self.versions_checked: List[str] = []
        self.files_validated: int = 0
        self.http_checks: int = 0
    
    def add_error(self, version: str, board: str, file: str, error: str):
        self.errors.append(ValidationError(version, board, file, error))
    
    def add_warning(self, message: str):
        self.warnings.append(message)
    
    def is_valid(self) -> bool:
        return len(self.errors) == 0
    
    def print_summary(self):
        print(f"\n{'='*70}")
        print("Validation Summary")
        print(f"{'='*70}\n")
        
        print(f"Versions checked: {len(self.versions_checked)}")
        print(f"Files validated: {self.files_validated}")
        if self.http_checks > 0:
            print(f"HTTP endpoints checked: {self.http_checks}")
        
        if self.errors:
            print(f"\n❌ ERRORS ({len(self.errors)}):")
            for error in self.errors:
                print(f"  {error}")
        
        if self.warnings:
            print(f"\n⚠️  WARNINGS ({len(self.warnings)}):")
            for warning in self.warnings:
                print(f"  {warning}")
        
        if not self.errors and not self.warnings:
            print("\n✅ All firmware endpoints are valid!")
        elif not self.errors:
            print("\n✅ All required files present (with warnings)")
        else:
            print("\n❌ Validation failed with errors")
        
        print(f"\n{'='*70}")


def get_firmware_versions(firmware_dir: Path) -> List[str]:
    """Get all version directories in the firmware folder."""
    if not firmware_dir.exists():
        return []
    
    versions = []
    for item in firmware_dir.iterdir():
        if item.is_dir() and item.name.startswith('v'):
            versions.append(item.name)
    
    return sorted(versions)


def validate_local_file(file_path: Path, result: ValidationResult, 
                       version: str, board_name: str, filename: str) -> bool:
    """Validate that a local file exists and is readable."""
    if not file_path.exists():
        result.add_error(version, board_name, filename, "File does not exist")
        return False
    
    if not file_path.is_file():
        result.add_error(version, board_name, filename, "Path is not a file")
        return False
    
    # Check file size
    file_size = file_path.stat().st_size
    if file_size == 0:
        result.add_error(version, board_name, filename, "File is empty (0 bytes)")
        return False
    
    # Check if file is suspiciously small (less than 1KB for bin files)
    if filename.endswith('.bin') and file_size < 1024:
        result.add_warning(f"[{version}/{board_name}] {filename} is very small ({file_size} bytes)")
    
    result.files_validated += 1
    return True


def validate_http_endpoint(url: str, result: ValidationResult, 
                          version: str, board_name: str, filename: str) -> bool:
    """Validate that an HTTP endpoint is accessible."""
    if not REQUESTS_AVAILABLE:
        return True  # Skip if requests not available
    
    try:
        # Use HEAD request first (faster)
        response = requests.head(url, timeout=10, allow_redirects=True)
        
        if response.status_code == 404:
            result.add_error(version, board_name, filename, f"HTTP 404 - Not Found: {url}")
            return False
        elif response.status_code >= 400:
            result.add_error(version, board_name, filename, 
                           f"HTTP {response.status_code}: {url}")
            return False
        
        # Check content length if available
        content_length = response.headers.get('content-length')
        if content_length and int(content_length) == 0:
            result.add_error(version, board_name, filename, f"Remote file is empty: {url}")
            return False
        
        result.http_checks += 1
        return True
        
    except requests.RequestException as e:
        result.add_error(version, board_name, filename, f"HTTP request failed: {str(e)}")
        return False


def validate_version(version_dir: Path, version: str, result: ValidationResult,
                     base_url: str = None, local_only: bool = False) -> None:
    """Validate all firmware files for a specific version."""
    
    # Check for release-level files
    release_files = ['Supported_Boards.txt']
    for release_file in release_files:
        file_path = version_dir / release_file
        if not file_path.exists():
            result.add_warning(f"[{version}] Missing {release_file}")
    
    # Validate each board
    for board_key, config in BOARD_CONFIGS.items():
        board_dir = version_dir / config['dir']
        
        if not board_dir.exists():
            result.add_warning(f"[{version}] Board directory not found: {config['dir']}")
            continue
        
        # Check required files
        for req_file in REQUIRED_FILES:
            filename = f"{config['prefix']}_{req_file}"
            file_path = board_dir / filename
            
            # Validate local file
            is_valid = validate_local_file(file_path, result, version, config['dir'], filename)
            
            # Validate HTTP endpoint if base URL provided
            if is_valid and base_url and not local_only and REQUESTS_AVAILABLE:
                url = f"{base_url}/firmware/{version}/{config['dir']}/{filename}"
                validate_http_endpoint(url, result, version, config['dir'], filename)
        
        # Check optional files
        for opt_file in OPTIONAL_FILES:
            filename = f"{config['prefix']}_{opt_file}"
            file_path = board_dir / filename
            
            if file_path.exists():
                validate_local_file(file_path, result, version, config['dir'], filename)
            else:
                result.add_warning(f"[{version}/{config['dir']}] Optional file missing: {filename}")


def validate_firmware_structure(firmware_dir: Path, base_url: str = None, 
                               local_only: bool = False) -> ValidationResult:
    """
    Validate the entire firmware directory structure.
    
    Args:
        firmware_dir: Path to firmware directory
        base_url: Base URL for HTTP validation (e.g., https://fpvgate.xyz)
        local_only: Skip HTTP validation
        
    Returns:
        ValidationResult object with all errors and warnings
    """
    result = ValidationResult()
    
    if not firmware_dir.exists():
        result.add_error("", "", "", f"Firmware directory does not exist: {firmware_dir}")
        return result
    
    # Get all versions
    versions = get_firmware_versions(firmware_dir)
    
    if not versions:
        result.add_warning("No firmware versions found in firmware directory")
        return result
    
    print(f"Found {len(versions)} firmware versions: {', '.join(versions)}\n")
    
    # Validate each version
    for version in versions:
        print(f"Validating {version}...")
        version_dir = firmware_dir / version
        validate_version(version_dir, version, result, base_url, local_only)
        result.versions_checked.append(version)
    
    return result


def check_flasher_compatibility(firmware_dir: Path) -> None:
    """Check that board IDs match between firmware structure and flasher.js expectations."""
    print("\nChecking flasher.js compatibility...")
    
    # This would ideally parse flasher.js, but for now we just document the mapping
    print("\nBoard ID Mapping (must match flasher.js BOARD_CONFIGS):")
    print("-" * 50)
    for board_key, config in BOARD_CONFIGS.items():
        print(f"  {config['id']:20s} -> {config['dir']}")
    print()


def main():
    parser = argparse.ArgumentParser(
        description='Validate FPVGate firmware endpoints',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Validate local files only
  python validate_firmware_endpoints.py --local-only
  
  # Validate local files and HTTP endpoints
  python validate_firmware_endpoints.py --base-url https://fpvgate.xyz
  
  # Validate specific firmware directory
  python validate_firmware_endpoints.py --firmware-dir ./firmware
        """
    )
    
    parser.add_argument('--firmware-dir', type=Path, default=Path('./firmware'),
                       help='Path to firmware directory (default: ./firmware)')
    parser.add_argument('--base-url', type=str,
                       help='Base URL for HTTP validation (e.g., https://fpvgate.xyz)')
    parser.add_argument('--local-only', action='store_true',
                       help='Skip HTTP endpoint validation')
    
    args = parser.parse_args()
    
    print(f"{'='*70}")
    print("FPVGate Firmware Endpoint Validation")
    print(f"{'='*70}\n")
    
    print(f"Firmware directory: {args.firmware_dir.absolute()}")
    if args.base_url and not args.local_only:
        print(f"Base URL: {args.base_url}")
        if not REQUESTS_AVAILABLE:
            print("\nWarning: HTTP validation disabled (requests library not available)")
            print("Install with: pip install requests")
    else:
        print("Mode: Local validation only")
    print()
    
    # Run validation
    result = validate_firmware_structure(args.firmware_dir, args.base_url, args.local_only)
    
    # Check flasher compatibility
    check_flasher_compatibility(args.firmware_dir)
    
    # Print summary
    result.print_summary()
    
    # Exit with error code if validation failed
    sys.exit(0 if result.is_valid() else 1)


if __name__ == '__main__':
    main()
