// Uses an external Playwright installation; no website build dependencies.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8037';
const sample = {
    days: 7, generated_at: '2026-11-16T12:00:00Z', total_events: 22, unique_users: 7,
    flash_started: 8, connection_cancelled: 1, success_rate: {successes: 6, failures: 2, rate: '75.00%'},
    recent_activity: ['2026-11-14','2026-11-15','2026-11-16'].map(date => ({date, count: 5, started: 3, completed: 2, failed: 1, cancelled: 0})),
    board_stats: [{board:'xiao',count:5},{board:'zero',count:3}],
    version_stats: [{version:'1.3.0',count:6},{version:'1.2.6',count:2}],
    country_stats: [{country:'GB',count:4},{country:'US',count:2},{country:'DE',count:1}],
    flash_events: ['flash_started','flash_complete','flash_failed','connection_cancelled'].map((name,i)=>({event_name:'c5_'+name,count:[8,6,2,1][i]})),
    users_by_recency: ['last_day','last_week','last_month','older'].map((recency,i)=>({recency,count:[4,3,0,0][i]})),
    common_errors: [{error_message:'<img src=x onerror=alert(1)>',board:'xiao',version:'1.3.0',count:2,last_occurred:'2026-11-16T11:00:00Z'}],
    rows: [{event_name:'c5_flash_complete',board:'xiao',version:'1.3.0',error_message:null,count:6}]
};
const empty = {...sample, total_events:0, unique_users:0, flash_started:0, connection_cancelled:0,
    success_rate:{successes:0,failures:0,rate:null}, recent_activity:[],board_stats:[],version_stats:[],country_stats:[],common_errors:[],rows:[],flash_events:sample.flash_events.map(row=>({...row,count:0})),users_by_recency:sample.users_by_recency.map(row=>({...row,count:0}))};

(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
    try {
        const page=await browser.newPage({viewport:{width:1440,height:1100},ignoreHTTPSErrors:true});
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        let mode='sample';const calls=[];
        await page.route('https://fpvgate-analytics.fpvgate-analytics.workers.dev/**',async route=>{
            const days=new URL(route.request().url()).searchParams.get('days');calls.push(days);
            if(mode==='failure'){await route.fulfill({status:503,json:{error:'Temporary test failure'}});return}
            if(mode==='race'&&days==='30')await new Promise(resolve=>setTimeout(resolve,350));
            await route.fulfill({json:mode==='empty'?{...empty,days:days==='all'?null:Number(days)}:{...sample,days:days==='all'?null:Number(days)}});
        });
        await page.goto(base+'/admin/');
        await page.waitForFunction(()=>typeof loadC5Stats==='function'&&typeof Chart!=='undefined');
        await page.evaluate(()=>{
            document.getElementById('auth-overlay').style.display='none';
            document.getElementById('main-content').style.display='flex';
            switchSection('c5stats',document.querySelector('[onclick*="c5stats"]'));
        });
        await page.locator('#c5-content').waitFor({state:'visible'});
        assert.equal(await page.locator('#c5-success-rate').innerText(),'75.00%');
        assert.equal(await page.locator('#c5-unique-users').innerText(),'7');
        assert.equal(await page.locator('#c5-error-rows img').count(),0);
        assert.match(await page.locator('#c5-error-rows').innerText(),/<img src=x/);
        assert.equal(await page.locator('#c5-stats-rows tr').count(),1);
        await page.waitForFunction(()=>document.getElementById('c5-map-stage').textContent!=='Loading map...');
        assert.ok(await page.evaluate(()=>Object.keys(c5Charts).length>=5));
        assert.equal(await page.locator('.c5-reference').first().getAttribute('open'),null);
        await page.waitForTimeout(600);
        await page.screenshot({path:path.join(os.tmpdir(),'fpvgate-c5-analytics-desktop.png'),fullPage:true});
        await page.locator('#section-c5stats').getByRole('button',{name:'All Time',exact:true}).click();
        await page.waitForFunction(()=>document.getElementById('c5-stats-summary').textContent.startsWith('All time'));
        assert.ok(calls.includes('all'));
        mode='race';
        await page.locator('#section-c5stats').getByRole('button',{name:'30 Days',exact:true}).click();
        await page.locator('#section-c5stats').getByRole('button',{name:'90 Days',exact:true}).click();
        await page.waitForTimeout(500);
        assert.match(await page.locator('#c5-stats-summary').innerText(),/^Last 90 days/);
        mode='empty';await page.locator('#section-c5stats .refresh-btn').click();
        await page.locator('#c5-empty').waitFor({state:'visible'});
        assert.equal(await page.locator('#c5-success-rate').innerText(),'-');
        assert.match(await page.locator('#c5-error-rows').innerText(),/No flash errors/);
        mode='failure';await page.locator('#section-c5stats .refresh-btn').click();
        await page.locator('#c5-error').waitFor({state:'visible'});
        assert.equal(await page.locator('#c5-content').isVisible(),false);
        mode='sample';await page.getByRole('button',{name:'Try again',exact:true}).click();
        await page.locator('#c5-content').waitFor({state:'visible'});
        assert.equal(await page.locator('#c5-error').isVisible(),false);
        await page.setViewportSize({width:390,height:844});
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.waitForTimeout(600);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        await page.screenshot({path:path.join(os.tmpdir(),'fpvgate-c5-analytics-mobile.png'),fullPage:true});
        assert.deepEqual(errors,[]);
        console.log('C5 dashboard browser checks passed: charts, date filters, race handling, safe errors, empty/retry states and mobile layout.');
    }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
