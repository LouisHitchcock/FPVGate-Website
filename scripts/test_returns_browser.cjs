const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'NEW123':undefined));
  await page.route('https://returns-preview.test/**',async route=>{const file=path.resolve(root,'.'+new URL(route.request().url()).pathname.replace(/\/$/,'/index.html'));const type={'.html':'text/html','.js':'application/javascript','.css':'text/css'}[path.extname(file)];if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){await route.fulfill({status:404,body:''});return}await route.fulfill({body:fs.readFileSync(file),contentType:type||'application/octet-stream'});});
  const id='12345678-1234-4234-8234-123456789012';
  const order={id:1,invoice_number:'FPVG-123',customer_name:'Alex',customer_email:'alex@example.com',items:[{id:'gate',name:'Timer',price:30,quantity:1,totalPrice:30}],shipping_address:{name:'Alex',country:'GB'},total:35,shipping_fees:5,status:'completed',created_at:'2026-11-17T12:00:00Z',labels:[]};
  const ticket={id,reference:'FPV-TEST123',type:'support',status:'open',contact_name:'Alex',email:'alex@example.com',subject:'Faulty timer',created_at:order.created_at,updated_at:order.created_at,application:{order_reference:'FPVG-123',topic:'Faulty device'}};
  let linked=false,ret=null,purchases=0;
  await page.route('https://fpvgate-store.fpvgate-analytics.workers.dev/**',async route=>{
   const req=route.request(),url=new URL(req.url());let body={};
   if(url.pathname==='/api/tickets')body={tickets:[ticket],counts:[{status:'open',count:1}],total:1};
   else if(url.pathname.endsWith('/order')){linked=true;body={success:true};}
   else if(url.pathname.startsWith('/api/tickets/'))body={ticket,messages:[],order:linked?order:null};
   else if(url.pathname==='/api/orders/1')body=order;
   else if(url.pathname.endsWith('/return/rates'))body={rates:[{objectId:'rate',provider:'Test carrier',serviceName:'Tracked',amount:'4.50',currency:'GBP'}]};
   else if(url.pathname.endsWith('/return/label')){purchases++;ret.status='label_created';ret.label_url='https://labels.test/return.pdf';ret.tracking_number='RET123';body={success:true,emailSent:false,labelUrl:ret.label_url,trackingNumber:'RET123'};}
   else if(url.pathname.endsWith('/return/status')){const data=req.postDataJSON();ret.status=data.status;if(data.replacementTrackingNumber)ret.replacement_tracking_number=data.replacementTrackingNumber;body={success:true};}
   else if(url.pathname.endsWith('/return')){if(req.method()==='POST'){const data=req.postDataJSON();assert.equal(data.resolution,'replacement');ret={status:'requested',resolution:'replacement',reason:'Faulty timer',items:data.items};}body={return:ret,success:true};}
   else if(url.pathname==='/api/orders')body={orders:[],counts:[]};
   else if(url.pathname.endsWith('/comments'))body={comments:[]};else if(url.pathname.endsWith('/refunds'))body={refunds:[]};else if(url.pathname.endsWith('/tracking'))body={events:[]};
   await route.fulfill({json:body});
  });
  await page.goto('https://returns-preview.test/admin/');await page.waitForFunction(()=>typeof loadSupportTickets==='function');await page.evaluate(()=>{document.getElementById('auth-overlay').style.display='none';document.getElementById('main-content').style.display='flex';switchSection('tickets',document.querySelector('[data-ticket-category="support"]'));});
  await page.locator('.ticket-open').click();await page.locator('#ticket-order-reference').waitFor({state:'visible'});await page.locator('#ticket-order-form button').click();await page.waitForFunction(()=>document.getElementById('ticket-linked-order').textContent.startsWith('Verified'));
  await page.locator('#ticket-return-form button').click();await page.getByRole('button',{name:'Get FPVGate-paid return rates',exact:true}).waitFor({state:'visible'});assert.equal(await page.getByRole('button',{name:'Record replacement dispatch',exact:true}).count(),0);
  await page.getByRole('button',{name:'Get FPVGate-paid return rates',exact:true}).click();await page.locator('.rate-option').click();await page.getByRole('button',{name:'Mark faulty device received',exact:true}).waitFor({state:'visible'});assert.equal(purchases,1);assert.match(await page.locator('#rates-container').innerText(),/email delivery was not confirmed/);
  await page.getByRole('button',{name:'Mark faulty device received',exact:true}).click();await page.getByRole('button',{name:'Record replacement dispatch',exact:true}).click();await page.waitForFunction(()=>document.getElementById('detail-content').textContent.includes('Replacement dispatched'));
  assert.match(await page.locator('#detail-content').innerText(),/NEW123/);assert.equal(purchases,1);assert.equal(await page.getByRole('button',{name:'Process refund',exact:true}).count(),0);assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'.tmp'),{recursive:true});await page.screenshot({path:path.join(root,'.tmp/return-workflow.png'),fullPage:true});console.log('Admin return workflow passed: verified order link, selected faulty item, paid label with truthful email outcome, receipt before replacement. All operations mocked.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
