import { sendEmail } from './email.js';
import { createSupportTicket } from './support.js';

const MAX_BODY_BYTES = 20000;
const FIELD_LIMITS = {business: 160, contact: 120, email: 254, country: 100, website: 500, channels: 500, products: 500, quantity: 200, message: 4000};
const SUPPORT_FIELD_LIMITS = {contact:120, email:254, subject:200, order_reference:100, topic:100, message:4000};
const escapeHtml = value => value.replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));

export async function handleDistributorEnquiry(request, env, corsHeaders, kind = 'distributor') {
    const respond = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
    const origin = request.headers.get('Origin');
    if (origin && !['https://fpvgate.xyz', 'https://www.fpvgate.xyz', 'https://louishitchcock.github.io'].includes(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return respond({error: 'Please submit your enquiry from the FPVGate website.'}, 403);
    }
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return respond({error: 'Expected a JSON application.'}, 415);
    // Limit the stream itself, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return respond({error: 'Please complete the application.'}, 400);
    const chunks = []; let size = 0;
    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); return respond({error: 'Your application is too long.'}, 413); }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    let body;
    try {body = JSON.parse(new TextDecoder().decode(bytes));} catch {return respond({error: 'Invalid application format.'}, 400);}
    if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({error: 'Invalid application format.'}, 400);
    if (body.fax) return respond({success: true}); // Honeypot; never send bot submissions.
    const fields = {};
    for (const [key, limit] of Object.entries(kind === 'support' ? SUPPORT_FIELD_LIMITS : FIELD_LIMITS)) {
        if (body[key] !== undefined && typeof body[key] !== 'string') return respond({error: 'Invalid ' + key + ' field.'}, 400);
        fields[key] = (body[key] || '').trim();
        if (fields[key].length > limit) return respond({error: 'Please shorten the ' + key + ' field.'}, 400);
    }
    if (kind === 'support' ? (!fields.contact || !fields.subject || !fields.topic || !fields.message || /[\r\n]/.test(fields.subject)) : (!fields.business || !fields.contact || !fields.country || !fields.channels || !fields.products || !fields.quantity)) return respond({error: 'Please complete all required fields.'}, 400);
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fields.email) || /[\r\n]/.test(fields.email)) return respond({error: 'Please enter a valid email address.'}, 400);
    if (body.consent !== true) return respond({error: 'Please confirm we can contact you about this enquiry.'}, 400);
    if (fields.website) {
        try {if (!['https:', 'http:'].includes(new URL(fields.website).protocol)) throw new Error();}
        catch {return respond({error: 'Please enter a full website URL, starting with https:// or http://.'}, 400);}
    }
    const address = request.headers.get('CF-Connecting-IP');
    // Never bucket unrelated anonymous users together if the platform omits an IP.
    if (!address) return respond({error: 'Unable to submit this enquiry. Please email shop.fpvgate@gmail.com directly.'}, 503);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('enquiry:' + address));
    const key = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    const now = Math.floor(Date.now() / 1000);
    // Atomic fixed window: allow three attempts per IP per hour, including failures.
    const allowed = await env.DB.prepare(`INSERT INTO distributor_request_limits (ip_hash, window_start, request_count)
        VALUES (?, ?, 1) ON CONFLICT(ip_hash) DO UPDATE SET
        window_start = CASE WHEN window_start <= ? - 3600 THEN ? ELSE window_start END,
        request_count = CASE WHEN window_start <= ? - 3600 THEN 1 ELSE request_count + 1 END
        WHERE window_start <= ? - 3600 OR request_count < 3 RETURNING request_count`).bind(key, now, now, now, now, now).first();
    if (!allowed) return respond({error: 'Too many enquiries from this connection. Please try again in an hour or email shop.fpvgate@gmail.com.'}, 429);
    await env.DB.prepare('DELETE FROM distributor_request_limits WHERE window_start < ?').bind(now - 86400).run();
    const ticket = await createSupportTicket(env, {type:kind, subject:kind === 'support' ? fields.subject : 'Distributor enquiry: ' + fields.business.replace(/[\r\n]/g, ' '), contact:fields.contact, email:fields.email, message:fields.message, application:fields, notify:true});
    const labels = kind === 'support' ? {contact:'Contact',email:'Reply email',subject:'Subject',order_reference:'Order reference (unverified)',topic:'Topic',message:'Message'} : {business: 'Business', contact: 'Contact', email: 'Reply email', country: 'Country / markets', website: 'Website', channels: 'Sales channels', products: 'Products of interest', quantity: 'Opening order / restocking plans', message: 'Message'};
    const html = '<h1>' + (kind === 'support' ? 'Support enquiry ' : 'Distributor application ') + ticket.reference + '</h1><p>Saved in the FPVGate admin ticket inbox.</p>' + Object.entries(labels).map(([key, label]) => '<h2>' + label + '</h2><p>' + escapeHtml(fields[key] || 'Not provided').replace(/\n/g, '<br>') + '</p>').join('');
    // The durable ticket is the receipt; a notification outage must not encourage
    // applicants to submit duplicate tickets or claim their enquiry was lost.
    try {
        const sent = await sendEmail(env, 'shop.fpvgate@gmail.com', kind === 'support' ? 'FPVGate support enquiry' : 'FPVGate distributor application', html, {type: kind === 'support' ? 'support_enquiry' : 'distributor_enquiry', replyTo: fields.email});
        await env.DB.prepare('UPDATE support_tickets SET notification_status = ? WHERE id = ?').bind(sent ? 'sent' : 'failed', ticket.id).run();
    } catch { console.error('Distributor ticket saved; notification status unconfirmed:', ticket.reference); }
    return respond({success: true, reference:ticket.reference});
}
