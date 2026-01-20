# FPVGate Analytics Deployment Guide

This guide will walk you through deploying the analytics system for FPVGate using Cloudflare Workers and D1 database.

## Overview

The analytics system consists of:
- **Backend**: Cloudflare Worker (API endpoint)
- **Database**: Cloudflare D1 (SQLite database)
- **Frontend**: JavaScript tracker integrated into your website
- **Dashboard**: HTML page to view analytics

## Prerequisites

1. A Cloudflare account (free tier works perfectly)
2. Node.js and npm installed
3. Git

## Step 1: Install Wrangler CLI

Wrangler is Cloudflare's CLI tool for managing Workers.

```bash
npm install -g wrangler
```

Authenticate with Cloudflare:

```bash
wrangler login
```

This will open a browser window to authorize Wrangler.

## Step 2: Create D1 Database

Navigate to the analytics directory:

```bash
cd analytics
```

Create a new D1 database:

```bash
wrangler d1 create fpvgate-analytics-db
```

Copy the `database_id` from the output. It will look like this:

```
[[d1_databases]]
binding = "DB"
database_name = "fpvgate-analytics-db"
database_id = "abc123-def456-ghi789"
```

Update `wrangler.toml` with your database_id.

## Step 3: Initialize Database Schema

Run the schema SQL to create the tables:

```bash
wrangler d1 execute fpvgate-analytics-db --file=schema.sql
```

Verify it worked:

```bash
wrangler d1 execute fpvgate-analytics-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

You should see `analytics_events` in the output.

## Step 4: Deploy the Worker

Deploy your Worker to Cloudflare:

```bash
wrangler deploy
```

After deployment, you'll get a URL like:
```
https://fpvgate-analytics.your-subdomain.workers.dev
```

**Save this URL** - you'll need it for the next steps.

## Step 5: Test the API

Test that your API is working:

```bash
curl -X POST https://your-worker-url.workers.dev/track \
  -H "Content-Type: application/json" \
  -d '{"event":"test_event","board":"esp32s3","version":"v1.0.0"}'
```

You should get a response:
```json
{"success":true}
```

Test the stats endpoint:

```bash
curl https://your-worker-url.workers.dev/stats
```

You should get JSON with analytics data.

## Step 6: Update Frontend Configuration

Update the API endpoint URL in two files:

### 1. analytics-tracker.js (line 85)

Replace:
```javascript
const ANALYTICS_API = 'https://your-worker-name.your-subdomain.workers.dev';
```

With your actual Worker URL:
```javascript
const ANALYTICS_API = 'https://fpvgate-analytics.your-subdomain.workers.dev';
```

### 2. analytics/dashboard.html (line 285)

Replace:
```javascript
const API_ENDPOINT = 'https://your-worker-name.your-subdomain.workers.dev';
```

With your actual Worker URL:
```javascript
const API_ENDPOINT = 'https://fpvgate-analytics.your-subdomain.workers.dev';
```

## Step 7: Deploy Website Changes

Commit and push your changes to GitHub:

```bash
git add .
git commit -m "Add analytics tracking"
git push
```

GitHub Pages will automatically deploy the updated website with analytics tracking.

## Step 8: Verify Analytics Tracking

1. Visit your website: https://fpvgate.xyz/flasher.html
2. Open browser DevTools (F12) → Network tab
3. Perform an action (e.g., select a board)
4. Look for a POST request to your Worker URL
5. Check that it returns `{"success":true}`

## Step 9: Access Analytics Dashboard

You can access the dashboard in two ways:

### Option A: Open Locally
Open `analytics/dashboard.html` in your browser (it will fetch data from your deployed API)

### Option B: Deploy Dashboard (Recommended)
Copy `analytics/dashboard.html` to your website root (or host it separately) to access it online.

**Important**: Keep the dashboard URL private or add authentication if you don't want analytics publicly visible.

## Configuration Options

### Custom Domain (Optional)

To use a custom domain for your Worker:

1. Go to Cloudflare Dashboard → Workers & Pages
2. Click on your Worker → Settings → Triggers
3. Add a custom domain (e.g., `analytics.fpvgate.xyz`)
4. Update the API URLs in your code

### Rate Limiting (Optional)

Add to `wrangler.toml`:

```toml
[env.production]
limits = { cpu_ms = 50 }
```

## Monitoring

### View Logs

```bash
wrangler tail
```

This shows real-time logs from your Worker.

### Check Database Size

```bash
wrangler d1 execute fpvgate-analytics-db --command="SELECT COUNT(*) as total_events FROM analytics_events"
```

### View Recent Events

```bash
wrangler d1 execute fpvgate-analytics-db --command="SELECT * FROM analytics_events ORDER BY timestamp DESC LIMIT 10"
```

## Tracked Events

The system automatically tracks:

- `page_view` - When someone visits a page
- `board_selected` - When a board is chosen
- `version_selected` - When a firmware version is chosen
- `expert_mode_toggled` - When expert mode is enabled/disabled
- `flash_started` - When flashing begins
- `flash_complete` - When flashing succeeds ✅
- `flash_failed` - When flashing fails ❌

## Privacy & GDPR Compliance

The analytics system is designed with privacy in mind:

- ✅ No cookies used
- ✅ IP addresses are one-way hashed (cannot be reversed)
- ✅ No personal information collected
- ✅ No third-party tracking
- ✅ You own all the data

To be fully GDPR compliant, consider adding a privacy notice to your website mentioning anonymous usage analytics.

## Costs

Cloudflare's free tier includes:

- **Workers**: 100,000 requests/day (FREE)
- **D1 Database**: 5GB storage, 5 million reads/day (FREE)

For FPVGate's expected traffic, you should stay well within free limits.

## Troubleshooting

### "Database not found" error

Make sure the database_id in `wrangler.toml` matches the one created in Step 2.

### CORS errors

The Worker includes CORS headers by default. If you still get errors, check that the Worker URL is correct.

### Analytics not tracking

1. Open browser console (F12) and look for errors
2. Check that `window.fpvgateAnalytics` is defined
3. Verify the API URL in `analytics-tracker.js`
4. Use `wrangler tail` to see incoming requests

### Dashboard not loading

1. Check the API URL in `dashboard.html`
2. Test the `/stats/detailed` endpoint directly in your browser
3. Check browser console for CORS or network errors

## Updating the Worker

After making changes to `worker.js`:

```bash
cd analytics
wrangler deploy
```

Changes are live immediately (no cache waiting).

## Backup Data

Export your analytics data:

```bash
wrangler d1 export fpvgate-analytics-db --output=backup.sql
```

## Support

If you encounter issues:

1. Check Cloudflare Workers dashboard for errors
2. Use `wrangler tail` for real-time debugging
3. Verify database with `wrangler d1 execute`

## Next Steps

Now that analytics are deployed, you can:

1. Monitor which boards are most popular
2. Track firmware version adoption
3. Identify common flash errors
4. Measure success rates
5. Understand user behavior

Happy tracking! 🚀
