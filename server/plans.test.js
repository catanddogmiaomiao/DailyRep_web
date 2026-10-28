import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makePlan,addDays,isDue,planProgress,updatePlan,reminderQueue,instantForLocal,validatePlanLink} from '../src/plans.js';
const now=new Date('2026-10-28T04:00:00Z');
const create=(input={})=>({id:'plan',...makePlan({sport:'abs',title:'腹肌100天',startDate:'2026-10-28',goalDays:100,timeZone:'Asia/Shanghai',reminderEnabled:true,reminderTime:'19:00',...input},now)});
const record=(day,extra={})=>({planId:'plan',sport:'abs',occurredAt:day+'T11:00:00Z',...extra});
test('100/150 day goals include the first day and flexible end dates',()=>{
 const p=create();assert.equal(p.endDate,addDays(p.startDate,99));
 assert.equal(create({goalDays:150}).endDate,addDays(p.startDate,149));
 assert.equal(create({endMode:'date',endDate:'2027-01-01'}).endDate,'2027-01-01');
 for(const goalDays of [0,-1,1.5,3651])assert.throws(()=>create({goalDays}));
 assert.throws(()=>create({startDate:'2026-02-30'}));assert.throws(()=>create({timeZone:'invalid'}));
});
test('calendar recurrence supports alternate weeks, month end and missing calendar dates',()=>{
 const weekly=create({repeat:{frequency:'weekly',interval:2,weekdays:[1,3,5]}});
 assert.equal(isDue(weekly,'2026-10-28'),true);assert.equal(isDue(weekly,'2026-11-04'),false);assert.equal(isDue(weekly,'2026-11-11'),true);
 const monthly=create({startDate:'2026-10-31',repeat:{frequency:'monthly',monthMode:'date'},goalDays:200});
 assert.equal(isDue(monthly,'2026-11-30'),false);assert.equal(isDue(monthly,'2026-12-31'),true);
 monthly.repeat.monthMode='last';monthly.scheduleHistory[0].repeat.monthMode='last';assert.equal(isDue(monthly,'2026-11-30'),true);
 const annual=create({startDate:'2028-02-29',goalDays:1500,repeat:{frequency:'yearly'}});
 assert.equal(isDue(annual,'2029-02-28'),false);assert.equal(isDue(annual,'2032-02-29'),true);
});
test('one day counts once; free check-ins are independent; planned rest does not break streak',()=>{
 const p=create({repeat:{frequency:'weekly',weekdays:[1,3,5]}});
 const rows=[record('2026-10-28'),record('2026-10-28'),record('2026-10-30'),record('2026-10-31'),record('2026-11-02',{planId:null})];
 const progress=planProgress(p,rows,new Date('2026-11-01T04:00:00Z'));
 assert.equal(progress.completedDays,3,'extra rest-day exercise is still a training day');assert.equal(progress.completedDueDays,2);assert.equal(progress.streak,2);
 assert.equal(planProgress(p,rows,new Date('2026-11-03T04:00:00Z')).streak,0);
});
test('100 to 110 to 120 keeps ID, original start and linked history',()=>{
 let p=create();const date=new Date(p.endDate+'T13:00:00Z'),rows=[record('2026-10-28')];
 p=updatePlan(p,{action:'extend',goalDays:110,revision:1},rows,date);
 assert.equal(p.id,'plan');assert.equal(p.startDate,'2026-10-28');assert.equal(p.goalDays,110);assert.equal(p.milestones.length,1);
 p=updatePlan(p,{action:'extend',goalDays:120,revision:2},rows,date);
 assert.equal(p.milestones.length,2);assert.equal(planProgress(p,rows,date).completedDays,1);
 assert.throws(()=>updatePlan(p,{action:'extend',goalDays:110,revision:3},rows,date));
 assert.throws(()=>updatePlan(p,{action:'edit',revision:1},rows,date),/其他设备/);
});
test('pause preserves completed today, stops reminders and extends the end on resume',()=>{
 const rows=[record('2026-10-28')];let p=create(),oldEnd=p.endDate;
 p=updatePlan(p,{action:'pause',revision:1},rows,now);assert.equal(p.pauses[0].from,'2026-10-29');
 assert.equal(planProgress(p,rows,now).completedDays,1);assert.equal(reminderQueue([p],rows,now).length,0);
 p=updatePlan(p,{action:'resume',revision:2},rows,new Date('2026-11-02T04:00:00Z'));
 assert.equal(p.endDate,addDays(oldEnd,4));assert.equal(p.goalDays,100);
 assert.equal(isDue(p,'2026-10-30'),false);
});
test('edits preserve historical repeat rules and take effect tomorrow',()=>{
 let p=create();p=updatePlan(p,{action:'edit',revision:1,title:'更新安排',repeat:{frequency:'weekly',weekdays:[1]},reminderTime:'20:00',reminderEnabled:true},[],now);
 assert.equal(isDue(p,'2026-10-28'),true);assert.equal(isDue(p,'2026-10-29'),false);assert.equal(isDue(p,'2026-11-02'),true);
});
test('reminders are end bounded, capacity bounded, timezone correct and skip completed dates',()=>{
 const p=create(),queue=reminderQueue([p],[record('2026-10-28')],now);
 assert.equal(queue.length,60);assert.equal(queue[0].at,'2026-10-29T11:00:00.000Z');
 assert.ok(queue.every(item=>item.at.slice(0,10)<=p.endDate));
 assert.equal(reminderQueue([{...p,endDate:'2026-10-28'}],[record('2026-10-28')],now).length,0);
 assert.equal(instantForLocal('2026-03-08','02:30','America/New_York'),null);
 assert.equal(instantForLocal('2026-10-28','19:00','Asia/Shanghai').toISOString(),'2026-10-28T11:00:00.000Z');
});
test('record linkage checks sport and date while allowing explicit extra training',()=>{
 const p=create();assert.doesNotThrow(()=>validatePlanLink(p,record('2026-10-28')));
 assert.throws(()=>validatePlanLink(p,record('2026-10-28',{sport:'running'})));
 assert.throws(()=>validatePlanLink(p,record('2026-01-01')));
});
