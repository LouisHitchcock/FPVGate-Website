const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');const {test}=require('node:test');const {DatabaseSync}=require('node:sqlite');
const source=fs.readFileSync('store/worker.js','utf8').replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'').replace('export default {','const worker = {');
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE inventory(product_id TEXT PRIMARY KEY,product_name TEXT,sku TEXT,price REAL,description TEXT,short_description TEXT,long_description TEXT,image_url TEXT,images TEXT DEFAULT '[]',stock_quantity INTEGER DEFAULT 10,low_stock_threshold INTEGER DEFAULT 5,weight INTEGER DEFAULT 100,max_quantity INTEGER DEFAULT 5,unit_cost REAL,category TEXT DEFAULT 'fpvgate',featured INTEGER DEFAULT 0,active INTEGER DEFAULT 1,preorder_enabled INTEGER DEFAULT 0,preorder_ship_date TEXT,preorder_limit INTEGER DEFAULT 0,updated_at TEXT);CREATE TABLE inventory_log(product_id TEXT,change_amount INTEGER,reason TEXT);`);
 db.exec(fs.readFileSync('store/migrations/0006_product_releases_variants.sql','utf8'));
 const env={ADMIN_TOKEN:'secret',DB:{prepare(sql){const statement=db.prepare(sql);const wrap=(params)=>({first:async()=>statement.get(...params),all:async()=>({results:statement.all(...params)}),run:async()=>({meta:statement.run(...params)})});return {...wrap([]),bind:(...params)=>wrap(params)};}}};
 const context=vm.createContext({Request,Response,URL,Headers,console,Date,crypto});vm.runInContext(source,context);let stripe;
 context.capture=params=>{stripe=params;return {url:'https://checkout.test',id:'cs_test'}};vm.runInContext('stripeRequest=async (key,path,method,params)=>capture(params)',context);
 const call=async(path,method='GET',body,auth)=>{const headers={};if(auth)headers.Authorization='Bearer '+auth;if(body)headers['Content-Type']='application/json';const response=await vm.runInContext('worker',context).fetch(new Request('https://store.test'+path,{method,headers,body:body?JSON.stringify(body):undefined}),env);return {status:response.status,data:await response.json()}};
 function add(id,extra={}){db.prepare('INSERT INTO inventory(product_id,product_name,price,publication_status,release_at,variants,images) VALUES (?,?,?,?,?,?,?)').run(id,'Gate '+id,10,extra.status||'published',extra.at||null,JSON.stringify(extra.variants||[]),JSON.stringify(extra.images||[]))}
 return {db,call,add,context,get stripe(){return stripe}};
}
test('public listings, search and categories hide drafts and future releases; boundary releases appear',async()=>{
 const s=setup();s.add('live');s.add('draft',{status:'draft'});s.add('future',{status:'scheduled',at:'2099-01-01T00:00:00Z'});s.add('released',{status:'scheduled',at:'2000-01-01T00:00:00Z'});
 assert.deepEqual((await s.call('/products')).data.map(p=>p.id),['live','released']);assert.equal((await s.call('/products?q=future')).data.length,0);assert.equal((await s.call('/products/categories')).data[0].count,2);
 assert.equal((await s.call('/products?preview=1')).status,401);assert.equal((await s.call('/products?preview=1','GET',null,'wrong')).status,401);assert.equal((await s.call('/products?preview=1','GET',null,'secret')).data.length,4);
});
test('admin creation and editing persist schedules and optional variants; malformed data is rejected',async()=>{
 const s=setup();const variants=[{id:'kit',name:'DIY Kit',price:20},{id:'built',name:'Pre assembled',price:35}];
 let r=await s.call('/api/inventory','POST',{product_id:'new',product_name:'New',price:20,publication_status:'scheduled',release_at:'2099-02-01T10:00:00+01:00',variants},'secret');assert.equal(r.status,200);assert.equal(s.db.prepare('SELECT release_at FROM inventory').get().release_at,'2099-02-01T09:00:00.000Z');
 r=await s.call('/api/inventory/new','PUT',{publication_status:'published'},'secret');assert.equal(r.status,200);assert.equal((await s.call('/products')).data[0].variants.length,2);
 for(const body of [{publication_status:'scheduled',release_at:null},{variants:[...variants,variants[0]]},{variants:[{id:'bad',name:'Bad',price:-1}]},{publication_status:'invalid'}])assert.equal((await s.call('/api/inventory/new','PUT',body,'secret')).status,400);
});
test('main-image reorder changes the catalogue image and rejects invalid permutations',async()=>{
 const s=setup();s.add('gate',{images:['a.jpg','b.jpg']});assert.equal((await s.call('/api/inventory/gate/images/reorder','POST',{order:[1,0]},'secret')).status,200);assert.equal((await s.call('/products')).data[0].image,'https://store.test/images/b.jpg');for(const order of [[0,0],[0,2],[-1,0],[0,'1']])assert.equal((await s.call('/api/inventory/gate/images/reorder','POST',{order},'secret')).status,400);
});
const shipping={country:'GB',email:'test@example.com',phone:'0123456789'};
function checkout(s,items){return s.call('/checkout','POST',{items,shipping,selectedShippingRate:{amount:5,name:'Post'}})}
test('checkout uses server variant prices and preserves selection in order metadata',async()=>{
 const s=setup();s.add('gate',{variants:[{id:'kit',name:'DIY Kit',price:20},{id:'built',name:'Pre assembled',price:35}]});assert.equal((await checkout(s,[{id:'gate',variantId:'built',price:1,quantity:1}])).status,200);assert.equal(s.stripe.line_items[0].price_data.unit_amount,3500);const item=JSON.parse(s.stripe.metadata.order_items)[0];assert.equal(item.variantId,'built');assert.match(item.name,/Pre assembled/);assert.equal(item.price,35);
 for(const variantId of [undefined,'missing'])assert.equal((await checkout(s,[{id:'gate',variantId,quantity:1}])).status,400);
});
test('checkout rejects unreleased products and aggregates stock/limits across variants',async()=>{
 const s=setup();s.add('future',{status:'scheduled',at:'2099-01-01T00:00:00Z'});s.add('draft',{status:'draft'});for(const id of ['future','draft'])assert.equal((await checkout(s,[{id,quantity:1}])).status,400);
 s.add('gate',{variants:[{id:'kit',name:'Kit',price:20},{id:'built',name:'Built',price:30}]});s.db.exec("UPDATE inventory SET stock_quantity=3 WHERE product_id='gate'");assert.equal((await checkout(s,[{id:'gate',variantId:'kit',quantity:2},{id:'gate',variantId:'built',quantity:2}])).status,400);
 s.db.exec("UPDATE inventory SET stock_quantity=10 WHERE product_id='gate'");assert.equal((await checkout(s,[{id:'gate',variantId:'kit',quantity:3},{id:'gate',variantId:'built',quantity:3}])).status,400);
});

test('admin featured selection persists and featured endpoint excludes ordinary or unreleased products',async()=>{
 const s=setup();s.add('novacore');s.add('ordinary');s.add('draft',{status:'draft'});
 assert.equal((await s.call('/api/inventory/novacore','PUT',{featured:true},'secret')).status,200);
 assert.equal((await s.call('/api/inventory/draft','PUT',{featured:true},'secret')).status,200);
 const featured=(await s.call('/products?featured=1&sort=newest')).data;assert.deepEqual(featured.map(p=>p.id),['novacore']);assert.equal(featured[0].featured,true);
 await s.call('/api/inventory/novacore','PUT',{featured:false},'secret');assert.equal((await s.call('/products?featured=1')).data.length,0);
});
