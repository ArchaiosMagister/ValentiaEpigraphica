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
    assert.equal(await page.locator('.inscription-types[open] dt').count(), 3);
    const password='Docente-prueba-2026!';
    async function unlock(page,create=false,secret=password){
      await page.locator('#teacher-password').fill(secret);
      if(create)await page.locator('#confirm-password').fill(secret);
      await page.locator('#unlock').click();
      await page.locator('#teacher-private').waitFor({state:'visible'});
    }
    await page.goto(base+'teacher.html');
    await unlock(page,true);
    await page.locator('#roster-school').selectOption('veles');
    await page.locator('#roster-names').fill('Manuel\nAndrea\nJuan');
    await page.getByRole('button',{name:'Generar código'}).click();
    await page.getByText(/Código generado: V[ACDEFHJKMNPQRTUVWXY3479]{7}/).waitFor();
    const groupCode=await page.locator('#roster strong').textContent();
    page.once('dialog',d=>d.accept());
    await page.locator('#seal-roster').click();
    await page.getByText('Registro cerrado',{exact:true}).waitFor();
    await page.locator('#lock-area').click();
    assert.equal(await page.locator('#roster').textContent(),'');
    assert.equal(await page.locator('#teacher-private').isVisible(),false);
    await page.goto(base);
    await page.locator('#group-school').selectOption('veles');
    await page.locator('#group-code').fill(groupCode);
    await page.locator('#group-names').fill('Manuel\nAndrea\nJuan');
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
      assert.equal(await page.locator('fieldset').count(), item.questions.length);
      assert.match(await page.locator('legend').nth(2).textContent(), /¿Ante qué tipo de inscripción estamos\?/);
      const fields = page.locator('#latin-text pre');
      assert.deepEqual(await fields.allTextContents(), item.latin.split('\n\n'));
      assert.equal(await fields.first().evaluate(field => getComputedStyle(field).fontVariantCaps), 'small-caps');
      if (item.id === 4) {
        assert.deepEqual(await page.locator('legend i[lang=la]').allTextContents(), ['Asclepio deo']);
      }
      for (const [i, question] of item.questions.entries()) {
        assert.equal(question.options.length, 3);
        assert.ok(Number.isInteger(question.correct) && question.correct >= 0 && question.correct < 3);
        await page.locator('input[name=q' + i + '][value="' + question.correct + '"]').check();
      }
      await page.locator('#check').click();
      await page.getByText('Respuestas guardadas.',{exact:false}).waitFor();
      assert.equal(await page.locator('.feedback:not([hidden])').count(),0);
      assert.ok(await page.locator('#check').isDisabled());
      await page.locator('nav [data-tab=list]').click();
    }
    await page.locator('nav [data-tab=results]').click();
    assert.equal(await page.locator('.score').count(),0);
    assert.equal(await page.locator('#recap-score').count(),0);
    assert.equal(await page.locator('#result-qr').count(),0);
    await page.getByRole('button', {name:'Hacer recapitulación'}).click();
    assert.equal(await page.locator('fieldset').count(), 5);
    for (const [i,q] of globalThis.VE_DATA.recap.questions.entries()) {
      await page.locator('input[name=q'+i+'][value="'+q.correct+'"]').check();
    }
    await page.locator('#check').click();
    await page.waitForFunction(() => document.querySelectorAll('.feedback.correct:not([hidden])').length === 5);
    await page.locator('nav [data-tab=results]').click();
    assert.equal(await page.locator('#recap-score').textContent(),'5/5');
    assert.equal(await page.locator('.score').textContent(),'26/26');
    await page.locator('main [data-open="1"]').click();
    assert.ok(await page.locator('input[name=q0][value="0"]').isDisabled());
    await page.getByText('Traducción', { exact: true }).click();
    await page.getByText('Contexto histórico', { exact: true }).click();
    await page.locator('#enlarge-latin').click();
    assert.ok(await page.locator('#check').isDisabled());
    assert.equal(await page.locator('details[open]').count(), 2);
    assert.equal(await page.locator('#enlarge-latin').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.feedback.correct:not([hidden])').count(),items[0].questions.length);
    await page.locator('.actions [data-open="2"]').click();
    await page.locator('.actions [data-open="1"]').click();
    assert.equal(await page.locator('.feedback.correct:not([hidden])').count(),items[0].questions.length);
    await page.locator('#theme').click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.locator('#theme').click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'oled');
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
    assert.equal(await page.locator('.score').textContent(), '26/26');
    assert.equal(await page.locator('#recap-score').textContent(),'5/5');
    await page.getByRole('button',{name:'Revisar recapitulación'}).click();
    assert.equal(await page.locator('input:checked').count(),5);
    await page.locator('nav [data-tab=results]').click();
    assert.equal(await page.locator('#reset').count(),0);
    assert.ok(await page.locator('#result-qr svg').isVisible());
    assert.match(await page.locator('#result-qr').locator('..').textContent(),/31\/31/);
    const qrImage=await page.locator('#result-qr').screenshot();
    await page.goto(base+'teacher.html');
    await page.locator('#teacher-password').fill('contraseña-incorrecta');
    await page.locator('#unlock').click();
    await page.getByText('Contraseña incorrecta o copia dañada.',{exact:true}).waitFor();
    assert.equal(await page.locator('#teacher-private').isVisible(),false);
    await unlock(page);
    const encrypted=await page.evaluate(()=>localStorage.getItem('ve-teacher-vault-v1'));
    assert.ok(!encrypted.includes('Manuel')&&!encrypted.includes(groupCode)&&!encrypted.includes(password));
    await page.locator('#scan-file').setInputFiles({name:'result.png',mimeType:'image/png',buffer:qrImage});
    await page.getByText('Resultado recibido:',{exact:false}).waitFor();
    assert.match(await page.locator('#groups').textContent(),/31\/31/);
    assert.equal(await page.locator('.rank-card.medal-1 svg').count(),1);
    await page.locator('#scan-file').setInputFiles({name:'result.png',mimeType:'image/png',buffer:qrImage});
    await page.getByText('Este grupo ya ha entregado su resultado.',{exact:false}).waitFor();
    page.once('dialog',d=>d.accept());
    await page.locator('#close-ranking').click();
    await page.getByText('Clasificación definitiva cerrada',{exact:true}).waitFor();
    assert.ok(await page.locator('#scan').isDisabled());
    await page.reload();
    assert.equal(await page.locator('#teacher-private').isVisible(),false);
    await unlock(page);
    assert.ok(await page.locator('#close-ranking').isDisabled());
    assert.match(await page.locator('#groups').textContent(),/31\/31/);
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('valentia-epigraphica-v1', JSON.stringify({
      answers: { 1: { draft: [1, 0], graded: [1, 0] } },
      theme: 'light', started:true, group:{id:crypto.randomUUID(),school:'veles',code:'V-123456789ABC',names:['Manuel','Andrea']},
    })));
    await page.reload();
    await page.locator('nav [data-tab=results]').click();
    assert.equal(await page.locator('.score').count(),0);
    assert.equal(await page.locator('[role=progressbar]').getAttribute('aria-valuenow'), '0');
    await page.locator('main [data-open="1"]').click();
    assert.equal(await page.locator('input:checked').count(), 2);
    assert.equal(await page.locator('#check').isDisabled(), true);
    await page.getByText('Contexto histórico', { exact: true }).click();
    assert.ok((await page.locator('details i[lang=la]').allTextContents()).includes('nomen'));
    assert.deepEqual(errors, []);
    console.log('Ocho fichas, 26 preguntas, GPS simulado, temas, cinco anchos, recarga sin red, puntuación y reinicio.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
