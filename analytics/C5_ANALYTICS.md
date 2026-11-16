# C5 flasher analytics

The C5 admin tab uses the `/stats/c5` endpoint, with 7, 30, 90, 365-day and all-time filters. Existing event breakdown rows are preserved in the response. No database migration is required.

## Counting rules

- Only `c5_*` events count. Timer flashing and store events are excluded.
- Unique users are distinct non-empty anonymised IP hashes within the selected period, not a device count.
- Success rate is completed / (completed + failed). Cancelled connections and incomplete attempts are excluded. With no outcomes it displays a dash.
- Board and version popularity count `c5_flash_started` events, not build selections.
- Each panel uses the same rolling UTC cutoff. The daily timeline includes partial boundary dates and fills quiet dates with zeros.
- Country counts deduplicate users within each country. A travelling user may count in multiple countries.
- Recency groups use each selected user's most recent C5 event relative to report generation time.
- Historical estimates and raw grouped events are collapsed below the live dashboard.

The date selection ignores stale responses. Charts are replaced on refresh, use independent state from the timer charts, and provide empty/error/retry states. A country table remains available if the external world map cannot load.

## Verification

```powershell
node --test scripts/test_c5_analytics.cjs
# External Playwright installation and Edge/Chromium, with a local static server:
$env:PLAYWRIGHT_MODULE='path/to/node_modules/playwright'
$env:CHROMIUM_PATH='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
$env:TEST_BASE_URL='http://127.0.0.1:8037'
node scripts/test_c5_analytics_browser.cjs
```

Deploy the analytics Worker before the static admin assets. This endpoint adds dashboard fields while retaining the original `rows` response for older admin pages.
