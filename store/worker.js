// Cloudflare Worker - FPVGate Store API
// Handles Snipcart webhooks, Shippo shipping integration, and admin API

import {
    getShippingRates,
    purchaseLabel,
    transformRatesForSnipcart,
    getFallbackRates
} from './shippo.js';

export default {
    async fetch(request, env) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        try {
            // --- Snipcart Webhooks ---

            // POST /shipping - Snipcart shipping rates webhook
            if (url.pathname === '/shipping' && request.method === 'POST') {
                return await handleShippingWebhook(request, env, corsHeaders);
            }

            // POST /webhook/order - Snipcart order completed webhook
            if (url.pathname === '/webhook/order' && request.method === 'POST') {
                return await handleOrderWebhook(request, env, corsHeaders);
            }

            // --- Admin API (requires auth) ---

            if (url.pathname.startsWith('/api/')) {
                const authError = await validateAdminAuth(request, env);
                if (authError) {
                    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                        status: 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                // GET /api/orders - List all orders
                if (url.pathname === '/api/orders' && request.method === 'GET') {
                    return await handleListOrders(request, env, corsHeaders);
                }

                // GET /api/orders/:id - Get single order
                const orderMatch = url.pathname.match(/^\/api\/orders\/(\d+)$/);
                if (orderMatch && request.method === 'GET') {
                    return await handleGetOrder(orderMatch[1], env, corsHeaders);
                }

                // POST /api/orders/:id/label - Create shipping label
                const labelMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/label$/);
                if (labelMatch && request.method === 'POST') {
                    return await handleCreateLabel(labelMatch[1], request, env, corsHeaders);
                }

                // PUT /api/orders/:id/status - Update order status
                const statusMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/status$/);
                if (statusMatch && request.method === 'PUT') {
                    return await handleUpdateStatus(statusMatch[1], request, env, corsHeaders);
                }

                // POST /api/orders/:id/rates - Get shipping rates for an order
                const ratesMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/rates$/);
                if (ratesMatch && request.method === 'POST') {
                    return await handleGetOrderRates(ratesMatch[1], env, corsHeaders);
                }
            }

            return new Response('Not Found', { status: 404, headers: corsHeaders });

        } catch (error) {
            console.error('Error:', error);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};

// --- Auth ---

async function validateAdminAuth(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return true;

    const token = authHeader.replace('Bearer ', '');
    if (token !== env.ADMIN_TOKEN) return true;

    return false; // no error, auth passed
}

// --- Snipcart Webhook Validation ---

async function validateSnipcartRequest(request) {
    const token = request.headers.get('X-Snipcart-RequestToken');
    if (!token) return false;

    try {
        const response = await fetch(
            `https://app.snipcart.com/api/requestvalidation/${token}`
        );
        return response.ok;
    } catch {
        return false;
    }
}

// --- Shipping Rates Webhook ---

async function handleShippingWebhook(request, env, corsHeaders) {
    const body = await request.json();
    const content = body.content || body;

    const shippingAddress = content.shippingAddress || content;
    const country = shippingAddress.country || shippingAddress.shippingAddressCountry;

    try {
        const shipment = await getShippingRates(env.SHIPPO_API_TOKEN, {
            name: shippingAddress.name || shippingAddress.shippingAddressName || 'Customer',
            address1: shippingAddress.address1 || shippingAddress.shippingAddressAddress1,
            address2: shippingAddress.address2 || shippingAddress.shippingAddressAddress2,
            city: shippingAddress.city || shippingAddress.shippingAddressCity,
            province: shippingAddress.province || shippingAddress.shippingAddressProvince,
            postalCode: shippingAddress.postalCode || shippingAddress.shippingAddressPostalCode,
            country: country,
            phone: shippingAddress.phone || shippingAddress.shippingAddressPhone || ''
        });

        const rates = transformRatesForSnipcart(shipment.rates || []);

        if (rates.length === 0) {
            // No rates from Shippo, use fallback
            return jsonResponse({ rates: getFallbackRates(country) }, corsHeaders);
        }

        return jsonResponse({ rates }, corsHeaders);

    } catch (error) {
        console.error('Shippo rate lookup failed, using fallback:', error.message);
        return jsonResponse({ rates: getFallbackRates(country) }, corsHeaders);
    }
}

// --- Order Webhook ---

async function handleOrderWebhook(request, env, corsHeaders) {
    const body = await request.json();

    // Only process order.completed events
    if (body.eventName !== 'order.completed') {
        return jsonResponse({ success: true, message: 'Event ignored' }, corsHeaders);
    }

    const order = body.content;

    // Store the order in D1
    await env.DB.prepare(`
        INSERT OR IGNORE INTO orders
        (snipcart_token, invoice_number, customer_name, customer_email,
         shipping_address, billing_address, items, subtotal, shipping_fees,
         total, currency, shipping_method, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `).bind(
        order.token,
        order.invoiceNumber || null,
        order.shippingAddressName || order.billingAddressName || 'Unknown',
        order.email,
        JSON.stringify({
            name: order.shippingAddressName,
            company: order.shippingAddressCompanyName,
            address1: order.shippingAddressAddress1,
            address2: order.shippingAddressAddress2,
            city: order.shippingAddressCity,
            province: order.shippingAddressProvince,
            postalCode: order.shippingAddressPostalCode,
            country: order.shippingAddressCountry,
            phone: order.shippingAddressPhone
        }),
        JSON.stringify({
            name: order.billingAddressName,
            address1: order.billingAddressAddress1,
            city: order.billingAddressCity,
            province: order.billingAddressProvince,
            postalCode: order.billingAddressPostalCode,
            country: order.billingAddressCountry
        }),
        JSON.stringify(order.items.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            totalPrice: item.totalPrice
        }))),
        order.subtotal,
        order.shippingFees || 0,
        order.finalGrandTotal || order.grandTotal,
        order.currency || 'gbp',
        order.shippingMethod || null
    ).run();

    return jsonResponse({ success: true }, corsHeaders);
}

// --- Admin API Handlers ---

async function handleListOrders(request, env, corsHeaders) {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let query = 'SELECT * FROM orders';
    const params = [];

    if (status) {
        query += ' WHERE status = ?';
        params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await env.DB.prepare(query).bind(...params).all();

    // Get counts by status
    const counts = await env.DB.prepare(`
        SELECT status, COUNT(*) as count FROM orders GROUP BY status
    `).all();

    return jsonResponse({
        orders: result.results.map(parseOrderJson),
        total: result.results.length,
        counts: counts.results
    }, corsHeaders);
}

async function handleGetOrder(orderId, env, corsHeaders) {
    const order = await env.DB.prepare(
        'SELECT * FROM orders WHERE id = ?'
    ).bind(orderId).first();

    if (!order) {
        return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);
    }

    return jsonResponse(parseOrderJson(order), corsHeaders);
}

async function handleGetOrderRates(orderId, env, corsHeaders) {
    const order = await env.DB.prepare(
        'SELECT * FROM orders WHERE id = ?'
    ).bind(orderId).first();

    if (!order) {
        return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);
    }

    const shippingAddress = JSON.parse(order.shipping_address);

    try {
        const shipment = await getShippingRates(env.SHIPPO_API_TOKEN, shippingAddress);

        // Store the shipment ID for later label purchase
        await env.DB.prepare(
            'UPDATE orders SET shippo_shipment_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
        ).bind(shipment.object_id, orderId).run();

        const rates = (shipment.rates || []).map(rate => ({
            objectId: rate.object_id,
            amount: rate.amount,
            currency: rate.currency,
            provider: rate.provider,
            serviceName: rate.servicelevel?.name || 'Standard',
            estimatedDays: rate.estimated_days,
            durationTerms: rate.duration_terms || ''
        }));

        return jsonResponse({ rates, shipmentId: shipment.object_id }, corsHeaders);

    } catch (error) {
        return jsonResponse({ error: `Failed to get rates: ${error.message}` }, corsHeaders, 500);
    }
}

async function handleCreateLabel(orderId, request, env, corsHeaders) {
    const order = await env.DB.prepare(
        'SELECT * FROM orders WHERE id = ?'
    ).bind(orderId).first();

    if (!order) {
        return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);
    }

    if (order.label_url) {
        return jsonResponse({
            error: 'Label already created',
            labelUrl: order.label_url,
            trackingNumber: order.tracking_number
        }, corsHeaders, 400);
    }

    const body = await request.json();
    const rateObjectId = body.rateId;

    if (!rateObjectId) {
        return jsonResponse({ error: 'rateId is required' }, corsHeaders, 400);
    }

    try {
        const label = await purchaseLabel(env.SHIPPO_API_TOKEN, rateObjectId);

        // Update order with label details
        await env.DB.prepare(`
            UPDATE orders SET
                tracking_number = ?,
                shippo_transaction_id = ?,
                label_url = ?,
                status = 'label_created',
                updated_at = datetime('now')
            WHERE id = ?
        `).bind(
            label.trackingNumber,
            label.transactionId,
            label.labelUrl,
            orderId
        ).run();

        // Optionally update Snipcart with tracking number
        if (env.SNIPCART_SECRET_KEY && order.snipcart_token) {
            try {
                await updateSnipcartTracking(
                    env.SNIPCART_SECRET_KEY,
                    order.snipcart_token,
                    label.trackingNumber
                );
            } catch (e) {
                console.error('Failed to update Snipcart tracking:', e.message);
            }
        }

        return jsonResponse({
            success: true,
            trackingNumber: label.trackingNumber,
            labelUrl: label.labelUrl,
            transactionId: label.transactionId
        }, corsHeaders);

    } catch (error) {
        return jsonResponse({ error: `Label creation failed: ${error.message}` }, corsHeaders, 500);
    }
}

async function handleUpdateStatus(orderId, request, env, corsHeaders) {
    const body = await request.json();
    const { status, trackingNumber, notes } = body;

    const validStatuses = ['new', 'label_created', 'shipped', 'completed'];
    if (!validStatuses.includes(status)) {
        return jsonResponse({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, corsHeaders, 400);
    }

    let query = 'UPDATE orders SET status = ?, updated_at = datetime(\'now\')';
    const params = [status];

    if (trackingNumber !== undefined) {
        query += ', tracking_number = ?';
        params.push(trackingNumber);
    }

    if (notes !== undefined) {
        query += ', notes = ?';
        params.push(notes);
    }

    query += ' WHERE id = ?';
    params.push(orderId);

    const result = await env.DB.prepare(query).bind(...params).run();

    if (result.meta.changes === 0) {
        return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);
    }

    return jsonResponse({ success: true, status }, corsHeaders);
}

// --- Helpers ---

async function updateSnipcartTracking(apiKey, orderToken, trackingNumber) {
    const credentials = btoa(apiKey + ':');
    await fetch(`https://app.snipcart.com/api/orders/${orderToken}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            trackingNumber: trackingNumber,
            status: 'Shipped'
        })
    });
}

function parseOrderJson(order) {
    return {
        ...order,
        shipping_address: tryParseJson(order.shipping_address),
        billing_address: tryParseJson(order.billing_address),
        items: tryParseJson(order.items)
    };
}

function tryParseJson(str) {
    try {
        return JSON.parse(str);
    } catch {
        return str;
    }
}

function jsonResponse(data, corsHeaders, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
