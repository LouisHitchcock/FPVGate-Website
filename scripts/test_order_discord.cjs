const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
function setup(configured=true){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('store/schema.sql','utf8'));db.exec('ALTER TABLE orders ADD COLUMN labels TEXT');
 const calls=[];let mode='success';
 const context=vm.createContext({Request,Response,URL,Headers,Date,crypto,AbortController,setTimeout,clearTimeout,console:{log(){},error(){}},allocateOrderNumber:async()=> '1711202601',fetch:async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return {ok:mode==='success',json:async()=>({id:'123456789012345678'})}}});
 vm.runInContext(fs.readFileSync('store/worker.js','utf8').replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'').replace('export default {','const worker={'),context);
 const env={ADMIN_TOKEN:'test',...(configured?{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/test-secret'}:{}),DB:{prepare(sql){const s=db.prepare(sql);const wrap=(...params)=>({first:async()=>s.get(...params),run:async()=>s.run(...params)});return {...wrap(),bind:wrap}}}};
 const body={customerName:'Test recipient',customerEmail:'test@example.com',shippingAddress:{name:'Test recipient',address1:'TEST DO NOT SHIP',city:'Test',postalCode:'TEST',country:'GB'},items:[{id:'test',name:'TEST ONLY',quantity:1,price:0}],labels:['test'],zeroValue:true};
 async function create(token='test'){
  const response=await vm.runInContext('worker',context).fetch(new Request('https://store.test/api/orders/test',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
  return {status:response.status,body:await response.json()};
 }
 return {db,calls,context,body,create,fail:()=>mode='failure'};
}
test('authenticated manual test orders notify the orders webhook with their stored date reference',async()=>{
 const s=setup();const r=await s.create();assert.equal(r.status,200);assert.equal(r.body.discord_notification_status,'sent');assert.equal(s.calls.length,1);
 assert.match(s.calls[0].url,/wait=true/);assert.equal(s.calls[0].options.redirect,'manual');assert.equal(s.calls[0].body.embeds[0].title,'Test Order #1711202601');assert.deepEqual(Array.from(s.calls[0].body.allowed_mentions.parse),[]);
 assert.equal(s.db.prepare('SELECT invoice_number FROM orders').get().invoice_number,'1711202601');
});
test('a rejected Discord request preserves the order and reports the notification failure',async()=>{
 const s=setup();s.fail();const r=await s.create();assert.equal(r.body.success,true);assert.equal(r.body.discord_notification_status,'failed');assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1);
});
test('missing webhook configuration saves the order without attempting a notification',async()=>{
 const s=setup(false);const r=await s.create();assert.equal(r.body.discord_notification_status,'not_configured');assert.equal(s.calls.length,0);
});
test('unauthorised requests cannot create an order or send an alert',async()=>{
 const s=setup();assert.equal((await s.create('wrong')).status,401);assert.equal(s.calls.length,0);assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
});
