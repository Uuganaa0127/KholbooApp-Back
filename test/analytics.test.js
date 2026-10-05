import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsReport,learningPlan,recordAnswers,logEvent} from '../analytics.js';
test('analytics deduplicates events, uses first answer per version, and gates insights on sample size',()=>{
 const d={courses:[],tests:[],users:[]},q={id:'q',prompt:'Example',options:['A','B'],answer:1,topic:'Communication'};
 for(let i=0;i<5;i++)recordAnswers(d,`u${i}`,{scope:'practice',contentId:'t',attemptId:`a${i}`,questions:[q],answers:[0],durationMs:4000});
 recordAnswers(d,'u0',{scope:'practice',contentId:'t',attemptId:'a0',questions:[q],answers:[0],durationMs:4000});
 recordAnswers(d,'u0',{scope:'practice',contentId:'t',attemptId:'retry',questions:[q],answers:[1],durationMs:4000});
 let r=analyticsReport(d);assert.equal(r.questions[0].n,5);assert.equal(r.questions[0].accuracy,0);assert.equal(r.questions[0].seconds,4);assert.ok(r.insights.length);assert.equal(r.questions[0].userId,undefined);
 d.tests=[{id:'t',active:true,questionItems:[q]}];assert.equal(learningPlan(d,'u0').weak.length,0);assert.equal(learningPlan(d,'u1').weak[0].accuracy,0);
 d.tests[0].questionItems[0]={...q,prompt:'Updated'};assert.equal(learningPlan(d,'u1').weak.length,0);
 const small={...d,learningEvents:d.learningEvents.filter(e=>e.userId==='u0')};assert.equal(analyticsReport(small).insights.length,0);
});
test('report distinguishes pending attempts and 30-day return cohorts',()=>{
 const now=Date.now(),day=86400000,d={courses:[],tests:[],learningEvents:[]};
 logEvent(d,'u','practice_start',{attemptId:'abandoned'});d.learningEvents[0].at=new Date(now-2*day).toISOString();
 logEvent(d,'u','screen_view',{target:'home'});logEvent(d,'u','screen_view',{target:'tests'});d.learningEvents[2].at=new Date(now-40*day).toISOString();
 const r=analyticsReport(d,now);assert.equal(r.funnel.pending,1);assert.equal(r.funnel.completed,0);assert.equal(r.returnRate,100);assert.equal(r.previousActive,1);
 d.practice={u:{t:{nextReviewAt:new Date(now-day).toISOString()}}};d.tests=[{id:'t',title:'Review',active:true}];assert.equal(learningPlan(d,'u',now).due.length,1);
});
