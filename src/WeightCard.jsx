import React, {useEffect, useState} from "react";

function localDay() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join("-");
}

function Trend({entries}) {
  const ordered=[...entries].reverse();
  const values=ordered.map(entry=>entry.kg);
  const min=Math.min(...values);
  const max=Math.max(...values);
  const step=Math.max(0.5,Math.ceil((max-min)/1.5)/2);
  const low=Math.floor(min/step)*step-step;
  const high=Math.ceil(max/step)*step+step;
  const first=Date.parse(ordered[0].day);
  const span=Date.parse(ordered.at(-1).day)-first;
  const y=kg=>127-(kg-low)*106/(high-low);
  const points=ordered.map(entry=>({x:span?45+(Date.parse(entry.day)-first)*355/span:223,y:y(entry.kg)}));
  const change=Number((values.at(-1)-values[0]).toFixed(3));
  return <section className="weight-trend" aria-label="体重趋势">
    <h3>体重趋势</h3>
    <p>{span?`这段时间 ${change>0?"+":""}${change} kg`:"再记录一次，就能看到变化。"}</p>
    <svg viewBox="0 0 418 145" role="img" aria-label={span?`从 ${values[0]} 公斤到 ${values.at(-1)} 公斤`:`${values[0]} 公斤`}>
      {[high,(high+low)/2,low].map(value=><g key={value}>
        <line x1="45" x2="400" y1={y(value)} y2={y(value)} stroke="#e8dcc833"/>
        <text x="38" y={y(value)+4} textAnchor="end" fill="#aab4c6" fontSize="11">{Number(value.toFixed(2))}</text>
      </g>)}
      {!!span&&<polyline points={points.map(point=>`${point.x},${point.y}`).join(" ")} fill="none" stroke="#e5c979" strokeWidth="2"/>}
      {(points.length>30?[points.at(-1)]:points).map((point,index)=><circle key={index} cx={point.x} cy={point.y} r="3" fill="#e5c979"/>)}
    </svg>
    <div className="weight-trend-dates"><time>{ordered[0].day}</time><span>{span?ordered.at(-1).day+" · kg":"kg"}</span></div>
  </section>;
}

export function WeightCard({api}) {
  const [entries,setEntries]=useState(null);
  const [editing,setEditing]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const today=entries?.find(entry=>entry.day===localDay());

  useEffect(()=>{
    let active=true;
    api("/account/weight").then(data=>{if(active)setEntries(data);})
      .catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[attempt]);

  async function save(event) {
    event.preventDefault();
    if(busy)return;
    const kg=event.currentTarget.elements.weight.valueAsNumber;
    setBusy(true);
    setError("");
    try {
      const entry=await api("/account/weight",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({day:localDay(),kg}),
      });
      setEntries(previous=>[entry,...previous.filter(item=>item.day!==entry.day)]
        .sort((a,b)=>b.day.localeCompare(a.day)).slice(0,90));
      setEditing(false);
      setNotice("体重已保存");
    } catch(e) {setError(e.message);}
    finally {setBusy(false);}
  }

  return <details className="weight-card">
    <summary>
      <span className="weight-heading">体重记录</span>
      <span className="weight-summary">
        <strong>{today ? `今日 ${today.kg} kg` : entries ? "今日未记录" : error ? "暂无法读取" : "读取中…"}</strong>
        <span aria-hidden="true">›</span>
      </span>
    </summary>
    {!!entries?.length&&<Trend entries={entries}/>}
    <h3>今日体重</h3>
    <p>{today ? `今日 ${today.kg} kg` : entries ? "今天还没有记录" : error ? "暂时无法读取体重记录" : "正在读取体重记录…"}</p>
    {entries && (editing ? <form onSubmit={save}>
      <label>体重（公斤）<input name="weight" type="number" inputMode="decimal" required min="1" max="1000" step="0.001" defaultValue={today?.kg} disabled={busy}/></label>
      <button className="gold" disabled={busy}>{busy?"保存中…":"保存体重"}</button>
      <button type="button" className="outline" disabled={busy} onClick={()=>{setEditing(false);setError("");}}>取消</button>
    </form> : <button className="outline" onClick={()=>{setEditing(true);setNotice("");}}>{today?"修改今日体重":"记录今日体重"}</button>)}
    {!entries&&error&&<button className="outline" onClick={()=>{setError("");setAttempt(n=>n+1);}}>重新读取</button>}
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
    {!!entries?.length&&<details><summary>查看近期体重记录</summary><ul>
      {entries.map(entry=><li key={entry.day}><time dateTime={entry.day}>{entry.day}</time><span>{entry.kg} kg</span></li>)}
    </ul></details>}
  </details>;
}
