# Product social previews

The Pages publishing workflow generates static product preview pages using the
public store catalogue. Open Graph and Twitter metadata use each product's first
gallery image (the main photo), or its image URL if no gallery images exist.
Products without a photo use the FPVGate logo.

`Copy link` uses the published URL from `product-previews.json`. Preview pages
contain metadata directly in their HTML so social crawlers can read it without
JavaScript. Visitors are sent to the matching product popup in the store; a
visible product link also works with JavaScript disabled.

The workflow refreshes these pages on every deployment and on a 30-minute
schedule. GitHub can delay scheduled jobs. Newly created products use the
existing `shop.html?id=...` link until a preview page is published. Old query
links still work but retain the generic shop preview. Social apps may cache old
photos even after a refresh; their cache refresh tools may be needed.

To refresh manually, run the **Deploy to GitHub Pages** workflow. For local
inspection, use `python scripts/generate_product_previews.py --output DIRECTORY`
with an existing output directory. No credentials or third-party packages are
required. The website remains static; generation happens during publishing.

Checks:

```sh
python -m unittest discover -s scripts -p test_product_previews.py
node --test scripts/test_product_links.cjs
```
