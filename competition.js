'use strict';
globalThis.VE_COMP=(()=>{
 const schools={veles:'IES Veles e Vents',om:'IES L’Om'}, activities=[...VE_DATA.items,VE_DATA.recap];
 const total=activities.reduce((n,x)=>n+x.questions.length,0);
 const bank=JSON.stringify(activities.map(x=>[x.id,x.questions.map(q=>[q.text,q.options,q.correct])]));
 let h=2166136261;for(let i=0;i<bank.length;i++)h=Math.imul(h^bank.charCodeAt(i),16777619);
 const fingerprint=(h>>>0).toString(36);
 function codeFor(school,code){return typeof code==='string'&&Object.hasOwn(schools,school)&&new RegExp('^'+(school==='veles'?'V':'O')+'-[A-F0-9]{12}$').test(code);}
 function makeCode(school){
  if(!Object.hasOwn(schools,school))throw Error('Centro inválido.');
  return (school==='veles'?'V':'O')+'-'+Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
 }
 const namesKey=names=>JSON.stringify(names.map(n=>n.toLocaleLowerCase('es')).sort());
 function optionOrder(code,id,index,n){
  let seed=2166136261;for(const ch of code+':'+id+':'+index)seed=Math.imul(seed^ch.charCodeAt(0),16777619);
  const order=Array.from({length:n},(_,i)=>i);
  for(let i=n-1;i>0;i--){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const j=(seed>>>0)%(i+1);[order[i],order[j]]=[order[j],order[i]];}
  return order;
 }
 function group(g){
  if(!g||!codeFor(g.school,g.code)||typeof g.id!=='string'||!/^[a-f0-9-]{36}$/.test(g.id)||!Array.isArray(g.names)||g.names.length<2||g.names.length>6)return null;
  if(g.names.some(n=>typeof n!=='string'))return null;
  const names=g.names.map(n=>n.trim().replace(/\s+/g,' ').normalize('NFC'));
  if(names.some(n=>!n||n.length>40||/[\u0000-\u001f\u007f]/.test(n)))return null;
  return {id:g.id,school:g.school,names,code:g.code};
 }
 function validate(r){
  const g=group(r);
  if(!g||r.bank!==fingerprint||!Array.isArray(r.first)||r.first.length!==total)throw Error('Resultado inválido o de otra versión.');
  let i=0,score=0;for(const x of activities)for(const q of x.questions){const v=r.first[i++];if(!Number.isInteger(v)||v<0||v>=q.options.length)throw Error('Respuestas inválidas.');score+=Number(v===q.correct);}
  return {...g,bank:fingerprint,first:r.first.slice(),score};
 }
 function encode(g,records){
  const first=activities.flatMap(x=>x.questions.map((q,i)=>records[x.id]?.first?.[i]));
  const r=validate({...g,bank:fingerprint,first});delete r.score;
  return 'VE2:'+encodeURIComponent(JSON.stringify(r));
 }
 function decode(code){if(typeof code!=='string'||code.length>5000||!code.startsWith('VE2:'))throw Error('No es un QR de Valentia Epigraphica.');return validate(JSON.parse(decodeURIComponent(code.slice(4))));}
 function admit(roster,records,r,closed=false){
  if(closed)throw Error('La clasificación está cerrada.');
  const entry=roster.find(g=>g.code===r.code);
  if(!entry||entry.school!==r.school)throw Error('Código de inscripción desconocido o centro incorrecto.');
  if(namesKey(entry.names)!==namesKey(r.names))throw Error('Los nombres no coinciden con el registro docente.');
  if(records.some(g=>g.code===r.code||g.id===r.id))throw Error('Este grupo ya ha entregado su resultado.');
  return r;
 }
 function ranks(records){
  const groups=records.map(validate).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const institutes=Object.entries(schools).map(([id,name])=>{const list=groups.filter(g=>g.school===id);return {id,name,count:list.length,pupils:list.reduce((n,g)=>n+g.names.length,0),sum:list.reduce((n,g)=>n+g.score,0)};}).sort((a,b)=>!a.count&&!b.count?0:!a.count?1:!b.count?-1:b.sum*a.count-a.sum*b.count);
  return {groups,institutes};
 }
 return {schools,total,group,validate,encode,decode,ranks,codeFor,makeCode,namesKey,optionOrder,admit};
})();