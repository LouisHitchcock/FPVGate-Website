"""Update checked-in static footers from one template. No runtime/build dependency.

Run `python scripts/sync_footer.py` after editing partials/footer.html.
Run with --check to verify the public pages are in sync without modifying them.
"""
import argparse
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FOOTER = re.compile(r'<footer\b[^>]*>.*?</footer>', re.DOTALL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    template = (ROOT / 'partials/footer.html').read_text(encoding='utf-8').strip()
    changed = []
    for page in sorted(ROOT.glob('*.html')):
        source = page.read_text(encoding='utf-8')
        if not FOOTER.search(source):
            continue
        updated, count = FOOTER.subn(lambda _: template, source)
        if count != 1:
            raise ValueError(f'Expected one site footer in {page.name}, found {count}')
        if source != updated:
            changed.append(page.name)
            if not args.check:
                page.write_text(updated, encoding='utf-8')
    if args.check and changed:
        print('Footers need updating: ' + ', '.join(changed))
        return 1
    print('Footers in sync.' if args.check else f'Updated {len(changed)} static footers.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
