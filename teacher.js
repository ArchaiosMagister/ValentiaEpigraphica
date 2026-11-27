'use strict';
const C=VE_COMP,key='ve-teacher-vault-v1',$=id=>document.getElementById(id),status=(m,kind='')=>{const el=$('teacher-status');el.textContent=m;el.dataset.kind=kind;};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=()=>({roster:[],records:[],excluded:[],sealed:false,closed:false});
const pending=s=>s.roster.length-s.records.length-s.excluded.length;
const canClose=s=>s.sealed&&!s.closed&&s.records.length>0&&pending(s)===0;
let session=empty(), storedRaw=null, vaultKey=null, salt=null, unlocked=false, busy=false, lockPending=false, epoch=0, idleTimer=null, lastActivity=0;
let loadFailed=false;
const idleMs=5*60*1000;
function checkSession(raw){
 if(!raw||!Array.isArray(raw.roster)||!Array.isArray(raw.records)||typeof raw.sealed!=='boolean'||typeof raw.closed!=='boolean')throw Error('Copia inválida.');
 const roster=raw.roster.map(g=>{const v=C.group(g);if(!v)throw Error('Grupo inválido.');return v;});
 const records=raw.records.map(C.validate);
 if(new Set(roster.map(g=>g.code)).size!==roster.length||new Set(roster.map(g=>g.id)).size!==roster.length||new Set(roster.map(g=>g.school+':'+C.namesKey(g.names))).size!==roster.length)throw Error('Registro duplicado.');
 const source=raw.excluded===undefined?[]:raw.excluded;
 if(!Array.isArray(source))throw Error('Incidencias inválidas.');
 const excluded=source.map(x=>{
  if(!x||!roster.some(g=>g.code===x.code)||typeof x.reason!=='string'||!x.reason.trim()||x.reason.length>300||typeof x.at!=='string'||!Number.isFinite(Date.parse(x.at))||records.some(r=>r.code===x.code))throw Error('Incidencia inválida.');
  return {code:x.code,reason:x.reason.trim(),at:x.at};
 });
 if(new Set(excluded.map(x=>x.code)).size!==excluded.length||((records.length||excluded.length)&&!raw.sealed)||(raw.sealed&&!roster.length)||(raw.closed&&(!raw.sealed||!records.length||records.length+excluded.length!==roster.length)))throw Error('Estado inválido.');
 const accepted=[];for(const r of records){C.admit(roster,accepted,r);accepted.push(r);}
 return {roster,records,excluded,sealed:raw.sealed,closed:raw.closed};
}
function loginStatus(m){$('login-status').textContent=m;}
function showLogin(){
 $('teacher-private').hidden=true;$('teacher-login').hidden=false;
 $('teacher-password').value='';$('confirm-password').value='';$('restore-vault').value='';
 try{storedRaw=localStorage.getItem(key);loadFailed=false;}
 catch{loadFailed=true;loginStatus('El almacenamiento local no está disponible. No se pueden guardar datos docentes.');}
 const exists=storedRaw!==null;
 $('login-title').textContent=exists?'Desbloquear área del profesor':'Configurar área del profesor';
 $('login-help').textContent=exists?'Introduce la contraseña para descifrar el registro y los resultados.':'Elige una contraseña de al menos 12 caracteres y consérvala. No hay recuperación. También puedes restaurar una copia cifrada.';
 $('confirm-password-wrap').hidden=exists;$('restore-wrap').hidden=exists;
 $('unlock').textContent=exists?'Desbloquear':'Continuar';$('unlock').disabled=loadFailed||!crypto.subtle;
 if(!crypto.subtle)loginStatus('Se necesita HTTPS y un navegador compatible con Web Crypto.');
}
function lock(){
 if(!unlocked)return;
 if(busy){lockPending=true;return;}
 epoch++;unlocked=false;vaultKey=null;salt=null;session=empty();clearTimeout(idleTimer);idleTimer=null;
 stop();hidePresentation();$('presentation-content').replaceChildren();$('roster-count').textContent='';$('collection-count').textContent='';$('roster-search').value='';$('roster-filter').value='all';$('roster').replaceChildren();$('groups').replaceChildren();$('schools').replaceChildren();
 for(const id of ['roster-status','teacher-status','completion-summary'])$(id).textContent='';
 for(const id of ['roster-names','scan-text','scan-file'])$(id).value='';
 $('roster-school').selectedIndex=0;
 loginStatus('Área bloqueada.');showLogin();
}
function touch(){if(!unlocked)return;lastActivity=Date.now();clearTimeout(idleTimer);idleTimer=setTimeout(lock,idleMs);}
function done(){busy=false;if(lockPending){lockPending=false;lock();}}
$('login-form').onsubmit=async e=>{
 e.preventDefault();if(busy||unlocked||loadFailed)return;
 busy=true;const token=epoch;$('unlock').disabled=true;loginStatus('');
 const password=$('teacher-password').value, confirmation=$('confirm-password').value, file=$('restore-vault').files[0];
 $('teacher-password').value='';$('confirm-password').value='';
 try{
  const prior=storedRaw;let opened,raw=prior,next;
  if(prior!==null){opened=await VE_VAULT.open(prior,password);next=checkSession(opened.session);}
  else if(file){if(localStorage.getItem('ve-teacher-results-v2')!==null)throw Error('Hay datos anteriores: configúralos primero para cifrarlos.');if(file.size>5000000)throw Error('La copia es demasiado grande.');raw=await file.text();opened=await VE_VAULT.open(raw,password);next=checkSession(opened.session);}
  else{
   if(password!==confirmation)throw Error('Las contraseñas no coinciden.');
   const legacy=localStorage.getItem('ve-teacher-results-v2');
   next=legacy?checkSession(JSON.parse(legacy)):empty();
   opened=await VE_VAULT.create(next,password);raw=opened.raw;
  }
  if(token!==epoch)return;
  if(localStorage.getItem(key)!==prior)throw Error('El área cambió en otra pestaña. Recarga la página.');
  if(prior===null)localStorage.setItem(key,raw);
  // The prior experimental format is removed only after its encrypted replacement is saved.
  if(prior===null&&!file)localStorage.removeItem('ve-teacher-results-v2');
  storedRaw=raw;session=next;vaultKey=opened.key;salt=opened.salt;unlocked=true;epoch++;
  $('restore-vault').value='';$('teacher-login').hidden=true;$('teacher-private').hidden=false;render();touch();
 }catch(e){loginStatus(e.message);}
 finally{done();$('unlock').disabled=loadFailed||!crypto.subtle;}
};
async function save(next){
 if(!unlocked||busy)return false;
 busy=true;const token=epoch;
 try{
  next=checkSession(next);
  const raw=await VE_VAULT.seal(next,vaultKey,salt);
  if(!unlocked||token!==epoch)return false;
  if(localStorage.getItem(key)!==storedRaw)throw Error('La sesión ha cambiado en otra pestaña. Bloquea y vuelve a entrar.');
  localStorage.setItem(key,raw);storedRaw=raw;session=next;render();return true;
 }catch(e){status('No se pudo guardar: '+e.message);return false;}
 finally{done();}
}
$('lock-area').onclick=lock;
for(const event of ['pointerdown','keydown','touchstart'])document.addEventListener(event,touch,{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&unlocked&&Date.now()-lastActivity>=idleMs)lock();});
window.addEventListener('pagehide',()=>{if(unlocked){busy=false;lock();}else{epoch++;$('teacher-password').value='';$('confirm-password').value='';}});
$('delete-vault').onclick=()=>{
 if(!unlocked||busy)return;
 if(!confirm('¿Eliminar definitivamente el registro, los códigos y todos los resultados de este dispositivo? Las copias descargadas no se borrarán.')||!confirm('Esta acción no se puede deshacer. ¿Confirmas la eliminación?'))return;
 try{
  if(localStorage.getItem(key)!==storedRaw)throw Error('La sesión ha cambiado en otra pestaña.');
  localStorage.removeItem(key);localStorage.removeItem('ve-teacher-results-v2');lock();loginStatus('Datos docentes eliminados.');
 }catch(e){status('No se pudieron eliminar: '+e.message);}
};
async function add(code){
 if(!unlocked||busy)return;
 try{if(!session.sealed)throw Error('Cierra primero el registro de grupos.');
 const r=C.admit(session.roster,session.records,C.decode(code.trim()),session.closed);
 if(session.excluded.some(x=>x.code===r.code))throw Error('Grupo excluido por incidencia. Reincorpóralo antes de registrar su resultado.');
 if(await save({...session,records:[...session.records,r]})&&unlocked){touch();status('Resultado recibido: '+r.names.join(', ')+'.','success');if(pending(session)===0)stop();return true;}
 }catch(e){status('No se ha importado: '+e.message,'error');}return false;
}
$('roster-form').onsubmit=async e=>{
 e.preventDefault();if(!unlocked||busy||session.sealed||loadFailed)return;
 const school=$('roster-school').value,names=$('roster-names').value.split(/\r?\n/).filter(n=>n.trim());
 let code;do{code=C.makeCode(school);}while(session.roster.some(g=>g.code===code));
 const g=C.group({school,names,code,id:crypto.randomUUID()});
 if(!g){$('roster-status').textContent='Escribe entre dos y seis nombres válidos.';return;}
 if(session.roster.some(r=>r.school===school&&C.namesKey(r.names)===C.namesKey(g.names))){$('roster-status').textContent='Ese grupo ya está registrado.';return;}
 if(await save({...session,roster:[...session.roster,g]})&&unlocked){$('roster-names').value='';$('roster-status').textContent='Código generado: '+code;}
};
$('roster').onclick=e=>{
 if(!unlocked||busy||session.closed)return;
 const id=e.target.dataset.removeRoster,code=e.target.dataset.exclude,restore=e.target.dataset.reinstate;
 if(id&&!session.sealed&&confirm('¿Retirar este grupo del registro previo?')){void save({...session,roster:session.roster.filter(g=>g.id!==id)});return;}
 if(!session.sealed)return;
 if(code&&session.roster.some(g=>g.code===code)&&!session.records.some(g=>g.code===code)&&!session.excluded.some(x=>x.code===code)){
  const reason=prompt('Motivo de la exclusión (ausencia, incidencia técnica, etc.). No contará en la clasificación.');
  if(reason===null)return;
  if(!reason.trim()||reason.trim().length>300){$('roster-status').textContent='Escribe un motivo válido de hasta 300 caracteres.';return;}
  if(confirm('¿Excluir este grupo de la clasificación? Podrás reincorporarlo antes del cierre.'))void save({...session,excluded:[...session.excluded,{code,reason:reason.trim(),at:new Date().toISOString()}]});
 }else if(restore&&session.excluded.some(x=>x.code===restore)&&confirm('¿Reincorporar el grupo al registro de pendientes?'))void save({...session,excluded:session.excluded.filter(x=>x.code!==restore)});
};
$('seal-roster').onclick=()=>{if(unlocked&&!busy&&!session.sealed&&session.roster.length&&confirm('¿Cerrar el registro? No podrás añadir más grupos.'))save({...session,sealed:true});};
$('close-ranking').onclick=()=>{if(unlocked&&!busy&&canClose(session)&&confirm('¿Cerrar definitivamente la clasificación? Se han recibido '+session.records.length+' resultados y hay '+session.excluded.length+' grupos excluidos. Guarda una copia cifrada antes de cerrar.')){stop();void save({...session,closed:true});}};
window.addEventListener('storage',e=>{if(e.key===key||e.key===null){if(unlocked)lock();else showLogin();loginStatus('Los datos cambiaron en otra pestaña. Vuelve a acceder.');}});
function renderRoster(){
 const {roster,records,excluded,sealed,closed}=session;
 const normalize=s=>s.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const query=normalize($('roster-search').value.trim()),filter=$('roster-filter').value;
 let shown=0;
 $('roster').innerHTML=roster.map(g=>{
  const received=records.some(r=>r.code===g.code),incident=excluded.find(x=>x.code===g.code),state=received?'received':incident?'absent':'pending';
  if(filter!=='all'&&filter!==state)return '';
  if(query&&!normalize([g.code,...g.names,C.schools[g.school]].join(' ')).includes(query))return '';
  shown++;
  const action=!sealed?'<button data-remove-roster="'+esc(g.id)+'">Retirar grupo</button>':closed||received?'':incident?'<button data-reinstate="'+esc(g.code)+'">Reincorporar</button>':'<button data-exclude="'+esc(g.code)+'">Registrar incidencia</button>';
  return '<div class="teacher-rank roster-entry"><div><strong>'+esc(g.code)+'</strong><small>'+g.names.map(esc).join(', ')+' · '+esc(C.schools[g.school])+'</small>'+(incident?'<small>Motivo: '+esc(incident.reason)+'</small>':'')+'</div><span class="roster-state" data-state="'+state+'">'+(received?'Recibido':incident?'Excluido':'Pendiente')+'</span>'+action+'</div>';
 }).join('')||'<p>'+ (roster.length?'No hay grupos que coincidan.':'No hay grupos registrados.')+'</p>';
 $('roster-count').textContent=shown+' de '+roster.length+' grupos · '+records.length+' entregados · '+pending(session)+' pendientes · '+excluded.length+' excluidos';
}
$('roster-search').oninput=renderRoster;$('roster-filter').onchange=renderRoster;
function render(){
 const {roster,records,excluded,sealed,closed}=session;
 renderRoster();
 const collection=$('collection'),panel=$('roster-panel');
 if(sealed&&!closed&&panel.nextElementSibling===collection)panel.before(collection);
 else if((!sealed||closed)&&collection.nextElementSibling===panel)panel.after(collection);
 $('collection-count').textContent=records.length+' entregados · '+pending(session)+' pendientes · '+excluded.length+' excluidos';
 $('roster-form').hidden=sealed;
 $('seal-roster').disabled=sealed||!roster.length||loadFailed;
 $('seal-roster').textContent=sealed?'Registro cerrado':'Cerrar registro de grupos';
 $('close-ranking').disabled=!canClose(session)||loadFailed;
 $('show-ranking').disabled=!closed;
 $('close-ranking').textContent=closed?'Clasificación definitiva cerrada':'Cerrar clasificación definitiva';
 $('completion-summary').textContent=(closed?'Clasificación definitiva. ':'Clasificación provisional. ')+records.length+' entregados · '+pending(session)+' pendientes · '+excluded.length+' excluidos.';
 $('scan').disabled=closed||!sealed||loadFailed;$('scan-file').disabled=closed||!sealed||loadFailed;$('add-code').disabled=closed||!sealed||loadFailed;
 const {groups,institutes}=C.ranks(records);let rank=0;
 $('groups').innerHTML=groups.map((g,i)=>{
  if(!i||g.score!==groups[i-1].score)rank=i+1;
  const medal=rank<=3?' medal-'+rank:'';
  const trophy=rank<=3?'<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 3h16v3h5v4c0 5-3 8-8 9-1 2-2 3-3 4v3h6v3H8v-3h6v-3c-1-1-2-2-3-4-5-1-8-4-8-9V6h5zm0 6H6v1c0 3 1 4 4 6L8 9zm16 0-2 7c3-2 4-3 4-6V9z"/></svg>':'';
  return '<article class="rank-card'+medal+'" data-rank="'+rank+'"><div class="rank-place" aria-label="Puesto '+rank+'">'+trophy+'<span>'+rank+'º</span></div><div class="rank-main"><strong>'+g.names.map(esc).join(', ')+'</strong><small>'+esc(C.schools[g.school])+'</small><div class="rank-meter" aria-hidden="true"><span style="width:'+100*g.score/C.total+'%"></span></div></div><div class="rank-score"><strong>'+g.score+'/'+C.total+'</strong><small>'+new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(100*g.score/C.total)+' %</small></div></article>';
 }).join('')||'<p>Todavía no se han recibido resultados.</p>';
 rank=0;$('schools').innerHTML=institutes.map((s,i)=>{if(s.count&&(!i||s.sum*institutes[i-1].count!==institutes[i-1].sum*s.count))rank=i+1;return '<div class="teacher-rank"><div><strong>'+(s.count?rank+'. ':'')+esc(s.name)+'</strong><small>'+s.count+' grupos recibidos de '+roster.filter(g=>g.school===s.id).length+' · '+s.pupils+' alumnos</small></div><strong>'+(s.count?new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(s.sum/s.count/C.total*100)+' %':'Sin resultados')+'</strong></div>';}).join('');
}
$('add-code').onclick=()=>add($('scan-text').value);
const video=$('scan-video'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});let stream=null,generation=0,scanning=false;
function stop(){generation++;scanning=false;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.hidden=true;$('scan').textContent='Escanear QR';}
function decodeImage(img,w,h){const scale=Math.min(1,1200/Math.max(w,h));canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));ctx.drawImage(img,0,0,canvas.width,canvas.height);const data=ctx.getImageData(0,0,canvas.width,canvas.height);return jsQR(data.data,data.width,data.height)?.data;}
$('scan').onclick=async()=>{
 if(!unlocked||busy||session.closed)return;
 if(scanning){stop();return;}
 scanning=true;const token=++generation;$('scan').textContent='Detener escaneo';status('Cámara activa. Acerca el QR del siguiente grupo.');
 try{
  const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
  stream=acquired;video.srcObject=stream;video.hidden=false;await video.play();
  let lastCode='',blankFrames=0;
  const tick=async()=>{
   if(token!==generation||!unlocked)return;
   try{
    if(!busy&&video.readyState>=2&&video.videoWidth){
     const code=decodeImage(video,video.videoWidth,video.videoHeight);
     if(!code){if(++blankFrames>=4)lastCode='';}
     else{blankFrames=0;if(code!==lastCode){lastCode=code;await add(code);}}
    }
   }catch{stop();status('No se pudo leer la cámara. Usa una fotografía.','error');return;}
   if(token===generation)setTimeout(tick,200);
  };
  void tick();
 }catch{if(token===generation){stop();status('No se pudo abrir la cámara. Importa una foto o el código de respaldo.','error');}}
};
$('scan-file').onchange=async e=>{const file=e.target.files[0];if(!file||!unlocked||busy)return;const token=epoch;stop();const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(!unlocked||token!==epoch)return;const code=decodeImage(img,img.naturalWidth,img.naturalHeight);if(code)await add(code);else status('No se encontró un QR legible.');}catch{status('No se pudo leer la imagen.');}finally{URL.revokeObjectURL(url);e.target.value='';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',stop);
function exportBackup(){if(!unlocked||busy||!storedRaw)return;const url=URL.createObjectURL(new Blob([storedRaw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='valentia-resultados-cifrados.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=exportBackup;
function hidePresentation(){
 $('ranking-presentation').hidden=true;document.body.classList.remove('presenting');
 if(unlocked)$('teacher-private').hidden=false;
}
$('show-ranking').onclick=()=>{
 if(!unlocked||busy||!session.closed)return;
 stop();
 const {institutes}=C.ranks(session.records),eligible=institutes.filter(x=>x.count),best=eligible[0];
 const winners=best?eligible.filter(x=>x.sum*best.count===best.sum*x.count):[];
 const winnerText=winners.length===2?'Empate entre institutos':winners.length===1&&eligible.length===2?'Instituto ganador':'Único instituto con resultados';
 const groupView=$('groups').innerHTML;
 const schoolView=eligible.map(x=>'<div class="presentation-school"><strong>'+esc(x.name)+'</strong><span>'+new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(x.sum/x.count/C.total*100)+' %</span></div>').join('');
 $('presentation-content').innerHTML='<div class="presentation-hero"><p class="muted">Valentia Epigraphica · Clasificación definitiva</p><h2>'+winnerText+'</h2><p class="presentation-winner">'+winners.map(x=>esc(x.name)).join(' · ')+'</p><p>'+session.records.length+' grupos clasificados</p></div><h3>Clasificación por grupos</h3><div class="rank-list">'+groupView+'</div><h3>Clasificación por institutos</h3>'+schoolView;
 $('teacher-private').hidden=true;$('ranking-presentation').hidden=false;document.body.classList.add('presenting');window.scrollTo(0,0);
};
$('exit-ranking').onclick=()=>{hidePresentation();$('presentation-content').replaceChildren();};
$('print-ranking').onclick=()=>{if(unlocked&&session.closed&&!$('ranking-presentation').hidden)window.print();};
showLogin();if('serviceWorker' in navigator&&isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>status('No se pudo preparar el uso sin conexión.'));
