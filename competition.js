'use strict';
globalThis.VE_COMP=(()=>{
 const schools={veles:'IES Veles e Vents',om:'IES L’Om'}, activities=[...VE_DATA.items,VE_DATA.recap];
 const total=activities.reduce((n,x)=>n+x.questions.length,0);
 const bank=JSON.stringify(activities.map(x=>[x.id,x.questions.map(q=>[q.text,q.options,q.correct])]));
 let h=2166136261;for(let i=0;i<bank.length;i++)h=Math.imul(h^bank.charCodeAt(i),16777619);
 const fingerprint=(h>>>0).toString(36);
 function group(g){
  if(!g||!Object.hasOwn(schools,g.school)||typeof g.id!=='string'||!/^[a-f0-9-]{36}$/.test(g.id)||!Array.isArray(g.names)||g.names.length<2||g.names.length>6)return null;
  if(g.names.some(n=>typeof n!=='string'))return null;
  const names=g.names.map(n=>n.trim().replace(/\s+/g,' ').normalize('NFC'));
  if(names.some(n=>!n||n.length>40||/[\u0000-\u001f\u007f]/.test(n)))return null;
  return {id:g.id,school:g.school,names};
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
  return 'VE1:'+encodeURIComponent(JSON.stringify(r));
 }
 function decode(code){if(typeof code!=='string'||code.length>5000||!code.startsWith('VE1:'))throw Error('No es un QR de Valentia Epigraphica.');return validate(JSON.parse(decodeURIComponent(code.slice(4))));}
 function ranks(records){
  const groups=records.map(validate).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const institutes=Object.entries(schools).map(([id,name])=>{const list=groups.filter(g=>g.school===id);return {id,name,count:list.length,pupils:list.reduce((n,g)=>n+g.names.length,0),sum:list.reduce((n,g)=>n+g.score,0)};}).sort((a,b)=>!a.count&&!b.count?0:!a.count?1:!b.count?-1:b.sum*a.count-a.sum*b.count);
  return {groups,institutes};
 }
 return {schools,total,group,validate,encode,decode,ranks};
})();