const assert=require('node:assert/strict');
require('../vault.js');
(async()=>{
 const V=VE_VAULT, p='Test-password-2026', data={roster:[{names:['Manuel','Andrea'],code:'V-123456789ABC'}],records:[]};
 const created=await V.create(data,p);
 assert.equal(created.key.extractable,false);
 assert.ok(!created.raw.includes('Manuel')&&!created.raw.includes(p));
 assert.deepEqual((await V.open(created.raw,p)).session,data);
 await assert.rejects(V.open(created.raw,'wrong-password'));
 await assert.rejects(V.create(data,'short'));
 const next=await V.seal(data,created.key,created.salt);
 assert.notEqual(JSON.parse(next).iv,JSON.parse(created.raw).iv);
 const changed=JSON.parse(created.raw);changed.data=(changed.data[0]==='A'?'B':'A')+changed.data.slice(1);
 await assert.rejects(V.open(JSON.stringify(changed),p));
 changed.iterations=1;await assert.rejects(V.open(JSON.stringify(changed),p));
 console.log('AES-GCM, PBKDF2, contraseña incorrecta, IV nuevo y alteración detectada OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
