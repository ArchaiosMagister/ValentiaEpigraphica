'use strict';
// A password-derived, non-extractable key; no plaintext or password is persisted.
globalThis.VE_VAULT=(()=>{
 const rounds=600000, version=1, aad=new TextEncoder().encode('ValentiaEpigraphica/teacher/vault/1');
 const bytes=n=>crypto.getRandomValues(new Uint8Array(n));
 const b64=b=>{let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
 const un64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 function parse(raw){
  if(typeof raw!=='string'||raw.length>5000000)throw Error('Formato de copia inválido.');
  const o=JSON.parse(raw);
  if(!o||o.version!==version||o.kdf!=='PBKDF2-SHA256'||o.iterations!==rounds||o.cipher!=='AES-256-GCM'||![o.salt,o.iv,o.data].every(v=>typeof v==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(v)))throw Error('Formato de copia inválido.');
  const salt=un64(o.salt),iv=un64(o.iv),data=un64(o.data);
  if(salt.length!==16||iv.length!==12||data.length<16)throw Error('Formato de copia inválido.');
  return {salt,iv,data};
 }
 async function derive(password,salt){
  const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:rounds,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 async function seal(session,key,salt){
  const iv=bytes(12), data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,new TextEncoder().encode(JSON.stringify(session)));
  return JSON.stringify({version,kdf:'PBKDF2-SHA256',iterations:rounds,cipher:'AES-256-GCM',salt:b64(salt),iv:b64(iv),data:b64(new Uint8Array(data))});
 }
 async function create(session,password){
  if(typeof password!=='string'||password.length<12||password.length>256)throw Error('Usa una contraseña de entre 12 y 256 caracteres.');
  const salt=bytes(16),key=await derive(password,salt);
  return {key,salt,raw:await seal(session,key,salt)};
 }
 async function open(raw,password){
  const {salt,iv,data}=parse(raw),key=await derive(password,salt);
  let clear;try{clear=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,data);}catch{throw Error('Contraseña incorrecta o copia dañada.');}
  return {key,salt,session:JSON.parse(new TextDecoder().decode(clear))};
 }
 return {create,open,seal,parse};
})();
