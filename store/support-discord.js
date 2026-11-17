// A separate webhook keeps customer enquiries out of the existing orders feed.
// Alert payloads deliberately contain no customer messages, email or addresses.
export async function notifyTicketDiscord(env, ticketId) {
    let claimed = false;
    try {
        const ticket = await env.DB.prepare('SELECT id, reference, type, discord_notification_status, created_at FROM support_tickets WHERE id = ?').bind(ticketId).first();
        if (!ticket) return {status:'not_found'};
        if (['sent','sending'].includes(ticket.discord_notification_status)) return {status:ticket.discord_notification_status};
        if (!env.DISCORD_SUPPORT_WEBHOOK_URL) {
            await env.DB.prepare("UPDATE support_tickets SET discord_notification_status = 'not_configured' WHERE id = ? AND discord_notification_status NOT IN ('sent','sending')").bind(ticketId).run();
            return {status:'not_configured'};
        }
        let webhook;
        try {
            webhook = new URL(env.DISCORD_SUPPORT_WEBHOOK_URL);
            if (webhook.protocol !== 'https:' || webhook.hostname !== 'discord.com' || webhook.port || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w.-]+\/?$/.test(webhook.pathname)) throw new Error();
        } catch {
            await env.DB.prepare("UPDATE support_tickets SET discord_notification_status = 'failed' WHERE id = ? AND discord_notification_status NOT IN ('sent','sending')").bind(ticketId).run();
            return {status:'failed'};
        }
        const lock = await env.DB.prepare("UPDATE support_tickets SET discord_notification_status = 'sending' WHERE id = ? AND discord_notification_status IN ('pending','failed','not_configured') RETURNING id").bind(ticketId).first();
        if (!lock) return {status:'sending'};
        claimed = true;
        const business = ticket.type === 'distributor';
        const adminUrl = new URL('https://fpvgate.xyz/admin/');
        adminUrl.searchParams.set('section',business ? 'business' : 'support');
        adminUrl.searchParams.set('ticket',ticket.id);
        const role = /^\d{15,22}$/.test(env.DISCORD_SUPPORT_ROLE_ID || '') ? env.DISCORD_SUPPORT_ROLE_ID : null;
        webhook.searchParams.set('wait','true');
        const controller = new AbortController();
        const timeout = setTimeout(()=>controller.abort(),8000);
        let response;
        try {
            response = await fetch(webhook.toString(), {
                method:'POST',redirect:'manual',signal:controller.signal,
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    ...(role ? {content:'<@&'+role+'>'} : {}),
                    allowed_mentions:{parse:[],...(role ? {roles:[role]} : {})},
                    embeds:[{
                        title:business ? 'New business enquiry' : 'New support ticket',
                        description:'Open the private admin ticket to review and respond.',
                        url:adminUrl.toString(),color:business ? 0x9f7aea : 0x4299e1,
                        fields:[{name:'Reference',value:ticket.reference},{name:'Category',value:business ? 'Business enquiries' : 'Support'}],
                        footer:{text:'FPVGate Support & Enquiries'},timestamp:ticket.created_at
                    }]
                })
            });
            if (!response.ok) throw new Error('Delivery failed');
            const result = await response.json();
            if (!result.id || !/^\d+$/.test(result.id)) throw new Error('Delivery unconfirmed');
            await env.DB.prepare("UPDATE support_tickets SET discord_notification_status = 'sent', discord_notified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), discord_message_id = ? WHERE id = ?").bind(result.id,ticketId).run();
            return {status:'sent'};
        } finally {clearTimeout(timeout);}
    } catch {
        // Do not log error bodies or URLs: Discord webhook URLs are credentials.
        if (claimed) {
            try {await env.DB.prepare("UPDATE support_tickets SET discord_notification_status = 'failed' WHERE id = ? AND discord_notification_status = 'sending'").bind(ticketId).run();} catch {}
        }
        return {status:'failed'};
    }
}
