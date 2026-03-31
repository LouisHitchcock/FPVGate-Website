// Cloudflare Worker - FPVGate Shop API
// Handles Stripe Checkout, webhooks, Shippo shipping, and admin API

import {
    getShippingRates,
    getReturnRates,
    purchaseLabel,
    transformRatesForStripe,
    getFallbackShippingOptions
} from './shippo.js';

import {
    sendEmail,
    orderConfirmationEmail,
    orderShippedEmail,
    trackingNumberEmail,
    orderCommentEmail,
    refundEmail,
    returnLabelEmail,
    normalizeOrder
} from './email.js';

export default {
    async fetch(request, env) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        try {
            // --- Public: Stripe Checkout ---

            if (url.pathname === '/checkout' && request.method === 'POST') {
                return await handleCheckout(request, env, corsHeaders);
            }

            // POST /webhook/stripe - Stripe webhook handler
            if (url.pathname === '/webhook/stripe' && request.method === 'POST') {
                return await handleStripeWebhook(request, env, corsHeaders);
            }

            // POST /webhook/shippo - Shippo tracking webhook handler
            if (url.pathname === '/webhook/shippo' && request.method === 'POST') {
                return await handleShippoWebhook(request, env, corsHeaders);
            }

            // --- Public Image Serve ---
            const imageMatch = url.pathname.match(/^\/images\/(.+)$/);
            if (imageMatch && request.method === 'GET') {
                const obj = await env.IMAGES.get(decodeURIComponent(imageMatch[1]));
                if (!obj) return new Response('Not Found', { status: 404, headers: corsHeaders });
                const headers = new Headers(corsHeaders);
                headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg');
                headers.set('Cache-Control', 'public, max-age=31536000');
                return new Response(obj.body, { headers });
            }

            // --- Public Products API (for shop page) ---

            if (url.pathname === '/products' && request.method === 'GET') {
                const result = await env.DB.prepare(
                    'SELECT product_id, product_name, price, description, short_description, long_description, image_url, images, weight, max_quantity, stock_quantity, low_stock_threshold, active FROM inventory WHERE active = 1 ORDER BY product_name ASC'
                ).all();

                const baseUrl = url.origin;
                const products = (result.results || []).map(p => {
                    const imgs = JSON.parse(p.images || '[]');
                    return {
                        id: p.product_id,
                        name: p.product_name,
                        price: p.price,
                        url: '/products',
                        description: p.description || '',
                        shortDescription: p.short_description || p.description || '',
                        longDescription: p.long_description || '',
                        image: imgs.length > 0 ? `${baseUrl}/images/${imgs[0]}` : (p.image_url || ''),
                        images: imgs.map(k => `${baseUrl}/images/${k}`),
                        stock: p.stock_quantity,
                        lowStockThreshold: p.low_stock_threshold,
                        weight: p.weight || 100,
                        maxQuantity: p.max_quantity || 5
                    };
                });

                return jsonResponse(products, corsHeaders);
            }

            // --- Public: Shipping Rates Lookup ---

            if (url.pathname === '/shipping-rates' && request.method === 'POST') {
                return await handleShippingRatesLookup(request, env, corsHeaders);
            }

            // --- Public: Order Session Lookup (for success page) ---

            if (url.pathname === '/order-status' && request.method === 'GET') {
                const sessionId = url.searchParams.get('session_id');
                if (!sessionId) return jsonResponse({ error: 'Missing session_id' }, corsHeaders, 400);

                const order = await env.DB.prepare(
                    'SELECT id, invoice_number, customer_name, customer_email, items, total, currency, shipping_method, status, created_at FROM orders WHERE stripe_session_id = ?'
                ).bind(sessionId).first();

                if (!order) return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);
                return jsonResponse({
                    invoiceNumber: order.invoice_number,
                    customerName: order.customer_name,
                    email: order.customer_email,
                    items: tryParseJson(order.items),
                    total: order.total,
                    currency: order.currency,
                    shippingMethod: order.shipping_method,
                    status: order.status,
                    createdAt: order.created_at
                }, corsHeaders);
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

                // GET /api/orders
                if (url.pathname === '/api/orders' && request.method === 'GET') {
                    return await handleListOrders(request, env, corsHeaders);
                }

                const orderMatch = url.pathname.match(/^\/api\/orders\/(\d+)$/);
                if (orderMatch && request.method === 'GET') {
                    return await handleGetOrder(orderMatch[1], env, corsHeaders);
                }

                const labelMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/label$/);
                if (labelMatch && request.method === 'POST') {
                    return await handleCreateLabel(labelMatch[1], request, env, corsHeaders);
                }

                const statusMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/status$/);
                if (statusMatch && request.method === 'PUT') {
                    return await handleUpdateStatus(statusMatch[1], request, env, corsHeaders);
                }

                const ratesMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/rates$/);
                if (ratesMatch && request.method === 'POST') {
                    return await handleGetOrderRates(ratesMatch[1], env, corsHeaders);
                }

                const commentsGetMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/comments$/);
                if (commentsGetMatch && request.method === 'GET') {
                    return await handleGetComments(commentsGetMatch[1], env, corsHeaders);
                }

                const commentsPostMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/comments$/);
                if (commentsPostMatch && request.method === 'POST') {
                    return await handleAddComment(commentsPostMatch[1], request, env, corsHeaders);
                }

                const refundMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/refund$/);
                if (refundMatch && request.method === 'POST') {
                    return await handleRefundOrder(refundMatch[1], request, env, corsHeaders);
                }

                const trackingMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/tracking$/);
                if (trackingMatch && request.method === 'GET') {
                    return await handleGetTracking(trackingMatch[1], env, corsHeaders);
                }

                const refundsListMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/refunds$/);
                if (refundsListMatch && request.method === 'GET') {
                    return await handleGetRefunds(refundsListMatch[1], env, corsHeaders);
                }

                const cancelMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/cancel$/);
                if (cancelMatch && request.method === 'POST') {
                    return await handleCancelOrder(cancelMatch[1], request, env, corsHeaders);
                }

                // Return endpoints
                const returnCreateMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/return$/);
                if (returnCreateMatch && request.method === 'POST') {
                    return await handleCreateReturn(returnCreateMatch[1], request, env, corsHeaders);
                }
                if (returnCreateMatch && request.method === 'GET') {
                    return await handleGetReturn(returnCreateMatch[1], env, corsHeaders);
                }

                const returnRatesMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/return\/rates$/);
                if (returnRatesMatch && request.method === 'POST') {
                    return await handleGetReturnRates(returnRatesMatch[1], env, corsHeaders);
                }

                const returnLabelMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/return\/label$/);
                if (returnLabelMatch && request.method === 'POST') {
                    return await handleCreateReturnLabel(returnLabelMatch[1], request, env, corsHeaders);
                }

                const returnStatusMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/return\/status$/);
                if (returnStatusMatch && request.method === 'PUT') {
                    return await handleUpdateReturnStatus(returnStatusMatch[1], request, env, corsHeaders);
                }

                // Inventory endpoints
                if (url.pathname === '/api/inventory' && request.method === 'GET') {
                    return await handleListInventory(env, corsHeaders);
                }

                const inventoryGetMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/);
                if (inventoryGetMatch && request.method === 'GET') {
                    const product = await env.DB.prepare('SELECT * FROM inventory WHERE product_id = ?').bind(decodeURIComponent(inventoryGetMatch[1])).first();
                    if (!product) return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);
                    return jsonResponse(product, corsHeaders);
                }

                const inventoryUpdateMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/);
                if (inventoryUpdateMatch && request.method === 'PUT') {
                    return await handleUpdateInventory(decodeURIComponent(inventoryUpdateMatch[1]), request, env, corsHeaders);
                }

                if (url.pathname === '/api/inventory' && request.method === 'POST') {
                    return await handleAddInventoryProduct(request, env, corsHeaders);
                }

                const inventoryLogMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/log$/);
                if (inventoryLogMatch && request.method === 'GET') {
                    return await handleGetInventoryLog(decodeURIComponent(inventoryLogMatch[1]), env, corsHeaders);
                }

                const imgUploadMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/images$/);
                if (imgUploadMatch && request.method === 'POST') {
                    return await handleImageUpload(decodeURIComponent(imgUploadMatch[1]), request, env, corsHeaders);
                }

                const imgDeleteMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/images\/(\d+)$/);
                if (imgDeleteMatch && request.method === 'DELETE') {
                    return await handleImageDelete(decodeURIComponent(imgDeleteMatch[1]), parseInt(imgDeleteMatch[2]), env, corsHeaders);
                }

                const imgReorderMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/images\/reorder$/);
                if (imgReorderMatch && request.method === 'POST') {
                    return await handleImageReorder(decodeURIComponent(imgReorderMatch[1]), request, env, corsHeaders);
                }

                const archiveMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)\/archive$/);
                if (archiveMatch && request.method === 'POST') {
                    return await handleArchiveProduct(decodeURIComponent(archiveMatch[1]), request, env, corsHeaders);
                }

                const deleteMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/);
                if (deleteMatch && request.method === 'DELETE') {
                    return await handleDeleteProduct(decodeURIComponent(deleteMatch[1]), env, corsHeaders);
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
    return false;
}

// --- Stripe Helpers ---

async function stripeRequest(secretKey, endpoint, method = 'POST', params = {}) {
    const body = new URLSearchParams();
    flattenParams(params, body, '');

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    };

    if (method !== 'GET') {
        options.body = body.toString();
    }

    const response = await fetch(`https://api.stripe.com/v1${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || `Stripe API error (${response.status})`);
    }

    return data;
}

function flattenParams(obj, params, prefix) {
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}[${key}]` : key;
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
            value.forEach((item, i) => {
                if (typeof item === 'object') {
                    flattenParams(item, params, `${fullKey}[${i}]`);
                } else {
                    params.append(`${fullKey}[${i}]`, item);
                }
            });
        } else if (typeof value === 'object') {
            flattenParams(value, params, fullKey);
        } else {
            params.append(fullKey, String(value));
        }
    }
}

async function verifyStripeSignature(payload, sigHeader, secret) {
    const parts = {};
    sigHeader.split(',').forEach(part => {
        const [k, v] = part.split('=');
        if (k === 't') parts.t = v;
        if (k === 'v1') parts.v1 = parts.v1 || v;
    });

    if (!parts.t || !parts.v1) return false;

    const signedPayload = `${parts.t}.${payload}`;
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (expected.length !== parts.v1.length) return false;
    let result = 0;
    for (let i = 0; i < expected.length; i++) {
        result |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
    }
    return result === 0;
}

// --- Shipping Rates Lookup ---

async function handleShippingRatesLookup(request, env, corsHeaders) {
    const body = await request.json();
    const { shipping } = body;

    if (!shipping || !shipping.country) {
        return jsonResponse({ error: 'Shipping address with country is required' }, corsHeaders, 400);
    }

    let rates = [];
    try {
        const shipment = await getShippingRates(env.SHIPPO_API_TOKEN, {
            name: shipping.name || 'Customer',
            address1: shipping.address1,
            address2: shipping.address2 || '',
            city: shipping.city,
            province: shipping.province || '',
            postalCode: shipping.postalCode,
            country: shipping.country,
            phone: shipping.phone || ''
        });
        rates = (shipment.rates || []).filter(r => r.amount && parseFloat(r.amount) > 0).map(r => ({
            id: r.object_id,
            provider: r.provider,
            service: r.servicelevel?.name || 'Standard',
            amount: parseFloat(r.amount),
            currency: r.currency,
            estimatedDays: r.estimated_days,
            durationTerms: r.duration_terms || ''
        })).sort((a, b) => a.amount - b.amount);
    } catch (e) {
        console.error('Shippo failed:', e.message);
    }

    if (rates.length === 0) {
        // Fallback rates
        const c = shipping.country;
        if (c === 'GB') {
            rates = [{ id: 'fallback_uk', provider: 'Royal Mail', service: 'UK Standard', amount: 1.85, currency: 'GBP', estimatedDays: 3 }];
        } else {
            const eu = ['IE','FR','DE','DK','AT','BE','BG','HR','CY','CZ','EE','FI','GR','HU','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','NO','CH'];
            if (eu.includes(c)) {
                rates = [{ id: 'fallback_eu', provider: 'Royal Mail', service: 'International Standard (Europe)', amount: 3.80, currency: 'GBP', estimatedDays: 5 }];
            } else {
                rates = [{ id: 'fallback_ww', provider: 'Royal Mail', service: 'International Standard (Worldwide)', amount: 4.60, currency: 'GBP', estimatedDays: 7 }];
            }
        }
    }

    return jsonResponse({ rates }, corsHeaders);
}

// --- Stripe Checkout ---

async function handleCheckout(request, env, corsHeaders) {
    const body = await request.json();
    const { items, shipping, selectedShippingRate, successUrl, cancelUrl } = body;

    if (!items || !items.length) {
        return jsonResponse({ error: 'No items provided' }, corsHeaders, 400);
    }

    if (!shipping || !shipping.country) {
        return jsonResponse({ error: 'Shipping address with country is required' }, corsHeaders, 400);
    }

    const lineItems = [];
    const orderItems = [];

    for (const item of items) {
        const product = await env.DB.prepare(
            'SELECT product_id, product_name, price, description, image_url, images, stock_quantity, weight, max_quantity FROM inventory WHERE product_id = ? AND active = 1'
        ).bind(item.id).first();

        if (!product) {
            return jsonResponse({ error: `Product not found: ${item.id}` }, corsHeaders, 400);
        }

        const qty = Math.min(item.quantity || 1, product.max_quantity || 5);
        if (product.stock_quantity < qty) {
            return jsonResponse({ error: `${product.product_name} is out of stock` }, corsHeaders, 400);
        }

        const imgs = JSON.parse(product.images || '[]');
        const imageUrl = imgs.length > 0
            ? `${new URL(request.url).origin}/images/${imgs[0]}`
            : (product.image_url || undefined);

        lineItems.push({
            price_data: {
                currency: 'gbp',
                product_data: {
                    name: product.product_name,
                    description: product.description || undefined,
                    images: imageUrl ? [imageUrl] : undefined,
                },
                unit_amount: Math.round(product.price * 100),
            },
            quantity: qty,
        });

        orderItems.push({
            id: product.product_id,
            name: product.product_name,
            price: product.price,
            quantity: qty,
            totalPrice: product.price * qty,
            weight: product.weight || 100
        });
    }

    // Use pre-selected rate if provided, otherwise fetch from Shippo
    let shippingOptions;
    if (selectedShippingRate) {
        shippingOptions = [{
            shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: { amount: Math.round(selectedShippingRate.amount * 100), currency: 'gbp' },
                display_name: selectedShippingRate.name || 'Shipping',
                delivery_estimate: selectedShippingRate.estimatedDays ? {
                    minimum: { unit: 'business_day', value: Math.max(1, selectedShippingRate.estimatedDays - 1) },
                    maximum: { unit: 'business_day', value: selectedShippingRate.estimatedDays + 1 }
                } : undefined
            }
        }];
    } else {
        try {
            const shipment = await getShippingRates(env.SHIPPO_API_TOKEN, {
                name: shipping.name || 'Customer',
                address1: shipping.address1,
                address2: shipping.address2 || '',
                city: shipping.city,
                province: shipping.province || '',
                postalCode: shipping.postalCode,
                country: shipping.country,
                phone: shipping.phone || ''
            });
            shippingOptions = transformRatesForStripe(shipment.rates || []);
        } catch (e) {
            console.error('Shippo failed, using fallback:', e.message);
        }

        if (!shippingOptions || shippingOptions.length === 0) {
            shippingOptions = getFallbackShippingOptions(shipping.country);
        }
    }

    const origin = new URL(request.url).origin;

    const sessionParams = {
        mode: 'payment',
        currency: 'gbp',
        line_items: lineItems,
        shipping_options: shippingOptions,
        success_url: successUrl || `${origin}/order-success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${origin}/shop.html`,
        metadata: {
            order_items: JSON.stringify(orderItems),
            shipping_address: JSON.stringify(shipping)
        }
    };

    const session = await stripeRequest(env.STRIPE_SECRET_KEY, '/checkout/sessions', 'POST', sessionParams);

    return jsonResponse({ url: session.url, sessionId: session.id }, corsHeaders);
}

// --- Stripe Webhook ---

async function handleStripeWebhook(request, env, corsHeaders) {
    const payload = await request.text();
    const sigHeader = request.headers.get('stripe-signature');

    if (env.STRIPE_WEBHOOK_SECRET && sigHeader) {
        const valid = await verifyStripeSignature(payload, sigHeader, env.STRIPE_WEBHOOK_SECRET);
        if (!valid) {
            return new Response(JSON.stringify({ error: 'Invalid signature' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }

    const event = JSON.parse(payload);

    if (event.type === 'checkout.session.completed') {
        try {
            await processCompletedCheckout(event.data.object, env);
            console.log('Order processed successfully');
        } catch (e) {
            console.error('processCompletedCheckout FAILED:', e.message, e.stack);
            return jsonResponse({ error: e.message }, corsHeaders, 500);
        }
    }

    return jsonResponse({ received: true }, corsHeaders);
}

async function processCompletedCheckout(session, env) {
    const metadata = session.metadata || {};
    const items = tryParseJson(metadata.order_items) || [];
    const shippingAddress = tryParseJson(metadata.shipping_address) || {};

    const shippingCost = session.shipping_cost?.amount_total ? session.shipping_cost.amount_total / 100 : 0;
    const shippingMethod = session.shipping_cost?.shipping_rate ? 'Shippo Rate' : 'Standard';
    const subtotal = items.reduce((s, i) => s + (i.totalPrice || i.price * i.quantity), 0);
    const total = (session.amount_total || 0) / 100;

    const countResult = await env.DB.prepare('SELECT COUNT(*) as c FROM orders').first();
    const invoiceNumber = `FPVG-${String((countResult?.c || 0) + 1).padStart(4, '0')}`;

    console.log('Processing checkout:', session.id, 'items:', items.length, 'total:', total);

    await env.DB.prepare(`
        INSERT INTO orders
        (stripe_session_id, stripe_payment_intent, invoice_number, customer_name, customer_email,
         shipping_address, billing_address, items, subtotal, shipping_fees,
         total, currency, shipping_method, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `).bind(
        session.id,
        session.payment_intent || null,
        invoiceNumber,
        shippingAddress.name || session.customer_details?.name || 'Unknown',
        session.customer_details?.email || shippingAddress.email || '',
        JSON.stringify(shippingAddress),
        JSON.stringify(session.customer_details || {}),
        JSON.stringify(items),
        subtotal,
        shippingCost,
        total,
        session.currency || 'gbp',
        shippingMethod
    ).run();

    // Auto-decrement inventory
    try {
        for (const item of items) {
            if (item.id) {
                await env.DB.prepare(
                    'UPDATE inventory SET stock_quantity = stock_quantity - ?, updated_at = datetime(\'now\') WHERE product_id = ?'
                ).bind(item.quantity || 1, item.id).run();

                await env.DB.prepare(
                    'INSERT INTO inventory_log (product_id, change_amount, reason) VALUES (?, ?, ?)'
                ).bind(item.id, -(item.quantity || 1), `Order #${invoiceNumber}`).run();
            }
        }
    } catch (e) {
        console.error('Inventory update failed:', e.message);
    }

    // Send order confirmation email
    try {
        const customerEmail = session.customer_details?.email || shippingAddress.email || '';
        if (customerEmail) {
            const emailData = {
                invoiceNumber,
                customerName: shippingAddress.name || session.customer_details?.name || 'Customer',
                customerEmail,
                items,
                subtotal,
                shippingFees: shippingCost,
                shippingMethod,
                total,
                currency: session.currency || 'gbp',
                createdAt: new Date().toISOString(),
                shippingAddress,
                billingAddress: session.customer_details || {}
            };
            const email = orderConfirmationEmail(emailData);
            await sendEmail(env, customerEmail, email.subject, email.html);
        }
    } catch (e) {
        console.error('Confirmation email failed:', e.message);
    }

    // Discord notification
    if (env.DISCORD_WEBHOOK_URL) {
        try {
            await sendDiscordNotification(env.DISCORD_WEBHOOK_URL, {
                invoiceNumber, items, total,
                currency: session.currency || 'gbp',
                shippingAddress,
                customerEmail: session.customer_details?.email || ''
            });
        } catch (e) {
            console.error('Discord notification failed:', e.message);
        }
    }
}

// --- Admin: Orders ---

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
    const counts = await env.DB.prepare('SELECT status, COUNT(*) as count FROM orders GROUP BY status').all();

    return jsonResponse({
        orders: result.results.map(parseOrderJson),
        total: result.results.length,
        counts: counts.results
    }, corsHeaders);
}

async function handleGetOrder(orderId, env, corsHeaders) {
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
    if (!order) return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);
    return jsonResponse(parseOrderJson(order), corsHeaders);
}

async function handleGetOrderRates(orderId, env, corsHeaders) {
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
    if (!order) return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);

    const shippingAddress = JSON.parse(order.shipping_address);

    try {
        const shipment = await getShippingRates(env.SHIPPO_API_TOKEN, shippingAddress);

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
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
    if (!order) return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);

    if (order.label_url) {
        return jsonResponse({ error: 'Label already created', labelUrl: order.label_url, trackingNumber: order.tracking_number }, corsHeaders, 400);
    }

    const body = await request.json();
    if (!body.rateId) return jsonResponse({ error: 'rateId is required' }, corsHeaders, 400);

    try {
        const label = await purchaseLabel(env.SHIPPO_API_TOKEN, body.rateId);

        await env.DB.prepare(`
            UPDATE orders SET tracking_number = ?, shippo_transaction_id = ?, label_url = ?,
                status = 'label_created', updated_at = datetime('now') WHERE id = ?
        `).bind(label.trackingNumber, label.transactionId, label.labelUrl, orderId).run();

        // Send tracking number email
        try {
            const updatedOrder = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
            if (updatedOrder && updatedOrder.customer_email) {
                const emailData = normalizeOrder(updatedOrder);
                emailData.trackingUrl = label.trackingUrlProvider || '';
                const email = trackingNumberEmail(emailData);
                await sendEmail(env, updatedOrder.customer_email, email.subject, email.html);
            }
        } catch (e) {
            console.error('Tracking email failed:', e.message);
        }

        return jsonResponse({ success: true, trackingNumber: label.trackingNumber, labelUrl: label.labelUrl, transactionId: label.transactionId }, corsHeaders);
    } catch (error) {
        return jsonResponse({ error: `Label creation failed: ${error.message}` }, corsHeaders, 500);
    }
}

async function handleUpdateStatus(orderId, request, env, corsHeaders) {
    const body = await request.json();
    const { status, trackingNumber, notes } = body;

    const validStatuses = ['new', 'label_created', 'shipped', 'completed', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
        return jsonResponse({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, corsHeaders, 400);
    }

    let query = 'UPDATE orders SET status = ?, updated_at = datetime(\'now\')';
    const params = [status];

    if (trackingNumber !== undefined) { query += ', tracking_number = ?'; params.push(trackingNumber); }
    if (notes !== undefined) { query += ', notes = ?'; params.push(notes); }

    query += ' WHERE id = ?';
    params.push(orderId);

    const result = await env.DB.prepare(query).bind(...params).run();
    if (result.meta.changes === 0) return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);

    // Send shipped notification email
    if (status === 'shipped') {
        try {
            const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
            if (order && order.customer_email) {
                const emailData = normalizeOrder(order);
                const email = orderShippedEmail(emailData);
                await sendEmail(env, order.customer_email, email.subject, email.html);
            }
        } catch (e) {
            console.error('Shipped email failed:', e.message);
        }
    }

    return jsonResponse({ success: true, status }, corsHeaders);
}

// --- Shippo Tracking Webhook ---

async function handleShippoWebhook(request, env, corsHeaders) {
    let payload;
    try {
        payload = await request.json();
    } catch {
        return jsonResponse({ error: 'Invalid JSON' }, corsHeaders, 400);
    }

    if (payload.event !== 'track_updated' || !payload.data) {
        return jsonResponse({ received: true, skipped: true }, corsHeaders);
    }

    const data = payload.data;
    const trackingNumber = data.tracking_number;
    if (!trackingNumber) return jsonResponse({ received: true }, corsHeaders);

    // Find the order or return by tracking number
    const order = await env.DB.prepare('SELECT id, status FROM orders WHERE tracking_number = ?').bind(trackingNumber).first();
    const ret = await env.DB.prepare('SELECT id, order_id, status FROM returns WHERE tracking_number = ?').bind(trackingNumber).first();
    const orderId = order ? order.id : (ret ? ret.order_id : null);

    // Clear existing events for this tracking number and re-insert full history
    await env.DB.prepare('DELETE FROM tracking_events WHERE tracking_number = ?').bind(trackingNumber).run();

    const history = data.tracking_history || [];
    for (const evt of history) {
        const loc = evt.location || {};
        await env.DB.prepare(
            `INSERT INTO tracking_events (order_id, tracking_number, carrier, status, substatus_code, substatus_text, status_details, location_city, location_state, location_country, location_zip, status_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            orderId,
            trackingNumber,
            data.carrier || null,
            evt.status || 'UNKNOWN',
            evt.substatus?.code || null,
            evt.substatus?.text || null,
            evt.status_details || null,
            loc.city || null,
            loc.state || null,
            loc.country || null,
            loc.zip || null,
            evt.status_date || null
        ).run();
    }

    // Auto-complete order when delivered
    if (order && data.tracking_status?.status === 'DELIVERED' && order.status === 'shipped') {
        await env.DB.prepare("UPDATE orders SET status = 'completed', updated_at = datetime('now') WHERE id = ?").bind(orderId).run();
        console.log(`Order ${orderId} auto-completed (tracking DELIVERED)`);
    }

    // Auto-update return status based on tracking
    if (ret) {
        const latestStatus = data.tracking_status?.status;
        if (latestStatus === 'TRANSIT' && ret.status === 'label_created') {
            await env.DB.prepare("UPDATE returns SET status = 'in_transit', updated_at = datetime('now') WHERE id = ?").bind(ret.id).run();
            console.log(`Return ${ret.id} now in_transit`);
        } else if (latestStatus === 'DELIVERED' && (ret.status === 'label_created' || ret.status === 'in_transit')) {
            await env.DB.prepare("UPDATE returns SET status = 'received', updated_at = datetime('now') WHERE id = ?").bind(ret.id).run();
            console.log(`Return ${ret.id} received`);
        }
    }

    console.log(`Tracking updated: ${trackingNumber} - ${data.tracking_status?.status || 'unknown'} (${history.length} events)`);
    return jsonResponse({ received: true }, corsHeaders);
}

// --- Tracking ---

async function handleGetTracking(orderId, env, corsHeaders) {
    const result = await env.DB.prepare(
        'SELECT * FROM tracking_events WHERE order_id = ? ORDER BY status_date ASC'
    ).bind(orderId).all();

    // Also get the order's tracking number for context
    const order = await env.DB.prepare('SELECT tracking_number FROM orders WHERE id = ?').bind(orderId).first();

    return jsonResponse({
        trackingNumber: order?.tracking_number || null,
        events: result.results || []
    }, corsHeaders);
}

// --- Returns ---

async function handleCreateReturn(orderId, request, env, corsHeaders) {
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
    if (!order) return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);

    // Check no active return already exists
    const existing = await env.DB.prepare("SELECT id FROM returns WHERE order_id = ? AND status NOT IN ('cancelled', 'refunded')").bind(orderId).first();
    if (existing) return jsonResponse({ error: 'An active return already exists for this order' }, corsHeaders, 400);

    const body = await request.json();
    const { reason, items } = body;

    const orderItems = tryParseJson(order.items) || [];
    const returnItems = items && items.length > 0 ? items : orderItems;
    const refundAmount = returnItems.reduce((s, i) => s + (i.totalPrice || i.price * (i.quantity || 1)), 0);

    await env.DB.prepare(
        'INSERT INTO returns (order_id, reason, items, refund_amount) VALUES (?, ?, ?, ?)'
    ).bind(orderId, reason || '', JSON.stringify(returnItems), refundAmount).run();

    const ret = await env.DB.prepare('SELECT * FROM returns WHERE order_id = ? ORDER BY id DESC LIMIT 1').bind(orderId).first();
    return jsonResponse({ success: true, return: ret }, corsHeaders);
}

async function handleGetReturn(orderId, env, corsHeaders) {
    const ret = await env.DB.prepare("SELECT * FROM returns WHERE order_id = ? ORDER BY id DESC LIMIT 1").bind(orderId).first();
    if (!ret) return jsonResponse({ return: null }, corsHeaders);
    ret.items = tryParseJson(ret.items);
    return jsonResponse({ return: ret }, corsHeaders);
}

async function handleGetReturnRates(orderId, env, corsHeaders) {
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
    if (!order) return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);

    const ret = await env.DB.prepare("SELECT * FROM returns WHERE order_id = ? AND status = 'requested' ORDER BY id DESC LIMIT 1").bind(orderId).first();
    if (!ret) return jsonResponse({ error: 'No pending return found' }, corsHeaders, 404);

    const shippingAddress = JSON.parse(order.shipping_address);

    try {
        const shipment = await getReturnRates(env.SHIPPO_API_TOKEN, shippingAddress);

        await env.DB.prepare(
            "UPDATE returns SET shippo_shipment_id = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(shipment.object_id, ret.id).run();

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
        return jsonResponse({ error: `Failed to get return rates: ${error.message}` }, corsHeaders, 500);
    }
}

async function handleCreateReturnLabel(orderId, request, env, corsHeaders) {
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
    if (!order) return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);

    const ret = await env.DB.prepare("SELECT * FROM returns WHERE order_id = ? AND status = 'requested' ORDER BY id DESC LIMIT 1").bind(orderId).first();
    if (!ret) return jsonResponse({ error: 'No pending return found' }, corsHeaders, 404);
    if (ret.label_url) return jsonResponse({ error: 'Return label already created' }, corsHeaders, 400);

    const body = await request.json();
    if (!body.rateId) return jsonResponse({ error: 'rateId is required' }, corsHeaders, 400);

    try {
        const label = await purchaseLabel(env.SHIPPO_API_TOKEN, body.rateId);

        await env.DB.prepare(`
            UPDATE returns SET tracking_number = ?, shippo_transaction_id = ?, label_url = ?,
                status = 'label_created', updated_at = datetime('now') WHERE id = ?
        `).bind(label.trackingNumber, label.transactionId, label.labelUrl, ret.id).run();

        // Email the customer with the return label
        try {
            if (order.customer_email) {
                const shippingAddress = tryParseJson(order.shipping_address) || {};
                const emailData = {
                    invoiceNumber: order.invoice_number,
                    customerName: shippingAddress.name || order.customer_name || 'Customer',
                    customerEmail: order.customer_email,
                    items: tryParseJson(order.items) || [],
                    returnItems: tryParseJson(ret.items) || [],
                    reason: ret.reason,
                    trackingNumber: label.trackingNumber,
                    labelUrl: label.labelUrl
                };
                const email = returnLabelEmail(emailData);
                await sendEmail(env, order.customer_email, email.subject, email.html);
            }
        } catch (e) {
            console.error('Return label email failed:', e.message);
        }

        return jsonResponse({ success: true, trackingNumber: label.trackingNumber, labelUrl: label.labelUrl }, corsHeaders);
    } catch (error) {
        return jsonResponse({ error: `Return label creation failed: ${error.message}` }, corsHeaders, 500);
    }
}

async function handleUpdateReturnStatus(orderId, request, env, corsHeaders) {
    const ret = await env.DB.prepare("SELECT * FROM returns WHERE order_id = ? ORDER BY id DESC LIMIT 1").bind(orderId).first();
    if (!ret) return jsonResponse({ error: 'No return found' }, corsHeaders, 404);

    const body = await request.json();
    const { status } = body;

    const validStatuses = ['requested', 'label_created', 'in_transit', 'received', 'refunded', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return jsonResponse({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, corsHeaders, 400);
    }

    // If marking as refunded, process the refund + restore inventory
    if (status === 'refunded' && ret.status === 'received') {
        const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
        if (!order) return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);

        const refundAmount = ret.refund_amount || parseFloat(order.total);

        // Stripe refund
        let stripeRefundId = null;
        if (env.STRIPE_SECRET_KEY && order.stripe_payment_intent) {
            try {
                const refund = await stripeRequest(env.STRIPE_SECRET_KEY, '/refunds', 'POST', {
                    payment_intent: order.stripe_payment_intent,
                    amount: Math.round(refundAmount * 100),
                    reason: 'requested_by_customer'
                });
                stripeRefundId = refund.id;
            } catch (e) {
                return jsonResponse({ error: `Stripe refund failed: ${e.message}` }, corsHeaders, 502);
            }
        }

        // Record refund
        await env.DB.prepare(
            'INSERT INTO order_refunds (order_id, stripe_refund_id, amount, comment, refunded_by_gateway) VALUES (?, ?, ?, ?, ?)'
        ).bind(orderId, stripeRefundId, refundAmount, `Return #${ret.id}`, stripeRefundId ? 1 : 0).run();

        // Restore inventory
        try {
            const returnItems = tryParseJson(ret.items) || [];
            for (const item of returnItems) {
                if (item.id) {
                    await env.DB.prepare('UPDATE inventory SET stock_quantity = stock_quantity + ?, updated_at = datetime(\'now\') WHERE product_id = ?').bind(item.quantity || 1, item.id).run();
                    await env.DB.prepare('INSERT INTO inventory_log (product_id, change_amount, reason) VALUES (?, ?, ?)').bind(item.id, item.quantity || 1, `Return #${ret.id} for order #${order.invoice_number || orderId}`).run();
                }
            }
        } catch (e) {
            console.error('Inventory restore on return failed:', e.message);
        }

        // Send refund email
        try {
            if (order.customer_email) {
                const emailData = normalizeOrder(order);
                const allRefundsResult = await env.DB.prepare('SELECT * FROM order_refunds WHERE order_id = ? ORDER BY created_at DESC').bind(orderId).all();
                const refundInfo = { amount: refundAmount, comment: `Return #${ret.id}` };
                const email = refundEmail(emailData, refundInfo, allRefundsResult.results || []);
                await sendEmail(env, order.customer_email, email.subject, email.html);
            }
        } catch (e) {
            console.error('Return refund email failed:', e.message);
        }
    }

    await env.DB.prepare("UPDATE returns SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, ret.id).run();
    return jsonResponse({ success: true, status }, corsHeaders);
}

// --- Comments ---

async function handleGetComments(orderId, env, corsHeaders) {
    const result = await env.DB.prepare('SELECT * FROM order_comments WHERE order_id = ? ORDER BY created_at ASC').bind(orderId).all();
    return jsonResponse({ comments: result.results }, corsHeaders);
}

async function handleAddComment(orderId, request, env, corsHeaders) {
    const body = await request.json();
    if (!body.comment || !body.comment.trim()) return jsonResponse({ error: 'Comment text is required' }, corsHeaders, 400);
    const result = await env.DB.prepare('INSERT INTO order_comments (order_id, comment) VALUES (?, ?)').bind(orderId, body.comment.trim()).run();

    // Send comment notification email
    try {
        const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
        if (order && order.customer_email) {
            const emailData = normalizeOrder(order);
            const email = orderCommentEmail(emailData, body.comment.trim());
            await sendEmail(env, order.customer_email, email.subject, email.html);
        }
    } catch (e) {
        console.error('Comment email failed:', e.message);
    }

    return jsonResponse({ success: true, id: result.meta.last_row_id }, corsHeaders);
}

// --- Refunds ---

async function handleRefundOrder(orderId, request, env, corsHeaders) {
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
    if (!order) return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);

    const body = await request.json();
    const { amount, comment } = body;

    if (!amount || amount <= 0) return jsonResponse({ error: 'Valid refund amount is required' }, corsHeaders, 400);
    if (amount > parseFloat(order.total)) return jsonResponse({ error: 'Refund amount exceeds order total' }, corsHeaders, 400);

    let stripeRefundId = null;
    let refundedByGateway = false;

    if (env.STRIPE_SECRET_KEY && order.stripe_payment_intent) {
        try {
            const refund = await stripeRequest(env.STRIPE_SECRET_KEY, '/refunds', 'POST', {
                payment_intent: order.stripe_payment_intent,
                amount: Math.round(amount * 100),
                reason: 'requested_by_customer'
            });
            stripeRefundId = refund.id;
            refundedByGateway = refund.status === 'succeeded';
        } catch (e) {
            return jsonResponse({ error: `Stripe refund failed: ${e.message}` }, corsHeaders, 502);
        }
    }

    await env.DB.prepare(
        'INSERT INTO order_refunds (order_id, stripe_refund_id, amount, comment, refunded_by_gateway) VALUES (?, ?, ?, ?, ?)'
    ).bind(orderId, stripeRefundId, amount, comment || '', refundedByGateway ? 1 : 0).run();

    const totalRefunds = await env.DB.prepare('SELECT SUM(amount) as total FROM order_refunds WHERE order_id = ?').bind(orderId).first();
    if (totalRefunds.total >= parseFloat(order.total)) {
        await env.DB.prepare('UPDATE orders SET status = \'refunded\', updated_at = datetime(\'now\') WHERE id = ?').bind(orderId).run();
    }

    // Send refund notification email
    try {
        if (order.customer_email) {
            const emailData = normalizeOrder(order);
            const allRefundsResult = await env.DB.prepare('SELECT * FROM order_refunds WHERE order_id = ? ORDER BY created_at DESC').bind(orderId).all();
            const refundInfo = { amount, comment: comment || '' };
            const email = refundEmail(emailData, refundInfo, allRefundsResult.results || []);
            await sendEmail(env, order.customer_email, email.subject, email.html);
        }
    } catch (e) {
        console.error('Refund email failed:', e.message);
    }

    return jsonResponse({ success: true, stripeRefundId, refundedByGateway, amount }, corsHeaders);
}

async function handleGetRefunds(orderId, env, corsHeaders) {
    const result = await env.DB.prepare('SELECT * FROM order_refunds WHERE order_id = ? ORDER BY created_at DESC').bind(orderId).all();
    return jsonResponse({ refunds: result.results }, corsHeaders);
}

// --- Cancellation ---

async function handleCancelOrder(orderId, request, env, corsHeaders) {
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
    if (!order) return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);
    if (order.status === 'cancelled') return jsonResponse({ error: 'Order is already cancelled' }, corsHeaders, 400);

    // Full refund via Stripe
    if (env.STRIPE_SECRET_KEY && order.stripe_payment_intent) {
        try {
            await stripeRequest(env.STRIPE_SECRET_KEY, '/refunds', 'POST', {
                payment_intent: order.stripe_payment_intent,
                reason: 'requested_by_customer'
            });
        } catch (e) {
            console.error('Stripe refund on cancel failed:', e.message);
        }
    }

    await env.DB.prepare('UPDATE orders SET status = \'cancelled\', updated_at = datetime(\'now\') WHERE id = ?').bind(orderId).run();

    // Restore inventory
    try {
        const items = JSON.parse(order.items);
        for (const item of items) {
            if (item.id) {
                await env.DB.prepare('UPDATE inventory SET stock_quantity = stock_quantity + ?, updated_at = datetime(\'now\') WHERE product_id = ?').bind(item.quantity || 1, item.id).run();
                await env.DB.prepare('INSERT INTO inventory_log (product_id, change_amount, reason) VALUES (?, ?, ?)').bind(item.id, item.quantity || 1, `Cancelled order #${order.invoice_number || order.id}`).run();
            }
        }
    } catch (e) {
        console.error('Inventory restore on cancel failed:', e.message);
    }

    return jsonResponse({ success: true, status: 'cancelled' }, corsHeaders);
}

// --- Inventory ---

async function handleListInventory(env, corsHeaders) {
    const result = await env.DB.prepare('SELECT * FROM inventory ORDER BY active DESC, product_name ASC').all();
    return jsonResponse({ products: result.results }, corsHeaders);
}

async function handleUpdateInventory(productId, request, env, corsHeaders) {
    const body = await request.json();
    const { stock_quantity, low_stock_threshold, reason, product_name, sku, price, description, short_description, long_description, image_url, weight, max_quantity } = body;

    const existing = await env.DB.prepare('SELECT * FROM inventory WHERE product_id = ?').bind(productId).first();
    if (!existing) return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);

    const updates = [];
    const params = [];

    if (stock_quantity !== undefined) {
        updates.push('stock_quantity = ?');
        params.push(stock_quantity);
        const changeAmount = stock_quantity - existing.stock_quantity;
        await env.DB.prepare('INSERT INTO inventory_log (product_id, change_amount, reason) VALUES (?, ?, ?)').bind(productId, changeAmount, reason || 'Manual adjustment').run();
    }

    if (low_stock_threshold !== undefined) { updates.push('low_stock_threshold = ?'); params.push(low_stock_threshold); }
    if (product_name !== undefined) { updates.push('product_name = ?'); params.push(product_name); }
    if (sku !== undefined) { updates.push('sku = ?'); params.push(sku); }
    if (price !== undefined) { updates.push('price = ?'); params.push(price); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (short_description !== undefined) { updates.push('short_description = ?'); params.push(short_description); }
    if (long_description !== undefined) { updates.push('long_description = ?'); params.push(long_description); }
    if (image_url !== undefined) { updates.push('image_url = ?'); params.push(image_url); }
    if (weight !== undefined) { updates.push('weight = ?'); params.push(weight); }
    if (max_quantity !== undefined) { updates.push('max_quantity = ?'); params.push(max_quantity); }

    if (updates.length === 0) return jsonResponse({ error: 'No fields to update' }, corsHeaders, 400);

    updates.push('updated_at = datetime(\'now\')');
    params.push(productId);

    await env.DB.prepare(`UPDATE inventory SET ${updates.join(', ')} WHERE product_id = ?`).bind(...params).run();
    return jsonResponse({ success: true }, corsHeaders);
}

async function handleAddInventoryProduct(request, env, corsHeaders) {
    const body = await request.json();
    const { product_id, product_name, sku, stock_quantity, low_stock_threshold, price, description, short_description, long_description, image_url } = body;

    if (!product_id || !product_name) return jsonResponse({ error: 'product_id and product_name are required' }, corsHeaders, 400);
    if (!price) return jsonResponse({ error: 'Price is required' }, corsHeaders, 400);

    try {
        await env.DB.prepare(
            'INSERT INTO inventory (product_id, product_name, sku, stock_quantity, low_stock_threshold, price, description, short_description, long_description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(product_id, product_name, sku || null, stock_quantity || 0, low_stock_threshold || 5, price || 0, description || null, short_description || null, long_description || null, image_url || null).run();

        if (stock_quantity && stock_quantity > 0) {
            await env.DB.prepare('INSERT INTO inventory_log (product_id, change_amount, reason) VALUES (?, ?, ?)').bind(product_id, stock_quantity, 'Initial stock').run();
        }

        return jsonResponse({ success: true }, corsHeaders);
    } catch (e) {
        if (e.message.includes('UNIQUE')) return jsonResponse({ error: 'Product already exists' }, corsHeaders, 409);
        throw e;
    }
}

async function handleGetInventoryLog(productId, env, corsHeaders) {
    const result = await env.DB.prepare('SELECT * FROM inventory_log WHERE product_id = ? ORDER BY created_at DESC LIMIT 50').bind(productId).all();
    return jsonResponse({ log: result.results }, corsHeaders);
}

// --- Image Management ---

async function handleImageUpload(productId, request, env, corsHeaders) {
    const product = await env.DB.prepare('SELECT images FROM inventory WHERE product_id = ?').bind(productId).first();
    if (!product) return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);

    const images = JSON.parse(product.images || '[]');
    if (images.length >= 8) return jsonResponse({ error: 'Maximum 8 images per product' }, corsHeaders, 400);

    const formData = await request.formData();
    const file = formData.get('image');
    if (!file) return jsonResponse({ error: 'No image provided' }, corsHeaders, 400);
    if (file.size > 5 * 1024 * 1024) return jsonResponse({ error: 'Image must be under 5MB' }, corsHeaders, 400);

    const ext = file.name.split('.').pop().toLowerCase();
    const key = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

    images.push(key);
    await env.DB.prepare('UPDATE inventory SET images = ?, updated_at = datetime(\'now\') WHERE product_id = ?').bind(JSON.stringify(images), productId).run();

    return jsonResponse({ success: true, key, index: images.length - 1 }, corsHeaders);
}

async function handleImageDelete(productId, index, env, corsHeaders) {
    const product = await env.DB.prepare('SELECT images FROM inventory WHERE product_id = ?').bind(productId).first();
    if (!product) return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);

    const images = JSON.parse(product.images || '[]');
    if (index < 0 || index >= images.length) return jsonResponse({ error: 'Invalid image index' }, corsHeaders, 400);

    await env.IMAGES.delete(images[index]);
    images.splice(index, 1);

    await env.DB.prepare('UPDATE inventory SET images = ?, updated_at = datetime(\'now\') WHERE product_id = ?').bind(JSON.stringify(images), productId).run();
    return jsonResponse({ success: true }, corsHeaders);
}

async function handleImageReorder(productId, request, env, corsHeaders) {
    const product = await env.DB.prepare('SELECT images FROM inventory WHERE product_id = ?').bind(productId).first();
    if (!product) return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);

    const images = JSON.parse(product.images || '[]');
    const { order } = await request.json();
    if (!Array.isArray(order) || order.length !== images.length) return jsonResponse({ error: 'Invalid order array' }, corsHeaders, 400);

    const reordered = order.map(i => images[i]);
    await env.DB.prepare('UPDATE inventory SET images = ?, updated_at = datetime(\'now\') WHERE product_id = ?').bind(JSON.stringify(reordered), productId).run();
    return jsonResponse({ success: true }, corsHeaders);
}

async function handleArchiveProduct(productId, request, env, corsHeaders) {
    const body = await request.json();
    const active = body.active !== undefined ? (body.active ? 1 : 0) : 0;
    const result = await env.DB.prepare('UPDATE inventory SET active = ?, updated_at = datetime(\'now\') WHERE product_id = ?').bind(active, productId).run();
    if (result.meta.changes === 0) return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);
    return jsonResponse({ success: true, active: !!active }, corsHeaders);
}

async function handleDeleteProduct(productId, env, corsHeaders) {
    await env.DB.prepare('DELETE FROM inventory_log WHERE product_id = ?').bind(productId).run();
    const result = await env.DB.prepare('DELETE FROM inventory WHERE product_id = ?').bind(productId).run();
    if (result.meta.changes === 0) return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);
    return jsonResponse({ success: true }, corsHeaders);
}

// --- Helpers ---

async function sendDiscordNotification(webhookUrl, orderData) {
    const { invoiceNumber, items, total, currency, shippingAddress, customerEmail } = orderData;
    const currencyUpper = (currency || 'GBP').toUpperCase();
    const itemList = items.map(item => `${item.name} x${item.quantity}`).join(', ');

    const address = [
        shippingAddress.address1, shippingAddress.address2,
        shippingAddress.city, shippingAddress.province,
        shippingAddress.postalCode, shippingAddress.country
    ].filter(Boolean).join(', ');

    await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            embeds: [{
                title: `New Order #${invoiceNumber}`,
                color: 0x48bb78,
                fields: [
                    { name: 'Customer', value: shippingAddress.name || customerEmail, inline: true },
                    { name: 'Total', value: `${currencyUpper} ${parseFloat(total).toFixed(2)}`, inline: true },
                    { name: 'Items', value: itemList, inline: false },
                    { name: 'Ship To', value: address, inline: false }
                ],
                footer: { text: 'FPVGate Shop' },
                timestamp: new Date().toISOString()
            }]
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
    try { return JSON.parse(str); } catch { return str; }
}

function jsonResponse(data, corsHeaders, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
