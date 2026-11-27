'use strict';
const C=VE_COMP,key='ve-teacher-vault-v1',$=id=>document.getElementById(id),status=m=>{$('teacher-status').textContent=m;};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=()=>({roster:[],records:[],sealed:false,closed:false});
let session=empty(), storedRaw=null, vaultKey=null, salt=null, unlocked=false, busy=false, lockPending=false, epoch=0, idleTimer=null, lastActivity=0;
let loadFailed=false;
const idleMs=5*60*1000;
function checkSession(raw){
 if(!raw||!Array.isArray(raw.roster)||!Array.isArray(raw.records)||typeof raw.sealed!=='boolean'||typeof raw.closed!=='boolean')throw Error('Copia inválida.');
 const roster=raw.roster.map(g=>{const v=C.group(g);if(!v)throw Error('Grupo inválido.');return v;});
 const records=raw.records.map(C.validate);
 if(new Set(roster.map(g=>g.code)).size!==roster.length||new Set(roster.map(g=>g.id)).size!==roster.length||new Set(roster.map(g=>g.school+':'+C.namesKey(g.names))).size!==roster.length)throw Error('Registro duplicado.');
 if((records.length&&!raw.sealed)||(raw.sealed&&!roster.length)||(raw.closed&&(!raw.sealed||records.length!==roster.length)))throw Error('Estado inválido.');
 const accepted=[];for(const r of records){C.admit(roster,accepted,r);accepted.push(r);}
 return {roster,records,sealed:raw.sealed,closed:raw.closed};
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
 stop();$('roster').replaceChildren();$('groups').replaceChildren();$('schools').replaceChildren();
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
 if(await save({...session,records:[...session.records,r]})&&unlocked)status('Resultado recibido: '+r.names.join(', ')+'.');
 }catch(e){status('No se ha importado: '+e.message);}
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
$('roster').onclick=e=>{const id=e.target.dataset.removeRoster;if(unlocked&&!busy&&id&&!session.sealed&&confirm('¿Retirar este grupo del registro previo?'))save({...session,roster:session.roster.filter(g=>g.id!==id)});};
$('seal-roster').onclick=()=>{if(unlocked&&!busy&&!session.sealed&&session.roster.length&&confirm('¿Cerrar el registro? No podrás añadir más grupos.'))save({...session,sealed:true});};
$('close-ranking').onclick=()=>{if(unlocked&&!busy&&session.sealed&&!session.closed&&session.records.length===session.roster.length&&confirm('¿Cerrar definitivamente la clasificación?'))save({...session,closed:true});};
window.addEventListener('storage',e=>{if(e.key===key||e.key===null){if(unlocked)lock();else showLogin();loginStatus('Los datos cambiaron en otra pestaña. Vuelve a acceder.');}});
function render(){
 const {roster,records,sealed,closed}=session;
 $('roster').innerHTML=roster.map(g=>'<div class="teacher-rank"><div><strong>'+esc(g.code)+'</strong><small>'+g.names.map(esc).join(', ')+' · '+esc(C.schools[g.school])+'</small></div><span>'+(records.some(r=>r.code===g.code)?'Recibido':'Pendiente')+'</span>'+(!sealed?'<button data-remove-roster="'+esc(g.id)+'">Retirar grupo</button>':'')+'</div>').join('')||'<p>No hay grupos registrados.</p>';
 $('roster-form').hidden=sealed;
 $('seal-roster').disabled=sealed||!roster.length||loadFailed;
 $('seal-roster').textContent=sealed?'Registro cerrado':'Cerrar registro de grupos';
 $('close-ranking').disabled=closed||!sealed||records.length!==roster.length||loadFailed;
 $('close-ranking').textContent=closed?'Clasificación definitiva cerrada':'Cerrar clasificación definitiva';
 $('completion-summary').textContent=(closed?'Clasificación definitiva. ':'Clasificación provisional. ')+records.length+' de '+roster.length+' grupos recibidos.';
 $('scan').disabled=closed||!sealed||loadFailed;$('scan-file').disabled=closed||!sealed||loadFailed;$('add-code').disabled=closed||!sealed||loadFailed;
 const {groups,institutes}=C.ranks(records);let rank=0;
 $('groups').innerHTML=groups.map((g,i)=>{if(!i||g.score!==groups[i-1].score)rank=i+1;return '<div class="teacher-rank"><div><strong>'+rank+'. '+g.names.map(esc).join(', ')+'</strong><small>'+esc(C.schools[g.school])+'</small></div><strong>'+g.score+'/'+C.total+'</strong></div>';}).join('')||'<p>Todavía no se han recibido resultados.</p>';
 rank=0;$('schools').innerHTML=institutes.map((s,i)=>{if(s.count&&(!i||s.sum*institutes[i-1].count!==institutes[i-1].sum*s.count))rank=i+1;return '<div class="teacher-rank"><div><strong>'+(s.count?rank+'. ':'')+esc(s.name)+'</strong><small>'+s.count+' grupos recibidos de '+roster.filter(g=>g.school===s.id).length+' · '+s.pupils+' alumnos</small></div><strong>'+(s.count?new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(s.sum/s.count/C.total*100)+' %':'Sin resultados')+'</strong></div>';}).join('');
}
$('add-code').onclick=()=>add($('scan-text').value);
const video=$('scan-video'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});let stream=null,generation=0,scanning=false;
function stop(){generation++;scanning=false;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.hidden=true;$('scan').textContent='Escanear QR';}
function decodeImage(img,w,h){const scale=Math.min(1,1200/Math.max(w,h));canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));ctx.drawImage(img,0,0,canvas.width,canvas.height);const data=ctx.getImageData(0,0,canvas.width,canvas.height);return jsQR(data.data,data.width,data.height)?.data;}
$('scan').onclick=async()=>{if(!unlocked||busy)return;if(scanning){stop();return;}scanning=true;const token=++generation;$('scan').textContent='Detener escaneo';try{const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;video.srcObject=stream;video.hidden=false;await video.play();const tick=()=>{if(token!==generation)return;try{if(video.readyState>=2&&video.videoWidth){const code=decodeImage(video,video.videoWidth,video.videoHeight);if(code){stop();add(code);return;}}}catch{stop();status('No se pudo leer la cámara. Usa una fotografía.');return;}setTimeout(tick,150);};tick();}catch{if(token===generation){stop();status('No se pudo abrir la cámara. Importa una foto o el código de respaldo.');}}};
$('scan-file').onchange=async e=>{const file=e.target.files[0];if(!file||!unlocked||busy)return;const token=epoch;stop();const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(!unlocked||token!==epoch)return;const code=decodeImage(img,img.naturalWidth,img.naturalHeight);if(code)await add(code);else status('No se encontró un QR legible.');}catch{status('No se pudo leer la imagen.');}finally{URL.revokeObjectURL(url);e.target.value='';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',stop);
$('export').onclick=()=>{if(!unlocked||busy||!storedRaw)return;const url=URL.createObjectURL(new Blob([storedRaw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='valentia-resultados-cifrados.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
showLogin();if('serviceWorker' in navigator&&isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>status('No se pudo preparar el uso sin conexión.'));
