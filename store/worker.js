// Cloudflare Worker - FPVGate Shop API
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
'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

            // --- Public Products API (for Snipcart validation + shop page) ---

            if (url.pathname === '/products' && request.method === 'GET') {
                const result = await env.DB.prepare(
                    'SELECT product_id, product_name, price, description, image_url, images, weight, max_quantity, stock_quantity, low_stock_threshold, active FROM inventory WHERE active = 1 ORDER BY product_name ASC'
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

                // GET /api/orders/:id/comments - List order comments
                const commentsGetMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/comments$/);
                if (commentsGetMatch && request.method === 'GET') {
                    return await handleGetComments(commentsGetMatch[1], env, corsHeaders);
                }

                // POST /api/orders/:id/comments - Add order comment
                const commentsPostMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/comments$/);
                if (commentsPostMatch && request.method === 'POST') {
                    return await handleAddComment(commentsPostMatch[1], request, env, corsHeaders);
                }

                // POST /api/orders/:id/refund - Issue refund via Snipcart
                const refundMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/refund$/);
                if (refundMatch && request.method === 'POST') {
                    return await handleRefundOrder(refundMatch[1], request, env, corsHeaders);
                }

                // GET /api/orders/:id/refunds - List refunds for an order
                const refundsListMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/refunds$/);
                if (refundsListMatch && request.method === 'GET') {
                    return await handleGetRefunds(refundsListMatch[1], env, corsHeaders);
                }

                // POST /api/orders/:id/cancel - Cancel order via Snipcart
                const cancelMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/cancel$/);
                if (cancelMatch && request.method === 'POST') {
                    return await handleCancelOrder(cancelMatch[1], request, env, corsHeaders);
                }

                // GET /api/inventory - List all inventory
                if (url.pathname === '/api/inventory' && request.method === 'GET') {
                    return await handleListInventory(env, corsHeaders);
                }

                // GET /api/inventory/:productId - Get single product
                const inventoryGetMatch = url.pathname.match(/^\/api\/inventory\/([\w-]+)$/);
                if (inventoryGetMatch && request.method === 'GET') {
                    const product = await env.DB.prepare('SELECT * FROM inventory WHERE product_id = ?').bind(inventoryGetMatch[1]).first();
                    if (!product) return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);
                    return jsonResponse(product, corsHeaders);
                }

                // PUT /api/inventory/:productId - Update stock
                const inventoryUpdateMatch = url.pathname.match(/^\/api\/inventory\/([\w-]+)$/);
                if (inventoryUpdateMatch && request.method === 'PUT') {
                    return await handleUpdateInventory(inventoryUpdateMatch[1], request, env, corsHeaders);
                }

                // POST /api/inventory - Add new product to inventory
                if (url.pathname === '/api/inventory' && request.method === 'POST') {
                    return await handleAddInventoryProduct(request, env, corsHeaders);
                }

                // GET /api/inventory/:productId/log - Get stock change history
                const inventoryLogMatch = url.pathname.match(/^\/api\/inventory\/([\w-]+)\/log$/);
                if (inventoryLogMatch && request.method === 'GET') {
                    return await handleGetInventoryLog(inventoryLogMatch[1], env, corsHeaders);
                }

                // POST /api/inventory/:productId/images - Upload image
                const imgUploadMatch = url.pathname.match(/^\/api\/inventory\/([\w-]+)\/images$/);
                if (imgUploadMatch && request.method === 'POST') {
                    return await handleImageUpload(imgUploadMatch[1], request, env, corsHeaders);
                }

                // DELETE /api/inventory/:productId/images/:index - Delete image
                const imgDeleteMatch = url.pathname.match(/^\/api\/inventory\/([\w-]+)\/images\/(\d+)$/);
                if (imgDeleteMatch && request.method === 'DELETE') {
                    return await handleImageDelete(imgDeleteMatch[1], parseInt(imgDeleteMatch[2]), env, corsHeaders);
                }

                // POST /api/inventory/:productId/images/reorder - Reorder images
                const imgReorderMatch = url.pathname.match(/^\/api\/inventory\/([\w-]+)\/images\/reorder$/);
                if (imgReorderMatch && request.method === 'POST') {
                    return await handleImageReorder(imgReorderMatch[1], request, env, corsHeaders);
                }

                // POST /api/inventory/:productId/archive - Toggle archive
                const archiveMatch = url.pathname.match(/^\/api\/inventory\/([\w-]+)\/archive$/);
                if (archiveMatch && request.method === 'POST') {
                    return await handleArchiveProduct(archiveMatch[1], request, env, corsHeaders);
                }

                // DELETE /api/inventory/:productId - Delete product
                const deleteMatch = url.pathname.match(/^\/api\/inventory\/([\w-]+)$/);
                if (deleteMatch && request.method === 'DELETE') {
                    return await handleDeleteProduct(deleteMatch[1], env, corsHeaders);
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

    // Auto-decrement inventory
    try {
        for (const item of order.items) {
            const productId = item.id || item.uniqueId;
            if (productId) {
                await env.DB.prepare(
                    'UPDATE inventory SET stock_quantity = stock_quantity - ?, updated_at = datetime(\'now\') WHERE product_id = ?'
                ).bind(item.quantity || 1, productId).run();

                await env.DB.prepare(
                    'INSERT INTO inventory_log (product_id, change_amount, reason) VALUES (?, ?, ?)'
                ).bind(productId, -(item.quantity || 1), `Order #${order.invoiceNumber || order.token.slice(0, 8)}`).run();
            }
        }
    } catch (e) {
        console.error('Inventory update failed:', e.message);
    }

    // Send Discord notification
    if (env.DISCORD_WEBHOOK_URL) {
        try {
            await sendDiscordNotification(env.DISCORD_WEBHOOK_URL, order);
        } catch (e) {
            console.error('Discord notification failed:', e.message);
        }
    }

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

    const validStatuses = ['new', 'label_created', 'shipped', 'completed', 'cancelled', 'refunded'];
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

// --- Order Comments ---

async function handleGetComments(orderId, env, corsHeaders) {
    const result = await env.DB.prepare(
        'SELECT * FROM order_comments WHERE order_id = ? ORDER BY created_at ASC'
    ).bind(orderId).all();

    return jsonResponse({ comments: result.results }, corsHeaders);
}

async function handleAddComment(orderId, request, env, corsHeaders) {
    const body = await request.json();
    const { comment } = body;

    if (!comment || !comment.trim()) {
        return jsonResponse({ error: 'Comment text is required' }, corsHeaders, 400);
    }

    const result = await env.DB.prepare(
        'INSERT INTO order_comments (order_id, comment) VALUES (?, ?)'
    ).bind(orderId, comment.trim()).run();

    return jsonResponse({ success: true, id: result.meta.last_row_id }, corsHeaders);
}

// --- Refunds ---

async function handleRefundOrder(orderId, request, env, corsHeaders) {
    const order = await env.DB.prepare(
        'SELECT * FROM orders WHERE id = ?'
    ).bind(orderId).first();

    if (!order) {
        return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);
    }

    const body = await request.json();
    const { amount, comment } = body;

    if (!amount || amount <= 0) {
        return jsonResponse({ error: 'Valid refund amount is required' }, corsHeaders, 400);
    }

    if (amount > parseFloat(order.total)) {
        return jsonResponse({ error: 'Refund amount exceeds order total' }, corsHeaders, 400);
    }

    let snipcartRefundId = null;
    let refundedByGateway = false;

    // Issue refund via Snipcart API
    if (env.SNIPCART_SECRET_KEY && order.snipcart_token) {
        try {
            const credentials = btoa(env.SNIPCART_SECRET_KEY + ':');
            const snipcartResp = await fetch(
                `https://app.snipcart.com/api/v1/orders/${order.snipcart_token}/refunds`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ amount, comment: comment || '' })
                }
            );

            if (snipcartResp.ok) {
                const refundData = await snipcartResp.json();
                snipcartRefundId = refundData.id;
                refundedByGateway = refundData.refundedByPaymentGateway || false;
            } else {
                const errText = await snipcartResp.text();
                return jsonResponse({ error: `Snipcart refund failed: ${errText}` }, corsHeaders, 502);
            }
        } catch (e) {
            return jsonResponse({ error: `Snipcart refund failed: ${e.message}` }, corsHeaders, 502);
        }
    }

    // Store refund locally
    await env.DB.prepare(
        'INSERT INTO order_refunds (order_id, snipcart_refund_id, amount, comment, refunded_by_gateway) VALUES (?, ?, ?, ?, ?)'
    ).bind(orderId, snipcartRefundId, amount, comment || '', refundedByGateway ? 1 : 0).run();

    // Update order status if full refund
    const totalRefunds = await env.DB.prepare(
        'SELECT SUM(amount) as total FROM order_refunds WHERE order_id = ?'
    ).bind(orderId).first();

    if (totalRefunds.total >= parseFloat(order.total)) {
        await env.DB.prepare(
            'UPDATE orders SET status = \'refunded\', updated_at = datetime(\'now\') WHERE id = ?'
        ).bind(orderId).run();
    }

    return jsonResponse({
        success: true,
        snipcartRefundId,
        refundedByGateway,
        amount
    }, corsHeaders);
}

async function handleGetRefunds(orderId, env, corsHeaders) {
    const result = await env.DB.prepare(
        'SELECT * FROM order_refunds WHERE order_id = ? ORDER BY created_at DESC'
    ).bind(orderId).all();

    return jsonResponse({ refunds: result.results }, corsHeaders);
}

// --- Order Cancellation ---

async function handleCancelOrder(orderId, request, env, corsHeaders) {
    const order = await env.DB.prepare(
        'SELECT * FROM orders WHERE id = ?'
    ).bind(orderId).first();

    if (!order) {
        return jsonResponse({ error: 'Order not found' }, corsHeaders, 404);
    }

    if (order.status === 'cancelled') {
        return jsonResponse({ error: 'Order is already cancelled' }, corsHeaders, 400);
    }

    // Cancel via Snipcart API
    if (env.SNIPCART_SECRET_KEY && order.snipcart_token) {
        try {
            const credentials = btoa(env.SNIPCART_SECRET_KEY + ':');
            const snipcartResp = await fetch(
                `https://app.snipcart.com/api/orders/${order.snipcart_token}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ status: 'Cancelled' })
                }
            );

            if (!snipcartResp.ok) {
                const errText = await snipcartResp.text();
                console.error('Snipcart cancel failed:', errText);
            }
        } catch (e) {
            console.error('Snipcart cancel failed:', e.message);
        }
    }

    // Update local status
    await env.DB.prepare(
        'UPDATE orders SET status = \'cancelled\', updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(orderId).run();

    // Restore inventory
    try {
        const items = JSON.parse(order.items);
        for (const item of items) {
            const productId = item.id;
            if (productId) {
                await env.DB.prepare(
                    'UPDATE inventory SET stock_quantity = stock_quantity + ?, updated_at = datetime(\'now\') WHERE product_id = ?'
                ).bind(item.quantity || 1, productId).run();

                await env.DB.prepare(
                    'INSERT INTO inventory_log (product_id, change_amount, reason) VALUES (?, ?, ?)'
                ).bind(productId, item.quantity || 1, `Cancelled order #${order.invoice_number || order.id}`).run();
            }
        }
    } catch (e) {
        console.error('Inventory restore on cancel failed:', e.message);
    }

    return jsonResponse({ success: true, status: 'cancelled' }, corsHeaders);
}

// --- Inventory ---

async function handleListInventory(env, corsHeaders) {
    const result = await env.DB.prepare(
        'SELECT * FROM inventory ORDER BY active DESC, product_name ASC'
    ).all();

    return jsonResponse({ products: result.results }, corsHeaders);
}

async function handleUpdateInventory(productId, request, env, corsHeaders) {
    const body = await request.json();
    const { stock_quantity, low_stock_threshold, reason, product_name, sku, price, description, image_url, weight, max_quantity } = body;

    const existing = await env.DB.prepare(
        'SELECT * FROM inventory WHERE product_id = ?'
    ).bind(productId).first();

    if (!existing) {
        return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);
    }

    const updates = [];
    const params = [];

    if (stock_quantity !== undefined) {
        updates.push('stock_quantity = ?');
        params.push(stock_quantity);
        const changeAmount = stock_quantity - existing.stock_quantity;
        await env.DB.prepare(
            'INSERT INTO inventory_log (product_id, change_amount, reason) VALUES (?, ?, ?)'
        ).bind(productId, changeAmount, reason || 'Manual adjustment').run();
    }

    if (low_stock_threshold !== undefined) { updates.push('low_stock_threshold = ?'); params.push(low_stock_threshold); }
    if (product_name !== undefined) { updates.push('product_name = ?'); params.push(product_name); }
    if (sku !== undefined) { updates.push('sku = ?'); params.push(sku); }
    if (price !== undefined) { updates.push('price = ?'); params.push(price); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (image_url !== undefined) { updates.push('image_url = ?'); params.push(image_url); }
    if (weight !== undefined) { updates.push('weight = ?'); params.push(weight); }
    if (max_quantity !== undefined) { updates.push('max_quantity = ?'); params.push(max_quantity); }

    if (updates.length === 0) {
        return jsonResponse({ error: 'No fields to update' }, corsHeaders, 400);
    }

    updates.push('updated_at = datetime(\'now\')');
    params.push(productId);

    await env.DB.prepare(
        `UPDATE inventory SET ${updates.join(', ')} WHERE product_id = ?`
    ).bind(...params).run();

    return jsonResponse({ success: true }, corsHeaders);
}

async function handleAddInventoryProduct(request, env, corsHeaders) {
    const body = await request.json();
    const { product_id, product_name, sku, stock_quantity, low_stock_threshold, price, description, image_url } = body;

    if (!product_id || !product_name) {
        return jsonResponse({ error: 'product_id and product_name are required' }, corsHeaders, 400);
    }

    try {
        await env.DB.prepare(
            'INSERT INTO inventory (product_id, product_name, sku, stock_quantity, low_stock_threshold, price, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(product_id, product_name, sku || null, stock_quantity || 0, low_stock_threshold || 5, price || 0, description || null, image_url || null).run();

        // Log initial stock
        if (stock_quantity && stock_quantity > 0) {
            await env.DB.prepare(
                'INSERT INTO inventory_log (product_id, change_amount, reason) VALUES (?, ?, ?)'
            ).bind(product_id, stock_quantity, 'Initial stock').run();
        }

        return jsonResponse({ success: true }, corsHeaders);
    } catch (e) {
        if (e.message.includes('UNIQUE')) {
            return jsonResponse({ error: 'Product already exists' }, corsHeaders, 409);
        }
        throw e;
    }
}

async function handleGetInventoryLog(productId, env, corsHeaders) {
    const result = await env.DB.prepare(
        'SELECT * FROM inventory_log WHERE product_id = ? ORDER BY created_at DESC LIMIT 50'
    ).bind(productId).all();

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

    await env.IMAGES.put(key, file.stream(), {
        httpMetadata: { contentType: file.type }
    });

    images.push(key);
    await env.DB.prepare('UPDATE inventory SET images = ?, updated_at = datetime(\'now\') WHERE product_id = ?')
        .bind(JSON.stringify(images), productId).run();

    return jsonResponse({ success: true, key, index: images.length - 1 }, corsHeaders);
}

async function handleImageDelete(productId, index, env, corsHeaders) {
    const product = await env.DB.prepare('SELECT images FROM inventory WHERE product_id = ?').bind(productId).first();
    if (!product) return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);

    const images = JSON.parse(product.images || '[]');
    if (index < 0 || index >= images.length) return jsonResponse({ error: 'Invalid image index' }, corsHeaders, 400);

    const key = images[index];
    await env.IMAGES.delete(key);
    images.splice(index, 1);

    await env.DB.prepare('UPDATE inventory SET images = ?, updated_at = datetime(\'now\') WHERE product_id = ?')
        .bind(JSON.stringify(images), productId).run();

    return jsonResponse({ success: true }, corsHeaders);
}

async function handleImageReorder(productId, request, env, corsHeaders) {
    const product = await env.DB.prepare('SELECT images FROM inventory WHERE product_id = ?').bind(productId).first();
    if (!product) return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);

    const images = JSON.parse(product.images || '[]');
    const { order } = await request.json();
    if (!Array.isArray(order) || order.length !== images.length) return jsonResponse({ error: 'Invalid order array' }, corsHeaders, 400);

    const reordered = order.map(i => images[i]);
    await env.DB.prepare('UPDATE inventory SET images = ?, updated_at = datetime(\'now\') WHERE product_id = ?')
        .bind(JSON.stringify(reordered), productId).run();

    return jsonResponse({ success: true }, corsHeaders);
}

async function handleArchiveProduct(productId, request, env, corsHeaders) {
    const body = await request.json();
    const active = body.active !== undefined ? (body.active ? 1 : 0) : 0;

    const result = await env.DB.prepare(
        'UPDATE inventory SET active = ?, updated_at = datetime(\'now\') WHERE product_id = ?'
    ).bind(active, productId).run();

    if (result.meta.changes === 0) {
        return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);
    }

    return jsonResponse({ success: true, active: !!active }, corsHeaders);
}

async function handleDeleteProduct(productId, env, corsHeaders) {
    await env.DB.prepare('DELETE FROM inventory_log WHERE product_id = ?').bind(productId).run();
    const result = await env.DB.prepare('DELETE FROM inventory WHERE product_id = ?').bind(productId).run();

    if (result.meta.changes === 0) {
        return jsonResponse({ error: 'Product not found' }, corsHeaders, 404);
    }

    return jsonResponse({ success: true }, corsHeaders);
}

// --- Helpers ---

async function sendDiscordNotification(webhookUrl, order) {
    const total = order.finalGrandTotal || order.grandTotal;
    const currency = (order.currency || 'GBP').toUpperCase();
    const itemList = order.items
        .map(item => `${item.name} x${item.quantity}`)
        .join(', ');

    const address = [
        order.shippingAddressAddress1,
        order.shippingAddressAddress2,
        order.shippingAddressCity,
        order.shippingAddressProvince,
        order.shippingAddressPostalCode,
        order.shippingAddressCountry
    ].filter(Boolean).join(', ');

    await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            embeds: [{
                title: `New Order #${order.invoiceNumber || order.token.slice(0, 8)}`,
                color: 0x48bb78,
                fields: [
                    { name: 'Customer', value: order.shippingAddressName || order.email, inline: true },
                    { name: 'Total', value: `${currency} ${parseFloat(total).toFixed(2)}`, inline: true },
                    { name: 'Items', value: itemList, inline: false },
                    { name: 'Ship To', value: address, inline: false }
                ],
                footer: { text: 'FPVGate Shop' },
                timestamp: new Date().toISOString()
            }]
        })
    });
}

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
