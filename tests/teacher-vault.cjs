const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const engine=process.env.VE_BROWSER||'chromium',base=(process.env.VE_URL||'http://localhost:8765/ValentiaEpigraphica/')+'teacher.html';
 const browser=await ({chromium,webkit})[engine].launch();
 const password='Prueba-docente-2026!';
 async function unlock(p,create=false){
  await p.locator('#teacher-password').fill(password);
  if(create)await p.locator('#confirm-password').fill(password);
  await p.locator('#unlock').click();
  await p.locator('#teacher-private').waitFor({state:'visible'});
 }
 try{
  const context=await browser.newContext(),p=await context.newPage();
  await p.goto(base);await unlock(p,true);
  await p.locator('#roster-names').fill('Andrea\nManuel');
  await p.getByRole('button',{name:'Generar código'}).click();
  await p.getByText(/Código generado:/).waitFor();
  const code=await p.locator('#roster strong').textContent();
  const raw=await p.evaluate(()=>localStorage.getItem('ve-teacher-vault-v1'));
  assert.ok(!raw.includes(code)&&!raw.includes('Manuel'));
  // Test idle timeout by advancing the browser clock, not by waiting five minutes.
  await p.clock.install();
  await p.locator('#lock-area').focus();
  await p.keyboard.press('Tab');
  await p.clock.fastForward(300001);
  await p.locator('#teacher-login').waitFor({state:'visible'});
  assert.equal(await p.locator('#roster').textContent(),'');
  await unlock(p);
  assert.equal(await p.locator('#roster strong').textContent(),code);
  // Restore encrypted data into a fresh origin storage.
  const other=await browser.newContext(),q=await other.newPage();
  await q.goto(base);
  await q.locator('#restore-vault').setInputFiles({name:'copia.json',mimeType:'application/json',buffer:Buffer.from(raw)});
  await unlock(q);
  assert.equal(await q.locator('#roster strong').textContent(),code);
  assert.equal(await q.evaluate(()=>localStorage.getItem('ve-teacher-vault-v1')),raw);
  q.on('dialog',d=>d.accept());
  await q.locator('#delete-vault').click();
  await q.getByText('Datos docentes eliminados.',{exact:true}).waitFor();
  assert.equal(await q.evaluate(()=>localStorage.getItem('ve-teacher-vault-v1')),null);
  assert.equal(await q.locator('#roster').textContent(),'');
  console.log(engine+': configuración, almacenamiento cifrado, bloqueo automático, restauración y eliminación OK');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
