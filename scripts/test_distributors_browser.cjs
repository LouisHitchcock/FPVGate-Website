// External Playwright installation; all submissions are mocked, never emailed.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname,'..');
(async()=>{
    const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
    try {
        const page = await browser.newPage({viewport:{width:1440,height:1100}});
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.route('https://fonts.**/*',route=>route.abort());
        await page.route('https://distributor-preview.test/**',async route=>{
            const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
            if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){await route.fulfill({status:404,body:''});return}
            const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)];
            await route.fulfill({body:fs.readFileSync(file),contentType:type||'application/octet-stream'});
        });
        let mode='success', requests=0;
        await page.route('https://fpvgate-store.fpvgate-analytics.workers.dev/**',async route=>{
            requests++;
            const body=route.request().postDataJSON();assert.equal(body.country,'Australia');assert.equal(body.consent,true);
            await new Promise(resolve=>setTimeout(resolve,150));
            await route.fulfill(mode==='error'?{status:502,json:{error:'Test delivery failure'}}:{json:{success:true}});
        });
        await page.goto('https://distributor-preview.test/distributors.html');
        await page.locator('#business').fill('Test FPV Store');
        await page.locator('#contact').fill('Alex Test');await page.locator('#email').fill('alex@example.com');
        await page.locator('#country').fill('Australia');await page.locator('#channels').selectOption({label:'Online store'});
        await page.locator('#products').fill('Novacore AIO and C5MK AIO');await page.locator('#quantity').fill('Discuss an opening batch');
        await page.locator('#consent').check();
        fs.mkdirSync(path.join(root,'.tmp'),{recursive:true});
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:path.join(root,'.tmp/distributors-desktop.png'),fullPage:true});
        mode='error';await page.locator('#distributor-submit').click();
        await page.waitForFunction(()=>document.getElementById('distributor-status').dataset.state==='error');
        assert.equal(await page.locator('#business').inputValue(),'Test FPV Store');assert.equal(requests,1);
        mode='success';await page.locator('#distributor-submit').click();
        await page.waitForFunction(()=>document.getElementById('distributor-status').dataset.state==='success');
        assert.equal(await page.locator('#business').inputValue(),'');assert.equal(requests,2);
        await page.setViewportSize({width:390,height:844});
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.locator('[data-theme-toggle]').click();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.locator('[data-nav-toggle]').click();assert.equal(await page.locator('.nav-links').isVisible(),true);
        await page.locator('[data-nav-toggle]').click();
        await page.screenshot({path:path.join(root,'.tmp/distributors-mobile.png'),fullPage:true});
        await page.goto(pathToFileURL(path.join(root,'distributors.html')).href);
        assert.match(await page.locator('.distributor-preview').innerText(),/not sent/);
        await page.locator('#business').fill('Local preview');await page.locator('#contact').fill('Alex');await page.locator('#email').fill('alex@example.com');await page.locator('#country').fill('Australia');await page.locator('#channels').selectOption({label:'Online store'});await page.locator('#products').fill('Timers');await page.locator('#quantity').fill('To discuss');await page.locator('#consent').check();await page.locator('#distributor-submit').click();
        assert.match(await page.locator('#distributor-status').innerText(),/no request has been sent/);assert.equal(requests,2);
        assert.deepEqual(errors,[]);
        console.log('Distributor browser checks passed: desktop/mobile, themes, navigation, delivery failure retention, success reset and safe local preview. No email sent.');
    } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
