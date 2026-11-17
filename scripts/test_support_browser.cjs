// All ticket API calls are mocked. This never sends an email or edits live data.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
    try{
        const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.route('https://admin-preview.test/**',async route=>{
            const file=path.resolve(root,'.'+new URL(route.request().url()).pathname.replace(/\/$/,'/index.html'));
            if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){await route.fulfill({status:404,body:''});return}
            const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)];await route.fulfill({body:fs.readFileSync(file),contentType:type||'application/octet-stream'});
        });
        const id='12345678-1234-4234-8234-123456789012';
        const ticket={id,reference:'FPV-123456781234',type:'distributor',status:'new',subject:'Distributor enquiry: FPV Store',contact_name:'Alex',email:'alex@example.com',notification_status:'failed',created_at:'2026-11-17T12:00:00Z',updated_at:'2026-11-17T12:00:00Z',application:{business:'<img src=x onerror=alert(1)>',country:'Australia',quantity:'Opening batch to discuss'}};
        const messages=[{id:'first',kind:'application',body:'Can we stock timers?',created_at:ticket.created_at}];
        const calls=[];let failReply=false;
        await page.route('https://fpvgate-store.fpvgate-analytics.workers.dev/**',async route=>{
            const request=route.request(),url=new URL(request.url());calls.push(url.pathname+url.search);
            let data={};let status=200;
            if(url.pathname==='/api/tickets'&&request.method()==='GET')data={tickets:[ticket],total:1,counts:[{status:ticket.status,count:1}]};
            else if(url.pathname==='/api/tickets'&&request.method()==='POST'){data={id,reference:ticket.reference};}
            else if(url.pathname.endsWith('/messages')){
                const body=request.postDataJSON();messages.push({kind:body.kind,body:body.body,delivery_status:body.kind==='reply'?(failReply?'failed':'sent'):null,created_at:ticket.created_at});
                if(body.kind==='reply'&&failReply){status=502;data={error:'Test email delivery failed. Reply saved as failed.'};}else{data={success:true};if(body.kind==='reply')ticket.status='waiting';}
            }else if(request.method()==='PUT'){ticket.status=request.postDataJSON().status;data={success:true};}
            else if(url.pathname.startsWith('/api/tickets/'))data={ticket,messages};
            await route.fulfill({status,json:data});
        });
        await page.goto('https://admin-preview.test/admin/');await page.waitForFunction(()=>typeof loadSupportTickets==='function');
        await page.evaluate(()=>{document.getElementById('auth-overlay').style.display='none';document.getElementById('main-content').style.display='flex';switchSection('tickets',document.querySelector('[data-ticket-category="support"]'));});
        await page.locator('.ticket-open').waitFor();assert.match(await page.locator('#ticket-counts').innerText(),/New/i);
        await page.locator('[data-ticket-category=distributor]').click();await page.waitForTimeout(100);assert.ok(calls.some(url=>url.includes('type=distributor')));
        fs.mkdirSync(path.join(root,'.tmp'),{recursive:true});await page.screenshot({path:path.join(root,'.tmp/support-inbox.png'),fullPage:true});
        await page.locator('.ticket-open').click();await page.locator('#ticket-detail').waitFor({state:'visible'});
        assert.match(await page.locator('#ticket-application-fields').innerText(),/Australia/);assert.equal(await page.locator('#ticket-application-fields img').count(),0);
        assert.match(await page.locator('#ticket-notification').innerText(),/safely saved/);
        await page.locator('#ticket-message-text').fill('Private pricing note');await page.locator('#ticket-message-submit').click();await page.waitForFunction(()=>document.getElementById('ticket-feedback').textContent==='Internal note saved.');assert.match(await page.locator('#ticket-messages').innerText(),/Private pricing note/);
        failReply=true;await page.locator('#ticket-message-kind').selectOption('reply');await page.locator('#ticket-message-text').fill('Hello Alex, let us discuss your order.');await page.locator('#ticket-message-submit').click();
        await page.waitForFunction(()=>document.getElementById('ticket-feedback').dataset.error==='true');assert.match(await page.locator('#ticket-message-text').inputValue(),/Hello Alex/);assert.match(await page.locator('#ticket-messages').innerText(),/Delivery failed/);
        failReply=false;await page.locator('#ticket-message-submit').click();await page.waitForFunction(()=>document.getElementById('ticket-feedback').textContent==='Email reply sent.');assert.equal(await page.locator('#ticket-detail-status').inputValue(),'waiting');
        await page.locator('#ticket-detail-status').selectOption('resolved');await page.locator('#ticket-status-form button').click();await page.waitForFunction(()=>document.getElementById('ticket-feedback').textContent==='Status saved.');assert.equal(ticket.status,'resolved');
        await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(root,'.tmp/support-ticket.png'),fullPage:true});
        await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,'.tmp/support-mobile.png'),fullPage:true});
        await page.locator('#ticket-back').click();await page.locator('.ticket-open').waitFor();await page.locator('#ticket-create summary').click();
        await page.locator('#ticket-create-form [name=contact]').fill('Sam');await page.locator('#ticket-create-form [name=email]').fill('sam@example.com');await page.locator('#ticket-create-form [name=subject]').fill('Setup help');await page.locator('#ticket-create-form [name=message]').fill('Support request received by email');await page.locator('#ticket-create-form button').click();await page.waitForFunction(()=>document.getElementById('ticket-feedback').textContent.includes('Business enquiry created'));
        assert.deepEqual(errors,[]);console.log('Support browser checks passed: filters, private application details, internal notes, failed/successful replies, status changes, manual creation and mobile layout. No live calls or emails.');
    }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

