// FPVGate Analytics Tracker
// Simple, privacy-focused analytics for tracking user events

class AnalyticsTracker {
  constructor(apiEndpoint) {
    this.apiEndpoint = apiEndpoint;
    this.enabled = true;
    this.queue = [];
    this.isSending = false;
  }

  /**
   * Track an event
   * @param {string} eventName - Name of the event (e.g., 'flash_complete', 'flash_failed')
   * @param {object} data - Additional data to track
   */
  async track(eventName, data = {}) {
    if (!this.enabled || !this.apiEndpoint) {
      return;
    }

    const eventData = {
      event: eventName,
      timestamp: new Date().toISOString(),
      referrer: document.referrer || window.location.href,
      ...data
    };

    // Add to queue
    this.queue.push(eventData);

    // Send immediately (or batch if you prefer)
    this.sendQueue();
  }

  /**
   * Send queued events to the backend
   */
  async sendQueue() {
    if (this.isSending || this.queue.length === 0) {
      return;
    }

    this.isSending = true;

    while (this.queue.length > 0) {
      const event = this.queue.shift();

      try {
        await fetch(`${this.apiEndpoint}/track`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
          // Don't block page unload
          keepalive: true
        });
      } catch (error) {
        // Silently fail - don't break user experience
        console.debug('Analytics tracking failed:', error);
      }
    }

    this.isSending = false;
  }

  /**
   * Disable tracking
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Enable tracking
   */
  enable() {
    this.enabled = true;
  }
}

// Create and export a singleton instance
// Replace this URL with your deployed Cloudflare Worker URL
const ANALYTICS_API = 'https://fpvgate-analytics.fpvgate-analytics.workers.dev';

const analytics = new AnalyticsTracker(ANALYTICS_API);

// Export for use in other scripts
window.fpvgateAnalytics = analytics;

// Track page views automatically
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    analytics.track('page_view', {
      page: window.location.pathname
    });
    initStoreTracking();
  });
} else {
  analytics.track('page_view', {
    page: window.location.pathname
  });
  initStoreTracking();
}

/**
 * Track store-specific events for live stats
 */
function initStoreTracking() {
  const page = window.location.pathname;

  // Track store page views specifically
  if (page === '/shop.html' || page === '/shop' || page === '/store.html' || page === '/store') {
    analytics.track('store_view', { page });
  }

  // Cart events (cart_add, cart_open, order_completed) are now
  // triggered directly by the cart widget in shop.html and order-success.html
  // via window.fpvgateAnalytics.track() calls.
}
