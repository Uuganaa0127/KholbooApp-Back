import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
test('connected courses, accounts, stories, anonymous moderation and once-only rewards',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'youth-platform-'));const password=randomBytes(16).toString('hex');const secret=randomBytes(32).toString('hex');let child;
 const start=async()=>{child=spawn(process.execPath,['src.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'4194',DATA_DIR:dir,ADMIN_EMAIL:'admin@test.test',ADMIN_PASSWORD:password,JWT_SECRET:secret},stdio:'pipe'});for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:4194/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server failed');};
 const stop=async()=>{if(child?.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});};
 const api=async(path,token,body,method)=>{const r=await fetch('http://127.0.0.1:4194/api'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 try{await start();const admin=(await api('/auth/login',null,{email:'admin@test.test',password})).data.token;
 const user=(await api('/users',admin,{name:'Doctor One',email:'doctor@test.test',password,role:'learner',memberLevel:'bronze',paymentStatus:'unpaid',active:true})).data;assert.ok(user.id);
 assert.equal((await api('/users/'+user.id,admin,{name:'Doctor Edited'},'PATCH')).data.name,'Doctor Edited');
 const token=(await api('/account/login',null,{email:'doctor@test.test',password})).data.token;
 assert.equal((await api('/users',token)).status,403);
 const story=(await api('/stories',admin,{label:'News',title:'App news',body:'Story body',published:false,order:0})).data;
 assert.equal((await api('/public/stories')).data.length,0);await api('/stories/'+story.id,admin,{published:true},'PATCH');assert.equal((await api('/public/stories')).data[0].title,'App news');
 await api('/coins/settings',admin,{dailyBonus:17},'PATCH');await Promise.all([api('/account/check-in',token,{}),api('/account/check-in',token,{})]);assert.equal((await api('/account/me',token)).data.balance,17);
 await api('/coins/adjust',admin,{userId:user.id,amount:5,reason:'Bonus',requestId:'once'});await api('/coins/adjust',admin,{userId:user.id,amount:5,reason:'Bonus',requestId:'once'});assert.equal((await api('/account/me',token)).data.balance,22);
 const cat=(await api('/public/categories')).data.find(c=>c.active);const post=(await api('/account/discussions',token,{title:'Discussion',body:'De-identified topic',anonymous:true,categoryId:cat.id})).data;assert.equal(post.author,null);assert.equal(post.ownerId,undefined);assert.equal(post.canManage,true);
 await api('/discussions/'+post.id,admin,{closed:true},'PATCH');assert.equal((await api('/account/discussions/'+post.id,token,{reply:'reply'},'PATCH')).status,400);await api('/discussions/'+post.id,admin,{hidden:true},'PATCH');assert.equal((await api('/account/discussions',token)).data.length,0);
 const question={prompt:'Choose B',options:['A','B'],answer:1,explanation:'B'};const course=(await api('/courses',admin,{title:'Connected',reward:80})).data;const lesson=(await api(`/courses/${course.id}/lessons`,admin,{title:'Subcourse',durationMinutes:2,videoUrl:'https://example.com/video.mp4',questionItems:[question]})).data;await api(`/courses/${course.id}/test`,admin,{title:'Final',passPercent:80,questionItems:[question]},'PATCH');
 const catalog=(await api('/public/courses')).data.find(c=>c.id===course.id);assert.equal(catalog.lessons[0].id,lesson.id);assert.equal(catalog.finalTest.questionItems[0].answer,undefined);
 assert.equal((await api(`/account/courses/${course.id}/exam`,token,{answers:[1]})).status,400);
 assert.equal((await api(`/account/courses/${course.id}/lessons/${lesson.id}/complete`,token,{answers:[0]})).status,400);assert.equal((await api(`/account/courses/${course.id}/lessons/${lesson.id}/complete`,token,{answers:[1]})).status,200);
 assert.equal((await api(`/account/courses/${course.id}/exam`,token,{answers:[0]})).data.passed,false);await Promise.all([api(`/account/courses/${course.id}/exam`,token,{answers:[1]}),api(`/account/courses/${course.id}/exam`,token,{answers:[1]})]);assert.equal((await api('/account/me',token)).data.balance,102);

 // Eight-character passwords are accepted; shorter passwords are rejected.
 assert.equal((await api('/users/'+user.id,admin,{password:'short77'},'PATCH')).status,400);
 assert.equal((await api('/users/'+user.id,admin,{password:'eight888'},'PATCH')).status,200);
 assert.ok((await api('/account/login',null,{email:'doctor@test.test',password:'eight888'})).data.token);
 // Premium media/questions are absent from locked catalogs and progress endpoints enforce access.
 const premium=(await api('/courses',admin,{title:'Premium',premium:true,priceCoins:40,reward:5})).data;
 const premiumLesson=(await api(`/courses/${premium.id}/lessons`,admin,{title:'Private',description:'Text lesson',durationMinutes:2,questionItems:[]})).data;
 const publicPremium=(await api('/public/courses')).data.find(c=>c.id===premium.id);
 assert.equal(publicPremium.locked,true);assert.equal(publicPremium.lessons[0].description,undefined);
 assert.equal((await api(`/account/courses/${premium.id}/lessons/${premiumLesson.id}/complete`,token,{answers:[]})).status,403);
 assert.equal((await api(`/account/courses/${premium.id}/game`,token,{})).status,403);
 const purchases=await Promise.all([api(`/account/courses/${premium.id}/purchase`,token,{}),api(`/account/courses/${premium.id}/purchase`,token,{})]);
 assert.ok(purchases.every(p=>p.status===200));assert.equal((await api('/account/me',token)).data.balance,62);
 assert.equal((await api('/account/courses',token)).data.find(c=>c.id===premium.id).locked,false);
 await api(`/account/courses/${premium.id}/game`,token,{});
 assert.equal((await api('/account/me',token)).data.progress[premium.id].gameCompleted,true);
 const costly=(await api('/courses',admin,{title:'Membership',premium:true,priceCoins:200})).data;
 assert.equal((await api(`/account/courses/${costly.id}/purchase`,token,{})).status,409);
 await api('/users/'+user.id,admin,{memberLevel:'premium',paymentStatus:'unpaid'},'PATCH');
 assert.equal((await api('/account/courses',token)).data.find(c=>c.id===costly.id).locked,false);
 await api('/users/'+user.id,admin,{paymentStatus:'paid'},'PATCH');
 assert.equal((await api('/account/courses',token)).data.find(c=>c.id===costly.id).locked,false);
 await api(`/account/courses/${costly.id}/purchase`,token,{});assert.equal((await api('/account/me',token)).data.balance,62);
 await api('/users/'+user.id,admin,{memberLevel:'bronze',paymentStatus:'unpaid'},'PATCH');
 assert.equal((await api('/account/courses',token)).data.find(c=>c.id===costly.id).locked,true);
 assert.equal((await api('/account/courses',token)).data.find(c=>c.id===premium.id).locked,false);
 await stop();await start();assert.equal((await api('/account/me',token)).data.balance,62);
 assert.ok((await api('/account/me',token)).data.purchases.includes(premium.id));

 await api('/users/'+user.id,admin,{active:false},'PATCH');assert.equal((await api('/account/me',token)).status,401);
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
