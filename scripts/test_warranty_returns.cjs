const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE orders(id INTEGER PRIMARY KEY,invoice_number TEXT,customer_name TEXT,customer_email TEXT,shipping_address TEXT,items TEXT,total REAL,stripe_payment_intent TEXT); CREATE TABLE support_tickets(id TEXT PRIMARY KEY); ");
 db.exec(fs.readFileSync('store/migration_returns.sql','utf8'));db.exec(fs.readFileSync('store/migrations/0009_support_returns.sql','utf8'));
 db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?)').run(1,'FPVG-123','Alex','alex@example.com',JSON.stringify({name:'Alex',country:'GB'}),JSON.stringify([{id:'gate',name:'Timer',price:30,quantity:2,totalPrice:60}]),65,'pi_test');
 const emails=[],purchases=[];
 const context=vm.createContext({Request,Response,URL,Headers,console,sendEmail:async(...args)=>{emails.push(args);return true},returnLabelEmail:()=>({subject:'Return label',html:'Test label'}),getReturnRates:async()=>({object_id:'shipment',rates:[{object_id:'rate',amount:'4.50',currency:'GBP',provider:'Test',servicelevel:{name:'Tracked'}}]}),purchaseLabel:async(...args)=>{purchases.push(args);return {trackingNumber:'RET123',transactionId:'txn',labelUrl:'https://labels.test/return.pdf',labelFileType:'PDF_4x6'}},DEFAULT_LABEL_FILE_TYPE:'PDF_4x6'});
 vm.runInContext(fs.readFileSync('store/worker.js','utf8').replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'').replace('export default {','const worker={'),context);
 const env={ADMIN_TOKEN:'secret',SHIPPO_API_TOKEN:'test',RESEND_API_KEY:'test',DB:{prepare(sql){const statement=db.prepare(sql);const bind=(...params)=>({first:async()=>statement.get(...params),all:async()=>({results:statement.all(...params)}),run:async()=>({meta:statement.run(...params)})});return {...bind(),bind}}}};
 async function call(path,method='POST',body){const response=await vm.runInContext('worker',context).fetch(new Request('https://store.test/api/orders/1/return'+path,{method,headers:{Authorization:'Bearer secret','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),env);return {status:response.status,body:await response.json()};}
 return {db,call,emails,purchases,context};
}
test('faulty replacements use stored order items, buy paid postage and require receipt before dispatch',async()=>{
 const s=setup();let r=await s.call('','POST',{resolution:'replacement',reason:'Faulty device',items:[{id:'gate',quantity:1,price:1}]});assert.equal(r.status,200);assert.equal(r.body.return.resolution,'replacement');assert.equal(r.body.return.refund_amount,0);assert.equal(JSON.parse(r.body.return.items)[0].price,30);
 assert.equal((await s.call('/status','PUT',{status:'replaced',replacementTrackingNumber:'NEW123'})).status,400);
 assert.equal((await s.call('/rates','POST')).body.rates[0].currency,'GBP');
 r=await s.call('/label','POST',{rateId:'rate'});assert.equal(r.status,200);assert.equal(r.body.emailSent,true);assert.equal(s.purchases.length,1);assert.equal(s.emails[0][1],'alex@example.com');
 await s.call('/status','PUT',{status:'received'});assert.equal((await s.call('/status','PUT',{status:'refunded'})).status,400);
 assert.equal((await s.call('/status','PUT',{status:'replaced',replacementTrackingNumber:'NEW123'})).status,200);
 const ret=(await s.call('','GET')).body.return;assert.equal(ret.status,'replaced');assert.equal(ret.replacement_tracking_number,'NEW123');
 assert.equal((await s.call('/status','PUT',{status:'replaced',replacementTrackingNumber:'NEW123'})).status,200);
});
test('paid manual return arrangements work when a Shippo label is unavailable',async()=>{
 const s=setup();await s.call('','POST',{resolution:'replacement'});
 assert.equal((await s.call('/status','PUT',{status:'in_transit'})).status,400);
 assert.equal((await s.call('/status','PUT',{status:'in_transit',postagePaid:true,postageNote:'FPVGate arranged prepaid service',postageCost:5,trackingNumber:'RETURN456'})).status,200);
 const ret=(await s.call('','GET')).body.return;assert.equal(ret.return_postage_cost,5);assert.equal(ret.tracking_number,'RETURN456');assert.equal(s.purchases.length,0);
});
test('invalid item quantities are rejected and label email failures are reported accurately',async()=>{
 const s=setup();for(const items of [[{id:'wrong',quantity:1}],[{id:'gate',quantity:3}],[{id:'gate',quantity:1},{id:'gate',quantity:1}]])assert.equal((await s.call('','POST',{resolution:'replacement',items})).status,400);
 await s.call('','POST',{resolution:'replacement'});s.context.sendEmail=async()=>false;const result=await s.call('/label','POST',{rateId:'rate'});assert.equal(result.status,200);assert.equal(result.body.emailSent,false);
 assert.equal((await s.call('/label','POST',{rateId:'rate'})).status,404);assert.equal(s.purchases.length,1);
});
