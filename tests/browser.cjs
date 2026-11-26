const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
require('../data.js');

(async () => {
  const base = process.env.VE_URL || 'http://localhost:8765/ValentiaEpigraphica/';
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base);
    await page.getByText('Disponible sin conexión', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Empezar recorrido' }).click();
    await page.locator('#gps').click();
    await page.getByText('Permiso denegado.', { exact: false }).waitFor();
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 39.473185, longitude: -0.374407, accuracy: 9 });
    await page.locator('#gps').click();
    await page.locator('.map .user').waitFor({ state: 'attached' });
    await context.setGeolocation({ latitude: 39.473185, longitude: -0.374407, accuracy: 90 });
    await page.getByText('Señal poco precisa', { exact: true }).first().waitFor();
    await page.locator('#gps').click();

    const items = globalThis.VE_DATA.items;
    assert.equal(items.length, 8);
    await page.locator('nav [data-tab=list]').click();
    for (const item of items) {
      await page.locator('.list-item[data-open="' + item.id + '"]').click();
      assert.equal(await page.locator('h2').textContent(), item.title);
      assert.equal(await page.locator('fieldset').count(), 2);
      const fields = page.locator('#latin-text pre');
      assert.deepEqual(await fields.allTextContents(), item.latin.split('\n\n'));
      assert.equal(await fields.first().evaluate(field => getComputedStyle(field).fontVariantCaps), 'small-caps');
      if (item.id === 4) {
        assert.deepEqual(await page.locator('legend i[lang=la]').allTextContents(), ['deo', 'Asclepio']);
      }
      for (const [i, question] of item.questions.entries()) {
        assert.equal(question.options.length, 3);
        assert.ok(Number.isInteger(question.correct) && question.correct >= 0 && question.correct < 3);
        await page.locator('input[name=q' + i + '][value="' + question.correct + '"]').check();
      }
      await page.locator('#check').click();
      assert.equal(await page.locator('.feedback.correct').count(), 2);
      await page.locator('nav [data-tab=list]').click();
    }
    await page.locator('nav [data-tab=results]').click();
    assert.equal(await page.locator('.score').textContent(), '16/16');
    await page.locator('main [data-open="1"]').click();
    await page.locator('input[name=q0][value="0"]').check();
    await page.getByText('Traducción', { exact: true }).click();
    await page.getByText('Contexto histórico', { exact: true }).click();
    await page.locator('#enlarge-latin').click();
    await page.locator('#check').click();
    assert.equal(await page.locator('details[open]').count(), 2);
    assert.equal(await page.locator('#enlarge-latin').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.feedback.incorrect').count(), 1);
    await page.locator('.actions [data-open="2"]').click();
    await page.locator('.actions [data-open="1"]').click();
    assert.equal(await page.locator('.feedback.incorrect').count(), 1);
    await page.locator('#theme').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.locator('#theme').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'oled');

    await context.setOffline(true);
    await page.reload();
    assert.equal(await page.locator('.map .streets polyline').count() > 0, true);
    await page.locator('nav [data-tab=list]').click();
    await page.locator('.list-item[data-open="1"]').click();
    assert.ok(await page.locator('.photo img').evaluate(img => img.decode().then(() => img.naturalWidth)));
    for (const item of items) {
      await page.locator('nav [data-tab=list]').click();
      await page.locator('.list-item[data-open="' + item.id + '"]').click();
      assert.ok(item.photos.length > 0);
      const figures = page.locator('.photo');
      assert.equal(await figures.count(), item.photos.length);
      for (const [index, photo] of item.photos.entries()) {
        const figure = figures.nth(index);
        assert.equal(await figure.locator('a').first().getAttribute('href'), photo.src);
        assert.ok(await figure.locator('img').evaluate(img => img.decode().then(() => img.naturalWidth)));
      }
    }
    const popupEvent = page.waitForEvent('popup');
    await page.locator('.photo > a').first().click();
    const enlarged = await popupEvent;
    await enlarged.waitForLoadState();
    assert.ok(await enlarged.locator('img').evaluate(img => img.decode().then(() => img.naturalWidth)));
    await enlarged.close();
    for (const width of [320, 390, 412, 768, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow at ' + width);
    }
    await page.locator('nav [data-tab=results]').click();
    assert.equal(await page.locator('.score').textContent(), '15/16');
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#reset').click();
    assert.equal(await page.locator('.score').textContent(), '15/16');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#reset').click();
    await page.reload();
    await page.getByRole('button', { name: 'Empezar recorrido' }).click();
    await page.locator('nav [data-tab=results]').click();
    assert.equal(await page.locator('.score').textContent(), '0/16');
    assert.deepEqual(errors, []);
    console.log('Ocho fichas, 16 preguntas, GPS simulado, temas, cinco anchos, recarga sin red, puntuación y reinicio.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
