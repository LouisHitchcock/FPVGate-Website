// Cloudflare Worker - Analytics API
// This receives analytics events from the website and stores them in D1

export default {
  async fetch(request, env) {
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      // POST /track - Track an event
      if (url.pathname === '/track' && request.method === 'POST') {
        const data = await request.json();
        
        // Validate required fields
        if (!data.event) {
          return new Response(JSON.stringify({ error: 'Event name required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Extract data with defaults
        const event = {
          event_name: data.event,
          board: data.board || null,
          version: data.version || null,
          expert_mode: data.expert_mode || false,
          error_message: data.error_message || null,
          user_agent: request.headers.get('User-Agent') || null,
          referrer: data.referrer || request.headers.get('Referer') || null,
          country: request.cf?.country || null,  // Cloudflare provides country code
          timestamp: new Date().toISOString(),
          // Optional: track IP for unique users (can be hashed for privacy)
          ip_hash: await hashIP(request.headers.get('CF-Connecting-IP'))
        };

        // Insert into D1 database
        await env.DB.prepare(
          `INSERT INTO analytics_events 
          (event_name, board, version, expert_mode, error_message, user_agent, referrer, country, ip_hash, timestamp) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          event.event_name,
          event.board,
          event.version,
          event.expert_mode ? 1 : 0,
          event.error_message,
          event.user_agent,
          event.referrer,
          event.country,
          event.ip_hash,
          event.timestamp
        ).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // GET /stats - Get analytics statistics
      if (url.pathname === '/stats' && request.method === 'GET') {
        const stats = await getStats(env.DB);
        
        return new Response(JSON.stringify(stats), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // GET /stats/detailed - Get detailed analytics
      if (url.pathname === '/stats/detailed' && request.method === 'GET') {
        const detailedStats = await getDetailedStats(env.DB);
        
        return new Response(JSON.stringify(detailedStats), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // GET /stats/live - Live stats for admin dashboard (requires auth)
      if (url.pathname === '/stats/live' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader ? authHeader.replace('Bearer ', '') : '';
        let authorized = false;
        // Check JWT
        if (token.includes('.') && env.JWT_SECRET) {
          const payload = await verifyJWT(token, env.JWT_SECRET);
          if (payload) authorized = true;
        }
        // Fallback to legacy ADMIN_TOKEN
        if (!authorized && env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) authorized = true;
        if (!authorized) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const liveStats = await getLiveStats(env.DB);
        return new Response(JSON.stringify(liveStats), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Default 404
      return new Response('Not Found', { 
        status: 404,
        headers: corsHeaders 
      });

    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// --- JWT Verification ---

async function verifyJWT(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const enc = new TextEncoder();
        const signingInput = `${parts[0]}.${parts[1]}`;
        const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
        const sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(signingInput));
        if (!valid) return null;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch { return null; }
}

// Hash IP address for privacy (one-way hash)
async function hashIP(ip) {
  if (!ip) return null;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

// Get basic statistics
async function getStats(db) {
  const results = {};

  // Total events
  const totalEvents = await db.prepare(
    'SELECT COUNT(*) as count FROM analytics_events'
  ).first();
  results.total_events = totalEvents.count;

  // Flash events breakdown
  const flashEvents = await db.prepare(`
    SELECT 
      event_name,
      COUNT(*) as count
    FROM analytics_events
    WHERE event_name LIKE 'flash_%'
    GROUP BY event_name
    ORDER BY count DESC
  `).all();
  results.flash_events = flashEvents.results;

  // Board popularity
  const boardStats = await db.prepare(`
    SELECT 
      board,
      COUNT(*) as count
    FROM analytics_events
    WHERE board IS NOT NULL
    GROUP BY board
    ORDER BY count DESC
  `).all();
  results.board_stats = boardStats.results;

  // Version popularity
  const versionStats = await db.prepare(`
    SELECT 
      version,
      COUNT(*) as count
    FROM analytics_events
    WHERE version IS NOT NULL
    GROUP BY version
    ORDER BY count DESC
    LIMIT 10
  `).all();
  results.version_stats = versionStats.results;

  // Events over last 30 days
  const recentEvents = await db.prepare(`
    SELECT 
      DATE(timestamp) as date,
      COUNT(*) as count
    FROM analytics_events
    WHERE timestamp >= datetime('now', '-30 days')
    GROUP BY DATE(timestamp)
    ORDER BY date DESC
  `).all();
  results.recent_activity = recentEvents.results;

  // Unique users (by IP hash) in last 30 days
  const uniqueUsers = await db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    WHERE timestamp >= datetime('now', '-30 days')
      AND ip_hash IS NOT NULL
  `).first();
  results.unique_users_30d = uniqueUsers.count;

  // Country breakdown (unique users per country)
  const countryStats = await db.prepare(`
    SELECT 
      country,
      COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    WHERE country IS NOT NULL
      AND ip_hash IS NOT NULL
    GROUP BY country
    ORDER BY count DESC
    LIMIT 20
  `).all();
  results.country_stats = countryStats.results;

  return results;
}

// Get live statistics for admin dashboard
async function getLiveStats(db) {
  const stats = {};

  // Active store visitors (unique IPs with store_view in last 15 mins)
  const storeVisitors = await db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    WHERE event_name = 'store_view'
      AND timestamp >= datetime('now', '-15 minutes')
      AND ip_hash IS NOT NULL
  `).first();
  stats.active_store_visitors = storeVisitors.count;

  // Users with items in cart (cart_add in last 30 mins)
  const cartUsers = await db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    WHERE event_name = 'cart_add'
      AND timestamp >= datetime('now', '-30 minutes')
      AND ip_hash IS NOT NULL
  `).first();
  stats.active_cart_users = cartUsers.count;

  // Total active site viewers (any event in last 15 mins)
  const totalViewers = await db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    WHERE timestamp >= datetime('now', '-15 minutes')
      AND ip_hash IS NOT NULL
  `).first();
  stats.total_active_viewers = totalViewers.count;

  // Geo-location of recent store visitors (last 1 hour)
  const geoData = await db.prepare(`
    SELECT
      country,
      COUNT(DISTINCT ip_hash) as visitors
    FROM analytics_events
    WHERE event_name IN ('store_view', 'page_view')
      AND timestamp >= datetime('now', '-1 hour')
      AND country IS NOT NULL
      AND ip_hash IS NOT NULL
    GROUP BY country
    ORDER BY visitors DESC
    LIMIT 30
  `).all();
  stats.geo_breakdown = geoData.results;

  // 30-day conversion ratio
  const storeVisitors30d = await db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    WHERE event_name = 'store_view'
      AND timestamp >= datetime('now', '-30 days')
      AND ip_hash IS NOT NULL
  `).first();

  const orders30d = await db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    WHERE event_name = 'order_completed'
      AND timestamp >= datetime('now', '-30 days')
      AND ip_hash IS NOT NULL
  `).first();

  stats.store_visitors_30d = storeVisitors30d.count;
  stats.orders_30d = orders30d.count;
  stats.conversion_rate_30d = storeVisitors30d.count > 0
    ? ((orders30d.count / storeVisitors30d.count) * 100).toFixed(2)
    : '0.00';

  // Recent activity timeline (last 24h, hourly buckets)
  const hourlyActivity = await db.prepare(`
    SELECT
      strftime('%Y-%m-%d %H:00', timestamp) as hour,
      COUNT(DISTINCT ip_hash) as unique_visitors,
      SUM(CASE WHEN event_name = 'store_view' THEN 1 ELSE 0 END) as store_views,
      SUM(CASE WHEN event_name = 'cart_add' THEN 1 ELSE 0 END) as cart_adds
    FROM analytics_events
    WHERE timestamp >= datetime('now', '-24 hours')
    GROUP BY hour
    ORDER BY hour DESC
  `).all();
  stats.hourly_activity = hourlyActivity.results;

  return stats;
}

// Get detailed statistics
async function getDetailedStats(db) {
  const stats = await getStats(db);

  // Add error details
  const errors = await db.prepare(`
    SELECT 
      error_message,
      board,
      version,
      COUNT(*) as count,
      MAX(timestamp) as last_occurred
    FROM analytics_events
    WHERE event_name = 'flash_failed'
      AND error_message IS NOT NULL
    GROUP BY error_message, board, version
    ORDER BY count DESC
    LIMIT 20
  `).all();
  stats.common_errors = errors.results;

  // Expert mode usage
  const expertMode = await db.prepare(`
    SELECT 
      expert_mode,
      COUNT(*) as count
    FROM analytics_events
    WHERE event_name = 'flash_complete'
    GROUP BY expert_mode
  `).all();
  stats.expert_mode_usage = expertMode.results;

  // Success rate
  const successRate = await db.prepare(`
    SELECT 
      SUM(CASE WHEN event_name = 'flash_complete' THEN 1 ELSE 0 END) as successes,
      SUM(CASE WHEN event_name = 'flash_failed' THEN 1 ELSE 0 END) as failures
    FROM analytics_events
    WHERE event_name IN ('flash_complete', 'flash_failed')
  `).first();
  
  if (successRate.successes + successRate.failures > 0) {
    stats.success_rate = {
      successes: successRate.successes,
      failures: successRate.failures,
      rate: (successRate.successes / (successRate.successes + successRate.failures) * 100).toFixed(2) + '%'
    };
  }

  // New users in last 30 days (users whose first event was in the last 30 days)
  const newUsers = await db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    WHERE ip_hash IN (
      SELECT ip_hash
      FROM analytics_events
      WHERE ip_hash IS NOT NULL
      GROUP BY ip_hash
      HAVING MIN(timestamp) >= datetime('now', '-30 days')
    )
  `).first();
  stats.new_users_30d = newUsers.count;

  // Returning users in last 30 days (users who had events before AND during last 30 days)
  const returningUsers = await db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    WHERE ip_hash IN (
      SELECT ip_hash
      FROM analytics_events
      WHERE ip_hash IS NOT NULL
      GROUP BY ip_hash
      HAVING MIN(timestamp) < datetime('now', '-30 days')
        AND MAX(timestamp) >= datetime('now', '-30 days')
    )
  `).first();
  stats.returning_users_30d = returningUsers.count;

  // Users by recency (last seen)
  const usersByRecency = await db.prepare(`
    WITH user_last_seen AS (
      SELECT 
        ip_hash,
        country,
        MAX(timestamp) as last_seen,
        MIN(timestamp) as first_seen,
        COUNT(*) as event_count
      FROM analytics_events
      WHERE ip_hash IS NOT NULL
      GROUP BY ip_hash
    )
    SELECT 
      CASE 
        WHEN last_seen >= datetime('now', '-1 day') THEN 'last_day'
        WHEN last_seen >= datetime('now', '-7 days') THEN 'last_week'
        WHEN last_seen >= datetime('now', '-30 days') THEN 'last_month'
        ELSE 'older'
      END as recency,
      COUNT(*) as count
    FROM user_last_seen
    GROUP BY recency
  `).all();
  stats.users_by_recency = usersByRecency.results;

  return stats;
}
