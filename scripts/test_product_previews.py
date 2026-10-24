import json
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

from generate_product_previews import generate, preview_path, render_preview


class Metadata(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.tags = {}
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'meta':
            self.tags[values.get('property') or values.get('name')] = values.get('content')


class ProductPreviews(unittest.TestCase):
    def product(self, **extra):
        return {'id': 'FPVGate-AIO', 'name': 'FPVGate AIO', 'shortDescription': '<p>A <b>lap timer</b> for FPV.</p>', 'image': 'https://images.example/fallback.jpg', 'images': ['https://images.example/main.jpg', 'https://images.example/second.jpg'], **extra}

    def test_main_photo_and_description_are_visible_without_javascript(self):
        tags = Metadata(render_preview(self.product())).tags
        self.assertEqual(tags['og:image'], 'https://images.example/main.jpg')
        self.assertEqual(tags['twitter:image'], tags['og:image'])
        self.assertEqual(tags['og:description'], 'A lap timer for FPV.')
        self.assertEqual(tags['og:title'], 'FPVGate AIO | FPVGate')
        self.assertEqual(tags['twitter:card'], 'summary_large_image')

    def test_fallbacks_for_products_without_gallery_images(self):
        self.assertEqual(Metadata(render_preview(self.product(images=[]))).tags['og:image'], 'https://images.example/fallback.jpg')
        self.assertEqual(Metadata(render_preview(self.product(images=[], image=''))).tags['og:image'], 'https://fpvgate.xyz/logo-black.png')

    def test_html_and_ids_cannot_escape_metadata_or_output_directory(self):
        product = self.product(id='../A / ?# & </script>', name='A "timer" <script>bad()</script>')
        markup = render_preview(product)
        self.assertEqual(Metadata(markup).tags['og:title'], product['name'] + ' | FPVGate')
        self.assertNotIn('<script>bad()</script>', markup)
        self.assertNotIn('../', preview_path(product['id']))
        self.assertEqual(markup.count('</script>'), 1)

    def test_stable_paths_remain_unique_when_ids_share_the_same_slug(self):
        self.assertNotEqual(preview_path('Gate + One'), preview_path('Gate / One'))
        self.assertEqual(preview_path('FPVGate-AIO'), preview_path('FPVGate-AIO'))

    def test_generation_writes_matching_manifest_and_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            links = generate([self.product()], root)
            self.assertEqual(json.loads((root / 'product-previews.json').read_text()), links)
            markup = (root / preview_path('FPVGate-AIO') / 'index.html').read_text()
            self.assertEqual(Metadata(markup).tags['og:url'], links['FPVGate-AIO'])
            self.assertIn('https://fpvgate.xyz/shop.html?id=FPVGate-AIO', markup)

    def test_invalid_catalogue_fails_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError):
                generate([self.product(), self.product()], root)
            self.assertEqual(list(root.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
