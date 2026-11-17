// Local virtual host; every API call is intercepted. No email, postage or live changes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('https://help-preview.test/**',async route=>{
   const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){await route.fulfill({status:404,body:''});return}
   const contentType={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)];await route.fulfill({body:fs.readFileSync(file),contentType:contentType||'application/octet-stream'});
  });
  let requests=0,telemetry=0,fail=true;
  await context.route('https://fpvgate-store.fpvgate-analytics.workers.dev/**',async route=>{
   requests++;assert.ok(route.request().url().endsWith('/support-enquiry'));const body=route.request().postDataJSON();assert.equal(body.topic,'Faulty device');assert.equal(body.order_reference,'FPVG-123');
   await route.fulfill(fail?{status:502,json:{error:'Test outage'}}:{json:{success:true,reference:'FPV-TEST123'}});
  });
  await context.route('https://fpvgate-analytics.fpvgate-analytics.workers.dev/**',async route=>{telemetry++;await route.fulfill({json:{success:true}});});
  fs.mkdirSync(path.join(root,'.tmp'),{recursive:true});
  for(const file of ['help.html','shipping.html','returns.html','privacy.html','data-collection.html','support.html']){
   await page.goto('https://help-preview.test/'+file);assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('.policy-nav [aria-current=page]').count(),1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   // Do not accidentally publish the dispatch address in the new customer pages.
   const source=fs.readFileSync(path.join(root,'store/shippo.js'),'utf8');
   for(const key of ['street1','city','zip']){const value=source.match(new RegExp(key+": '([^']+)'"))?.[1];if(value)assert.ok(!(await page.locator('body').innerText()).includes(value));}
  }
  await page.goto('https://help-preview.test/support.html?topic=Faulty%20device');assert.equal(await page.locator('[name=topic]').inputValue(),'Faulty device');
  await page.locator('[name=contact]').fill('Alex');await page.locator('[name=email]').fill('alex@example.com');await page.locator('[name=order_reference]').fill('FPVG-123');await page.locator('[name=subject]').fill('Timer will not start');await page.locator('[name=message]').fill('Please help troubleshoot my timer.');await page.locator('[name=consent]').check();
  await page.locator('#support-submit').click();await page.waitForFunction(()=>document.getElementById('support-status').dataset.state==='error');assert.equal(await page.locator('[name=subject]').inputValue(),'Timer will not start');
  fail=false;await page.locator('#support-submit').click();await page.waitForFunction(()=>document.getElementById('support-status').dataset.state==='success');assert.match(await page.locator('#support-status').innerText(),/FPV-TEST123/);assert.equal(requests,2);
  await page.goto('https://help-preview.test/data-collection.html');await page.locator('#disable-analytics').click();assert.match(await page.locator('#analytics-preference-status').innerText(),/disabled/);
  await page.addScriptTag({path:path.join(root,'analytics-tracker.js')});await page.evaluate(()=>window.fpvgateAnalytics.track('test-event'));assert.equal(telemetry,0);
  await page.locator('#enable-analytics').click();await page.evaluate(()=>window.fpvgateAnalytics.track('test-event'));await page.waitForTimeout(100);assert.ok(telemetry>0);
  await page.evaluate(()=>{localStorage.setItem('fpvgate_recent','[1]');localStorage.setItem('fpvgate_cart','[2]');});await page.locator('#clear-recent-products').click();assert.equal(await page.evaluate(()=>localStorage.getItem('fpvgate_recent')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('fpvgate_cart')),'[2]');
  await page.goto('https://help-preview.test/help.html');await page.screenshot({path:path.join(root,'.tmp/help-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.goto('https://help-preview.test/returns.html');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,'.tmp/returns-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('Help-page browser checks passed: six pages, privacy preferences, support form failures/success, private addresses excluded and mobile layout. No live operations.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
