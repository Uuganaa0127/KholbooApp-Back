import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';

test('category API authorization, validation, rename, archive and persistence', async () => {
 const directory=await mkdtemp(join(tmpdir(),'youth-categories-'));
 const port=4192, password=randomBytes(16).toString('hex');
 let child;
 async function start() {
  child=spawn(process.execPath,['src.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),DATA_DIR:directory,ADMIN_EMAIL:'test@example.test',ADMIN_PASSWORD:password,JWT_SECRET:randomBytes(32).toString('hex')},stdio:'pipe'});
  let output='';child.stderr.on('data',chunk=>output+=chunk);
  for(let i=0;i<60;i++){ if(child.exitCode!==null) throw new Error(output);try {const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100)); }
  throw new Error('Server failed to start '+output);
 }
 async function stop(){if(child && child.exitCode===null){await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}}
 const api=async(path,method='GET',body,token)=>{const response=await fetch(`http://127.0.0.1:${port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 try {
  await start();
  assert.equal((await api('/categories','POST',{name:'No access'})).status,401);
  const login=await api('/auth/login','POST',{email:'test@example.test',password});assert.equal(login.status,200);const token=login.data.token;
  assert.equal((await api('/categories','POST',{name:'   '},token)).status,400);
  assert.equal((await api('/categories','POST',{name:'Bad',color:'red'},token)).status,400);
  const created=await api('/categories','POST',{name:'Integration topic',color:'#123456',order:8},token);assert.equal(created.status,201);
  const id=created.data.id;
  assert.equal((await api('/categories','POST',{name:'Integration topic'},token)).status,409);
  const renamed=await api(`/categories/${id}`,'PATCH',{name:'Renamed topic',active:false},token);assert.equal(renamed.status,200);assert.deepEqual(renamed.data.aliases,['Integration topic']);
  const publicData=(await api('/public/categories')).data;assert.equal(publicData.find(c=>c.id===id).active,false);assert.ok(!JSON.stringify(publicData).includes('password'));
  const concurrent=await Promise.all(['Parallel one','Parallel two'].map(name=>api('/categories','POST',{name},token)));assert.ok(concurrent.every(r=>r.status===201));
  await stop();await start();
  const persisted=(await api('/public/categories')).data;assert.equal(persisted.find(c=>c.id===id).name,'Renamed topic');assert.ok(persisted.some(c=>c.name==='Parallel one'));assert.ok(persisted.some(c=>c.name==='Parallel two'));
 } finally {await stop();await rm(directory,{recursive:true,force:true});}
});
