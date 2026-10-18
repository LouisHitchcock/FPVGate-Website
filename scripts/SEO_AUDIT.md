# Website SEO audit — 18 October 2026

Scope: homepage, documentation, C5 Radio/flasher, S3 flasher, AIO quick start,
3D print files, shop and its three category pages. This is a pre-publication
technical/content audit, not a search-ranking score.

## Result

`python scripts/audit_seo.py`: **10 public pages, 0 errors, 0 editorial warnings**.

Chromium checks: all ten pages return HTTP 200 locally with JavaScript enabled
and disabled. Each has one rendered H1, the intended canonical URL, readable
primary content, parseable JSON-LD and alt attributes on images. All ten fit a
390px mobile viewport. The normal C5 browser regression covers all twelve
board/firmware combinations, integrity checks, busy/cancellation controls,
the legacy URL redirect, and mobile navigation.

## Improvements included

- Unique titles and descriptions for the ten public pages; the main page keeps
  FPVGate's lap-timing identity and includes SPI, C5MK and Event Mode content.
- Dedicated canonical C5 page with crawlable setup instructions, board tables,
  firmware requirements and its own flasher. Site-wide links make it discoverable.
- Page headings distinguish the brand label from the main H1. Dynamically loaded
  board instructions now remain under Hardware Setup instead of adding another H1.
- Canonicals and Open Graph URLs consistently use `https://fpvgate.xyz/`, with
  `/` preferred to `/index.html` for the homepage.
- Source HTML includes titles, descriptions, canonicals, social tags and the
  substantive C5/Event Mode documentation; they do not require client rendering.
- WebSite/Organization/application, article, collection and breadcrumb structured
  data describe the actual pages. No invented ratings, reviews, stock or prices
  were added. The free offer on the homepage describes the firmware, not hardware.
- Removed FAQ-only markup that was not presented as a visible FAQ, and removed
  third-party Reddit posts from Organization identity links.
- Added social-card tags to the 3D print page and structured data to the quick
  start, print collection and shop categories.
- Sitemap contains all ten canonical public pages, with dates matching this
  revision. Added static links to previously hard-to-discover quick-start and
  shop-category pages. Static internal link/fragment checks pass.
- Existing `noindex` directives on checkout/order confirmation are retained.
  Public pages are allowed by robots.txt, which advertises the sitemap;
  operational/admin folders remain excluded.
- C5 capability and Event Mode claims were checked against packaged
  Multi-Alpha-3 release notes and tagged firmware source. Alpha/RC and board
  validation status are explicit; traditional SPI receiver support stays visible.

## Practical limits

Product inventory and the interactive STL viewer still load with JavaScript.
Their collection headings, descriptions and navigation are static; this work
does not create independently indexable product-detail URLs or product offers.

Google's selected canonicals, index coverage, search performance and field Core
Web Vitals require live Search Console/traffic data. No Lighthouse score, Google
Rich Results Test certification or indexing submission is claimed by this audit.
After publishing, verify the Pages deployment and fetch the live canonical pages,
sitemap, robots file and referenced assets. The source audit is repeatable without
third-party packages; browser checks additionally verify the rendered experience.

Guidance consulted:

- [Google title-link guidance](https://developers.google.com/search/docs/appearance/title-link)
- [Google structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google's June 2026 removal of FAQ rich-result documentation](https://developers.google.com/search/updates#june-2026)
