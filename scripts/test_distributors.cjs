const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {DatabaseSync} = require('node:sqlite');
const source = fs.readFileSync('store/distributors.js', 'utf8').replace(/import[^;]+;/g, '').replace('export async function', 'async function');
const valid = {business:'Test FPV Shop',contact:'Alex',email:'alex@example.com',country:'Australia',website:'https://example.com',channels:'Online store',products:'C5MK AIO',quantity:'Discuss an opening batch',message:'International delivery?',consent:true};
function setup() {
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync('store/migrations/0007_distributor_enquiries.sql','utf8'));
    db.exec(fs.readFileSync('store/migrations/0008_support_tickets.sql','utf8'));
    const sent = [];
    const context = vm.createContext({notifyTicketDiscord:async()=>({status:"not_configured"}),Response,Request,URL,TextEncoder,TextDecoder,Uint8Array,crypto,Date,sendEmail:async(...args)=>{sent.push(args);return true}});
    const support=fs.readFileSync('store/support.js','utf8').replace(/import[^;]+;/g,'').replace(/export /g,'');
    vm.runInContext(support+'\n'+source,context);
    const env = {RESEND_API_KEY:'test-only',DB:{prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {first:async()=>stmt.get(...args),run:async()=>stmt.run(...args),all:async()=>({results:stmt.all(...args)})}}}},async batch(statements){db.exec('BEGIN');try{const results=[];for(const st of statements)results.push(await st.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}}};
    async function call(data=valid,extra={}) {
        const headers={'Content-Type':'application/json','Origin':'https://fpvgate.xyz','CF-Connecting-IP':'192.0.2.1',...extra.headers};
        const req=new Request('https://store.test/distributor-enquiry',{method:'POST',headers,body:extra.raw??JSON.stringify(data)});
        const response=await context.handleDistributorEnquiry(req,env,{},extra.kind || 'distributor');
        return {status:response.status,body:await response.json()};
    }
    return {call,sent,db,env,context};
}
test('international applications reach only the official shop inbox with a reply address',async()=>{
    const s=setup();const r=await s.call();assert.equal(r.status,200);assert.equal(r.body.success,true);
    assert.equal(s.sent.length,1);assert.equal(s.sent[0][1],'shop.fpvgate@gmail.com');assert.equal(s.sent[0][4].replyTo,valid.email);assert.match(s.sent[0][3],/Australia/);
    const stored=s.db.prepare('SELECT * FROM distributor_request_limits').get();assert.equal(stored.ip_hash.length,64);assert.equal(stored.request_count,1);assert.equal(Object.keys(stored).length,3);
});
test('reject invalid applicants, consent, field lengths and unsafe URLs before sending',async()=>{
    const s=setup();for(const extra of [{country:''},{business:' '},{consent:false},{email:'alex@example.com\r\nBcc: other@example.com'},{website:'javascript:alert(1)'},{message:'x'.repeat(4001)},{contact:42}])assert.equal((await s.call({...valid,...extra})).status,400);
    assert.equal(s.sent.length,0);
});
test('HTML is escaped and honeypot submissions never send',async()=>{
    const s=setup();await s.call({...valid,message:'<script>alert(1)</script>\nHello & goodbye'});assert.match(s.sent[0][3],/&lt;script&gt;/);assert.ok(!s.sent[0][3].includes('<script>'));
    assert.equal((await s.call({...valid,fax:'bot'})).status,200);assert.equal(s.sent.length,1);
});
test('limits three attempts atomically, isolates addresses and resets expired windows',async()=>{
    const s=setup();for(let i=0;i<3;i++)assert.equal((await s.call()).status,200);assert.equal((await s.call()).status,429);assert.equal(s.sent.length,3);
    assert.equal((await s.call(valid,{headers:{'CF-Connecting-IP':'192.0.2.2'}})).status,200);
    s.db.exec('UPDATE distributor_request_limits SET window_start=0');assert.equal((await s.call()).status,200);
});
test('notification failures keep a durable ticket and return its reference',async()=>{
    const s=setup();s.context.sendEmail=async()=>false;const result=await s.call();assert.equal(result.status,200);assert.ok(result.body.reference);assert.equal(s.db.prepare('SELECT notification_status FROM support_tickets').get().notification_status,'failed');
    delete s.env.RESEND_API_KEY;assert.equal((await s.call()).status,200);
    s.env.RESEND_API_KEY='test';assert.equal((await s.call(valid,{headers:{'CF-Connecting-IP':''}})).status,503);
});
test('bounds request size and rejects foreign origins and malformed requests',async()=>{
    const s=setup();assert.equal((await s.call(valid,{raw:'x'.repeat(20001)})).status,413);assert.equal((await s.call(valid,{raw:'{'})).status,400);
    assert.equal((await s.call(valid,{headers:{Origin:'https://other.test'}})).status,403);
    assert.equal((await s.call(valid,{headers:{'Content-Type':'text/plain'}})).status,415);
    assert.equal(s.sent.length,0);
});

test('public support enquiries save private tickets without exposing orders or ticket history',async()=>{
 const s=setup();const r=await s.call({contact:'Alex',email:'alex@example.com',subject:'Faulty timer',topic:'Faulty device',order_reference:'FPVG-1234',message:'Timer will not start',consent:true},{kind:'support'});
 assert.equal(r.status,200);assert.ok(r.body.reference);assert.deepEqual(Object.keys(r.body).sort(),['reference','success']);
 const ticket=s.db.prepare('SELECT * FROM support_tickets').get();assert.equal(ticket.type,'support');assert.equal(JSON.parse(ticket.application).order_reference,'FPVG-1234');assert.equal(ticket.notification_status,'sent');
 assert.equal(s.sent[0][1],'shop.fpvgate@gmail.com');assert.equal((await s.call({contact:'Alex',email:'alex@example.com',subject:'Help',topic:'Order query',message:'',consent:true},{kind:'support'})).status,400);
});
