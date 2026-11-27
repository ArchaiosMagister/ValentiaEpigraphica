const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
require('../data.js');

const base = process.env.VE_URL || 'http://localhost:8765/ValentiaEpigraphica/';
const engine = process.env.VE_BROWSER || 'chromium';
const widths = [320, 375, 390, 412, 768, 1280];
const themes = ['light', 'dark', 'oled'];
const fonts = [
  ['600 20px Cinzel', 'VALENTIA'],
  ['400 18px Marcellus', 'Æ Œ IVLIA'],
  ['400 17px "Source Serif 4"', 'Valencia, æ, œ'],
  ['italic 400 17px "Source Serif 4"', 'nomen'],
  ['600 17px "Source Serif 4"', 'Pregunta'],
];
async function layout(page, label) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 850 });
    const result = await page.evaluate(() => ({
      viewport: innerWidth,
      root: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll('nav:not([hidden]) button, #theme')].map(e => {
        const r = e.getBoundingClientRect();
        return { width: r.width, height: r.height, left: r.left, right: r.right };
      }),
    }));
    assert.ok(result.root <= result.viewport + 1, label + ' overflow at ' + width + ': ' + result.root);
    for (const c of result.controls) {
      assert.ok(c.height >= 44 && c.width >= 44, label + ' small control at ' + width);
      assert.ok(c.left >= -1 && c.right <= width + 1, label + ' clipped control at ' + width);
    }
  }
}
async function loadFonts(page) {
  for (const [description, sample] of fonts) {
    const ok = await page.evaluate(async ([description, sample]) => {
      const faces = await document.fonts.load(description, sample);
      return faces.length > 0 && faces.every(f => f.status === 'loaded');
    }, [description, sample]);
    assert.ok(ok, 'Font did not load: ' + description);
  }
}
async function theme(page, value) {
  for (let i = 0; i < 3; i++) {
    if (await page.locator('html').getAttribute('data-theme') === value) return;
    const previous = await page.locator('html').getAttribute('data-theme');
    await page.locator('#theme').click();
    await page.waitForFunction(previous => document.documentElement.dataset.theme !== previous, previous);
  }
  assert.equal(await page.locator('html').getAttribute('data-theme'), value);
}

(async () => {
  assert.ok(['chromium', 'webkit'].includes(engine));
  const browser = await ({ chromium, webkit })[engine].launch({ executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByText('Disponible sin conexión', { exact: true }).waitFor();
    await loadFonts(page);
    for (const value of themes) {
      await theme(page, value);
      await layout(page, 'welcome ' + value);
      assert.ok(await page.locator('.welcome-wordmark').isVisible());
    }
    await page.locator('#group-school').selectOption('veles');
    await page.locator('#group-code').fill('V-123456789ABC');
    await page.locator('#group-names').fill('Manuel\nAndrea\nJuan');
    await page.getByRole('button', { name: 'Empezar recorrido' }).click();
    for (const value of themes) {
      await theme(page, value);
      await page.locator('nav [data-tab=route]').click();
      await layout(page, 'route ' + value);
      assert.equal(await page.locator('.map .dot').count(), 4);
      await page.locator('nav [data-tab=list]').click();
      await layout(page, 'list ' + value);
      for (const item of globalThis.VE_DATA.items) {
        await page.locator('.list-item[data-open="' + item.id + '"]').click();
        assert.equal(await page.locator('h2').textContent(), item.title);
        assert.deepEqual(await page.locator('#latin-text pre').allTextContents(), item.latin.split('\n\n'));
        assert.equal(await page.locator('#latin-text pre').first().evaluate(e => getComputedStyle(e).whiteSpace), 'pre');
        await layout(page, 'inscription ' + item.id + ' ' + value);
        await page.locator('#enlarge-latin').click();
        await layout(page, 'enlarged inscription ' + item.id + ' ' + value);
        await page.locator('nav [data-tab=list]').click();
      }
      await page.locator('nav [data-tab=results]').click();
      await layout(page, 'results ' + value);
      assert.equal(await page.locator('.score').count(),0);
    }
    // WebKit's offline emulation may fail before dispatching navigation to
    // the service worker. In CI, stop the real HTTP origin instead.
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller),
      'Page must be controlled by the installed service worker');
    const serverPid = process.env.VE_SERVER_PID;
    if (serverPid) {
      const pid = Number(serverPid);
      assert.ok(Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid);
      process.kill(pid, 'SIGTERM');
      let disconnected = false;
      for (let i = 0; i < 30; i++) {
        try {
          await fetch(new URL('index.html', base), { cache: 'no-store', signal: AbortSignal.timeout(1000) });
        } catch {
          disconnected = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(disconnected, 'The HTTP origin must be unreachable before the offline reload');
      console.log('HTTP origin stopped and independently confirmed unreachable.');
    } else {
      await context.setOffline(true);
    }
    await page.reload();
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller),
      'Offline navigation must remain controlled by the service worker');
    await loadFonts(page);
    await page.locator('nav [data-tab=list]').click();
    await page.locator('.list-item[data-open="1"]').click();
    assert.ok(await page.locator('.photo img').first().evaluate(img => img.decode().then(() => img.naturalWidth)));
    assert.deepEqual(errors, []);
    console.log(engine + ': portada, tres temas, seis anchos, ocho transcripciones normales y ampliadas, fuentes locales y recarga offline.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
