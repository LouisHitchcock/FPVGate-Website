const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
function setup(){
    const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('store/migrations/0008_support_tickets.sql','utf8'));
    db.exec('CREATE TABLE orders(id INTEGER PRIMARY KEY, invoice_number TEXT, customer_email TEXT, items TEXT); CREATE TABLE returns(id INTEGER PRIMARY KEY, order_id INTEGER, status TEXT)');
    db.exec(fs.readFileSync('store/migrations/0009_support_returns.sql','utf8'));
    const sent=[];
    const context=vm.createContext({Request,Response,Headers,URL,crypto,console,sendEmail:async(...args)=>{sent.push(args);return true}});
    vm.runInContext(fs.readFileSync('store/support.js','utf8').replace(/import[^;]+;/g,'').replace(/export /g,''),context);
    vm.runInContext(fs.readFileSync('store/worker.js','utf8').replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'').replace('export default {','const worker = {'),context);
    const DB={prepare(sql){const stmt=db.prepare(sql);const bind=(...args)=>({first:async()=>stmt.get(...args),all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:stmt.run(...args)})});return {...bind(),bind}},async batch(statements){db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}};
    const env={DB,ADMIN_TOKEN:'test-admin',RESEND_API_KEY:'test-only'};
    const call=async(path,method='GET',body,auth='test-admin')=>{const headers={};if(auth)headers.Authorization='Bearer '+auth;if(body)headers['Content-Type']='application/json';const response=await vm.runInContext('worker',context).fetch(new Request('https://store.test'+path,{method,headers,body:body?JSON.stringify(body):undefined}),env);return {status:response.status,body:await response.json()}};
    const create=()=>call('/api/tickets','POST',{contact:'Alex',email:'alex@example.com',subject:'Timer setup help',message:'How do I connect my timer?'});
    return {call,create,db,env,context,sent};
}
test('all ticket routes require authentication, including lists, details and mutations',async()=>{
    const s=setup();for(const [path,method,body]of [['/api/tickets','GET'],['/api/tickets','POST',{}],['/api/tickets/123','GET'],['/api/tickets/123','PUT',{status:'resolved'}],['/api/tickets/123/messages','POST',{kind:'reply',body:'Hi'}]])assert.equal((await s.call(path,method,body,'')).status,401);
});
test('manual tickets are searchable, filterable, paginated and never send an opening email',async()=>{
    const s=setup();const created=await s.create();assert.equal(created.status,200);assert.ok(created.body.reference);assert.equal(s.sent.length,0);
    const id=created.body.id;const detail=await s.call('/api/tickets/'+id);assert.equal(detail.body.ticket.status,'new');assert.equal(detail.body.messages.length,1);
    assert.equal((await s.call('/api/tickets?q=alex&type=support')).body.total,1);assert.equal((await s.call('/api/tickets?type=distributor')).body.total,0);
    assert.equal((await s.call('/api/tickets?offset=50')).body.tickets.length,0);
    await s.call('/api/tickets/'+id,'PUT',{status:'resolved'});assert.equal((await s.call('/api/tickets?status=resolved')).body.total,1);
    const reopened=await s.call('/api/tickets/'+id,'PUT',{status:'open'});assert.equal(reopened.status,200);
    assert.equal((await s.call('/api/tickets?status=made-up')).status,400);
});
test('internal notes are kept private; replies are escaped, sent to the stored contact and move to waiting',async()=>{
    const s=setup();const id=(await s.create()).body.id;
    assert.equal((await s.call('/api/tickets/'+id+'/messages','POST',{kind:'note',body:'Internal pricing discussion'})).status,200);assert.equal(s.sent.length,0);
    assert.equal((await s.call('/api/tickets/'+id+'/messages','POST',{kind:'reply',body:'<script>bad</script>\nHello',email:'other@example.com'})).status,200);
    assert.equal(s.sent.length,1);assert.equal(s.sent[0][1],'alex@example.com');assert.equal(s.sent[0][4].replyTo,'shop.fpvgate@gmail.com');assert.match(s.sent[0][3],/&lt;script&gt;/);assert.ok(!s.sent[0][3].includes('Internal pricing'));
    const detail=(await s.call('/api/tickets/'+id)).body;assert.equal(detail.ticket.status,'waiting');assert.equal(detail.messages.at(-1).delivery_status,'sent');
});
test('failed replies remain visible as failed, preserve status and missing mail configuration sends nothing',async()=>{
    const s=setup();const id=(await s.create()).body.id;s.context.sendEmail=async()=>false;
    assert.equal((await s.call('/api/tickets/'+id+'/messages','POST',{kind:'reply',body:'Reply'})).status,502);
    let detail=(await s.call('/api/tickets/'+id)).body;assert.equal(detail.ticket.status,'new');assert.equal(detail.messages.at(-1).delivery_status,'failed');
    delete s.env.RESEND_API_KEY;assert.equal((await s.call('/api/tickets/'+id+'/messages','POST',{kind:'reply',body:'Reply'})).status,503);assert.equal((await s.call('/api/tickets/'+id)).body.messages.length,2);
});
test('distributor applications retain all fields privately; invalid mutations are rejected',async()=>{
    const s=setup();const ticket=await s.context.createSupportTicket(s.env,{type:'distributor',subject:'Store enquiry',contact:'Alex',email:'alex@example.com',application:{business:'FPV Shop',country:'Canada',quantity:'To discuss'}});
    const detail=(await s.call('/api/tickets/'+ticket.id)).body;assert.equal(detail.ticket.application.country,'Canada');assert.equal(detail.ticket.notification_status,'pending');
    assert.equal((await s.call('/api/tickets/'+ticket.id,'PUT',{status:'invalid'})).status,400);
    assert.equal((await s.call('/api/tickets/'+ticket.id+'/messages','POST',{kind:'reply',body:''})).status,400);
    assert.equal((await s.call('/api/tickets/'+ticket.id+'/messages','POST',{kind:'note',body:'x'.repeat(8001)})).status,400);
    assert.equal((await s.call('/api/tickets/00000000-0000-4000-8000-000000000000')).status,404);
});

test('linking orders requires admin authentication and a matching verified checkout email',async()=>{
 const s=setup();const id=(await s.create()).body.id;
 s.db.prepare('INSERT INTO orders(id,invoice_number,customer_email,items) VALUES(?,?,?,?)').run(1,'FPVG-123','other@example.com','[]');
 assert.equal((await s.call('/api/tickets/'+id+'/order','PUT',{order_reference:'FPVG-123'})).status,400);
 s.db.exec("UPDATE orders SET customer_email='alex@example.com'");
 assert.equal((await s.call('/api/tickets/'+id+'/order','PUT',{order_reference:'FPVG-123'})).status,200);
 assert.equal((await s.call('/api/tickets/'+id)).body.order.id,1);
 assert.equal((await s.call('/api/tickets/'+id+'/order','PUT',{order_reference:'FPVG-123'},'')).status,401);
});
