"""Offline checks for every public page's static social-preview metadata."""
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
import struct
import unittest
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


class Metadata(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.tags = {}
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        if tag != 'meta':
            return
        attrs = dict(attrs)
        key = attrs.get('property') or attrs.get('name')
        if key:
            self.tags.setdefault(key, []).append(attrs.get('content', ''))

    def one(self, key):
        values = self.tags.get(key, [])
        if len(values) != 1:
            raise AssertionError(f'Expected one {key}, got {values}')
        return values[0]


class PageSocialImagesTests(unittest.TestCase):
    def public_pages(self):
        sitemap = ET.parse(ROOT / 'sitemap.xml')
        urls = sitemap.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')
        return {urlsplit(url.text).path.lstrip('/') or 'index.html' for url in urls}

    def test_every_public_page_has_a_unique_real_png(self):
        image_urls, hashes = set(), set()
        pages = self.public_pages()
        self.assertGreaterEqual(len(pages), 10)
        for page in sorted(pages):
            with self.subTest(page=page):
                meta = Metadata((ROOT / page).read_text(encoding='utf-8'))
                url = meta.one('og:image')
                self.assertEqual(meta.one('twitter:image'), url)
                self.assertEqual(meta.one('twitter:card'), 'summary_large_image')
                self.assertEqual(meta.one('og:image:type'), 'image/png')
                self.assertEqual(meta.one('og:image:width'), '1200')
                self.assertEqual(meta.one('og:image:height'), '630')
                self.assertGreater(len(meta.one('og:image:alt')), 15)
                self.assertEqual(meta.one('twitter:image:alt'), meta.one('og:image:alt'))
                parsed = urlsplit(url)
                self.assertEqual((parsed.scheme, parsed.netloc), ('https', 'fpvgate.xyz'))
                self.assertTrue(parsed.path.startswith('/images/social/'))
                self.assertFalse(parsed.query or parsed.fragment)
                data = (ROOT / parsed.path.lstrip('/')).read_bytes()
                self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
                self.assertEqual(struct.unpack('>II', data[16:24]), (1200, 630))
                self.assertLess(len(data), 500_000)
                digest = hashlib.sha256(data).hexdigest()
                self.assertNotIn(url, image_urls, 'Pages must not share image URLs')
                self.assertNotIn(digest, hashes, 'Renaming identical images is not unique artwork')
                image_urls.add(url)
                hashes.add(digest)

    def test_public_root_pages_are_not_missing_from_the_audit(self):
        pages = set()
        for page in ROOT.glob('*.html'):
            if page.name == '404.html':
                continue  # Redirect/error handler, not a shareable destination.
            meta = Metadata(page.read_text(encoding='utf-8'))
            if any('noindex' in value for value in meta.tags.get('robots', [])):
                continue
            pages.add(page.name)
        self.assertEqual(pages, self.public_pages())

    def test_transaction_pages_remain_noindex(self):
        for page in ('checkout.html', 'order-success.html'):
            meta = Metadata((ROOT / page).read_text(encoding='utf-8'))
            self.assertIn('noindex', meta.one('robots'))

    def test_screenshot_manifest_matches_the_delivered_images(self):
        manifest = json.loads((ROOT / 'images/social/captures.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['style'], 'actual-website-screenshot')
        self.assertEqual({card['page'] for card in manifest['cards']}, self.public_pages())
        self.assertEqual(len(manifest['cards']), len(self.public_pages()))
        for card in manifest['cards']:
            with self.subTest(page=card['page']):
                image = ROOT / 'images/social' / (card['slug'] + '.png')
                self.assertEqual(hashlib.sha256(image.read_bytes()).hexdigest(), card['imageHash'])
                self.assertRegex(card['screenshotHash'], r'^[0-9a-f]{64}$')
                meta = Metadata((ROOT / card['page']).read_text(encoding='utf-8'))
                self.assertEqual(meta.one('og:image:alt'), f"Screenshot of {card['title']} on fpvgate.xyz.")


if __name__ == '__main__':
    unittest.main()
