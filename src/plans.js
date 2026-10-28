// Calendar-only arithmetic uses UTC keys; instants are interpreted in the plan's own time zone.
export const SPORT_NAMES = {running:"跑步", swimming:"游泳", pushups:"俯卧撑", abs:"腹肌训练"};
const DAY = 86400000;
export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value+"T00:00:00Z");
  return Number.isFinite(+d) && d.toISOString().slice(0,10) === value;
}
export const addDays = (key, count) => new Date(Date.parse(key+"T00:00:00Z")+count*DAY).toISOString().slice(0,10);
export const dayDistance = (a,b) => Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/DAY);
export function dateInZone(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(instant));
  const get = type => parts.find(p=>p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function repeatRule(input, startDate) {
  const frequency = input?.frequency || "daily", interval = Number(input?.interval ?? 1);
  if (!["daily","weekly","monthly","yearly"].includes(frequency) || !Number.isInteger(interval) || interval < 1 || interval > 365) throw new Error("请检查重复频率和间隔");
  const weekdays = [...new Set(input?.weekdays || [new Date(startDate+"T00:00:00Z").getUTCDay()])].sort();
  if (!weekdays.length || weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)) throw new Error("请至少选择一个有效星期");
  const monthMode = input?.monthMode || "date";
  if (!["date","last","ordinal"].includes(monthMode)) throw new Error("请选择有效的每月重复方式");
  return {frequency,interval,weekdays,monthMode};
}
export function makePlan(input, now = new Date()) {
  const sport = input.sport;
  if (!Object.hasOwn(SPORT_NAMES,sport)) throw new Error("请选择训练项目");
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 60) throw new Error("计划名称需为1至60字");
  const startDate = input.startDate;
  if (!validDate(startDate)) throw new Error("请选择有效的开始日期");
  const timeZone = input.timeZone || "Asia/Shanghai";
  try {dateInZone(now,timeZone);} catch {throw new Error("请选择有效时区");}
  let goalDays = Number(input.goalDays ?? 100);
  if (input.endMode === "date") {
    if (!validDate(input.endDate)) throw new Error("请选择有效的结束日期");
    goalDays = dayDistance(startDate,input.endDate)+1;
  }
  if (!Number.isInteger(goalDays)||goalDays<1||goalDays>3650) throw new Error("坚持天数需为1至3650天");
  const endDate = addDays(startDate,goalDays-1);
  if (endDate < dateInZone(now,timeZone)) throw new Error("结束日期不能早于今天");
  const reminderTime = input.reminderTime || "19:00";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) throw new Error("请选择有效的提醒时间");
  const repeat = repeatRule(input.repeat,startDate);
  return {sport,title,titleAuto:input.titleAuto===true,startDate,endDate,goalDays,timeZone,repeat,reminderTime,reminderEnabled:input.reminderEnabled === true,status:"active",pauses:[],scheduleHistory:[{from:startDate,repeat,reminderTime}],milestones:[],revision:1,createdAt:now.toISOString(),updatedAt:now.toISOString()};
}
export function pausedOn(plan,key) {
  return (plan.pauses||[]).some(p=>key>=p.from && (!p.to || key<=p.to));
}
export function scheduleOn(plan,key) {
  return [...(plan.scheduleHistory||[{from:plan.startDate,repeat:plan.repeat,reminderTime:plan.reminderTime}])].reverse().find(s=>s.from<=key);
}
export function isDue(plan,key) {
  if (!validDate(key)||key<plan.startDate||key>plan.endDate||pausedOn(plan,key)) return false;
  const rule = scheduleOn(plan,key)?.repeat || plan.repeat;
  const start = new Date(plan.startDate+"T00:00:00Z"), date = new Date(key+"T00:00:00Z");
  if (rule.frequency === "daily") return dayDistance(plan.startDate,key)%rule.interval === 0;
  if (rule.frequency === "weekly") {
    const monday = d=>addDays(d,-((new Date(d+"T00:00:00Z").getUTCDay()+6)%7));
    return dayDistance(monday(plan.startDate),monday(key))/7%rule.interval === 0 && rule.weekdays.includes(date.getUTCDay());
  }
  if (rule.frequency === "monthly") {
    const months = (date.getUTCFullYear()-start.getUTCFullYear())*12+date.getUTCMonth()-start.getUTCMonth();
    if (months%rule.interval) return false;
    if (rule.monthMode === "last") return date.getUTCDate() === new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    if (rule.monthMode === "ordinal") return date.getUTCDay()===start.getUTCDay() && Math.floor((date.getUTCDate()-1)/7)===Math.floor((start.getUTCDate()-1)/7);
    return date.getUTCDate()===start.getUTCDate();
  }
  return (date.getUTCFullYear()-start.getUTCFullYear())%rule.interval === 0 && date.getUTCMonth()===start.getUTCMonth() && date.getUTCDate()===start.getUTCDate();
}
export function planProgress(plan, records, now = new Date()) {
  const today = dateInZone(now,plan.timeZone);
  const completed = new Set(records.filter(r=>r.planId===plan.id && r.sport===plan.sport).map(r=>dateInZone(r.occurredAt,plan.timeZone)).filter(d=>d>=plan.startDate&&d<=plan.endDate));
  const completedDays=[...completed].filter(day=>day<=today).length;
  let completedDueDays=0, dueDays=0, missedDays=0, streak=0, pausedDays=0;
  let last = today<plan.endDate ? today : plan.endDate;
  if(plan.finishedOn && last>plan.finishedOn)last=plan.finishedOn;
  for(let day=plan.startDate;day<=last;day=addDays(day,1)) {
    if(pausedOn(plan,day)) {pausedDays++;continue;}
    if(!isDue(plan,day)) continue;
    dueDays++;
    if(completed.has(day)) {completedDueDays++;streak++;}
    else if(day<today) {missedDays++;streak=0;}
  }
  const elapsedDays=Math.max(0,Math.min(plan.goalDays,dayDistance(plan.startDate,last)+1-pausedDays));
  const dueToday=isDue(plan,today), doneToday=completed.has(today);
  const ended=today>plan.endDate || (today===plan.endDate && (!dueToday||doneToday));
  return {today,completedDays,completedDueDays,dueDays,missedDays,streak,elapsedDays,goalDays:plan.goalDays,dueToday,doneToday,ended,paused:plan.status==="paused",endDate:plan.endDate,
    nextGoals:[plan.goalDays+10,plan.goalDays+20].filter(n=>n<=3650)};
}
export function updatePlan(plan, command, records = [], now = new Date()) {
  const today=dateInZone(now,plan.timeZone), next=JSON.parse(JSON.stringify(plan));
  if(command.revision!==plan.revision) throw Object.assign(new Error("计划已在其他设备更新，请刷新后重试"),{status:409});
  if(command.action==="extend") {
    if(plan.status==="paused")throw new Error("请先恢复计划，再延长目标");
    const days=Number(command.goalDays);
    if(!Number.isInteger(days)||days<=plan.goalDays||days>3650) throw new Error("新目标需要大于当前目标，最多3650天");
    const end=addDays(plan.endDate,days-plan.goalDays);
    if(end<today) throw new Error("新阶段的结束日仍早于今天，请选择更长目标");
    next.milestones.push({goalDays:plan.goalDays,endDate:plan.endDate,completedDays:planProgress(plan,records,now).completedDays,extendedAt:now.toISOString()});
    next.goalDays=days;next.endDate=end;next.status="active";delete next.finishedOn;
    if(next.titleAuto)next.title=SPORT_NAMES[next.sport]+days+"天计划";
  } else if(command.action==="pause") {
    if(plan.status!=="active" || today>plan.endDate) throw new Error("只有进行中的计划可以暂停");
    next.status="paused";next.pauses.push({from:planProgress(plan,records,now).doneToday?addDays(today,1):(today<plan.startDate?plan.startDate:today),to:null});
  } else if(command.action==="resume") {
    if(plan.status!=="paused") throw new Error("计划尚未暂停");
    const pause=next.pauses.at(-1), days=Math.max(0,dayDistance(pause.from,today));
    if(days) pause.to=addDays(today,-1);else next.pauses.pop();
    next.endDate=addDays(next.endDate,days);next.status="active";
  } else if(["finish","archive"].includes(command.action)) {
    if(plan.status==="paused") throw new Error("请先恢复暂停的计划再结束，避免暂停日期不明确");
    next.status=command.action==="finish"?"finished":"archived";next.finishedOn=next.finishedOn||today;
  } else if(command.action==="edit") {
    if(typeof command.title!=="string"||!command.title.trim()||command.title.trim().length>60)throw new Error("请输入1至60字的名称");
    const repeat=repeatRule(command.repeat,plan.startDate), time=command.reminderTime;
    if(typeof time!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error("请选择有效提醒时间");
    next.title=command.title.trim();next.titleAuto=command.titleAuto===true;next.repeat=repeat;next.reminderTime=time;next.reminderEnabled=command.reminderEnabled===true;
    // Revisions affect future dates; historical training obligations remain stable.
    const from=today<plan.startDate?plan.startDate:addDays(today,1);
    next.scheduleHistory=next.scheduleHistory.filter(s=>s.from<from);
    next.scheduleHistory.push({from,repeat,reminderTime:time});
  } else throw new Error("不支持的计划操作");
  next.revision++;next.updatedAt=now.toISOString();return next;
}
export function validatePlanLink(plan, record) {
  if(!plan || plan.sport!==record.sport)throw new Error("所选计划与训练项目不匹配");
  const date=dateInZone(record.occurredAt,plan.timeZone);
  if(date<plan.startDate||date>plan.endDate)throw new Error("打卡时间不在计划日期范围内，可选择不关联计划");
}
export function instantForLocal(day,time,timeZone) {
  const [year,month,date]=day.split("-").map(Number), [hour,minute]=time.split(":").map(Number);
  const target=Date.UTC(year,month-1,date,hour,minute);let guess=target;
  for(let i=0;i<4;i++) {
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(guess));
    const get=k=>Number(parts.find(p=>p.type===k).value);
    const actual=Date.UTC(get("year"),get("month")-1,get("day"),get("hour"),get("minute"));
    if(actual===target)return new Date(guess);guess+=target-actual;
  }
  return null; // Nonexistent local time during a DST jump is deliberately skipped.
}
export function reminderQueue(plans,records,now=new Date(),limit=60) {
  const queue=[];
  for(const plan of plans.filter(p=>p.status==="active"&&p.reminderEnabled)) {
    const today=dateInZone(now,plan.timeZone), completed=new Set(records.filter(r=>r.planId===plan.id).map(r=>dateInZone(r.occurredAt,plan.timeZone)));
    let collected=0;
    for(let day=today<plan.startDate?plan.startDate:today;day<=plan.endDate && collected<limit;day=addDays(day,1)) {
      if(!isDue(plan,day)||completed.has(day))continue;
      const time=scheduleOn(plan,day).reminderTime, instant=instantForLocal(day,time,plan.timeZone);
      if(!instant||instant<=now)continue;
      queue.push({id:`dailyrep.${plan.id}.${day}`,planId:plan.id,sport:plan.sport,title:plan.title,body:`给${SPORT_NAMES[plan.sport]}留一点时间，完成后记得打卡。`,at:instant.toISOString()});collected++;
    }
  }
  return queue.sort((a,b)=>a.at.localeCompare(b.at)).slice(0,limit);
}
export function repeatLabel(rule) {
  const units={daily:"天",weekly:"周",monthly:"月",yearly:"年"};
  const base=rule.interval===1?`每${units[rule.frequency]}`:`每${rule.interval}${units[rule.frequency]}`;
  return base+(rule.frequency==="weekly"?" · "+rule.weekdays.map(d=>"周"+"日一二三四五六"[d]).join("、"):rule.frequency==="monthly"&&rule.monthMode==="last"?"最后一天":rule.frequency==="monthly"&&rule.monthMode==="ordinal"?"同序号星期":"");
}

export const matchesPlan = (record, filter = "") => !filter || (filter === "free" ? !record.planId : record.planId === filter);
