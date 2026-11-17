const returnText = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function formatReturnRate(rate) {
    const code=/^[A-Z]{3}$/.test(rate.currency || '')?rate.currency:'GBP';
    return new Intl.NumberFormat('en-GB',{style:'currency',currency:code}).format(Number(rate.amount));
}
const pendingReturnLabels = new Set();
async function purchaseReturnLabel(id, rateId) {
    if (exampleReadOnly() || pendingReturnLabels.has(id)) return;
    if (!confirm("Purchase this return label using FPVGate's Shippo account?")) return;
    pendingReturnLabels.add(id);
    document.getElementById('rates-container').textContent='Purchasing return label...';
    try {
        const result=await storeApi('/api/orders/'+id+'/return/label','POST',{rateId,labelFileType:'PDF_4x6'});
        if (result.error) throw new Error(result.error);
        await openDetail(id);
        const note=document.createElement('p');note.className=result.emailSent?'success-text':'error-text';
        note.textContent=result.emailSent?'Return label purchased and emailed to the customer.':'Return label purchased, but email delivery was not confirmed. Share the saved label privately through support; do not purchase another label.';
        document.getElementById('rates-container').append(note);
        loadOrders();
    } catch(error) {
        await openDetail(id);
        const note=document.createElement('p');note.className='error-text';note.textContent=error.message+' Check the saved return details before attempting another purchase.';document.getElementById('rates-container').append(note);
    } finally {pendingReturnLabels.delete(id);}
}
function renderReturnSection(order, ret) {
    const id=Number(order.id),replacement=ret.resolution==='replacement';
    const names={requested:'Requested',label_created:'Label created',in_transit:'In transit',received:'Received',refunded:'Refunded',replaced:'Replacement dispatched',cancelled:'Cancelled'};
    let html='<div class="detail-section"><h3>'+(replacement?'Faulty-device replacement':'Return / refund')+'</h3><p>Status: <strong>'+returnText(names[ret.status] || ret.status)+'</strong></p>';
    if(ret.reason)html+='<p>'+returnText(ret.reason)+'</p>';
    if(ret.tracking_number)html+='<p>Return tracking: '+returnText(ret.tracking_number)+'</p>';
    if(ret.return_postage_note)html+='<p>FPVGate-paid return arrangement: '+returnText(ret.return_postage_note)+(ret.return_postage_cost!==null?' ('+formatReturnRate({amount:ret.return_postage_cost,currency:'GBP'})+')':'')+'</p>';
    if(ret.replacement_tracking_number)html+='<p>Replacement tracking: '+returnText(ret.replacement_tracking_number)+'</p>';
    if(ret.label_url && /^https:\/\//.test(ret.label_url))html+='<a href="'+returnText(ret.label_url)+'" target="_blank" rel="noopener">View return label</a>';
    html+='<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">';
    const button=(label,handler)=>'<button class="btn btn-secondary btn-sm" onclick="'+handler+'">'+label+'</button>';
    if(ret.status==='requested'){
        html+=button('Get FPVGate-paid return rates','fetchReturnRates('+id+')');
        html+=button('Record other paid postage','recordManualReturn('+id+')');
        html+=button('Cancel return',"updateReturnStatus("+id+",'cancelled')");
    }
    if(ret.status==='label_created')html+=button('Mark in transit',"updateReturnStatus("+id+",'in_transit')");
    if(['label_created','in_transit'].includes(ret.status))html+=button('Mark faulty device received',"updateReturnStatus("+id+",'received')");
    if(ret.status==='received')html+=replacement?button('Record replacement dispatch','recordReplacementDispatch('+id+')'):button('Process refund',"updateReturnStatus("+id+",'refunded')");
    html+='</div>';
    if(replacement)html+='<p style="font-size:12px;color:#718096;margin-top:12px">Replacement dispatch records tracking only; adjust replacement stock separately in Inventory. Returned faulty hardware is not added to sellable stock.</p>';
    return html+'</div>';
}
async function recordManualReturn(id) {
    if(exampleReadOnly())return;
    const note=prompt('Describe the return postage already arranged and paid by FPVGate (for example, a prepaid service arranged outside Shippo). This records an arrangement; it does not make a payment.');if(!note?.trim())return;
    const tracking=prompt('Return tracking number, if available:') || '';
    const cost=prompt('Amount paid in GBP (optional):');if(cost===null)return;
    try{const response=await storeApi('/api/orders/'+id+'/return/status','PUT',{status:'in_transit',postagePaid:true,postageNote:note.trim(),trackingNumber:tracking.trim(),postageCost:cost.trim()?Number(cost):null});if(response.error)throw new Error(response.error);await openDetail(id);}catch(error){alert(error.message);}
}
async function recordReplacementDispatch(id) {
    if(exampleReadOnly())return;
    const tracking=prompt('Replacement tracking number (record only after receiving the faulty device and dispatching its replacement):');if(!tracking?.trim())return;
    try{const response=await storeApi('/api/orders/'+id+'/return/status','PUT',{status:'replaced',replacementTrackingNumber:tracking.trim()});if(response.error)throw new Error(response.error);await openDetail(id);}catch(error){alert(error.message);}
}
