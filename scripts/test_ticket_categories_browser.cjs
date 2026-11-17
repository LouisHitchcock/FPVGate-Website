// Virtual website + mocked API; no actual Discord messages or live tickets.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>sessionStorage.setItem('fpvgate_admin_token','mock-admin'));
  await page.route('https://tickets-preview.test/**',async route=>{const file=path.resolve(root,'.'+new URL(route.request().url()).pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){await route.fulfill({status:404,body:''});return}const type={'.html':'text/html','.js':'application/javascript','.css':'text/css'}[path.extname(file)];await route.fulfill({body:fs.readFileSync(file),contentType:type||'application/octet-stream'});});
  const common={contact_name:'Alex',email:'alex@example.com',created_at:'2026-11-17T12:00:00Z',updated_at:'2026-11-17T12:00:00Z',notification_status:'not_required'};
  const support={...common,id:'11111111-1111-4111-8111-111111111111',reference:'FPV-SUPPORT',type:'support',status:'open',subject:'Timer setup',discord_notification_status:'sent'};
  const business={...common,id:'22222222-2222-4222-8222-222222222222',reference:'FPV-BUSINESS',type:'distributor',status:'new',subject:'Stocking timers',discord_notification_status:'failed'};
  const calls=[];let retries=0;
  await page.route('https://fpvgate-store.fpvgate-analytics.workers.dev/**',async route=>{
   const url=new URL(route.request().url());calls.push(url.pathname+url.search);let data;
   if(url.pathname==='/auth/verify')data={email:'admin@example.com'};
   else if(url.pathname==='/api/tickets/notifications')data={configured:true,role_mentions_enabled:false};
   else if(url.pathname==='/api/tickets'){const type=url.searchParams.get('type'),ticket=type==='distributor'?business:support;data={tickets:!url.searchParams.get('status')||url.searchParams.get('status')===ticket.status?[ticket]:[],total:!url.searchParams.get('status')||url.searchParams.get('status')===ticket.status?1:0,counts:[{status:ticket.status,count:1}],new_counts:[{type:'distributor',count:1}]};}
   else if(url.pathname.endsWith('/discord')){retries++;business.discord_notification_status='sent';data={success:true,status:'sent'};}
   else data={ticket:url.pathname.includes(business.id)?business:support,messages:[],order:null};
   await route.fulfill({json:data});
  });
  await page.goto('https://tickets-preview.test/admin/?section=business&ticket='+business.id);
  await page.locator('#ticket-detail').waitFor({state:'visible'});assert.equal(await page.locator('#ticket-page-title').innerText(),'Business Enquiries');assert.match(await page.locator('#ticket-subject').innerText(),/Stocking/);
  assert.equal(await page.locator('[data-ticket-category=distributor]').evaluate(el=>el.classList.contains('active')),true);
  await page.locator('#ticket-discord-retry').click();await page.waitForFunction(()=>document.getElementById('ticket-feedback').textContent==='Discord alert sent.');assert.equal(retries,1);assert.equal(await page.locator('#ticket-discord-retry').isVisible(),false);
  await page.locator('[data-ticket-category=support]').click();await page.locator('#ticket-status-filter').selectOption('open');await page.locator('#ticket-search').fill('Alex');await page.locator('#ticket-filters button').click();await page.locator('.ticket-open').waitFor();assert.match(await page.locator('#ticket-list').innerText(),/Timer setup/);
  await page.locator('[data-ticket-category=distributor]').click();assert.equal(await page.locator('#ticket-status-filter').inputValue(),'');assert.equal(await page.locator('#ticket-search').inputValue(),'');await page.locator('.ticket-open').waitFor();assert.match(await page.locator('#ticket-list').innerText(),/Stocking timers/);
  await page.locator('[data-ticket-category=support]').click();assert.equal(await page.locator('#ticket-status-filter').inputValue(),'open');assert.equal(await page.locator('#ticket-search').inputValue(),'Alex');await page.locator('.ticket-open').waitFor();assert.ok(calls.some(url=>url.includes('type=support')));assert.ok(calls.some(url=>url.includes('type=distributor')));
  fs.mkdirSync(path.join(root,'.tmp'),{recursive:true});await page.screenshot({path:path.join(root,'.tmp/ticket-categories.png'),fullPage:true});assert.deepEqual(errors,[]);
  console.log('Ticket category browser checks passed: Discord sign-in landing, alert retry, separate categories, saved filters and notification state. All calls mocked.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
