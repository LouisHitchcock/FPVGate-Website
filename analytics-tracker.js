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

  // Listen for Snipcart events if Snipcart is present
  if (typeof document.querySelector('#snipcart') !== 'undefined') {
    // Poll for Snipcart SDK readiness
    let attempts = 0;
    const waitForSnipcart = setInterval(() => {
      attempts++;
      if (attempts > 50) {
        clearInterval(waitForSnipcart);
        return;
      }
      if (window.Snipcart) {
        clearInterval(waitForSnipcart);
        bindSnipcartEvents();
      }
    }, 200);
  }
}

function bindSnipcartEvents() {
  try {
    // Track item added to cart
    window.Snipcart.events.on('item.added', (item) => {
      analytics.track('cart_add', {
        product_id: item.id || item.uniqueId,
        product_name: item.name,
        quantity: item.quantity,
        price: item.price
      });
    });

    // Track cart opened
    window.Snipcart.events.on('cart.opened', () => {
      analytics.track('cart_open', {});
    });

    // Track order completed (client-side)
    window.Snipcart.events.on('order.completed', (order) => {
      analytics.track('order_completed', {
        invoice: order.invoiceNumber,
        total: order.total
      });
    });
  } catch (e) {
    console.debug('Snipcart event binding failed:', e);
  }
}
