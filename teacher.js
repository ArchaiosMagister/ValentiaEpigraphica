'use strict';
const C=VE_COMP,key='ve-teacher-results-v2',$=id=>document.getElementById(id),status=m=>{$('teacher-status').textContent=m;};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session={roster:[],records:[],sealed:false,closed:false};
let loadFailed=false, storedRaw=null;
function checkSession(raw){
 if(!raw||!Array.isArray(raw.roster)||!Array.isArray(raw.records)||typeof raw.sealed!=='boolean'||typeof raw.closed!=='boolean')throw Error('Copia inválida.');
 const roster=raw.roster.map(g=>{const v=C.group(g);if(!v)throw Error('Grupo inválido.');return v;});
 const records=raw.records.map(C.validate);
 if(new Set(roster.map(g=>g.code)).size!==roster.length||new Set(roster.map(g=>g.id)).size!==roster.length||new Set(roster.map(g=>g.school+':'+C.namesKey(g.names))).size!==roster.length)throw Error('Registro duplicado.');
 if((records.length&&!raw.sealed)||(raw.sealed&&!roster.length)||(raw.closed&&(!raw.sealed||records.length!==roster.length)))throw Error('Estado inválido.');
 const accepted=[];for(const r of records){C.admit(roster,accepted,r);accepted.push(r);}
 return {roster,records,sealed:raw.sealed,closed:raw.closed};
}
try{storedRaw=localStorage.getItem(key);if(storedRaw)session=checkSession(JSON.parse(storedRaw));}catch{loadFailed=true;status('No se pudo leer la sesión guardada. Restaura una copia antes de continuar.');}
function save(next,{restore=false}={}){
 try{
  if(loadFailed&&!restore)throw Error('Restaura primero la copia.');
  if(localStorage.getItem(key)!==storedRaw)throw Error('La sesión ha cambiado en otra pestaña. Recarga esta página.');
  next=checkSession(next);const raw=JSON.stringify(next);localStorage.setItem(key,raw);storedRaw=raw;loadFailed=false;
 }catch(e){status('No se pudo guardar: '+e.message);return false;}
 session=next;render();return true;
}
function add(code){
 try{if(!session.sealed)throw Error('Cierra primero el registro de grupos.');
 const r=C.admit(session.roster,session.records,C.decode(code.trim()),session.closed);
 if(save({...session,records:[...session.records,r]}))status('Resultado recibido: '+r.names.join(', ')+'.');
 }catch(e){status('No se ha importado: '+e.message);}
}
$('roster-form').onsubmit=e=>{
 e.preventDefault();if(session.sealed||loadFailed)return;
 const school=$('roster-school').value,names=$('roster-names').value.split(/\r?\n/).filter(n=>n.trim());
 let code;do{code=C.makeCode(school);}while(session.roster.some(g=>g.code===code));
 const g=C.group({school,names,code,id:crypto.randomUUID()});
 if(!g){$('roster-status').textContent='Escribe entre dos y seis nombres válidos.';return;}
 if(session.roster.some(r=>r.school===school&&C.namesKey(r.names)===C.namesKey(g.names))){$('roster-status').textContent='Ese grupo ya está registrado.';return;}
 if(save({...session,roster:[...session.roster,g]})){$('roster-names').value='';$('roster-status').textContent='Código generado: '+code;}
};
$('roster').onclick=e=>{const id=e.target.dataset.removeRoster;if(id&&!session.sealed&&confirm('¿Retirar este grupo del registro previo?'))save({...session,roster:session.roster.filter(g=>g.id!==id)});};
$('seal-roster').onclick=()=>{if(!session.sealed&&session.roster.length&&confirm('¿Cerrar el registro? No podrás añadir más grupos.'))save({...session,sealed:true});};
$('close-ranking').onclick=()=>{if(session.sealed&&!session.closed&&session.records.length===session.roster.length&&confirm('¿Cerrar definitivamente la clasificación?'))save({...session,closed:true});};
window.addEventListener('storage',e=>{if(e.key===key)status('La sesión cambió en otra pestaña. Recarga antes de continuar.');});
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
$('scan').onclick=async()=>{if(scanning){stop();return;}scanning=true;const token=++generation;$('scan').textContent='Detener escaneo';try{const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;video.srcObject=stream;video.hidden=false;await video.play();const tick=()=>{if(token!==generation)return;try{if(video.readyState>=2&&video.videoWidth){const code=decodeImage(video,video.videoWidth,video.videoHeight);if(code){stop();add(code);return;}}}catch{stop();status('No se pudo leer la cámara. Usa una fotografía.');return;}setTimeout(tick,150);};tick();}catch{if(token===generation){stop();status('No se pudo abrir la cámara. Importa una foto o el código de respaldo.');}}};
$('scan-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;stop();const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const code=decodeImage(img,img.naturalWidth,img.naturalHeight);if(code)add(code);else status('No se encontró un QR legible.');}catch{status('No se pudo leer la imagen.');}finally{URL.revokeObjectURL(url);e.target.value='';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',stop);
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(session)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='valentia-resultados.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('backup').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const next=checkSession(JSON.parse(await file.text()));if(!loadFailed&&(session.roster.length||session.closed))throw Error('La sesión ya tiene datos; no se puede sobrescribir.');if(confirm('¿Restaurar esta copia de la jornada?')&&save(next,{restore:true}))status('Copia restaurada.');}catch(e){status('No se restauró: '+e.message);}finally{e.target.value='';}};
render();if('serviceWorker' in navigator&&isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>status('No se pudo preparar el uso sin conexión.'));
