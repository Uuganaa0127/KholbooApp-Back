import {extrasRoutes} from './extras.js';
import {analyticsRoutes,recordAnswers,learningPlan,versionOf} from './analytics.js';
import bcrypt from 'bcryptjs';
import {studyRoutes,professions,canUseTest} from './study.js';
import {ownsCourse} from './course-access.js';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const str=(v,max=5000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('Required text is missing or too long.');return v.trim();};
const bool=v=>{if(typeof v!=='boolean')fail('Invalid status.');return v;};
const integer=(v,min=0,max=100000)=>{if(!Number.isInteger(v)||v<min||v>max)fail('Invalid coin amount.');return v;};
const safe=({passwordHash,...u})=>u;
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ulaanbaatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const init=d=>{d.stories??=[];d.discussions??=[];d.ledger??=[];d.progress??={};d.purchases??={};d.coinSettings??={dailyBonus:10};return d;};
const balance=(d,id)=>d.ledger.filter(x=>x.userId===id).reduce((sum,x)=>sum+x.amount,0);
const credit=(d,userId,amount,kind,reference,reason)=>{if(d.ledger.some(x=>x.reference===reference))return false;d.ledger.push({id:randomUUID(),userId,amount,kind,reference,reason,createdAt:new Date().toISOString()});return true;};
const feedbackFor=(qs,a)=>qs.map((q,i)=>({prompt:q.prompt,correct:q.answer===a[i],answer:q.options[q.answer],explanation:q.explanation||'',source:q.source||''}));
const publicQuestions=items=>(items||[]).map(({id,prompt,options})=>({id,prompt,options}));
export function platformRoutes(app,admin,{db,save,secret,categories}) {
 const account=async(req,res,next)=>{try{const claim=jwt.verify(req.headers.authorization?.replace('Bearer ',''),secret);const d=await db();req.user=d.users.find(u=>u.id===claim.id&&u.active);if(!req.user)return res.status(401).json({error:'Please sign in again.'});next();}catch{return res.status(401).json({error:'Please sign in again.'});}};
 const read=async()=>init(await db());
 const accountView=(d,u)=>({user:safe(u),balance:balance(d,u.id),dailyBonus:d.coinSettings.dailyBonus,checkedIn:d.ledger.some(x=>x.reference===`daily:${u.id}:${day()}`),learningPlan:learningPlan(d,u.id),progress:d.progress[u.id]||{},purchases:d.purchases[u.id]||[],practice:Object.fromEntries(Object.entries(d.practice?.[u.id]||{}).filter(([id])=>{const t=d.tests.find(t=>t.id===id);return t&&canUseTest(u,t);} )),surveyCompleted:(d.surveyResponses||[]).filter(r=>r.userId===u.id).map(r=>r.surveyId),ledger:d.ledger.filter(x=>x.userId===u.id).slice(-30).reverse()});
 extrasRoutes(app,{account,admin,read,save});
 analyticsRoutes(app,{account,admin,read,save});
 studyRoutes(app,{account,admin,read,save,accountView});
 app.post('/api/account/login',async(req,res)=>{const d=await read();const u=d.users.find(u=>u.email.toLowerCase()===String(req.body.email).trim().toLowerCase());if(!u||!u.active||!await bcrypt.compare(String(req.body.password||''),u.passwordHash))fail('Email or password is incorrect.',401);res.json({token:jwt.sign({id:u.id},secret,{expiresIn:'7d'}),...accountView(d,u)});});
 app.get('/api/account/me',account,async(req,res)=>res.json(accountView(await read(),req.user)));
 app.post('/api/account/check-in',account,async(req,res)=>{const d=await read();credit(d,req.user.id,d.coinSettings.dailyBonus,'daily',`daily:${req.user.id}:${day()}`,'Өдөр тутмын бонус');await save(d);res.json(accountView(d,req.user));});
 app.get('/api/users',admin,async(_,res)=>res.json((await read()).users.map(safe)));
 const userFields=async(body,old={},d)=>{const n={...old,...body};const name=str(n.name,160),email=str(n.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid email.');if(d.users.some(u=>u.id!==old.id&&u.email.toLowerCase()===email))fail('This email already exists.',409);if(!['admin','learner'].includes(n.role)||!['bronze','silver','gold','premium'].includes(n.memberLevel)||!['paid','unpaid','trial'].includes(n.paymentStatus))fail('Invalid account option.');if(!professions.includes(n.profession??'Ерөнхий'))fail('Invalid profession.');const fields={name,email,profession:n.profession??'Ерөнхий',role:n.role,memberLevel:n.memberLevel,paymentStatus:n.paymentStatus,active:bool(n.active??true)};if(!old.id||body.password){if(typeof body.password!=='string'||body.password.length<8||body.password.length>72)fail('Password must be 8–72 characters.');fields.passwordHash=await bcrypt.hash(body.password,12);}return fields;};
 app.post('/api/users',admin,async(req,res)=>{const d=await read();const u={id:randomUUID(),xp:0,...await userFields(req.body,{},d)};d.users.push(u);await save(d);res.status(201).json(safe(u));});
 app.patch('/api/users/:id',admin,async(req,res)=>{const d=await read();const u=d.users.find(u=>u.id===req.params.id);if(!u)fail('User not found.',404);const fields=await userFields(req.body,u,d);if(u.id===req.admin.id&&(!fields.active||fields.role!=='admin'))fail('You cannot disable your own admin account.');if(u.role==='admin'&&(!fields.active||fields.role!=='admin')&&!d.users.some(x=>x.id!==u.id&&x.active&&x.role==='admin'))fail('Keep at least one active admin.');Object.assign(u,fields);await save(d);res.json(safe(u));});
 const storyFields=(b,old={})=>{const n={...old,...b};let imageUrl=String(n.imageUrl||'');if(imageUrl&&!/^https?:\/\//.test(imageUrl)&&!/^\/uploads\/[a-f0-9-]+\.(png|jpg|jpeg|webp)$/.test(imageUrl))fail('Use an HTTP or HTTPS image URL.');if(n.expiresAt&&!Number.isFinite(Date.parse(n.expiresAt)))fail('Invalid expiry date.');return {label:str(n.label,32),title:str(n.title,160),body:str(n.body),imageUrl,published:bool(n.published??false),order:integer(n.order??0),expiresAt:n.expiresAt||null};};
 app.get('/api/stories',admin,async(_,res)=>res.json((await read()).stories));
 app.get('/api/public/stories',async(_,res)=>res.json((await read()).stories.filter(s=>s.published&&(!s.expiresAt||Date.parse(s.expiresAt)>Date.now())).sort((a,b)=>a.order-b.order)));
 app.post('/api/stories',admin,async(req,res)=>{const d=await read();const s={id:randomUUID(),createdAt:new Date().toISOString(),...storyFields(req.body)};d.stories.push(s);await save(d);res.status(201).json(s);});
 app.patch('/api/stories/:id',admin,async(req,res)=>{const d=await read();const s=d.stories.find(s=>s.id===req.params.id);if(!s)fail('Story not found.',404);Object.assign(s,storyFields(req.body,s));await save(d);res.json(s);});
 app.get('/api/coins',admin,async(_,res)=>{const d=await read();res.json({settings:d.coinSettings,users:d.users.map(u=>({id:u.id,name:u.name,email:u.email,balance:balance(d,u.id)})),ledger:d.ledger.slice().reverse()});});
 app.patch('/api/coins/settings',admin,async(req,res)=>{const d=await read();d.coinSettings.dailyBonus=integer(req.body.dailyBonus);await save(d);res.json(d.coinSettings);});
 app.post('/api/coins/adjust',admin,async(req,res)=>{const d=await read();if(!d.users.some(u=>u.id===req.body.userId))fail('User not found.',404);const amount=integer(req.body.amount,-100000,100000);if(!amount||balance(d,req.body.userId)+amount<0)fail('Balance cannot be negative and amount cannot be zero.');const reference=`manual:${req.admin.id}:${str(req.body.requestId,100)}`;credit(d,req.body.userId,amount,'manual',reference,str(req.body.reason,500));await save(d);res.json({balance:balance(d,req.body.userId)});});
 const view=(p,u)=>{const {ownerId,hidden,...rest}=p;return {...rest,...(u.role==='admin'?{hidden}:{}),canManage:u.role==='admin'||ownerId===u.id};};
 app.get('/api/discussions',admin,async(req,res)=>res.json((await read()).discussions.map(p=>view(p,req.admin))));
 app.get('/api/account/discussions',account,async(req,res)=>res.json((await read()).discussions.filter(p=>!p.hidden).map(p=>view(p,req.user))));
 app.post('/api/account/discussions',account,async(req,res)=>{const d=await read();const cats=await categories.list();const c=cats.find(c=>c.id===req.body.categoryId&&c.active);if(!c)fail('Select an active category.');const anonymous=bool(req.body.anonymous);const p={id:randomUUID(),ownerId:req.user.id,title:str(req.body.title,200),body:str(req.body.body,10000),categoryId:c.id,specialty:c.name,author:anonymous?null:req.user.name,createdAt:new Date().toISOString(),closed:false,hidden:false,replies:[]};d.discussions.unshift(p);await save(d);res.status(201).json(view(p,req.user));});
 const changeDiscussion=async(req,res)=>{const d=await read();const u=req.user||req.admin;const p=d.discussions.find(p=>p.id===req.params.id);if(!p||p.hidden&&u.role!=='admin')fail('Discussion not found.',404);if(req.body.reply!==undefined){if(p.closed)fail('This case is closed.');p.replies.push(`${u.name}: ${str(req.body.reply,5000)}`);}else{if(u.role!=='admin'&&p.ownerId!==u.id)fail('Only the author can change this case.',403);if(req.body.closed!==undefined)p.closed=bool(req.body.closed);if(req.body.hidden!==undefined){if(u.role!=='admin')fail('Admin access required.',403);p.hidden=bool(req.body.hidden);}}await save(d);res.json(view(p,u));};
 app.patch('/api/discussions/:id',admin,changeDiscussion);app.patch('/api/account/discussions/:id',account,changeDiscussion);
 const catalogCourse=(c,unlocked)=>({...c,locked:!unlocked,preTest:c.preTest?{title:c.preTest.title,version:versionOf(c.preTest.questionItems),questionItems:unlocked?publicQuestions(c.preTest.questionItems):[]}:null,lessons:(c.lessons||[]).map(l=>unlocked?{...l,questionItems:publicQuestions(l.questionItems)}:{id:l.id,title:l.title,durationMinutes:l.durationMinutes}),finalTest:c.finalTest?{title:c.finalTest.title,passPercent:c.finalTest.passPercent,questionItems:unlocked?publicQuestions(c.finalTest.questionItems):[]}:null});
 app.get('/api/public/courses',async(_,res)=>res.json((await read()).courses.filter(c=>c.active).map(c=>catalogCourse(c,!c.premium))));
 app.get('/api/account/courses',account,async(req,res)=>{const d=await read();res.json(d.courses.filter(c=>c.active).map(c=>catalogCourse(c,ownsCourse(d,req.user,c))));});
 app.post('/api/account/courses/:id/purchase',account,async(req,res)=>{
  const d=await read(),c=d.courses.find(c=>c.id===req.params.id&&c.active);if(!c)fail('Course not found.',404);
  if(!ownsCourse(d,req.user,c)){
   const price=c.priceCoins;if(!Number.isInteger(price)||price<1)fail('Course is not available for coin purchase.');
   if(balance(d,req.user.id)<price)fail('Coin хүрэлцэхгүй байна. Өдрийн бонусоо цуглуулах эсвэл Premium гишүүнчлэлээ идэвхжүүлнэ үү.',409);
   credit(d,req.user.id,-price,'purchase',`purchase:${req.user.id}:${c.id}`,c.title);
   (d.purchases[req.user.id]??=[]).push(c.id);await save(d);
  }
  res.json(accountView(d,req.user));
 });
 const preRequired=(c,p)=>c.preTest?.questionItems?.length&&p.preTest?.version!==versionOf(c.preTest.questionItems);
 const courseState=(d,u,id)=>{const c=d.courses.find(c=>c.id===id&&c.active);if(!c)fail('Course not found.',404);if(!ownsCourse(d,u,c))fail('Unlock this premium course first.',403);d.progress[u.id]??={};const progress=d.progress[u.id][id]??={lessons:[],bestScore:0,completed:false};return {c,progress};};
 app.post('/api/account/courses/:id/pre-test',account,async(req,res)=>{
  const d=await read(),{c,progress}=courseState(d,req.user,req.params.id),qs=c.preTest?.questionItems;if(!qs?.length)fail('Pre-test not published.',404);
  const version=versionOf(qs);if(progress.preTest?.version===version)return res.json({score:progress.preTest.score,...accountView(d,req.user)});
  const a=req.body.answers;if(!Array.isArray(a)||a.length!==qs.length||a.some((v,i)=>!Number.isInteger(v)||v<0||v>=qs[i].options.length))fail('Answer every question.');
  const score=qs.filter((q,i)=>q.answer===a[i]).length;progress.preTest={score,percent:Math.round(100*score/qs.length),version,at:new Date().toISOString()};progress.firstPost=null;
  recordAnswers(d,req.user.id,{scope:'pretest',contentId:c.id,attemptId:randomUUID(),questions:qs,answers:a,topic:c.title});await save(d);res.json({score,...accountView(d,req.user)});
 });
 app.post('/api/account/courses/:id/lessons/:lessonId/complete',account,async(req,res)=>{const d=await read();const {c,progress}=courseState(d,req.user,req.params.id);if(preRequired(c,progress))fail('Complete the pre-test first.',409);const lesson=c.lessons.find(l=>l.id===req.params.lessonId);if(!lesson)fail('Lesson not found.',404);const questions=lesson.questionItems||[];if(questions.length){const answers=req.body.answers;if(!Array.isArray(answers)||answers.length!==questions.length||questions.some((q,i)=>answers[i]!==q.answer))fail('Answer all lesson questions correctly to continue.');}if(!progress.lessons.includes(lesson.id)){progress.lessons.push(lesson.id);req.user.xp=(req.user.xp||0)+20;d.users.find(u=>u.id===req.user.id).xp=req.user.xp;}await save(d);res.json(accountView(d,req.user));});
 app.post('/api/account/courses/:id/lessons/:lessonId/test',account,async(req,res)=>{
  const d=await read(),{c,progress}=courseState(d,req.user,req.params.id),l=c.lessons.find(l=>l.id===req.params.lessonId);if(!l)fail('Lesson not found.',404);
  if(preRequired(c,progress))fail('Complete the pre-test first.',409);
  const qs=l.questionItems||[],a=req.body.answers;if(!qs.length)fail('Дэд тест хараахан нийтлэгдээгүй байна.');if(!Array.isArray(a)||a.length!==qs.length||a.some((v,i)=>!Number.isInteger(v)||v<0||v>=qs[i].options.length))fail('Асуулт бүрт хариулна уу.');
  recordAnswers(d,req.user.id,{scope:'lesson',contentId:l.id,attemptId:randomUUID(),questions:qs,answers:a,topic:c.title});
  const score=qs.filter((q,i)=>q.answer===a[i]).length,passed=score===qs.length;progress.lessonScores??={};progress.lessonScores[l.id]=Math.round(score/qs.length*100);
  if(passed&&!progress.lessons.includes(l.id)){progress.lessons.push(l.id);req.user.xp=(req.user.xp||0)+20;d.users.find(u=>u.id===req.user.id).xp=req.user.xp;}
  await save(d);res.json({score,passed,feedback:feedbackFor(qs,a),...accountView(d,req.user)});
 });
 app.post('/api/account/courses/:id/game',account,async(req,res)=>{const d=await read();const {progress}=courseState(d,req.user,req.params.id);progress.gameCompleted=true;await save(d);res.json(accountView(d,req.user));});
 app.post('/api/account/courses/:id/exam',account,async(req,res)=>{const d=await read();const {c,progress}=courseState(d,req.user,req.params.id);if(preRequired(c,progress))fail('Complete the pre-test first.',409);if(!c.lessons?.length||!c.lessons.every(l=>progress.lessons.includes(l.id)))fail('Complete all subcourses first.');const qs=c.finalTest?.questionItems;if(!qs?.length)fail('The final test is not published yet.');const answers=req.body.answers;if(!Array.isArray(answers)||answers.length!==qs.length||answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=qs[i].options.length))fail('Answer every question.');recordAnswers(d,req.user.id,{scope:'posttest',contentId:c.id,attemptId:randomUUID(),questions:qs,answers,topic:c.title});const score=qs.filter((q,i)=>q.answer===answers[i]).length;if(!progress.firstPost||progress.firstPost.version!==versionOf(qs))progress.firstPost={percent:Math.round(100*score/qs.length),version:versionOf(qs),preVersion:progress.preTest?.version||null,at:new Date().toISOString()};progress.bestScore=Math.max(progress.bestScore,score/qs.length*100);const passed=score/qs.length*100>=c.finalTest.passPercent;if(passed){if(!progress.completed){req.user.xp=(req.user.xp||0)+100;d.users.find(u=>u.id===req.user.id).xp=req.user.xp;}progress.completed=true;credit(d,req.user.id,c.reward??50,'course',`course:${req.user.id}:${c.id}`,c.title);}await save(d);res.json({score,passed,feedback:feedbackFor(qs,answers),...accountView(d,req.user)});});
}
