"""Generate static social-preview pages from the public store catalogue.

Run during Pages publishing; no browser JavaScript or private credentials are
needed by social crawlers. Product IDs map to stable, filesystem-safe URLs.
"""
import argparse
import hashlib
import html
import json
import re
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

SITE = 'https://fpvgate.xyz/'
CATALOGUE = 'https://fpvgate-store.fpvgate-analytics.workers.dev/products'


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def description_text(value):
    parser = PlainText()
    parser.feed(value)
    return ' '.join(' '.join(parser.parts).split())[:300]


def preview_path(product_id):
    slug = re.sub(r'[^a-z0-9]+', '-', product_id.lower()).strip('-')[:60] or 'product'
    digest = hashlib.sha256(product_id.encode('utf-8')).hexdigest()[:12]
    return f'products/{slug}-{digest}/'


def render_preview(product, site=SITE):
    product_id = product['id']
    name = product['name']
    description = description_text(product.get('shortDescription') or product.get('description') or name)
    images = product.get('images') or []
    image = urllib.parse.urljoin(site, (images[0] if images else product.get('image')) or 'logo-black.png')
    if urllib.parse.urlsplit(image).scheme not in ('http', 'https'):
        image = urllib.parse.urljoin(site, 'logo-black.png')
    share_url = urllib.parse.urljoin(site, preview_path(product_id))
    store_url = urllib.parse.urljoin(site, 'shop.html') + '?' + urllib.parse.urlencode({'id': product_id})
    title, desc, photo, share, target = map(lambda v: html.escape(v, quote=True), (name + ' | FPVGate', description, image, share_url, store_url))
    # JSON string escaping alone does not stop an HTML script end tag.
    redirect = json.dumps(store_url).replace('<', '\\u003c')
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{share}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="FPVGate">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{share}">
<meta property="og:image" content="{photo}">
<meta property="og:image:alt" content="{html.escape(name, quote=True)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{photo}">
<meta name="twitter:image:alt" content="{html.escape(name, quote=True)}">
<link rel="icon" href="{urllib.parse.urljoin(site, 'logo-black.png')}">
<style>body{{font:18px system-ui,sans-serif;max-width:680px;margin:48px auto;padding:0 24px;background:#14161a;color:#e9eaec}}img{{max-width:100%;max-height:420px;object-fit:contain}}a{{color:#6fb2f2}}</style>
</head>
<body>
<h1>{html.escape(name)}</h1>
<img src="{photo}" alt="{html.escape(name, quote=True)}">
<p>{desc}</p>
<p><a href="{target}">View product in the FPVGate store</a></p>
<script>window.location.replace({redirect});</script>
</body>
</html>
'''


def generate(products, output, site=SITE):
    if not isinstance(products, list):
        raise ValueError('Catalogue must be a list of products')
    # Validate and render before writing so invalid catalogue data fails the publish.
    pages = {}
    links = {}
    for product in products:
        product_id = product['id']
        if not isinstance(product_id, str) or not product_id or not isinstance(product['name'], str):
            raise ValueError('Products must have a non-empty string ID and a name')
        if product_id in links:
            raise ValueError('Duplicate product ID')
        relative = preview_path(product_id)
        pages[relative] = render_preview(product, site)
        links[product_id] = urllib.parse.urljoin(site, relative)
    for relative, content in pages.items():
        target = output / relative / 'index.html'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')
    (output / 'product-previews.json').write_text(json.dumps(links, ensure_ascii=False, indent=2), encoding='utf-8')
    return links


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    request = urllib.request.Request(CATALOGUE, headers={'User-Agent': 'FPVGate-Product-Previews/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        products = json.load(response)
    links = generate(products, args.output)
    print(f'Generated {len(links)} product preview pages')


if __name__ == '__main__':
    main()
