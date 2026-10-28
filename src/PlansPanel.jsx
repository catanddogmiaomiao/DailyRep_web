import React,{useEffect,useRef,useState} from 'react';
import {X,Plus} from 'lucide-react';
import {SPORT_NAMES,addDays,dayDistance,dateInZone,repeatLabel,validDate} from './plans.js';
export function PlanSummary({plan,onClick}) {
  const p=plan.progress;
  return <button className="plan-summary" onClick={onClick}>
    <div className="section-heading"><strong>{plan.title}</strong><span>{plan.status==='paused'?'已暂停':plan.status==='finished'?'已结束':p.ended?'阶段到站':'进行中'}</span></div>
    <b>已训练 {p.completedDays} 天</b><p>计划第 {p.elapsedDays} / {p.goalDays} 天 · 连续完成 {p.streak} 个训练日</p>
    <progress value={p.elapsedDays} max={p.goalDays}/>
    <p>{plan.status==='finished'?'计划已结束，记录已保留':plan.status==='paused'?'恢复时结束日期会顺延':p.ended?'到下一程，继续积累':p.doneToday?'今天已打卡 ✓':p.dueToday?'今天有训练安排':'今天休息，按自己的节奏来'}</p>
  </button>;
}
export function PlansPanel({plans,api,onChanged,onPlanSaved,onClose,onCheckin}) {
 const [editing,setEditing]=useState(undefined),[busy,setBusy]=useState(false),[error,setError]=useState(''),[code,setCode]=useState('');const dialog=useRef(null);
 useEffect(()=>{dialog.current?.focus();const handle=e=>{if(e.key==='Escape'&&!busy)onClose();if(e.key==='Tab'){const nodes=[...dialog.current.querySelectorAll('button,input,select')].filter(n=>!n.disabled);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}};document.addEventListener('keydown',handle);return()=>document.removeEventListener('keydown',handle);},[busy,onClose]);
 async function action(plan,body){if(busy)return;setBusy(true);setError('');try{const saved=await api('/plans/'+plan.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,revision:plan.revision})});onPlanSaved(saved);await onChanged();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function widget(plan){if(!confirm('生成新连接码后，此计划旧的小组件连接码会失效。继续？'))return;setBusy(true);try{const data=await api('/widget-links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId:plan.id})});setCode(data.code);try{await navigator.clipboard.writeText(data.code);}catch{}}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="overlay"><section className="modal plans-modal" role="dialog" aria-modal="true" aria-labelledby="plans-title" tabIndex={-1} ref={dialog}>
  <div className="modal-heading"><h2 id="plans-title">{editing===undefined?'长期训练计划':editing?'调整安排':'设置长期计划'}</h2><button aria-label="关闭计划窗口" disabled={busy} onClick={onClose}><X/></button></div>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {editing!==undefined?<><button className="outline" disabled={busy} onClick={()=>setEditing(undefined)}>返回计划列表</button><PlanForm key={editing?.id||'new'} plan={editing} busy={busy} onSave={async input=>{setBusy(true);setError('');try{const saved=await api(editing?'/plans/'+editing.id:'/plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(editing?{...input,action:'edit',revision:editing.revision}:input)});onPlanSaved(saved);setEditing(undefined);await onChanged();}catch(e){setError(e.message);}finally{setBusy(false);}}}/></>:<>
   <p className="plan-note">可以只打卡，也可以设置长期计划。网页修改安排后，请打开iPhone App同步系统提醒。</p>
   <button className="gold" disabled={busy} onClick={()=>setEditing(null)}><Plus size={18}/>设置长期计划</button>
   {plans.filter(p=>p.status!=='archived').map(plan=><div className="plan-item" key={plan.id}>
    <PlanSummary plan={plan} onClick={()=>{if(plan.status==='active'&&!plan.progress.ended)onCheckin(plan.sport,plan.id);}}/>
    <p className="plan-note">{plan.startDate} — {plan.endDate} · {repeatLabel(plan.repeat)} · {plan.reminderEnabled?plan.reminderTime+'提醒':'不提醒'}</p>
    {plan.status==='active'&&plan.progress.ended&&<div className="plan-celebration"><h3>{plan.goalDays}天阶段已到站</h3><p>累计训练 {plan.progress.completedDays} 天。延长后保留原计划、记录和进度。</p><div className="plan-actions">{plan.progress.nextGoals.map(goal=><button key={goal} className="gold" disabled={busy} onClick={()=>action(plan,{action:'extend',goalDays:goal})}>继续到{goal}天</button>)}</div></div>}
    <div className="plan-actions">
      {plan.status==='active'&&!plan.progress.ended&&<button className="gold" onClick={()=>onCheckin(plan.sport,plan.id)}>去打卡</button>}
      {plan.status==='paused'?<button className="outline" disabled={busy} onClick={()=>action(plan,{action:'resume'})}>恢复计划</button>:plan.status==='active'&&!plan.progress.ended?<button className="outline" disabled={busy} onClick={()=>{if(confirm('暂停时不提醒，恢复时结束日期按暂停天数顺延。已有记录保留。'))action(plan,{action:'pause'});}}>暂停</button>:null}
      {plan.status==='active'&&<button className="outline" disabled={busy} onClick={()=>setEditing(plan)}>调整安排</button>}
      {plan.status!=='paused'&&<button className="outline" disabled={busy} onClick={()=>{const days=prompt('新的总目标天数（例如110或150）；保留原计划及打卡',String(plan.goalDays+30));if(days!==null)action(plan,{action:'extend',goalDays:Number(days)});}}>自定下一阶段</button>}
      <button className="outline" disabled={busy} onClick={()=>widget(plan)}>连接桌面小组件</button>
      {plan.status==='active'&&<button className="outline" disabled={busy} onClick={()=>{if(confirm('结束后停止安排提醒，原打卡记录保留。'))action(plan,{action:'finish'});}}>结束此计划</button>}
      {plan.status==='finished'&&<button className="outline" disabled={busy} onClick={()=>action(plan,{action:'archive'})}>隐藏已结束计划</button>}
    </div>
   </div>)}
   {code&&<div className="plan-celebration"><label className="field">小组件连接码<input value={code} readOnly onFocus={e=>e.target.select()}/></label><p>长按iPhone主屏幕添加“健身坚持”，再编辑小组件并粘贴连接码。仅允许读取此计划进度。</p></div>}
  </>}
 </section></div>;
}
function PlanForm({plan,busy,onSave}){
 const zone=plan?.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone;
 const [sport,setSport]=useState(plan?.sport||'abs'),[title,setTitle]=useState(plan?.title||''),[start,setStart]=useState(plan?.startDate||dateInZone(new Date(),zone)),[days,setDays]=useState(String(plan?.goalDays||100)),[end,setEnd]=useState(plan?.endDate||addDays(dateInZone(new Date(),zone),99)),[endMode,setEndMode]=useState('days'),[repeat,setRepeat]=useState(plan?.repeat||{frequency:'daily',interval:1,weekdays:[new Date().getDay()],monthMode:'date'}),[remind,setRemind]=useState(plan?.reminderEnabled??true),[time,setTime]=useState(plan?.reminderTime||'19:00');
 const count=endMode==='date'?dayDistance(start,end)+1:Number(days),computedEnd=endMode==='date'?end:validDate(start)&&Number.isInteger(count)&&count>0&&count<=3650?addDays(start,count-1):'—';
 return <form className="plan-form" onSubmit={e=>{e.preventDefault();onSave({sport,title:title.trim()||SPORT_NAMES[sport]+count+'天计划',titleAuto:!title.trim()||!!(plan?.titleAuto&&title===plan.title),startDate:start,goalDays:count,endMode,endDate:end,repeat,reminderEnabled:remind,reminderTime:time||"19:00",timeZone:zone});}}>
   <label className="field">训练项目<select value={sport} disabled={!!plan} onChange={e=>setSport(e.target.value)}>{Object.entries(SPORT_NAMES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label className="field">名称（可选）<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={60} placeholder={SPORT_NAMES[sport]+(count||100)+'天计划'}/></label>
   {!plan?<><label className="field">开始日期<input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label><label className="field">计划期限<select value={endMode} onChange={e=>setEndMode(e.target.value)}><option value="days">坚持多少天</option><option value="date">直接选择结束日期</option></select></label>
    {endMode==='days'?<><div className="plan-actions">{[30,100,150].map(n=><button key={n} type="button" className={days===String(n)?'gold':'outline'} onClick={()=>setDays(String(n))}>{n}天</button>)}</div><label className="field">自定义天数<input type="number" min="1" max="3650" required value={days} onChange={e=>setDays(e.target.value)}/></label></>:<label className="field">结束日期<input type="date" required min={start} value={end} onChange={e=>setEnd(e.target.value)}/></label>}
    <output className="plan-note" aria-live="polite">含开始当天，共 {count>0?count:'—'} 天，结束于 {computedEnd}。</output></>:<p className="plan-note">调整重复及提醒时间从明天生效，历史安排保留；延长期限使用“下一阶段”。</p>}
   <label className="field">重复<select value={repeat.frequency} onChange={e=>setRepeat({...repeat,frequency:e.target.value})}>{[['daily','每天'],['weekly','每周'],['monthly','每月'],['yearly','每年']].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label className="field">重复间隔（例如每2周）<input type="number" required min="1" max="365" value={repeat.interval} onChange={e=>setRepeat({...repeat,interval:Number(e.target.value)})}/></label>
   {repeat.frequency==='weekly'&&<fieldset className="plan-weekdays"><legend>每周哪几天</legend>{[1,2,3,4,5,6,0].map(day=><label key={day}><input type="checkbox" checked={repeat.weekdays.includes(day)} onChange={()=>setRepeat({...repeat,weekdays:repeat.weekdays.includes(day)?repeat.weekdays.filter(d=>d!==day):[...repeat.weekdays,day]})}/>周{'日一二三四五六'[day]}</label>)}</fieldset>}
   {repeat.frequency==='monthly'&&<label className="field">每月方式<select value={repeat.monthMode} onChange={e=>setRepeat({...repeat,monthMode:e.target.value})}><option value="date">与开始日期同日（无此日期则跳过）</option><option value="last">每月最后一天</option><option value="ordinal">与开始日期同序号星期</option></select></label>}
   <label className="plan-checkbox"><input type="checkbox" checked={remind} onChange={e=>setRemind(e.target.checked)}/>系统提醒</label>
   {remind&&<label className="field">提醒时间<input type="time" required value={time} onChange={e=>setTime(e.target.value)}/></label>}
   <p className="plan-note">使用 {zone} 时区。保存后请在iPhone App中同步并允许通知。</p>
   <button type="submit" className="gold" disabled={busy}>{busy?'保存中…':'保存计划'}</button>
 </form>;
}
