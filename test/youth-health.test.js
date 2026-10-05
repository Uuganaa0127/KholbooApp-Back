import test from 'node:test';
import assert from 'node:assert/strict';
import {youthHealthRoutes} from '../youth-health.js';
function setup(upstream) {
 const routes={}; const auth=()=>{};
 const app={get:(path,...handlers)=>routes['GET '+path]=handlers,post:(path,...handlers)=>routes['POST '+path]=handlers};
 youthHealthRoutes(app,auth,upstream);
 return {routes,auth,async call(path,body){let status=200,value;const res={status(n){status=n;return this},json(v){value=v;return this}};await routes[path].at(-1)({body},res);return {status,value}}};
}
const application={name:'Demo Doctor',email:'demo@example.com',role:'Doctor',profession:'doctor',region:'Баянзүрх',specialty:'Medicine',phone:'',committeeId:'',khorooId:'',consent:true};
test('application matches website contract without forwarding credentials',async()=>{
 let sent;const s=setup(async(url,options)=>{assert.equal(url,'https://youthhealthpf.mn/api/data');sent=JSON.parse(options.body);return {ok:true}});
 const r=await s.call('POST /api/public/membership-applications',{...application,password:'must-not-forward',token:'secret',kind:'admin'});
 assert.equal(r.status,201);assert.equal(sent.kind,'application');assert.equal(sent.specialty,'Medicine');assert.equal(sent.password,undefined);assert.equal(sent.token,undefined);assert.equal(sent.consent,undefined);
});
test('invalid or unconsented applications never reach upstream',async()=>{
 const s=setup(()=>{throw Error('must not be called')});
 for(const patch of [{consent:false},{email:'bad'},{name:''},{region:'unknown'},{profession:'admin'},{phone:12}]) assert.equal((await s.call('POST /api/public/membership-applications',{...application,...patch})).status,400);
});
test('published members are admin protected and field limited',async()=>{
 const s=setup(async()=>({ok:true,json:async()=>[{id:'1',kind:'member',name:'Public name',email:'private',passwordHash:'secret'},{kind:'application',name:'pending'}]}));
 assert.equal(s.routes['GET /api/youth-health-members'][0],s.auth);
 assert.deepEqual((await s.call('GET /api/youth-health-members')).value,[{id:'1',name:'Public name'}]);
});
test('options and conditional fields match website and errors stay visible',async()=>{
 const s=setup(async()=>({ok:true,json:async()=>[{kind:'committee',id:'c',name:'Committee'},{kind:'khoroo',id:'k',name:'Ward',region:'Баянзүрх'}]}));
 const r=await s.call('GET /api/public/membership-options');assert.equal(r.value.regions.length,30);assert.equal(r.value.committees[0].id,'c');
 const fail=setup(async()=>{throw Error('private failure')});assert.equal((await fail.call('POST /api/public/membership-applications',application)).status,502);
 let sent;const conditional=setup(async(_,o)=>{sent=JSON.parse(o.body);return {ok:true}});
 await conditional.call('POST /api/public/membership-applications',{...application,profession:'nurse',region:'Архангай'});assert.equal(sent.specialty,undefined);assert.equal(sent.khorooId,undefined);
});
