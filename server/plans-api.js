import {makePlan, updatePlan, planProgress, validatePlanLink} from "../src/plans.js";
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("");
const random = size => Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,"0")).join("");
const error = (message,status=400) => {throw Object.assign(new Error(message),{status});};
const checked = fn => {try{return fn();}catch(e){throw Object.assign(e,{status:e.status||400});}};
export function planStore(db, worker=false) {
  const all = async (sql,args=[]) => worker ? (await db.prepare(sql).bind(...args).all()).results : db.prepare(sql).all(...args);
  const one = async (sql,args=[]) => worker ? db.prepare(sql).bind(...args).first() : db.prepare(sql).get(...args);
  const run = async (sql,args=[]) => worker ? db.prepare(sql).bind(...args).run() : db.prepare(sql).run(...args);
  const getPlan = async id => {const row=await one("SELECT spec FROM training_plans WHERE id=?",[id]);return row?JSON.parse(row.spec):null;};
  const records = async () => all("SELECT planId,sport,occurredAt FROM records");
  return {all,one,run,getPlan,records};
}
export async function validateRecordPlan(store, record, planId) {
  if(planId==null||planId==="")return null;
  if(typeof planId!=="string"||!/^[a-f0-9]{32}$/.test(planId))error("请选择有效计划");
  const plan=await store.getPlan(planId);checked(()=>validatePlanLink(plan,record));return planId;
}
export async function widgetState(store, code) {
  if(typeof code!=="string"||!/^[a-f0-9]{12}$/i.test(code))error("小组件连接码无效",401);
  const key=await hash(code.toLowerCase());
  const collection=await store.one("SELECT id FROM widget_collections WHERE tokenHash=?",[key]);
  const summary=(plan,records)=>({planId:plan.id,title:plan.title,sport:plan.sport,status:plan.status,progress:planProgress(plan,records)});
  if(collection){
    const records=await store.records();
    const plans=(await store.all("SELECT spec FROM training_plans ORDER BY rowid DESC"))
      .map(row=>JSON.parse(row.spec)).filter(plan=>plan.status!=="archived").map(plan=>summary(plan,records));
    const rank=p=>p.status==="active"&&!p.progress.ended?(p.progress.dueToday&&!p.progress.doneToday?0:1):p.status==="paused"?2:3;
    plans.sort((a,b)=>rank(a)-rank(b));
    return {scope:"all",plans,updatedAt:new Date().toISOString()};
  }
  const link=await store.one("SELECT planId FROM widget_links WHERE tokenHash=?",[await hash(code.toLowerCase())]);
  if(!link)error("连接已撤销，请在App重新生成连接码",401);
  const plan=await store.getPlan(link.planId);
  if(!plan||plan.status==="archived")error("计划不可用",404);
  const item=summary(plan,await store.records());
  return {...item,scope:"plan",plans:[item],updatedAt:new Date().toISOString()};
}
export async function handlePlanRoute(store, route, method, body={}) {
  if(!body||typeof body!=="object"||Array.isArray(body))error("计划内容无效");
  if(route==="/plans"&&method==="GET") {
    const rows=await store.all("SELECT spec FROM training_plans ORDER BY rowid DESC"), records=await store.records();
    return {status:200,body:rows.map(row=>{const plan=JSON.parse(row.spec);return {...plan,progress:planProgress(plan,records)};})};
  }
  if(route==="/plans"&&method==="POST") {
    const plan={id:random(16),...checked(()=>makePlan(body))};
    try {await store.run("INSERT INTO training_plans(id,sport,status,revision,spec) VALUES (?,?,?,?,?)",[plan.id,plan.sport,plan.status,plan.revision,JSON.stringify(plan)]);}
    catch(e){if(String(e).includes("UNIQUE"))error("这个项目已有进行中或暂停的计划，请编辑或续期现有计划",409);throw e;}
    return {status:201,body:plan};
  }
  const match=route.match(/^\/plans\/([a-f0-9]{32})$/);
  if(match&&method==="POST") {
    const plan=await store.getPlan(match[1]);if(!plan)error("计划不存在",404);
    const records=await store.records();
    const next=checked(()=>updatePlan(plan,body,records));
    try {
      const result=await store.run("UPDATE training_plans SET status=?,revision=?,spec=? WHERE id=? AND revision=?",[next.status,next.revision,JSON.stringify(next),next.id,plan.revision]);
      if(Number(result.meta?.changes??result.changes)!==1)error("计划已在其他设备更新，请刷新",409);
    } catch(e){if(String(e).includes("UNIQUE"))error("该项目已有另一个进行中的计划",409);throw e;}
    return {status:200,body:next};
  }
  if(route==="/widget-links"&&method==="POST") {
    if(body.scope==="all"){
      const code=random(6);
      await store.run("INSERT INTO widget_collections(id,tokenHash) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET tokenHash=excluded.tokenHash",[await hash(code)]);
      return {status:201,body:{code,scope:"all"}};
    }
    const plan=await store.getPlan(body.planId);if(!plan||plan.status==="archived")error("请选择有效计划");
    const code=random(6),tokenHash=await hash(code);
    await store.run("INSERT INTO widget_links(tokenHash,planId) VALUES (?,?) ON CONFLICT(planId) DO UPDATE SET tokenHash=excluded.tokenHash",[tokenHash,plan.id]);
    return {status:201,body:{code,planId:plan.id}};
  }
  if(route==="/widget-links"&&method==="DELETE") {
    if(body.scope==="all"){await store.run("DELETE FROM widget_collections WHERE id=1");return {status:200,body:{ok:true}};}
    if(typeof body.planId!=="string")error("请选择计划");
    await store.run("DELETE FROM widget_links WHERE planId=?",[body.planId]);
    return {status:200,body:{ok:true}};
  }
  return null;
}
