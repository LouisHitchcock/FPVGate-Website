"""Audit crawlable public HTML without third-party dependencies.

Run: python scripts/audit_seo.py
Checks source HTML so important content cannot depend on JavaScript rendering.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse
from urllib.robotparser import RobotFileParser
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://fpvgate.xyz/'
PAGES = ['index.html', 'docs.html', 'c5.html', 'flasher.html', 'quickstart.html',
         'print-files.html', 'shop.html', 'shop-fpvgate.html', 'shop-components.html', 'shop-misc.html']


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.title = ''
        self.title_count = 0
        self.headings = []
        self.metas = {}
        self.canonicals = []
        self.ids = []
        self.links = []
        self.images = []
        self.jsonld = []
        self.in_title = False
        self.heading = None
        self.schema = None
        self.language = ''
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'html': self.language = attrs.get('lang', '')
        if tag == 'title': self.in_title = True; self.title_count += 1
        if re.fullmatch(r'h[1-6]', tag): self.heading = [tag, '']
        if tag == 'meta':
            key = attrs.get('name', attrs.get('property', '')).lower()
            self.metas.setdefault(key, []).append(attrs.get('content', ''))
        if tag == 'link' and attrs.get('rel') == 'canonical': self.canonicals.append(attrs.get('href'))
        if 'id' in attrs: self.ids.append(attrs['id'])
        if tag == 'a' and attrs.get('href'): self.links.append(attrs['href'])
        if tag == 'img': self.images.append(attrs)
        if tag == 'script' and attrs.get('type') == 'application/ld+json': self.schema = ''

    def handle_data(self, data):
        if self.in_title: self.title += data
        if self.heading is not None: self.heading[1] += data
        if self.schema is not None: self.schema += data

    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
        if self.heading and tag == self.heading[0]: self.headings.append(self.heading); self.heading = None
        if tag == 'script' and self.schema is not None: self.jsonld.append(self.schema); self.schema = None


def audit():
    failures = []
    warnings = []
    pages = {name: Page((ROOT / name).read_text(encoding='utf-8-sig')) for name in PAGES}
    namespaces = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    urls = ET.parse(ROOT / 'sitemap.xml').findall('s:url', namespaces)
    sitemap = [entry.findtext('s:loc', namespaces=namespaces) for entry in urls]
    if len(set(sitemap)) != len(sitemap): failures.append('Duplicate sitemap URLs')
    robots = RobotFileParser()
    robots.parse((ROOT / 'robots.txt').read_text().splitlines())
    parts = json.loads((ROOT / 'print-files/parts.json').read_text())['parts']
    dynamic_parts = {part['id'] for part in parts}
    titles = set()
    descriptions = set()
    incoming = {name: 0 for name in PAGES}
    for name, page in pages.items():
        def require(condition, message):
            if not condition: failures.append(f'{name}: {message}')
        url = ORIGIN if name == 'index.html' else ORIGIN + name
        require(page.language == 'en', 'Missing English language declaration')
        require(page.title_count == 1 and page.title.strip(), 'Expected one nonempty title')
        require(page.title not in titles, 'Duplicate title')
        titles.add(page.title)
        if len(page.title) > 65: warnings.append(f'{name}: review title length ({len(page.title)})')
        h1 = [text for level, text in page.headings if level == 'h1']
        require(len(h1) == 1 and h1[0].strip(), f'Expected one main H1, found {len(h1)}')
        require(page.canonicals == [url], 'Canonical does not match the preferred URL')
        description = page.metas.get('description', [])
        require(len(description) == 1 and description[0].strip(), 'Missing/duplicate description')
        if description:
            require(description[0] not in descriptions, 'Duplicate description')
            descriptions.add(description[0])
            if len(description[0]) > 165: warnings.append(f'{name}: review description length ({len(description[0])})')
        for field in ['viewport', 'og:title', 'og:description', 'og:url', 'og:image', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']:
            require(len(page.metas.get(field, [])) == 1 and page.metas[field][0], f'Missing/duplicate {field}')
        require(page.metas.get('og:url') == [url], 'Open Graph URL differs from canonical')
        require('noindex' not in ' '.join(page.metas.get('robots', [])), 'Public page is noindex')
        require(robots.can_fetch('Googlebot', url), 'Robots blocks this page')
        require(url in sitemap, 'Missing from sitemap')
        require(len(page.ids) == len(set(page.ids)), 'Duplicate IDs')
        for image in page.images:
            require('alt' in image, f'Image has no alt attribute: {image.get("src")}')
        for value in page.jsonld:
            try:
                data = json.loads(value)
                require(data.get('@context') == 'https://schema.org', 'Invalid JSON-LD context')
                graph = data.get('@graph', [data])
                require(all(node.get('@type') for node in graph), 'Untyped JSON-LD node')
                require(not any(node.get('@type') == 'FAQPage' for node in graph), 'FAQ markup without a dedicated visible FAQ')
            except (ValueError, TypeError): require(False, 'Invalid JSON-LD')
        require(page.jsonld, 'No structured data')
        for href in page.links:
            target = urlparse(urljoin(url, href))
            if target.netloc != urlparse(ORIGIN).netloc: continue
            pathname = unquote(target.path).lstrip('/') or 'index.html'
            local = ROOT / pathname
            require(local.exists(), f'Broken internal target: {href}')
            if pathname in incoming and pathname != name: incoming[pathname] += 1
            if target.fragment and pathname in pages:
                dynamic = pathname == 'print-files.html' and target.fragment in dynamic_parts
                require(target.fragment in pages[pathname].ids or dynamic, f'Broken internal anchor: {href}')
        print(f'{name}: title={len(page.title)} chars, description={len(description[0]) if description else 0} chars, H1={len(h1)}, JSON-LD={len(page.jsonld)}')
    for name, count in incoming.items():
        if count == 0: failures.append(f'{name}: no incoming links from audited pages')
    for entry in urls:
        lastmod = entry.findtext('s:lastmod', namespaces=namespaces)
        if lastmod and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', lastmod): failures.append('Invalid sitemap lastmod')
    for name in ['checkout.html', 'order-success.html']:
        private = Page((ROOT / name).read_text())
        if 'noindex' not in ' '.join(private.metas.get('robots', [])): failures.append(f'{name}: needs noindex')
    for warning in warnings: print('REVIEW:', warning)
    for failure in failures: print('FAIL:', failure)
    print(f'\n{len(pages)} pages; {len(failures)} errors; {len(warnings)} editorial warnings')
    return not failures


if __name__ == '__main__':
    raise SystemExit(0 if audit() else 1)
