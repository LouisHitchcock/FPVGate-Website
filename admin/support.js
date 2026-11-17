let supportOffset = 0, supportTotal = 0, supportTicketId = null, supportRequest = 0;
let supportLinkedOrder = null;
const supportLabels = {new:'New',open:'Open',waiting:'Waiting for customer',resolved:'Resolved'};
const supportElement = id => document.getElementById(id);
function supportFeedback(text, error = false) {
    const el = supportElement('ticket-feedback'); el.textContent = text; el.dataset.error = error;
}
async function supportApi(path, method = 'GET', body = null) {
    const result = await storeApi(path, method, body);
    if (result.error) throw new Error(result.error);
    return result;
}
function supportDate(value) { return new Date(value).toLocaleString(); }
function supportCell(row, text) { const cell=document.createElement('td');cell.textContent=text;row.append(cell);return cell; }

async function loadSupportTickets() {
    const request = ++supportRequest;
    supportTicketId = null;
    supportElement('ticket-inbox').hidden = false; supportElement('ticket-detail').hidden = true;
    supportFeedback('Loading enquiries...');
    const params = new URLSearchParams({offset:supportOffset});
    for (const [key,id] of [['status','ticket-status-filter'],['type','ticket-type-filter'],['q','ticket-search']]) {
        const value=supportElement(id).value.trim();if(value)params.set(key,value);
    }
    try {
        const data = await supportApi('/api/tickets?' + params);
        if (request !== supportRequest) return;
        supportTotal = data.total;
        const counts=supportElement('ticket-counts');counts.replaceChildren();
        Object.entries(supportLabels).forEach(([status,label])=>{
            const card=document.createElement('div');card.className='metric-card';
            const heading=document.createElement('h3');heading.textContent=label;
            const value=document.createElement('div');value.className='metric-value';value.textContent=(data.counts.find(row=>row.status===status)?.count || 0).toLocaleString();card.append(heading,value);counts.append(card);
        });
        const unread=data.counts.find(row=>row.status==='new')?.count || 0;
        supportElement('ticket-new-badge').hidden=!unread;supportElement('ticket-new-badge').textContent=unread;
        const list=supportElement('ticket-list');list.replaceChildren();
        data.tickets.forEach(ticket=>{
            const row=document.createElement('tr');const title=document.createElement('td');
            const button=document.createElement('button');button.type='button';button.className='ticket-open';button.textContent=ticket.reference+' / '+ticket.subject;button.onclick=()=>openSupportTicket(ticket.id);title.append(button);row.append(title);
            supportCell(row,ticket.contact_name+' / '+ticket.email);supportCell(row,ticket.type==='distributor'?'Distributor':'Support');supportCell(row,supportLabels[ticket.status]);supportCell(row,supportDate(ticket.updated_at));list.append(row);
        });
        if(!data.tickets.length){const row=document.createElement('tr');supportCell(row,'No tickets match your filters.').colSpan=5;list.append(row);}
        supportElement('ticket-page').textContent=data.total ? (supportOffset+1)+'-'+Math.min(supportOffset+50,data.total)+' of '+data.total : 'No tickets';
        supportElement('ticket-prev').disabled=supportOffset===0;supportElement('ticket-next').disabled=supportOffset+50>=data.total;
        supportFeedback('');
    } catch(error) {if(request===supportRequest){supportElement('ticket-list').replaceChildren();supportFeedback('Unable to load tickets: '+error.message,true);}}
}

async function openSupportTicket(id, preserveDraft = false) {
    const request = ++supportRequest;
    supportTicketId = id;
    supportElement('ticket-inbox').hidden = true; supportElement('ticket-detail').hidden = true;
    supportFeedback('Loading ticket...');
    if(!preserveDraft){supportElement('ticket-message-text').value='';supportElement('ticket-message-kind').value='note';supportElement('ticket-message-submit').textContent='Save internal note';}
    try {
        const data=await supportApi('/api/tickets/'+encodeURIComponent(id));if(request!==supportRequest)return;
        const {ticket,messages}=data;
        supportElement('ticket-reference').textContent=ticket.reference+' | '+(ticket.type==='distributor'?'Distributor enquiry':'Support ticket')+' | Created '+supportDate(ticket.created_at);
        supportElement('ticket-subject').textContent=ticket.subject;
        supportElement('ticket-contact').textContent=ticket.contact_name+' <'+ticket.email+'>';
        supportElement('ticket-notification').textContent=(ticket.type==='distributor'||ticket.application)?(ticket.notification_status==='sent'?'Shop email notification sent.':'Shop email notification '+ticket.notification_status+'. The application is safely saved in this ticket.'):'Recorded by an admin. No opening email was sent.';
        supportElement('ticket-detail-status').value=ticket.status;
        supportLinkedOrder=data.order || null;
        supportElement('ticket-return-tools').hidden=!supportLinkedOrder;
        supportElement('ticket-linked-order').textContent=supportLinkedOrder?'Verified linked order: '+(supportLinkedOrder.invoice_number || supportLinkedOrder.id)+' / '+supportLinkedOrder.customer_email:'No order linked.';
        const productSelect=supportElement('ticket-return-product');productSelect.replaceChildren();
        if(supportLinkedOrder)(supportLinkedOrder.items || []).forEach((item,index)=>{const option=document.createElement('option');option.value=index;option.textContent=item.name+' (ordered: '+item.quantity+')';productSelect.append(option);});
        supportElement('ticket-return-quantity').value='1';
        supportElement('ticket-order-reference').value=supportLinkedOrder?(supportLinkedOrder.invoice_number || supportLinkedOrder.id):ticket.application?.order_reference || '';

        supportElement('ticket-application').hidden=!ticket.application;
        const fields=supportElement('ticket-application-fields');fields.replaceChildren();
        supportElement('ticket-application-title').textContent=ticket.type==='distributor'?'Distributor application':'Support enquiry details';
        const labels=ticket.type==='support'?{order_reference:'Order reference (not verified)',topic:'Topic',subject:'Subject',message:'Message'}:{business:'Business',contact:'Contact',email:'Email',country:'Country / markets',website:'Website',channels:'Sales channels',products:'Products',quantity:'Order plans',message:'Message'};
        if(ticket.application)Object.entries(labels).forEach(([key,label])=>{const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=ticket.application[key]||'Not supplied';fields.append(dt,dd);});
        const history=supportElement('ticket-messages');history.replaceChildren();
        messages.forEach(message=>{
            const card=document.createElement('article');card.className='ticket-message';card.dataset.kind=message.kind;
            const heading=document.createElement('p');heading.className='ticket-help';
            const names={application:'Received enquiry',note:'Internal note (not emailed)',reply:'Email reply',status:'Status update'};
            heading.textContent=names[message.kind]+' | '+supportDate(message.created_at)+(message.delivery_status?' | '+({pending:'Delivery unconfirmed',sent:'Sent',failed:'Delivery failed'}[message.delivery_status]||message.delivery_status):'');
            const body=document.createElement('p');body.className='ticket-message-body';body.textContent=message.body;card.append(heading,body);history.append(card);
        });
        supportElement('ticket-detail').hidden=false;supportFeedback('');
    }catch(error){if(request===supportRequest){supportElement('ticket-inbox').hidden=false;supportFeedback('Unable to open ticket: '+error.message,true);}}
}

supportElement('ticket-filters').addEventListener('submit',event=>{event.preventDefault();supportOffset=0;loadSupportTickets();});
for(const id of ['ticket-status-filter','ticket-type-filter'])supportElement(id).addEventListener('change',()=>{supportOffset=0;loadSupportTickets();});
supportElement('ticket-prev').onclick=()=>{supportOffset=Math.max(0,supportOffset-50);loadSupportTickets();};
supportElement('ticket-next').onclick=()=>{if(supportOffset+50<supportTotal){supportOffset+=50;loadSupportTickets();}};
supportElement('ticket-back').onclick=()=>loadSupportTickets();
supportElement('ticket-message-kind').onchange=event=>{supportElement('ticket-message-submit').textContent=event.target.value==='reply'?'Send email reply':'Save internal note';};

supportElement('ticket-status-form').addEventListener('submit',async event=>{
    event.preventDefault();if(exampleReadOnly()||!supportTicketId)return;
    const id=supportTicketId;const button=event.target.querySelector('button');button.disabled=true;
    try{await supportApi('/api/tickets/'+id,'PUT',{status:supportElement('ticket-detail-status').value});if(supportTicketId===id){await openSupportTicket(id,true);supportFeedback('Status saved.');}}
    catch(error){supportFeedback(error.message,true);}finally{button.disabled=false;}
});
supportElement('ticket-message-form').addEventListener('submit',async event=>{
    event.preventDefault();if(exampleReadOnly()||!supportTicketId)return;
    const id=supportTicketId,button=supportElement('ticket-message-submit');
    if(button.disabled)return;button.disabled=true;
    const kind=supportElement('ticket-message-kind').value,body=supportElement('ticket-message-text').value.trim();
    try{
        await supportApi('/api/tickets/'+id+'/messages','POST',{kind,body});
        if(supportTicketId===id){supportElement('ticket-message-text').value='';await openSupportTicket(id,true);supportFeedback(kind==='reply'?'Email reply sent.':'Internal note saved.');}
    }catch(error){if(supportTicketId===id){await openSupportTicket(id,true);supportFeedback(error.message,true);}}
    finally{button.disabled=false;}
});
supportElement('ticket-create-form').addEventListener('submit',async event=>{
    event.preventDefault();if(exampleReadOnly())return;
    const form=event.target,button=form.querySelector('button');if(button.disabled)return;button.disabled=true;
    try{const ticket=await supportApi('/api/tickets','POST',Object.fromEntries(new FormData(form)));form.reset();supportElement('ticket-create').open=false;await openSupportTicket(ticket.id);supportFeedback('Support ticket created. No email has been sent.');}
    catch(error){supportFeedback(error.message,true);}finally{button.disabled=false;}
});

supportElement('ticket-order-form').addEventListener('submit',async event=>{
    event.preventDefault();if(exampleReadOnly()||!supportTicketId)return;const id=supportTicketId,button=event.target.querySelector('button');button.disabled=true;
    try{await supportApi('/api/tickets/'+id+'/order','PUT',{order_reference:supportElement('ticket-order-reference').value.trim()});if(supportTicketId===id){await openSupportTicket(id,true);supportFeedback('Order verified and linked.');}}
    catch(error){supportFeedback(error.message,true);}finally{button.disabled=false;}
});
supportElement('ticket-manage-order').onclick=()=>{if(supportLinkedOrder)openDetail(supportLinkedOrder.id);};
supportElement('ticket-return-form').addEventListener('submit',async event=>{
    event.preventDefault();if(exampleReadOnly()||!supportLinkedOrder||!supportTicketId)return;
    const item=supportLinkedOrder.items?.[Number(supportElement('ticket-return-product').value)],quantity=Number(supportElement('ticket-return-quantity').value);
    if(!item||!Number.isInteger(quantity)||quantity<1||quantity>Number(item.quantity)){supportFeedback('Select an item and a quantity no greater than the original order.',true);return;}
    if(!confirm('Start a faulty-device replacement return for this item? This does not buy postage or send a replacement.'))return;
    const button=event.target.querySelector('button');button.disabled=true;
    try{await supportApi('/api/orders/'+supportLinkedOrder.id+'/return','POST',{resolution:'replacement',reason:'Faulty device; support ticket '+supportElement('ticket-reference').textContent.split(' | ')[0],items:[{id:item.id,variantId:item.variantId || null,quantity}]});supportFeedback('Replacement return started. Arrange paid postage in the order panel.');openDetail(supportLinkedOrder.id);}
    catch(error){supportFeedback(error.message,true);}finally{button.disabled=false;}
});
