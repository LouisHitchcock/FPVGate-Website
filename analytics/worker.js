// Cloudflare Worker - Analytics API
// This receives analytics events from the website and stores them in D1

export default {
  async fetch(request, env) {
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
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

  // Country breakdown
  const countryStats = await db.prepare(`
    SELECT 
      country,
      COUNT(*) as count
    FROM analytics_events
    WHERE country IS NOT NULL
    GROUP BY country
    ORDER BY count DESC
    LIMIT 20
  `).all();
  results.country_stats = countryStats.results;

  return results;
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

  return stats;
}
