'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
require('../data.js');
const items = globalThis.VE_DATA.items;
const root = path.resolve(__dirname, '..');
const key = 'valentia-epigraphica-v1';
const engine = process.env.VE_BROWSER || 'chromium';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.ttf':'font/ttf'};
let release = '1.0-rc19-codigos-qr';
let failPhoto = false;
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const prefix = '/ValentiaEpigraphica/';
    if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const relative = pathname.slice(prefix.length) || 'index.html';
    if (failPhoto && relative === 'photos/crates.jpg') { res.writeHead(503).end('Fixture failure'); return; }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    let data = await fs.readFile(file);
    if (relative === 'sw.js') data = data.toString().replace("const release = '1.0-rc19-codigos-qr';", "const release = '" + release + "';");
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'}).end(data);
  } catch { res.writeHead(404).end(); }
});
const wait = (page, fn, arg) => page.waitForFunction(fn, arg, {timeout: 30000});
async function ready(page) {
  await page.getByText('Disponible sin conexión', { exact: true }).waitFor({timeout: 30000});
}
async function start(page) {
  await page.locator('#group-school').selectOption('veles');
    await page.locator('#group-code').fill('V-123456789ABC');
  await page.locator('#group-names').fill('Manuel\nAndrea');
  await page.getByRole('button', {name:'Empezar recorrido'}).click();
  await page.locator('nav [data-tab=list]').waitFor();
}
async function open(page, id) {
  await page.locator('nav [data-tab=list]').click();
  await page.locator('.list-item[data-open="' + id + '"]').click();
}
async function grade(page, id) {
  const item = items.find(x => x.id === id);
  await open(page, id);
  for (const [i,q] of item.questions.entries()) await page.locator('input[name=q'+i+'][value="'+q.correct+'"]').check();
  await page.locator('#check').click();
  await wait(page, n => document.querySelectorAll('.feedback.correct:not([hidden])').length === n, item.questions.length);
}
async function read(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), key); }
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/ValentiaEpigraphica/';
  const browser = await ({chromium,webkit})[engine].launch();
  try {
    const context = await browser.newContext({colorScheme:'light'});
    const a = await context.newPage(), b = await context.newPage();
    await a.goto(base); await ready(a); await start(a);
    await b.goto(base); await ready(b);
    // WebKit has one foreground window; concurrent physical mouse actions
    // across windows can steal focus. Open each form using real navigation,
    // then dispatch native radio activations in both documents concurrently.
    // This exercises the actual click/change/persistence handlers without
    // making the two virtual mice fight for the foreground.
    await open(a,1);
    await open(b,2);
    const activate = (page, item) => page.evaluate(choices => {
      for (const [i, value] of choices.entries()) {
        const radio = document.querySelector('input[name=q' + i + '][value="' + value + '"]');
        radio.click();
        if (!radio.checked) throw new Error('Radio activation lost: ' + i);
      }
      document.querySelector('#check').click();
    }, item.questions.map(q => q.correct));
    await Promise.all([activate(a,items[0]),activate(b,items[1])]);
    for (const [p,item] of [[a,items[0]],[b,items[1]]]) {
      await wait(p,n => document.querySelectorAll('.feedback.correct:not([hidden])').length === n,item.questions.length);
      assert.equal(await p.locator('input:checked').count(),item.questions.length);
    }
    await a.locator('nav [data-tab=results]').click();
    await b.locator('nav [data-tab=results]').click();
    for (const p of [a,b]) await wait(p, () => document.querySelector('.score')?.textContent === '7/26');
    const stored = await read(a);
    assert.equal(Object.keys(stored.answers).length,2);
    assert.ok(stored.answers[1].questions.every(q => typeof q.text === 'string'));
    // Independent theme write cannot replace the answer state.
    await b.locator('#theme').click();
    await wait(a, () => document.documentElement.dataset.theme === 'dark');
    assert.equal((await read(a)).answers[1].graded.length,4);
    await open(b,3);
    await b.locator('input[name=q0][value="0"]').check();
    await wait(b, key => JSON.parse(localStorage.getItem(key)).answers[3]?.draft[0] === 0, key);
    await a.locator('nav [data-tab=results]').click();
    assert.equal(await a.locator('#reset').count(),0);
    await a.evaluate(key=>{const s=JSON.parse(localStorage.getItem(key));s.answers={1:s.answers[1]};localStorage.setItem(key,JSON.stringify(s));},key);
    await a.reload();await ready(a);
    await a.locator('nav [data-tab=results]').click();
    await wait(a, () => document.querySelector('.score')?.textContent === '4/26');
    // Reorder the stored options (not the actual data); migration must map by text.
    await a.evaluate(key => {
      const s = JSON.parse(localStorage.getItem(key));
      const r = s.answers[1], opts = r.questions[0].options;
      opts.push(opts.shift());
      r.draft[0] = (r.draft[0] + opts.length - 1) % opts.length;
      r.graded[0] = (r.graded[0] + opts.length - 1) % opts.length;
      localStorage.setItem(key,JSON.stringify(s));
    },key);
    await a.reload(); await ready(a);
    await a.locator('nav [data-tab=results]').click();
    await wait(a, () => document.querySelector('.score')?.textContent === '4/26');
    // Detect partial cache and repair it only when the matching release is served.
    failPhoto = true;
    await a.evaluate(async () => {
      for (const name of await caches.keys()) {
        if (!name.startsWith('valentia-epigraphica:')) continue;
        await (await caches.open(name)).delete(new URL('photos/crates.jpg', location.href));
      }
      window.dispatchEvent(new Event('online'));
    });
    await a.getByText('Descarga sin conexión no disponible',{exact:true}).waitFor();
    failPhoto = false;
    await a.evaluate(() => window.dispatchEvent(new Event('online')));
    await ready(a);
    // Update with a waiting worker, retaining the progress across activation.
    release = '1.0-rc19-codigos-qr-fixture-update';
    await a.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await wait(a, async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
    await b.close(); await a.close();
    const next = await context.newPage();
    await next.goto(base); await ready(next);
    await wait(next, async () => (await caches.keys()).some(k => k.endsWith('fixture-update')) &&
      !(await caches.keys()).some(k => k.endsWith('1.0-rc19-codigos-qr')));
    await next.locator('nav [data-tab=results]').click();
    await wait(next, () => document.querySelector('.score')?.textContent === '4/26');
    await context.close();
    // A new installation with an unavailable asset must never claim offline readiness.
    failPhoto = true;
    const broken = await browser.newContext({colorScheme:'light'});
    const bad = await broken.newPage();
    await bad.goto(base);
    await bad.getByText('Descarga sin conexión no disponible',{exact:true}).waitFor({timeout:30000});
    assert.equal(await bad.getByText('Disponible sin conexión',{exact:true}).count(),0);
    await broken.close();
    failPhoto = false;
    // Invalid stored values, theme and malformed JSON must not prevent use.
    const corrupt = await browser.newContext({colorScheme:'light'});
    const c = await corrupt.newPage();
    await c.goto(base);
    await c.evaluate(key => localStorage.setItem(key,'{bad JSON'),key);
    await c.reload();
    await c.getByText(/No se puede garantizar el guardado/).waitFor();
    await start(c); await grade(c,1);
    assert.equal((await read(c)).answers[1].graded.length,4);
    await c.evaluate(key => localStorage.setItem(key,JSON.stringify({group:{id:crypto.randomUUID(),school:'veles',code:'V-123456789ABC',names:['Manuel','Andrea']},started:true,theme:'invalid',answers:{1:{draft:[99,null,-2],graded:[99,null,-2]}}})),key);
    await c.reload();
    assert.equal(await c.locator('html').getAttribute('data-theme'),'light');
    await c.locator('nav [data-tab=results]').click();
    await wait(c, () => document.querySelector('.score')?.textContent === '0/26');
    // Legacy index-only answers for IV.1 must never be silently regraded
    // as the new whole-syntagm question. Retain its other two answers.
    await c.evaluate(key => localStorage.setItem(key,JSON.stringify({group:{id:crypto.randomUUID(),school:'veles',code:'V-123456789ABC',names:['Manuel','Andrea']},started:true,theme:'light',answers:{4:{draft:[1,0,2],graded:[1,0,2]}}})),key);
    await c.reload();
    await c.locator('nav [data-tab=results]').click();
    await wait(c, () => document.querySelector('.score')?.textContent === '2/26');
    await open(c,4);
    assert.equal(await c.locator('input[name=q0]:checked').count(),0);
    assert.equal(await c.locator('input[name=q3]:checked').count(),0);
    assert.equal(await c.locator('#check').isDisabled(),true);
    await corrupt.close();

    // A browser that denies access to storage still allows the whole activity.
    const blocked = await browser.newContext({colorScheme:'light'});
    await blocked.addInitScript(() => {
      Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});
    });
    const d = await blocked.newPage();
    await d.goto(base);
    await d.getByText(/No se puede garantizar el guardado/).waitFor();
    await start(d); await grade(d,1);
    await d.locator('nav [data-tab=results]').click();
    await wait(d, () => document.querySelector('.score')?.textContent === '4/26');
    await blocked.close();
    // Deterministic GPS callbacks, including a callback arriving after stop.
    const geo = await browser.newContext({colorScheme:'light'});
    await geo.addInitScript(() => {
      let id = 0;
      window.gpsFixture = { calls: [], cleared: [] };
      Object.defineProperty(navigator,'geolocation',{value:{
        watchPosition(ok,error,options) {
          window.gpsFixture.calls.push({id:++id,ok,error,options});
          return id;
        },
        clearWatch(id) { window.gpsFixture.cleared.push(id); }
      }});
    });
    const g = await geo.newPage();
    await g.goto(base); await start(g);
    await g.locator('#gps').click();
    assert.equal(await g.evaluate(() => gpsFixture.calls[0].options.enableHighAccuracy),false);
    await g.evaluate(() => gpsFixture.calls[0].ok({coords:{latitude:39.4732235,longitude:-0.3744353,accuracy:90}}));
    assert.equal(await g.evaluate(() => gpsFixture.calls[1].options.enableHighAccuracy),true);
    await g.evaluate(() => gpsFixture.calls[1].ok({coords:{latitude:39.4732235,longitude:-0.3744353,accuracy:2}}));
    await g.getByText(/A menos de 10 m/).waitFor();
    await g.locator('#gps').click();
    await g.evaluate(() => gpsFixture.calls[1].ok({coords:{latitude:39.4732235,longitude:-0.3744353,accuracy:2}}));
    assert.equal(await g.locator('.map .user').count(),0);
    assert.equal(await g.locator('#gps').getAttribute('aria-pressed'),'false');
    await g.locator('#gps').click();
    await g.evaluate(() => gpsFixture.calls.at(-1).error({code:1}));
    await g.getByText(/Permiso denegado/).waitFor();
    assert.equal(await g.locator('#gps').getAttribute('aria-pressed'),'false');
    await geo.close();
    console.log(engine + ': concurrent tabs, reset, option migration, partial cache, update, failed installation, malformed/blocked storage, GPS recovery and late callbacks.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
