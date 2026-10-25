# Page social images

Every public root page listed in `sitemap.xml` has its own 1200 × 630 PNG under
`images/social/`. Open Graph and Twitter reference the same absolute HTTPS URL
for each page, with image type, dimensions and descriptive alt text in static
HTML. These tags do not depend on JavaScript or the visitor's theme.

Cards follow the main FPVGate graphic: the existing stopwatch logo and plain
page heading on the left, a real browser screenshot on the right. Headings and
subtitles are read from the actual page; there are no invented taglines,
illustrations, AI images or simulated product interfaces.

`generate_page_social_images.cjs` captures a locally served checkout using
Playwright/Chromium, waits for fonts, visible photos and dynamic content, then
renders the screenshot-led layout in HTML. It blocks analytics and non-read
requests and uses a fresh browser context, not a personal/admin session.
The shop uses the actual public catalogue and photos; prices/stock are a dated
snapshot, not a live availability promise. The print-files image includes the
actual rendered STL viewer. Failed/loading pages are not saved as previews.
The viewer and the single-item miscellaneous grid use element screenshots so
the actual model/photo fits without a clipped page heading. Other pages use
viewport screenshots with small recorded scroll offsets where appropriate.
Screenshots retain their aspect ratio; they are not stretched to fit the frame.

To regenerate, install Playwright in a tooling environment (not a website build
dependency), start a local static server, and run in a second terminal:

```sh
python -m http.server 8765 --bind 127.0.0.1
# In a second terminal with Playwright available:
node scripts/generate_page_social_images.cjs
python -m unittest discover -s scripts -p test_page_social_images.py -v
```

Use `--playwright-module <path-to-playwright-package>` for external tooling,
`--executable <chromium-or-edge-executable>` for an existing browser, and
`--base-url http://127.0.0.1:PORT/` for a different local port. `--only home,c5`
and `--output <review-directory>` are available for drafts; regenerate the full
set into `images/social` for the final manifest.

`captures.json` records the source page, captured heading/subtitle, capture
time and image hashes. The complete set is captured successfully before any
existing preview is replaced. Commit PNGs and the capture manifest; the static
website still needs no new build step, browser runtime or external image service.

When adding a page, add its route/slug, capture the page, add its
`og:image`/`twitter:image` tags and update the sitemap. Tests check coverage,
image dimensions, matching metadata, actual PNG files, capture-manifest coverage
and unique image hashes. Refresh the alt text to describe the real page, not
the rejected illustrated-card taglines.

Checkout/order-confirmation pages stay `noindex`; admin, analytics, email
templates and the 404 redirect handler are not public sharing destinations.
Product previews retain their own catalogue photos and generation pipeline:
see [Product previews](PRODUCT_PREVIEWS.md). Query-string product links do not
have unique server-rendered metadata; use the generated product share URLs.

After publishing, social platforms may keep their previous cached preview.
Re-scrape the exact page URL with the platform's sharing debugger when needed;
changing local HTML alone does not update the live site or those caches.
