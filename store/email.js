// FPVGate Transactional Email System
// Sends branded HTML emails via Resend API
// Templates converted from email-templates/*.html

// ─── Helpers ────────────────────────────────────────

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function money(amount, currency = 'gbp') {
    const n = parseFloat(amount) || 0;
    const sym = { gbp: '&pound;', usd: '$', eur: '&euro;' }[currency.toLowerCase()] || currency.toUpperCase() + ' ';
    return `${sym}${n.toFixed(2)}`;
}

function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
    if (!d) return '';
    const dt = new Date(d);
    const pad = n => String(n).padStart(2, '0');
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`;
}

function nl2br(str) {
    if (!str) return '';
    return esc(str).replace(/\n/g, '<br />');
}

// ─── Resend API ─────────────────────────────────────

export async function sendEmail(env, to, subject, html, meta = {}) {
    if (!env.RESEND_API_KEY) {
        console.error('RESEND_API_KEY not configured, email skipped');
        await logEmail(env, to, subject, 'skipped', 'RESEND_API_KEY not configured', meta);
        return false;
    }

    const from = env.FROM_EMAIL || 'FPVGate <orders@fpvgate.xyz>';

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ from, to, subject, html })
        });

        if (!res.ok) {
            const err = await res.text();
            console.error(`Resend error (${res.status}):`, err);
            await logEmail(env, to, subject, 'failed', err, meta);
            return false;
        }

        console.log(`Email sent: "${subject}" -> ${to}`);
        await logEmail(env, to, subject, 'sent', null, meta);
        return true;
    } catch (e) {
        console.error('Email send failed:', e.message);
        await logEmail(env, to, subject, 'failed', e.message, meta);
        return false;
    }
}

async function logEmail(env, to, subject, status, error, meta) {
    try {
        await env.DB.prepare(
            'INSERT INTO email_log (order_id, invoice_number, email_type, recipient, subject, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
            meta.orderId || null,
            meta.invoiceNumber || null,
            meta.type || 'unknown',
            to,
            subject,
            status,
            error || null
        ).run();
    } catch (e) {
        console.error('Email log failed:', e.message);
    }
}

// ─── Shared HTML ────────────────────────────────────

const HEADER = `                        <tr>
                            <td style="background: #0b1120; padding: 30px 40px; text-align: center;">
                                <h1 style="color: #00d4ff; margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 1px;">FPVGate</h1>
                            </td>
                        </tr>`;

const FOOTER = `                        <tr>
                            <td style="background: #f7fafc; padding: 25px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                                <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                                    Need help? Visit <a href="https://fpvgate.xyz/docs.html" style="color: #00d4ff; text-decoration: none;">our documentation</a> or open an <a href="https://github.com/LouisHitchcock/FPVGate/issues" style="color: #00d4ff; text-decoration: none;">issue on GitHub</a>.
                                </p>
                                <p style="margin: 10px 0 0; color: #cbd5e0; font-size: 11px;">Made with care for the FPV community</p>
                            </td>
                        </tr>`;

function wrap(innerRows) {
    return `<!DOCTYPE html>
<html>
<head></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 14px; color: #2d3748; margin: 0; padding: 0; background-color: #f5f7fa;">
    <center>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f7fa; padding: 20px 0;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
${HEADER}
${innerRows}
${FOOTER}
                    </table>
                </td>
            </tr>
        </table>
    </center>
</body>
</html>`;
}

// ─── Reusable Sections ──────────────────────────────

function orderInfoBar(invoiceNumber, date) {
    return `
                        <tr>
                            <td style="padding: 20px 40px;">
                                <table width="100%" cellpadding="0" cellspacing="0" style="background: #f7fafc; border-radius: 6px;">
                                    <tr>
                                        <td style="padding: 15px;">
                                            <span style="color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Order Number</span><br />
                                            <strong style="font-size: 16px; color: #1a202c;">${esc(invoiceNumber)}</strong>
                                        </td>
                                        <td align="right" style="padding: 15px;">
                                            <span style="color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Date</span><br />
                                            <strong style="font-size: 16px; color: #1a202c;">${fmtDate(date)}</strong>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>`;
}

function itemsTable(data) {
    const items = data.items || [];
    const cur = data.currency || 'gbp';

    const rows = items.map(item => `
                                    <tr>
                                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                                            <strong style="color: #1a202c;">${esc(item.name)}</strong><br />
                                            <span style="color: #a0aec0; font-size: 13px;">Qty: ${item.quantity}</span>
                                        </td>
                                        <td align="right" style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                                            <strong>${money(item.totalPrice || item.price * item.quantity, cur)}</strong>
                                        </td>
                                    </tr>`).join('');

    return `
                        <tr>
                            <td style="padding: 0 40px 20px;">
                                <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #718096; margin: 0 0 12px; font-weight: 600;">Items Ordered</h3>
                                <table width="100%" cellpadding="0" cellspacing="0">
${rows}
                                    <tr>
                                        <td style="padding: 12px 0 4px;">Subtotal</td>
                                        <td align="right" style="padding: 12px 0 4px;">${money(data.subtotal, cur)}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 4px 0; color: #718096;">${esc(data.shippingMethod || 'Shipping')}</td>
                                        <td align="right" style="padding: 4px 0; color: #718096;">${money(data.shippingFees, cur)}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 14px 0 0; border-top: 2px solid #1a202c;">
                                            <strong style="font-size: 16px; color: #1a202c;">Total</strong>
                                        </td>
                                        <td align="right" style="padding: 14px 0 0; border-top: 2px solid #1a202c;">
                                            <strong style="font-size: 16px; color: #1a202c;">${money(data.total, cur)}</strong>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>`;
}

function addressesRow(data) {
    const s = data.shippingAddress || {};
    const b = data.billingAddress || {};
    const ba = b.address || {};

    const billingHtml = [
        esc(b.name || data.customerName),
        esc(data.customerEmail),
        '',
        esc(ba.line1 || ''),
        ba.line2 ? esc(ba.line2) : null,
        [ba.city, ba.state, ba.country].filter(Boolean).map(esc).join(', '),
        esc(ba.postal_code || ''),
        b.phone ? esc(b.phone) : null
    ].filter(l => l !== null && l !== '').join('<br />');

    const shippingHtml = [
        esc(s.name || data.customerName),
        esc(s.address1 || ''),
        s.address2 ? esc(s.address2) : null,
        [s.city, s.province, s.country].filter(Boolean).map(esc).join(', '),
        esc(s.postalCode || ''),
        s.phone ? esc(s.phone) : null
    ].filter(l => l !== null && l !== '').join('<br />');

    return `
                        <tr>
                            <td style="padding: 0 40px 20px;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td width="50%" valign="top" style="padding-right: 15px;">
                                            <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #718096; margin: 0 0 10px; font-weight: 600;">Billing Address</h3>
                                            <p style="margin: 0; line-height: 1.6; color: #4a5568; font-size: 13px;">${billingHtml}</p>
                                        </td>
                                        <td width="50%" valign="top" style="padding-left: 15px;">
                                            <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #718096; margin: 0 0 10px; font-weight: 600;">Shipping To</h3>
                                            <p style="margin: 0; line-height: 1.6; color: #4a5568; font-size: 13px;">${shippingHtml}</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>`;
}

function paymentRow(data) {
    return `
                        <tr>
                            <td style="padding: 0 40px 20px;">
                                <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #718096; margin: 0 0 10px; font-weight: 600;">Payment</h3>
                                <p style="margin: 0; color: #4a5568;">
                                    Card payment via Stripe<br />
                                    <span style="color: #a0aec0; font-size: 13px;">${fmtDateTime(data.createdAt)}</span>
                                </p>
                            </td>
                        </tr>`;
}

// ─── Template: Order Confirmation ───────────────────

export function orderConfirmationEmail(data) {
    const html = wrap(
        `
                        <tr>
                            <td style="padding: 30px 40px 10px;">
                                <p style="margin: 0 0 10px; font-size: 16px;">Hi ${esc(data.customerName)},</p>
                                <p style="margin: 0; color: #718096;">Thank you for your order! Here's your confirmation.</p>
                            </td>
                        </tr>` +
        orderInfoBar(data.invoiceNumber, data.createdAt) +
        itemsTable(data) +
        addressesRow(data) +
        paymentRow(data)
    );

    return { subject: `Order ${data.invoiceNumber} - FPVGate`, html };
}

// ─── Template: Order Shipped ────────────────────────

export function orderShippedEmail(data) {
    const html = wrap(`
                        <tr>
                            <td style="padding: 30px 40px;">
                                <p style="margin: 0 0 15px; font-size: 16px;">Hi ${esc(data.customerName)},</p>
                                <p style="margin: 0 0 20px; color: #718096; line-height: 1.6;">
                                    Great news! Your order <strong style="color: #1a202c;">${esc(data.invoiceNumber)}</strong> has been shipped and is on its way to you.
                                </p>
                                <table width="100%" cellpadding="0" cellspacing="0" style="background: #c6f6d5; border-radius: 6px;">
                                    <tr>
                                        <td style="padding: 20px; text-align: center;">
                                            <strong style="color: #276749; font-size: 18px;">Order Shipped</strong>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>`);

    return { subject: `Your order ${data.invoiceNumber} is on its way! - FPVGate`, html };
}

// ─── Template: Tracking Number ──────────────────────

export function trackingNumberEmail(data) {
    const hasUrl = !!data.trackingUrl;
    const trackingDisplay = hasUrl
        ? `<a href="${esc(data.trackingUrl)}" target="_blank" style="color: #00d4ff; text-decoration: none; font-weight: 700;">${esc(data.trackingNumber)}</a>`
        : `<strong style="color: #1a202c;">${esc(data.trackingNumber)}</strong>`;

    const trackBtn = hasUrl ? `
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td align="center" style="padding-top: 10px;">
                                            <a href="${esc(data.trackingUrl)}" target="_blank" style="display: inline-block; background: #00d4ff; color: #0b1120; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Track Your Order</a>
                                        </td>
                                    </tr>
                                </table>` : '';

    const html = wrap(`
                        <tr>
                            <td style="padding: 30px 40px;">
                                <p style="margin: 0 0 15px; font-size: 16px;">Hi ${esc(data.customerName)},</p>
                                <p style="margin: 0 0 20px; color: #718096; line-height: 1.6;">
                                    Your order <strong style="color: #1a202c;">${esc(data.invoiceNumber)}</strong> has been shipped! Here are your tracking details.
                                </p>
                                <table width="100%" cellpadding="0" cellspacing="0" style="background: #f7fafc; border-radius: 6px;">
                                    <tr>
                                        <td style="padding: 20px;">
                                            <p style="margin: 0 0 8px; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Shipping Method</p>
                                            <p style="margin: 0 0 15px; color: #1a202c; font-weight: 600;">${esc(data.shippingMethod || 'Standard')}</p>
                                            <p style="margin: 0 0 8px; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Tracking Number</p>
                                            <p style="margin: 0; font-size: 18px;">${trackingDisplay}</p>
                                        </td>
                                    </tr>
                                </table>
${trackBtn}
                            </td>
                        </tr>`);

    return { subject: `Tracking info for order ${data.invoiceNumber} - FPVGate`, html };
}

// ─── Template: Order Comment ────────────────────────

export function orderCommentEmail(data, commentText) {
    const html = wrap(`
                        <tr>
                            <td style="padding: 30px 40px;">
                                <p style="margin: 0 0 15px; font-size: 16px;">Hi ${esc(data.customerName)},</p>
                                <p style="margin: 0 0 20px; color: #718096; line-height: 1.6;">
                                    A message has been added to your order <strong style="color: #1a202c;">${esc(data.invoiceNumber)}</strong>.
                                </p>
                                <table width="100%" cellpadding="0" cellspacing="0" style="background: #f7fafc; border-radius: 6px; border-left: 4px solid #00d4ff;">
                                    <tr>
                                        <td style="padding: 20px;">
                                            <div style="color: #4a5568; line-height: 1.6;">${nl2br(commentText)}</div>
                                        </td>
                                    </tr>
                                </table>
                                <p style="margin: 20px 0 0; color: #718096; font-size: 13px;">
                                    If you have any questions regarding this message, reply to this email directly.
                                </p>
                            </td>
                        </tr>`);

    return { subject: `Update on your order ${data.invoiceNumber} - FPVGate`, html };
}

// ─── Template: Refund ───────────────────────────────

export function refundEmail(data, refund, allRefunds) {
    const cur = data.currency || 'gbp';
    const totalRefunded = (allRefunds || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const adjusted = Math.max(0, parseFloat(data.total) - totalRefunded);
    const isFullRefund = adjusted <= 0;

    const message = isFullRefund
        ? "We've fully refunded your order. You can find the details below."
        : `${money(refund.amount, cur)} has been refunded on your order. You can find the details below.`;

    const commentBlock = refund.comment
        ? `
                                <p style="margin: 15px 0 0; padding: 15px; background: #f7fafc; border-radius: 6px; border-left: 4px solid #00d4ff; color: #4a5568;">
                                    ${nl2br(refund.comment)}
                                </p>` : '';

    const refundRows = (allRefunds || []).map(r => `
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${fmtDate(r.created_at)}</td>
                                        <td align="right" style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${money(r.amount, cur)}</td>
                                    </tr>`).join('');

    const html = wrap(
        `
                        <tr>
                            <td style="padding: 30px 40px 10px;">
                                <p style="margin: 0 0 10px; font-size: 16px;">Hi ${esc(data.customerName)},</p>
                                <p style="margin: 0; color: #718096;">${message}</p>${commentBlock}
                            </td>
                        </tr>` +
        orderInfoBar(data.invoiceNumber, data.createdAt) +
        itemsTable(data) +
        `
                        <tr>
                            <td style="padding: 0 40px 20px;">
                                <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #718096; margin: 0 0 10px; font-weight: 600;">Refunds</h3>
                                <table width="100%" cellpadding="0" cellspacing="0">
${refundRows}
                                    <tr>
                                        <td style="padding: 12px 0;">
                                            <strong style="font-size: 16px;">Adjusted total:</strong>
                                        </td>
                                        <td align="right" style="padding: 12px 0;">
                                            <strong style="font-size: 16px;">${money(adjusted, cur)}</strong>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>` +
        paymentRow(data)
    );

    return { subject: `Refund notice for order ${data.invoiceNumber} - FPVGate`, html };
}

// ─── Template: Return Label ─────────────────────────

export function returnLabelEmail(data) {
    const itemsList = (data.returnItems || data.items || []).map(i =>
        `${esc(i.name)} x${i.quantity}`
    ).join(', ');

    const html = wrap(`
                        <tr>
                            <td style="padding: 30px 40px;">
                                <p style="margin: 0 0 15px; font-size: 16px;">Hi ${esc(data.customerName)},</p>
                                <p style="margin: 0 0 20px; color: #718096; line-height: 1.6;">
                                    A return has been arranged for your order <strong style="color: #1a202c;">${esc(data.invoiceNumber)}</strong>. Please find your prepaid return label below.
                                </p>

                                <table width="100%" cellpadding="0" cellspacing="0" style="background: #f7fafc; border-radius: 6px; margin-bottom: 20px;">
                                    <tr>
                                        <td style="padding: 20px;">
                                            <p style="margin: 0 0 8px; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Items to Return</p>
                                            <p style="margin: 0 0 15px; color: #1a202c; font-weight: 600;">${esc(itemsList) || 'All items'}</p>
                                            ${data.reason ? `<p style="margin: 0 0 8px; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Reason</p><p style="margin: 0 0 15px; color: #1a202c;">${esc(data.reason)}</p>` : ''}
                                            ${data.trackingNumber ? `<p style="margin: 0 0 8px; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Return Tracking Number</p><p style="margin: 0; font-size: 18px;"><strong style="color: #1a202c;">${esc(data.trackingNumber)}</strong></p>` : ''}
                                        </td>
                                    </tr>
                                </table>

                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td align="center">
                                            <a href="${esc(data.labelUrl)}" target="_blank" style="display: inline-block; background: #00d4ff; color: #0b1120; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Download Return Label (PDF)</a>
                                        </td>
                                    </tr>
                                </table>

                                <div style="margin-top: 24px; padding: 16px; background: #fffaf0; border-radius: 6px; border-left: 4px solid #ed8936;">
                                    <p style="margin: 0 0 8px; font-weight: 600; color: #744210; font-size: 13px;">Return Instructions</p>
                                    <ol style="margin: 0; padding-left: 20px; color: #744210; font-size: 13px; line-height: 1.8;">
                                        <li>Print the return label from the link above</li>
                                        <li>Pack the item(s) securely in their original packaging if possible</li>
                                        <li>Attach the return label to the outside of the package</li>
                                        <li>Drop the package off at your nearest post office</li>
                                    </ol>
                                </div>

                                <p style="margin: 20px 0 0; color: #718096; font-size: 13px;">
                                    Once we receive your return, we'll process your refund. If you have any questions, reply to this email directly.
                                </p>
                            </td>
                        </tr>`);

    return { subject: `Return label for order ${data.invoiceNumber} - FPVGate`, html };
}

// ─── Order Data Normalizer ──────────────────────────

export function normalizeOrder(row) {
    const shipping = typeof row.shipping_address === 'string' ? JSON.parse(row.shipping_address) : (row.shipping_address || {});
    const billing = typeof row.billing_address === 'string' ? JSON.parse(row.billing_address) : (row.billing_address || {});
    const items = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);

    return {
        invoiceNumber: row.invoice_number,
        customerName: shipping.name || row.customer_name || 'Customer',
        customerEmail: row.customer_email,
        items,
        subtotal: row.subtotal,
        shippingFees: row.shipping_fees || 0,
        shippingMethod: row.shipping_method || 'Standard',
        total: row.total,
        currency: row.currency || 'gbp',
        trackingNumber: row.tracking_number,
        createdAt: row.created_at,
        shippingAddress: shipping,
        billingAddress: billing
    };
}
