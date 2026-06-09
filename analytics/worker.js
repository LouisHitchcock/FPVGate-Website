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
          (event_name, board, version, expert_mode, error_message, user_agent, referrer, country, ip_hash, timestamp, product_id, product_name, category, price, event_data) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          event.timestamp,
          data.product_id || null,
          data.product_name || null,
          data.category || null,
          data.price != null ? data.price : null,
          data.event_data ? JSON.stringify(data.event_data) : null
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
        const days = parseInt(url.searchParams.get('days')) || null;
        const detailedStats = await getDetailedStats(env.DB, days);
        
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

      // GET /store/stats - Store-specific analytics (product/category popularity)
      if (url.pathname === '/store/stats' && request.method === 'GET') {
        const days = parseInt(url.searchParams.get('days')) || 30;
        const storeStats = await getStoreStats(env.DB, days);
        return new Response(JSON.stringify(storeStats), {
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
async function getStats(db, days = null) {
  const results = {};

  const dateFilter = days !== null
    ? `WHERE timestamp >= datetime('now', '-${days} days')`
    : '';

  // Total events
  const totalEvents = await db.prepare(
    `SELECT COUNT(*) as count FROM analytics_events ${dateFilter}`
  ).first();
  results.total_events = totalEvents.count;

  // Flash events breakdown
  const flashEvents = await db.prepare(`
    SELECT 
      event_name,
      COUNT(*) as count
    FROM analytics_events
    WHERE event_name LIKE 'flash_%'
      ${days !== null ? `AND timestamp >= datetime('now', '-${days} days')` : ''}
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
      ${days !== null ? `AND timestamp >= datetime('now', '-${days} days')` : ''}
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
      ${days !== null ? `AND timestamp >= datetime('now', '-${days} days')` : ''}
    GROUP BY version
    ORDER BY count DESC
    LIMIT 10
  `).all();
  results.version_stats = versionStats.results;

  // Events over last N days (or all time)
  const recentEvents = await db.prepare(`
    SELECT 
      DATE(timestamp) as date,
      COUNT(*) as count
    FROM analytics_events
    ${days !== null ? `WHERE timestamp >= datetime('now', '-${days} days')` : ''}
    GROUP BY DATE(timestamp)
    ORDER BY date DESC
  `).all();
  results.recent_activity = recentEvents.results;

  // Unique users (by IP hash) in filtered date range
  const uniqueUsers = await db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    ${days !== null ? `WHERE timestamp >= datetime('now', '-${days} days')` : 'WHERE 1=1'}
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
      ${days !== null ? `AND timestamp >= datetime('now', '-${days} days')` : ''}
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

  // Top products currently in carts (cart_add in last 30 mins)
  const topCartProducts = await db.prepare(`
    SELECT
      product_id,
      product_name,
      COUNT(DISTINCT ip_hash) as user_count,
      COUNT(*) as add_count
    FROM analytics_events
    WHERE event_name = 'cart_add'
      AND timestamp >= datetime('now', '-30 minutes')
      AND product_id IS NOT NULL
    GROUP BY product_id
    ORDER BY user_count DESC
    LIMIT 10
  `).all();
  stats.top_cart_products = topCartProducts.results;

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
    SUM(CASE WHEN event_name = 'cart_add' THEN 1 ELSE 0 END) as cart_adds,
      SUM(CASE WHEN event_name = 'product_view' THEN 1 ELSE 0 END) as product_views
    FROM analytics_events
    WHERE timestamp >= datetime('now', '-24 hours')
    GROUP BY hour
    ORDER BY hour DESC
  `).all();
  stats.hourly_activity = hourlyActivity.results;

  return stats;
}

// Get store-specific analytics (product/category popularity)
async function getStoreStats(db, days = 30) {
  const stats = {};

  // Most viewed products
  const topViewedProducts = await db.prepare(`
    SELECT
      product_id,
      product_name,
      category,
      COUNT(*) as view_count,
      COUNT(DISTINCT ip_hash) as unique_viewers
    FROM analytics_events
    WHERE event_name = 'product_view'
      AND timestamp >= datetime('now', '-' || ? || ' days')
      AND product_id IS NOT NULL
    GROUP BY product_id
    ORDER BY view_count DESC
    LIMIT 20
  `).bind(String(days)).all();
  stats.top_viewed_products = topViewedProducts.results;

  // Most added-to-cart products
  const topCartProducts = await db.prepare(`
    SELECT
      product_id,
      product_name,
      category,
      COUNT(*) as add_count,
      COUNT(DISTINCT ip_hash) as unique_adders,
      ROUND(AVG(price), 2) as avg_price
    FROM analytics_events
    WHERE event_name = 'cart_add'
      AND timestamp >= datetime('now', '-' || ? || ' days')
      AND product_id IS NOT NULL
    GROUP BY product_id
    ORDER BY add_count DESC
    LIMIT 20
  `).bind(String(days)).all();
  stats.top_cart_products = topCartProducts.results;

  // Category popularity (views)
  const categoryViews = await db.prepare(`
    SELECT
      category,
      COUNT(*) as view_count,
      COUNT(DISTINCT ip_hash) as unique_viewers
    FROM analytics_events
    WHERE event_name IN ('product_view', 'store_view')
      AND timestamp >= datetime('now', '-' || ? || ' days')
      AND category IS NOT NULL
    GROUP BY category
    ORDER BY view_count DESC
  `).bind(String(days)).all();
  stats.category_views = categoryViews.results;

  // Category cart popularity
  const categoryCart = await db.prepare(`
    SELECT
      category,
      COUNT(*) as add_count,
      COUNT(DISTINCT ip_hash) as unique_adders
    FROM analytics_events
    WHERE event_name = 'cart_add'
      AND timestamp >= datetime('now', '-' || ? || ' days')
      AND category IS NOT NULL
    GROUP BY category
    ORDER BY add_count DESC
  `).bind(String(days)).all();
  stats.category_cart = categoryCart.results;

  // Conversion metrics: product views -> cart adds
  const conversionMetrics = await db.prepare(`
    WITH views AS (
      SELECT product_id, COUNT(*) as vc
      FROM analytics_events
      WHERE event_name = 'product_view'
        AND timestamp >= datetime('now', '-' || ? || ' days')
        AND product_id IS NOT NULL
      GROUP BY product_id
    ),
    adds AS (
      SELECT product_id, COUNT(*) as ac
      FROM analytics_events
      WHERE event_name = 'cart_add'
        AND timestamp >= datetime('now', '-' || ? || ' days')
        AND product_id IS NOT NULL
      GROUP BY product_id
    )
    SELECT
      COALESCE(v.product_id, a.product_id) as product_id,
      COALESCE(v.vc, 0) as views,
      COALESCE(a.ac, 0) as adds
    FROM views v
    FULL OUTER JOIN adds a ON v.product_id = a.product_id
    WHERE COALESCE(v.vc, 0) + COALESCE(a.ac, 0) > 0
    ORDER BY adds DESC, views DESC
    LIMIT 20
  `).bind(String(days), String(days)).all();
  stats.product_conversion = conversionMetrics.results;

  // Overall conversion
  const storeVisitors = await db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    WHERE event_name = 'store_view'
      AND timestamp >= datetime('now', '-' || ? || ' days')
      AND ip_hash IS NOT NULL
  `).bind(String(days)).first();
  stats.store_visitors = storeVisitors.count;

  const orders = await db.prepare(`
    SELECT COUNT(DISTINCT ip_hash) as count
    FROM analytics_events
    WHERE event_name = 'order_completed'
      AND timestamp >= datetime('now', '-' || ? || ' days')
      AND ip_hash IS NOT NULL
  `).bind(String(days)).first();
  stats.orders = orders.count;

  stats.conversion_rate = stats.store_visitors > 0
    ? Math.round((stats.orders / stats.store_visitors) * 100 * 100) / 100
    : 0;

  // Daily store activity timeline
  const dailyActivity = await db.prepare(`
    SELECT
      DATE(timestamp) as date,
      SUM(CASE WHEN event_name = 'store_view' THEN 1 ELSE 0 END) as store_views,
      SUM(CASE WHEN event_name = 'product_view' THEN 1 ELSE 0 END) as product_views,
      SUM(CASE WHEN event_name = 'cart_add' THEN 1 ELSE 0 END) as cart_adds,
      SUM(CASE WHEN event_name = 'order_completed' THEN 1 ELSE 0 END) as orders
    FROM analytics_events
    WHERE timestamp >= datetime('now', '-' || ? || ' days')
    GROUP BY DATE(timestamp)
    ORDER BY date ASC
  `).bind(String(days)).all();
  stats.daily_activity = dailyActivity.results;

  return stats;
}

// Get detailed statistics
async function getDetailedStats(db, days = null) {
  const stats = await getStats(db, days);

  const dateFilter = days !== null
    ? `AND timestamp >= datetime('now', '-${days} days')`
    : '';

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
      ${dateFilter}
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
      ${dateFilter}
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
      ${dateFilter}
  `).first();
  
  if (successRate.successes + successRate.failures > 0) {
    stats.success_rate = {
      successes: successRate.successes,
      failures: successRate.failures,
      rate: (successRate.successes / (successRate.successes + successRate.failures) * 100).toFixed(2) + '%'
    };
  }

  // New users in last filtered period
  const newUsers = days !== null
    ? await db.prepare(`
      SELECT COUNT(DISTINCT ip_hash) as count
      FROM analytics_events
      WHERE ip_hash IN (
        SELECT ip_hash
        FROM analytics_events
        WHERE ip_hash IS NOT NULL
        ${dateFilter}
        GROUP BY ip_hash
        HAVING MIN(timestamp) >= datetime('now', '-${days} days')
      )
    `).first()
    : await db.prepare(`
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

  // Returning users in filtered period
  const returningUsers = days !== null
    ? await db.prepare(`
      SELECT COUNT(DISTINCT ip_hash) as count
      FROM analytics_events
      WHERE ip_hash IN (
        SELECT ip_hash
        FROM analytics_events
        WHERE ip_hash IS NOT NULL
        GROUP BY ip_hash
        HAVING MIN(timestamp) < datetime('now', '-${days} days')
          AND MAX(timestamp) >= datetime('now', '-${days} days')
      )
    `).first()
    : await db.prepare(`
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
