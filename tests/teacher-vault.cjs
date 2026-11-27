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
  await p.goto(base);
  await p.locator('#show-access-qr').click();
  assert.ok(await p.locator('#access-qr-dialog').isVisible());
  const decoded=await p.evaluate(async()=>{
   const svg=document.querySelector('#student-access-qr svg');
   const data=new XMLSerializer().serializeToString(svg);
   const img=new Image();
   img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(data);
   await img.decode();
   const canvas=document.createElement('canvas');canvas.width=canvas.height=480;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,480,480);ctx.drawImage(img,0,0,480,480);
   return jsQR(ctx.getImageData(0,0,480,480).data,480,480)?.data;
  });
  assert.equal(decoded,'https://archaiosmagister.github.io/ValentiaEpigraphica/');
  assert.equal(await p.evaluate(()=>localStorage.getItem('ve-teacher-vault-v1')),null);
  await p.locator('#close-access-qr').click();
  assert.equal(await p.locator('#access-qr-dialog').isVisible(),false);
  await unlock(p,true);
  await p.locator('#show-access-qr').click();
  assert.ok(await p.locator('#student-access-qr svg').isVisible());
  await p.locator('#close-access-qr').click();
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
  // Exercise exclusions, filtering, closing and the privacy-safe presentation.
  await q.locator('#roster-school').selectOption('om');
  await q.locator('#roster-names').fill('Clara\nPablo');
  await q.getByRole('button',{name:'Generar código'}).click();
  await q.locator('#roster .roster-entry').nth(1).waitFor();
  const otherCode=await q.locator('#roster strong').nth(1).textContent();
  await q.locator('#roster-search').fill('clara');
  assert.equal(await q.locator('#roster .roster-entry').count(),1);
  await q.locator('#roster-search').fill('');
  q.on('dialog',d=>d.type()==='prompt'?d.accept('Ausencia de prueba'):d.accept());
  await q.locator('#seal-roster').click();
  await q.getByText('Registro cerrado',{exact:true}).waitFor();
  assert.ok(await q.locator('#close-ranking').isDisabled());
  await q.locator('[data-exclude="'+otherCode+'"]').click();
  await q.getByText('Motivo: Ausencia de prueba',{exact:true}).waitFor();
  await q.locator('#roster-filter').selectOption('pending');
  assert.equal(await q.locator('#roster .roster-entry').count(),1);
  await q.locator('#roster-filter').selectOption('absent');
  await q.locator('[data-reinstate="'+otherCode+'"]').click();
  await q.getByText('No hay grupos que coincidan.',{exact:true}).waitFor();
  await q.locator('#roster-filter').selectOption('all');
  await q.locator('[data-exclude="'+otherCode+'"]').click();
  await q.getByText('Motivo: Ausencia de prueba',{exact:true}).waitFor();
  const result=await q.evaluate(code=>{
    const g={id:crypto.randomUUID(),school:'veles',code,names:['Andrea','Manuel']};
    const records=Object.fromEntries([...VE_DATA.items,VE_DATA.recap].map(x=>[x.id,{first:x.questions.map(q=>q.correct)}]));
    return VE_COMP.encode(g,records);
  },code);
  await q.getByText('Introducir código de respaldo',{exact:true}).click();
  await q.locator('#scan-text').fill(result);
  await q.locator('#add-code').click();
  await q.getByText('Resultado recibido:',{exact:false}).waitFor();
  await q.locator('#close-ranking').click();
  await q.getByText('Clasificación definitiva cerrada',{exact:true}).waitFor();
  await q.locator('#show-ranking').click();
  await q.locator('#ranking-presentation').waitFor({state:'visible'});
  assert.ok(!(await q.locator('#presentation-content').textContent()).includes(code));
  assert.ok(!(await q.locator('#presentation-content').textContent()).includes('Ausencia de prueba'));
  assert.equal(await q.locator('#teacher-private').isVisible(),false);
  assert.match(await q.locator('#presentation-content').textContent(),/31\/31/);
  await q.locator('#exit-ranking').click();
  await q.reload();await unlock(q);
  assert.ok(await q.locator('#show-ranking').isEnabled());
  assert.match(await q.locator('#roster').textContent(),/Ausencia de prueba/);
  await q.locator('#delete-vault').click();
  await q.getByText('Datos docentes eliminados.',{exact:true}).waitFor();
  assert.equal(await q.evaluate(()=>localStorage.getItem('ve-teacher-vault-v1')),null);
  assert.equal(await q.locator('#roster').textContent(),'');
  console.log(engine+': configuración, almacenamiento cifrado, bloqueo automático, restauración y eliminación OK');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
