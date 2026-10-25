// Capture the actual website, then render screenshot-led social cards in HTML.
// No invented taglines, simulated UI, image synthesis or website mutations.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const PAGES = {
  'index.html': 'home', 'flasher.html': 'flasher', 'docs.html': 'docs',
  'c5.html': 'c5', 'quickstart.html': 'quickstart', 'print-files.html': 'print-files',
  'shop.html': 'shop', 'shop-fpvgate.html': 'shop-fpvgate',
  'shop-components.html': 'shop-components', 'shop-misc.html': 'shop-misc',
};
const escape = value => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function cardHtml({ title, description, slug, page, screenshot, logo, fontCss }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${fontCss}
    * { box-sizing: border-box; }
    html, body { width:1200px; height:630px; margin:0; overflow:hidden; }
    body { background:#181f22; color:#f5f7f8; font-family:'IBM Plex Sans',Arial,sans-serif; border-top:8px solid #009a8d; }
    .brand { position:absolute; top:43px; left:48px; display:flex; align-items:center; gap:14px; font-size:40px; font-weight:600; }
    .brand img { width:49px; height:59px; object-fit:contain; filter:brightness(0) invert(1); }
    .copy { position:absolute; left:48px; top:179px; width:345px; }
    h1 { font-size:43px; line-height:1.12; letter-spacing:-1px; margin:0 0 24px; font-weight:600; overflow-wrap:break-word; }
    p { font-size:24px; line-height:1.4; color:#bfc8cc; margin:0; }
    .screen { position:absolute; left:438px; top:117px; width:720px; height:470px; border:2px solid #3d484e; box-shadow:0 15px 40px #0005; }
    .screen img { display:block; width:100%; height:100%; object-fit:contain; background:#14161a; }
    footer { position:absolute; bottom:27px; left:48px; font-size:21px; font-weight:600; color:#4bcabe; }
  </style></head><body>
    <div class="brand"><img src="${logo}" alt=""><span>FPVGate</span></div>
    <div class="copy"><h1>${escape(title)}</h1><p>${escape(description)}</p></div>
    <div class="screen"><img src="data:image/png;base64,${screenshot.toString('base64')}" alt="Screenshot of ${escape(title)}"></div>
    <footer>fpvgate.xyz${slug === 'home' ? '' : '/' + page}</footer>
  </body></html>`;
}

async function generate(options = {}) {
  const modulePath = options.modulePath || process.env.FPVGATE_PLAYWRIGHT_MODULE || 'playwright';
  const { chromium } = require(modulePath);
  const base = new URL(options.baseUrl || 'http://127.0.0.1:8765/');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Capture a locally served checkout, not a production/admin session');
  const browser = await chromium.launch({ headless:true, args:['--enable-unsafe-swiftshader'], ...(options.executablePath ? { executablePath:options.executablePath } : {}) });
  const context = await browser.newContext({ viewport:{ width:1200, height:783 }, deviceScaleFactor:1, colorScheme:'dark', reducedMotion:'reduce' });
  const results = [];
  try {
    // Capture read-only public pages. Avoid analytics traffic and block writes.
    await context.route('**/*', route => {
      const request = route.request();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || /analytics-tracker\.js|fpvgate-analytics\.fpvgate-analytics\.workers\.dev/.test(request.url())) return route.fulfill({ status:204, body:'' });
      return route.continue();
    });
    await context.addInitScript(() => localStorage.setItem('fpvgate-theme', 'dark'));
    const tab = await context.newPage();
    const composition = await context.newPage();
    await composition.setViewportSize({ width:1200, height:630 });
    const logo = 'data:image/svg+xml;base64,' + (await fs.readFile(path.join(ROOT, 'images/LogoAnimated.svg'))).toString('base64');
    for (const [page, slug] of Object.entries(PAGES)) {
      if (options.only && !options.only.includes(slug)) continue;
      const url = new URL(page, base).href;
      const response = await tab.goto(url, { waitUntil:'networkidle', timeout:45000 });
      if (!response?.ok()) throw new Error(`Cannot capture ${page}: HTTP ${response?.status()}`);
      await tab.locator('h1').waitFor({ state:'visible' });
      if (page.startsWith('shop')) {
        // A real empty category is allowed; loading/error placeholders are not.
        await tab.waitForFunction(() => {
          const grid = document.querySelector('.product-grid');
          return grid && !/loading|could not|failed|unable/i.test(grid.innerText) &&
            (grid.querySelector('.product-card') || /no products|nothing here|coming soon/i.test(grid.innerText));
        }, null, { timeout:30000 });
      }
      if (page === 'print-files.html') {
        await tab.waitForFunction(() => {
          const status = document.getElementById('viewer-status');
          return document.getElementById('part-name')?.innerText && status?.hidden && document.querySelector('#viewer-stage canvas');
        }, null, { timeout:30000 });
      }
      // Keep the real heading visible while bringing the full product/model
      // into the frame, instead of clipping it beneath a tall page header.
      const captureSelector = page === 'print-files.html' ? '.viewer-frame' : page === 'shop-misc.html' ? '#product-grid' : null;
      const scrollY = page.startsWith('shop') && !captureSelector ? 120 : 0;
      if (scrollY) await tab.evaluate(y => window.scrollTo({ top:y, behavior:'instant' }), scrollY);
      await tab.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].filter(image => {
          const rect = image.getBoundingClientRect();
          let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
          let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
          // Hidden carousel slides aren't part of the screenshot. Check real
          // clipping rather than failing on an unrelated off-screen gallery URL.
          for (let parent = image.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
            if (style.overflowX !== 'visible') { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
            if (style.overflowY !== 'visible') { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
          }
          return right > left && bottom > top;
        }).map(image => image.decode().catch(() => { throw new Error('Visible image did not load: ' + image.src); })));
      });
      // Finish entrance animations and freeze animated SVG logos consistently.
      await tab.addStyleTag({ content:'*,*::before,*::after{animation:none!important;transition:none!important} .fade-in,.fade-in-up,[data-animation],[data-animate]{opacity:1!important;transform:none!important}' });
      await tab.evaluate(() => document.querySelectorAll('svg').forEach(svg => { svg.pauseAnimations?.(); svg.setCurrentTime?.(10); }));
      await tab.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const title = (await tab.locator('h1').innerText()).trim();
      const description = await tab.evaluate(() => (document.querySelector('.subtitle')?.textContent || document.querySelector('meta[name="description"]')?.content || '').replace(/\s+/g,' ').trim());
      const screenshot = captureSelector
        ? await tab.locator(captureSelector).screenshot({ animations:'disabled', type:'png' })
        : await tab.screenshot({ animations:'disabled', type:'png' });
      // Use the same actual font files already loaded by the website.
      const fontCss = await tab.evaluate(() => [...document.styleSheets].flatMap(sheet => {
        try { return [...sheet.cssRules].filter(rule => rule.type === CSSRule.FONT_FACE_RULE).map(rule => rule.cssText); }
        catch { return []; }
      }).join('\n'));
      await composition.setContent(cardHtml({ title, description, slug, page, screenshot, logo, fontCss }));
      await composition.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
      const fits = await composition.locator('.copy').evaluate(element => element.getBoundingClientRect().bottom < 552);
      if (!fits) throw new Error(`Screenshot card copy overflows: ${page}; adjust layout, not the site's copy`);
      const data = await composition.screenshot({ animations:'disabled', type:'png' });
      results.push({ page, slug, title, description, scrollY, captureSelector, data, screenshotHash:crypto.createHash('sha256').update(screenshot).digest('hex') });
      console.log(`Captured ${page}: ${Math.round(data.length/1024)} KiB`);
    }
  } finally {
    await browser.close();
  }
  // Do not replace a set with partially loaded/failed screenshots.
  const output = options.output || path.join(ROOT, 'images/social');
  await fs.mkdir(output, { recursive:true });
  for (const result of results) await fs.writeFile(path.join(output, `${result.slug}.png`), result.data);
  await fs.writeFile(path.join(output, 'captures.json'), JSON.stringify({ style:'actual-website-screenshot', capturedAt:new Date().toISOString(), viewport:{ width:1200, height:783 }, cards:results.map(({ data, ...result }) => ({ ...result, imageHash:crypto.createHash('sha256').update(data).digest('hex') })) }, null, 2) + '\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const value = flag => args.includes(flag) ? args[args.indexOf(flag)+1] : undefined;
  generate({ baseUrl:value('--base-url'), modulePath:value('--playwright-module'), executablePath:value('--executable'), output:value('--output'), only:value('--only')?.split(',') }).catch(error => { console.error(error); process.exitCode=1; });
}
module.exports = { PAGES, cardHtml, generate };
