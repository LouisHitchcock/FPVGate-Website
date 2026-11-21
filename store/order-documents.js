const MAX_PDF_BYTES = 10 * 1024 * 1024;
const PDF_SIGNATURE = '%PDF-';

export async function handleOrderDocuments(match, request, env, corsHeaders, json) {
    const [, orderId, kind, documentId] = match;
    const order = await env.DB.prepare("SELECT id FROM orders WHERE id = ? AND order_type = 'distributor_stock'")
        .bind(orderId).first();
    if (!order) return json({ error: 'Distributor order not found' }, corsHeaders, 404);

    const bucket = env.ORDER_DOCUMENTS;
    if (!bucket) return json({ error: 'Order document storage is unavailable' }, corsHeaders, 503);
    const prefix = `orders/${order.id}/`;
    const privateHeaders = { ...corsHeaders, 'Cache-Control': 'private, no-store' };

    if (!kind && request.method === 'GET') {
        const documents = [];
        let cursor;
        do {
            const page = await bucket.list({ prefix, cursor, include: ['customMetadata'] });
            for (const object of page.objects) {
                const [type, id] = object.key.slice(prefix.length).split('/');
                documents.push({ kind: type, id, name: object.customMetadata?.name || `${type}.pdf` });
            }
            cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
        return json({ documents }, privateHeaders);
    }

    if (kind && !documentId && request.method === 'POST') {
        const size = Number(request.headers.get('Content-Length'));
        if (size > MAX_PDF_BYTES) return json({ error: 'PDFs must be 10 MB or smaller' }, privateHeaders, 413);
        if (request.headers.get('Content-Type') !== 'application/pdf' || !request.body) {
            return json({ error: 'Choose a PDF file' }, privateHeaders, 400);
        }
        const reader = request.body.getReader();
        const chunks = [];
        let total = 0;
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_PDF_BYTES) {
                await reader.cancel();
                return json({ error: 'PDFs must be 10 MB or smaller' }, privateHeaders, 413);
            }
            chunks.push(value);
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        if (new TextDecoder().decode(bytes.subarray(0, 5)) !== PDF_SIGNATURE) {
            return json({ error: 'Choose a valid PDF file' }, privateHeaders, 400);
        }
        const filename = (new URL(request.url).searchParams.get('name') || `${kind}.pdf`).slice(0, 180);
        const id = crypto.randomUUID();
        await bucket.put(`${prefix}${kind}/${id}`, bytes, { customMetadata: { name: filename } });
        return json({ id, kind, name: filename }, privateHeaders, 201);
    }

    if (documentId && request.method === 'GET') {
        const object = await bucket.get(`${prefix}${kind}/${documentId}`);
        if (!object) return json({ error: 'Document not found' }, privateHeaders, 404);
        return new Response(object.body, { headers: {
            ...privateHeaders,
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${kind}.pdf"`,
            'X-Content-Type-Options': 'nosniff'
        } });
    }

    return json({ error: 'Method not allowed' }, privateHeaders, 405);
}
