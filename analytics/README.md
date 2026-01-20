# FPVGate Analytics

Privacy-focused analytics system for tracking FPVGate website usage.

## What's Included

```
analytics/
├── worker.js           # Cloudflare Worker backend (API)
├── schema.sql          # Database schema
├── wrangler.toml       # Cloudflare Worker configuration
├── dashboard.html      # Analytics viewing dashboard
├── DEPLOYMENT.md       # Full deployment instructions
└── README.md          # This file
```

## Quick Start

1. Read [DEPLOYMENT.md](./DEPLOYMENT.md) for step-by-step instructions
2. Deploy the Cloudflare Worker
3. Update API URLs in your website code
4. Push to GitHub Pages

## Features

### Tracked Events

- Page views
- Board selections
- Firmware version selections
- Expert mode toggles
- Flash starts/completions/failures

### Analytics Dashboard

View real-time statistics:

- Total events
- Flash success rates
- Unique users (30 days)
- Board popularity
- Version adoption
- Common errors
- Activity timeline

### Privacy-First Design

- No cookies
- No personal data
- Hashed IP addresses
- You own all data
- GDPR compliant

## API Endpoints

### POST /track

Track an event:

```bash
curl -X POST https://your-worker.workers.dev/track \
  -H "Content-Type: application/json" \
  -d '{
    "event": "flash_complete",
    "board": "esp32s3",
    "version": "v1.0.0"
  }'
```

### GET /stats

Get basic statistics:

```bash
curl https://your-worker.workers.dev/stats
```

### GET /stats/detailed

Get detailed analytics:

```bash
curl https://your-worker.workers.dev/stats/detailed
```

## Database Schema

```sql
CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  board TEXT,
  version TEXT,
  expert_mode INTEGER DEFAULT 0,
  error_message TEXT,
  user_agent TEXT,
  referrer TEXT,
  ip_hash TEXT,
  timestamp TEXT NOT NULL
);
```

## Cost

**100% FREE** on Cloudflare's free tier:

- 100,000 requests/day
- 5GB database storage
- 5 million database reads/day

## Support

For deployment help, see [DEPLOYMENT.md](./DEPLOYMENT.md)

## License

Same as FPVGate project (CC BY-NC-SA 4.0)
