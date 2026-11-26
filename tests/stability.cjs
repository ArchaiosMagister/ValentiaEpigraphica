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
let release = '1.0-rc13-stability';
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
    if (relative === 'sw.js') data = data.toString().replace("const release = '1.0-rc13-stability';", "const release = '" + release + "';");
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'}).end(data);
  } catch { res.writeHead(404).end(); }
});
const wait = (page, fn, arg) => page.waitForFunction(fn, arg, {timeout: 30000});
async function ready(page) {
  await page.getByText('Disponible sin conexión', { exact: true }).waitFor({timeout: 30000});
}
async function start(page) {
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
  await wait(page, () => document.querySelectorAll('.feedback.correct:not([hidden])').length === 3);
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
    await Promise.all([grade(a,1),grade(b,2)]);
    await a.locator('nav [data-tab=results]').click();
    await b.locator('nav [data-tab=results]').click();
    for (const p of [a,b]) await wait(p, () => document.querySelector('.score')?.textContent === '6/24');
    const stored = await read(a);
    assert.equal(Object.keys(stored.answers).length,2);
    assert.ok(stored.answers[1].questions.every(q => typeof q.text === 'string'));
    // Independent theme write cannot replace the answer state.
    await b.locator('#theme').click();
    await wait(a, () => document.documentElement.dataset.theme === 'dark');
    assert.equal((await read(a)).answers[1].graded.length,3);
    await open(b,3);
    await b.locator('input[name=q0][value="0"]').check();
    await wait(b, key => JSON.parse(localStorage.getItem(key)).answers[3]?.draft[0] === 0, key);
    a.once('dialog', d => d.accept());
    await a.locator('#reset').click();
    for (const p of [a,b]) await p.getByRole('button', {name:'Empezar recorrido'}).waitFor();
    assert.deepEqual((await read(a)).answers,{});
    await start(a); await grade(a,1);
    await a.locator('nav [data-tab=results]').click();
    await wait(a, () => document.querySelector('.score')?.textContent === '3/24');
    // Reorder the stored options (not the actual data); migration must map by text.
    await a.evaluate(key => {
      const s = JSON.parse(localStorage.getItem(key));
      const r = s.answers[1], opts = r.questions[0].options;
      opts.reverse();
      r.draft[0] = opts.length - 1 - r.draft[0];
      r.graded[0] = opts.length - 1 - r.graded[0];
      localStorage.setItem(key,JSON.stringify(s));
    },key);
    await a.reload(); await ready(a);
    await a.locator('nav [data-tab=results]').click();
    await wait(a, () => document.querySelector('.score')?.textContent === '3/24');
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
    release = '1.0-rc13-stability-fixture-update';
    await a.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await wait(a, async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
    await b.close(); await a.close();
    const next = await context.newPage();
    await next.goto(base); await ready(next);
    await wait(next, async () => (await caches.keys()).some(k => k.endsWith('fixture-update')) &&
      !(await caches.keys()).some(k => k.endsWith('1.0-rc13-stability')));
    await next.locator('nav [data-tab=results]').click();
    await wait(next, () => document.querySelector('.score')?.textContent === '3/24');
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
    await c.locator('#storage-status').getByText(/No se puede garantizar/).waitFor().catch(async () => {
      await c.getByText(/No se puede garantizar el guardado/).waitFor();
    });
    await start(c); await grade(c,1);
    assert.equal((await read(c)).answers[1].graded.length,3);
    await c.evaluate(key => localStorage.setItem(key,JSON.stringify({theme:'invalid',answers:{1:{draft:[99,null,-2],graded:[99,null,-2]}}})),key);
    await c.reload();
    assert.equal(await c.locator('html').getAttribute('data-theme'),'light');
    await c.locator('nav [data-tab=results]').click();
    await wait(c, () => document.querySelector('.score')?.textContent === '0/24');
    await corrupt.close();
    console.log(engine + ': concurrent tabs, reset, option migration, partial cache, update, failed installation, malformed storage.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
