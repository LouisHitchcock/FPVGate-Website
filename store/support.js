import { sendEmail } from './email.js';

const SUPPORT_EMAIL = 'shop.fpvgate@gmail.com';
const supportEscape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const SUPPORT_STATUSES = ['new', 'open', 'waiting', 'resolved'];

export async function createSupportTicket(env, {type = 'support', subject, contact, email, message, application = null, notify = false}) {
    const id = crypto.randomUUID();
    const reference = 'FPV-' + id.replaceAll('-', '').slice(0, 12).toUpperCase();
    await env.DB.batch([
        env.DB.prepare('INSERT INTO support_tickets (id, reference, type, subject, contact_name, email, application, notification_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(id, reference, type, subject, contact, email, application ? JSON.stringify(application) : null, type === 'distributor' || notify ? 'pending' : 'not_required'),
        env.DB.prepare('INSERT INTO support_messages (id, ticket_id, kind, body) VALUES (?, ?, ?, ?)')
            .bind(crypto.randomUUID(), id, 'application', message || 'Distributor application received.')
    ]);
    return {id, reference};
}

// This handler is mounted only after the store Worker's admin authentication.
export async function handleSupportAdmin(request, env, corsHeaders) {
    const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers:{...corsHeaders, 'Content-Type':'application/json', 'Cache-Control':'no-store'}});
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/tickets(?:\/([a-f0-9-]+)(?:\/(messages|order))?)?$/);
    if (!match) return json({error:'Not found'}, 404);
    const [, id, action] = match;
    if (!id && request.method === 'GET') {
        const status = url.searchParams.get('status');
        const type = url.searchParams.get('type');
        const search = (url.searchParams.get('q') || '').trim().slice(0, 200);
        const offset = Math.max(0, Math.min(100000, Number.parseInt(url.searchParams.get('offset'), 10) || 0));
        if (status && !SUPPORT_STATUSES.includes(status)) return json({error:'Invalid status'}, 400);
        if (type && !['distributor','support'].includes(type)) return json({error:'Invalid ticket type'}, 400);
        const where = [], params = [];
        if (status) {where.push('status = ?'); params.push(status);}
        if (type) {where.push('type = ?'); params.push(type);}
        if (search) {where.push('(subject LIKE ? OR contact_name LIKE ? OR email LIKE ? OR reference LIKE ?)'); params.push(...Array(4).fill('%' + search + '%'));}
        const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
        const [tickets, total, counts] = await Promise.all([
            env.DB.prepare('SELECT id, reference, type, status, subject, contact_name, email, notification_status, created_at, updated_at FROM support_tickets' + clause + ' ORDER BY updated_at DESC, id DESC LIMIT 50 OFFSET ?').bind(...params, offset).all(),
            env.DB.prepare('SELECT COUNT(*) AS count FROM support_tickets' + clause).bind(...params).first(),
            env.DB.prepare('SELECT status, COUNT(*) AS count FROM support_tickets GROUP BY status').all()
        ]);
        return json({tickets:tickets.results || [], total:total.count, counts:counts.results || [], offset});
    }
    if (!id && request.method === 'POST') {
        const body = await request.json();
        const clean = name => typeof body[name] === 'string' ? body[name].trim() : '';
        const subject = clean('subject'), contact = clean('contact'), email = clean('email'), message = clean('message');
        if (!subject || subject.length > 200 || /[\r\n]/.test(subject) || !contact || contact.length > 120 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 254 || !message || message.length > 8000) return json({error:'Enter a name, valid email, subject and message (up to 8,000 characters).'},400);
        return json(await createSupportTicket(env,{subject,contact,email,message}));
    }
    if (!id) return json({error:'Method not allowed'},405);
    const ticket = await env.DB.prepare('SELECT * FROM support_tickets WHERE id = ?').bind(id).first();
    if (!ticket) return json({error:'Ticket not found'},404);
    if (request.method === 'GET' && !action) {
        const messages = await env.DB.prepare('SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC, rowid ASC').bind(id).all();
        const order = ticket.linked_order_id ? await env.DB.prepare('SELECT id, invoice_number, customer_email, items FROM orders WHERE id = ?').bind(ticket.linked_order_id).first() : null;
        if (order) order.items = JSON.parse(order.items || '[]');
        return json({ticket:{...ticket, application:ticket.application ? JSON.parse(ticket.application) : null},messages:messages.results || [],order});
    }
    if (request.method === 'PUT' && action === 'order') {
        const body = await request.json();
        const reference = typeof body.order_reference === 'string' ? body.order_reference.trim() : '';
        if (!reference || reference.length > 100) return json({error:'Enter the order reference to link.'},400);
        const order = await env.DB.prepare('SELECT id, invoice_number, customer_email FROM orders WHERE invoice_number = ? OR CAST(id AS TEXT) = ?').bind(reference,reference).first();
        if (!order || order.customer_email.trim().toLowerCase() !== ticket.email.trim().toLowerCase()) return json({error:'No matching order for this ticket email. Verify the checkout email and reference before linking.'},400);
        await env.DB.batch([
            env.DB.prepare("UPDATE support_tickets SET linked_order_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(order.id,id),
            env.DB.prepare('INSERT INTO support_messages (id,ticket_id,kind,body) VALUES (?,?,?,?)').bind(crypto.randomUUID(),id,'note','Admin linked order '+(order.invoice_number || order.id))
        ]);
        return json({success:true});
    }
    if (request.method === 'PUT' && !action) {
        const body = await request.json();
        if (!SUPPORT_STATUSES.includes(body.status)) return json({error:'Invalid status'},400);
        await env.DB.batch([
            env.DB.prepare("UPDATE support_tickets SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(body.status,id),
            env.DB.prepare('INSERT INTO support_messages (id,ticket_id,kind,body) VALUES (?,?,?,?)').bind(crypto.randomUUID(),id,'status','Status changed to ' + body.status)
        ]);
        return json({success:true});
    }
    if (request.method === 'POST' && action === 'messages') {
        const body = await request.json();
        const text = typeof body.body === 'string' ? body.body.trim() : '';
        if (!['note','reply'].includes(body.kind) || !text || text.length > 8000) return json({error:'Choose an internal note or reply and enter a message up to 8,000 characters.'},400);
        if (body.kind === 'reply' && !env.RESEND_API_KEY) return json({error:'Email is not configured. Nothing was sent.'},503);
        const messageId = crypto.randomUUID();
        await env.DB.batch([
            env.DB.prepare('INSERT INTO support_messages (id,ticket_id,kind,body,delivery_status) VALUES (?,?,?,?,?)').bind(messageId,id,body.kind,text,body.kind === 'reply' ? 'pending' : null),
            env.DB.prepare("UPDATE support_tickets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(id)
        ]);
        if (body.kind === 'note') return json({success:true});
        const html = '<p>Hello ' + supportEscape(ticket.contact_name) + ',</p><p>' + supportEscape(text).replace(/\n/g,'<br>') + '</p><hr><p>FPVGate | ' + supportEscape(ticket.reference) + '</p><p>Reply to this email to contact ' + SUPPORT_EMAIL + '.</p>';
        const sent = await sendEmail(env,ticket.email,'[' + ticket.reference + '] ' + ticket.subject,html,{type:'support_reply',replyTo:SUPPORT_EMAIL});
        await env.DB.batch([
            env.DB.prepare('UPDATE support_messages SET delivery_status = ? WHERE id = ?').bind(sent ? 'sent' : 'failed', messageId),
            // Do not overwrite a status another admin changed while email was sending.
            env.DB.prepare("UPDATE support_tickets SET status = CASE WHEN status = ? AND ? = 1 THEN 'waiting' ELSE status END, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(ticket.status,sent ? 1 : 0,id)
        ]);
        return sent ? json({success:true}) : json({error:'Email delivery failed. The failed reply is saved in the ticket; nothing is marked as sent.'},502);
    }
    return json({error:'Method not allowed'},405);
}
