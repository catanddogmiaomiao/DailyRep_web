import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Footprints,
  Waves,
  Dumbbell,
  Activity,
  ArrowUpRight,
  Plus,
  Download,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Lock,
  Camera,
  Image as ImageIcon,
  X,
  Trash2,
  CalendarDays,
  Clock,
  Check,
} from "lucide-react";
import {PlansPanel, PlanSummary} from "./PlansPanel.jsx";
import {dateInZone,isDue,matchesPlan,planProgress} from "./plans.js";
import { report, movePeriod } from "./stats";
import {subtypeOptions, subtypeLabel, matchesSubtype, recordDetails, projectRecord, recordUnit, formatSets} from "./subtypes.js";
import "./style.css";
const sports = {
  running: { name: "跑步", unit: "km", icon: Footprints },
  swimming: { name: "游泳", unit: "m", icon: Waves },
  pushups: { name: "俯卧撑", unit: "次", icon: Dumbbell },
  abs: { name: "腹肌训练", unit: "个", icon: Activity },
};
const fmt = (n) => Number(n.toFixed(2)).toLocaleString("zh-CN");
const localTime = () => {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const dateLabel = (d) =>
  d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
async function api(url, options) {
  const r = await fetch("/api" + url, options);
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: "请求失败，请重试" }));
    const err = new Error(e.error || "请求失败");
    err.status = r.status;
    throw err;
  }
  return r.status === 204 ? null : r.json();
}
function App() {
  const [user, setUser] = useState(undefined),
    [records, setRecords] = useState([]),
    [plans,setPlans] = useState([]),
    [plansVisible,setPlansVisible] = useState(false),
    [initialPlanId,setInitialPlanId] = useState(""),
    [planFilter,setPlanFilter] = useState(""),
    [page, setPage] = useState("home"),
    [period, setPeriod] = useState("week"),
    [subtype, setSubtype] = useState(""),
    [anchor, setAnchor] = useState(new Date()),
    [modal, setModal] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [photo, setPhoto] = useState(null),
    [exporting, setExporting] = useState(false);
  const [download,setDownload] = useState(null);
  useEffect(()=>()=>{if(download)URL.revokeObjectURL(download.url);},[download]);
  useEffect(()=>{setDownload(null);},[page,subtype,planFilter,user]);
  const generation = useRef(0);
  useEffect(() => { window.scrollTo(0, 0); }, [page, user]);
  const load = async (propagate=false) => {
    const version = generation.current;
    setLoading(true);
    try {
      const [rows,planRows] = await Promise.all([api("/records"),api("/plans")]);
      if (version === generation.current) {setRecords(rows);setPlans(planRows);}
    } catch (e) {
      if (e.status === 401) {
        generation.current++;
        setUser(null);
        setRecords([]);
      } else setError(e.message);
      if(propagate)throw e;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    api("/me")
      .then((u) => {
        setUser(u);
        load();
      })
      .catch((e) => {
        setUser(null);
        if (e.status !== 401) setError("暂时无法连接服务，请确认后端已经启动");
      });
  }, []);
  const logout = async () => {
    try {
      await api("/logout", { method: "POST" });
      generation.current++;
      setUser(null);
      setRecords([]);setPlans([]);setPlansVisible(false);
      setPhoto(null);
    } catch (e) {
      setError(e.message);
    }
  };
  const go = (key) => {
    setPage(key);setPlanFilter("");
    setSubtype("");
    setPeriod("week");
    setAnchor(new Date());
  };
  if (user === undefined)
    return (
      <div className="splash">
        dailyRep <span>正在打开你的运动空间…</span>
      </div>
    );
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          setError("");
          load();
        }}
        error={error}
      />
    );
  const selected = sports[page],
    stats = selected ? report(records.filter(r=>matchesPlan(r,planFilter)), page, period, anchor, subtype) : null;
  async function exportFile() {
    if(exporting)return;
    setExporting(true);
    setError("");
    try {
      const r = await fetch("/api/export?sport=" + page + (subtype ? "&subtype=" + encodeURIComponent(subtype) : "")+(planFilter?"&planId="+encodeURIComponent(planFilter):""),{signal:AbortSignal.timeout(30000)});
      if (!r.ok) {const body=await r.json().catch(()=>({}));throw new Error(body.error||"导出失败，请重新登录或稍后重试");}
      const u = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = u;
      a.download = "dailyRep-" + page + ".xlsx";
      setDownload({url:u,name:a.download});
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setError(e.name==='TimeoutError'?'导出超时，请检查网络后重试':e.message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="app">
      <aside>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <img src="/icon.png" alt="" />
          dailyRep<span>运动打卡</span>
        </a>
        <div className="nav-label">我的运动空间</div>
        <button
          className={"nav " + (page === "home" ? "active" : "")}
          onClick={() => go("home")}
        >
          <CalendarDays size={20} />
          今日概览
        </button>
        {Object.entries(sports).map(([key, s]) => (
          <button
            className={"nav " + (page === key ? "active" : "")}
            key={key}
            onClick={() => go(key)}
          >
            <s.icon size={20} />
            {s.name}
            <ChevronRight size={15} />
          </button>
        ))}
        <button className="nav" onClick={()=>setPlansVisible(true)}><CalendarDays size={20}/>长期计划</button>
        <div className="account">
          <Lock size={16} />
          <span>
            私人空间<small>{user.email}</small>
          </span>
          <button title="退出登录" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div className="eyebrow">YOUR EVERYDAY, A LITTLE STRONGER</div>
          <div className="header-line">
            <div>
              <h1>{selected ? selected.name + "报告" : "今天，也向前一步"}</h1>
              <p>
                {selected
                  ? "让每一份坚持，都清晰可见。"
                  : "每一次运动，都是靠近更好的自己。"}
              </p>
            </div>
            <span className="today">
              {new Date().toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </span>
          </div>
        </header>
        {error && (
          <div role="alert" className="error">
            {error}
            <button onClick={() => setError("")} aria-label="关闭提示">
              <X size={16} />
            </button>
          </div>
        )}
        {loading && <p role="status">正在同步运动记录…</p>}
        {!selected ? (
          <>
            <section className="home-summary beige">
              <div>
                <span>本周打卡</span>
                <strong>
                  {
                    records.filter(
                      (r) =>
                        new Date(r.occurredAt) >=
                        report([], "running", "week").start,
                    ).length
                  }
                  <small>次</small>
                </strong>
                <p>把今天的努力，留给未来的自己。</p>
              </div>
              <div className="summary-art">
                <Waves size={96} strokeWidth={0.8} />
              </div>
            </section>
            <div className="section-heading">
              <h2>选择今天的运动</h2>
              <span>从一次打卡开始</span>
            </div>
            <section className="sport-grid">
              {Object.entries(sports).map(([key, s]) => {
                const stat = report(records, key, "week");
                return (
                  <button
                    className="sport-card"
                    key={key}
                    onClick={() => go(key)}
                  >
                    <div>
                      <s.icon size={32} strokeWidth={1.4} />
                      <ArrowUpRight size={20} />
                    </div>
                    <h2>{s.name}</h2>
                    <strong>
                      {fmt(stat.total)} <small>{s.unit}</small>
                    </strong>
                    <p>本周累计 · {stat.rows.length} 次打卡</p>
                  </button>
                );
              })}
            </section>
            <div className="section-heading"><h2>长期计划</h2><button className="outline" onClick={()=>setPlansVisible(true)}>管理计划</button></div>
            <section className="plan-home">{plans.filter(p=>p.status==='active'||p.status==='paused').map(plan=><PlanSummary key={plan.id} plan={plan} onClick={()=>setPlansVisible(true)}/>)}{!plans.some(p=>p.status==='active'||p.status==='paused')&&<button className="plan-summary" onClick={()=>setPlansVisible(true)}>设置100天目标，或继续自由打卡 →</button>}</section>
            <p className="quiet">
              <Lock size={14} />
              记录只属于你，今天的努力值得被记住。
            </p>
          </>
        ) : (
          <>
            <div className="toolbar">
              <div className="period">
                {[
                  ["week", "周"],
                  ["month", "月"],
                  ["year", "年"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={period === key ? "chosen" : ""}
                    onClick={() => {
                      setPeriod(key);
                      setAnchor(new Date());
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="range">
                <button
                  aria-label="上一周期"
                  onClick={() => setAnchor(movePeriod(anchor, period, -1))}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {period === "year"
                    ? stats.start.getFullYear() + "年"
                    : period === "month"
                      ? stats.start.toLocaleDateString("zh-CN", {
                          year: "numeric",
                          month: "long",
                        })
                      : dateLabel(stats.start) +
                        " — " +
                        dateLabel(new Date(stats.end - 1))}
                </span>
                <button
                  aria-label="下一周期"
                  onClick={() => setAnchor(movePeriod(anchor, period, 1))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="actions">
                <button
                  className="outline"
                  disabled={exporting}
                  onClick={exportFile}
                >
                  <Download size={17} />
                  {exporting ? "正在导出" : "导出 Excel"}
                </button>
                <button className="gold" onClick={() => {setInitialPlanId("");setModal(true);}}>
                  <Plus size={18} />
                  {selected.name}打卡
                </button>
              </div>
            </div>
            {download&&<p className="download-status" role="status">Excel已生成。若未自动下载，<a href={download.url} download={download.name}>点此保存Excel</a>。</p>}
            {plans.some(p=>p.sport===page)&&<label className="subtype-filter">统计范围<select value={planFilter} onChange={e=>setPlanFilter(e.target.value)}><option value="">全部记录</option><option value="free">自由打卡</option>{plans.filter(p=>p.sport===page).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
            {subtypeOptions(page).length > 0 && <label className="subtype-filter">按类型统计
              <select value={subtype} onChange={e => setSubtype(e.target.value)}>
                <option value="">全部类型</option>
                {subtypeOptions(page).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                <option value="unclassified">未分类（旧记录）</option>
              </select>
            </label>}
            <section className="report-summary beige">
              <div>
                <span>
                  本
                  {period === "week" ? "周" : period === "month" ? "月" : "年"}
                  运动量
                </span>
                <strong>
                  {fmt(stats.total)}
                  <small>{selected.unit}</small>
                </strong>
              </div>
              <div>
                <span>{stats.setCount > 0 ? "组数 / 打卡次数" : "打卡次数"}</span>
                <strong>
                  {stats.setCount > 0 && <>{stats.setCount}<small>组 / </small></>}
                  {stats.rows.length}
                  <small>次</small>
                </strong>
              </div>
              <div>
                <span>累计时长</span>
                <strong>
                  {Math.floor(stats.duration / 3600)}
                  <small>小时</small>
                  {Math.floor((stats.duration % 3600) / 60)}
                  <small>分</small>
                </strong>
              </div>
              <selected.icon
                className="summary-icon"
                size={80}
                strokeWidth={1}
              />
            </section>
            {stats.legacyCount > 0 && <p className="empty">本周期含 {stats.legacyCount} 条旧版腹肌计时记录：时长保留，分钟数不计入个数统计。原记录见下方。</p>}
            {!subtype && stats.breakdown.length > 0 && <section className="subtype-breakdown" aria-label="分类统计">
              {stats.breakdown.map(group => <button key={group.value} onClick={() => setSubtype(group.value)}>
                <span>{group.label}</span><strong>{fmt(group.total)} <small>{selected.unit}</small></strong>
                <small>{group.setCount > 0 ? group.setCount + "组 · " : ""}{group.count} 次打卡 · {Math.floor(group.duration / 60)}分{group.duration % 60}秒</small>
              </button>)}
            </section>}
            <section className="chart-card">
              <div className="section-heading">
                <h2>运动量趋势</h2>
                <span>
                  单位：{selected.unit} ·{" "}
                  {period === "week"
                    ? "每日"
                    : period === "month"
                      ? "每日"
                      : "每月"}
                  累计
                </span>
              </div>
              <Chart bars={stats.bars} unit={selected.unit} />
              {!stats.rows.length && (
                <p className="empty">
                  这个周期还没有记录，开始你的第一次打卡吧。
                </p>
              )}
            </section>
            <section className="records">
              <div className="section-heading">
                <h2>最近记录</h2>
                <span>
                  {records.filter((r) => r.sport === page && matchesSubtype(r, subtype) && matchesPlan(r,planFilter)).length} 条记录
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>运动时间</th>
                      {(subtypeOptions(page).length > 0 || page === "pushups") && <th>训练内容</th>}
                      <th>运动量</th>
                      <th>时长</th>
                      <th>打卡照片</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records
                      .filter((r) => r.sport === page && matchesSubtype(r, subtype) && matchesPlan(r,planFilter))
                      .map(r => projectRecord(r, subtype))
                      .map((r) => (
                        <tr key={r.id}>
                          <td>
                            {new Date(r.occurredAt).toLocaleString("zh-CN", {
                              hour12: false,
                            })}
                          </td>
                          {(subtypeOptions(page).length > 0 || page === "pushups") && <td>{recordDetails(r).map(d => <div key={d.subtype || "unclassified"}>{page === "pushups" ? "俯卧撑" : subtypeLabel(page,d.subtype)} · {d.sets ? formatSets(d.sets,recordUnit(r)) : fmt(d.value)+recordUnit(r)} · {Math.floor(d.duration/60)}分{d.duration%60}秒</div>)}</td>}
                          <td>
                            {fmt(r.value)} {recordUnit(r)}
                          </td>
                          <td>
                            {Math.floor(r.duration / 60)} 分 {r.duration % 60}{" "}
                            秒
                          </td>
                          <td>
                            {r.photo ? (
                              <button
                                className="photo-link"
                                onClick={() =>
                                  setPhoto("/api/photos/" + r.photo)
                                }
                              >
                                <ImageIcon size={16} />
                                查看照片
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <button
                              className="delete"
                              aria-label="删除这条记录"
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    "确定删除这条运动记录及照片？",
                                  )
                                )
                                  return;
                                try {
                                  await api("/records/" + r.id, {
                                    method: "DELETE",
                                  });
                                  await load();
                                } catch (e) {
                                  setError(e.message);
                                }
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!records.some((r) => r.sport === page) && (
                  <p className="empty">
                    还没有记录，点击上方“{selected.name}打卡”添加。
                  </p>
                )}
              </div>
            </section>
          </>
        )}
        <footer>dailyRep · 每天进步一点点</footer>
      </main>
      {modal && (
        <Checkin
          sport={page}
          plans={plans}
          initialPlanId={initialPlanId}
          onClose={() => setModal(false)}
          onSaved={async () => {
            setModal(false);
            setAnchor(new Date());
            await load();
          }}
        />
      )}
      {plansVisible&&<PlansPanel plans={plans} api={api} onChanged={()=>load(true)} onPlanSaved={saved=>setPlans(previous=>[{...saved,progress:planProgress(saved,records)},...previous.filter(p=>p.id!==saved.id)])} onClose={()=>setPlansVisible(false)} onCheckin={(sport,planId)=>{setPlansVisible(false);go(sport);setInitialPlanId(planId);setModal(true);}}/>}
      {photo && (
        <div className="overlay" onClick={() => setPhoto(null)}>
          <button
            className="photo-close"
            onClick={() => setPhoto(null)}
            aria-label="关闭照片"
          >
            <X />
          </button>
          <img className="lightbox" src={photo} alt="运动打卡照片" />
        </div>
      )}
    </div>
  );
}
function Chart({ bars, unit }) {
  const max = Math.max(...bars.map((b) => b.value), 1),
    ceiling = Math.ceil(max / 3) * 3;
  return (
    <div className="chart-scroll">
      <div className="chart" style={{ minWidth: bars.length > 12 ? 680 : 320 }}>
        <div className="axis">
          {[ceiling, (ceiling * 2) / 3, ceiling / 3, 0].map((n) => (
            <span key={n}>{fmt(n)}</span>
          ))}
        </div>
        <div className="plot">
          <div className="grid-lines">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="bars">
            {bars.map((b, i) => (
              <div
                className="bar-column"
                key={i}
                title={`${bars.length === 7 ? "周" + b.label : b.label + (bars.length === 12 ? "月" : "日")}：${fmt(b.value)} ${unit}`}
              >
                <div className="bar-space">
                  <div
                    className={
                      "bar " + (b.value === max && b.value > 0 ? "peak" : "")
                    }
                    style={{ height: (b.value / ceiling) * 100 + "%" }}
                  >
                    {b.value > 0 && bars.length <= 12 && (
                      <span>{fmt(b.value)}</span>
                    )}
                  </div>
                </div>
                <label>
                  {bars.length === 7 ? "周" : ""}
                  {b.label}
                  {bars.length === 12 ? "月" : ""}
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
function Login({ onLogin, error }) {
  const [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    [register, setRegister] = useState(false),
    [registrationAvailable, setRegistrationAvailable] = useState(false);
  useEffect(() => {
    api('/setup').then(data => setRegistrationAvailable(data.registrationAvailable)).catch(() => {});
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const f = new FormData(e.currentTarget);
    try {
      if (register && f.get('password') !== f.get('confirmPassword')) throw new Error('两次输入的密码不一致');
      const { email } = await api(register ? "/register" : "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(f)),
      });
      onLogin({ email });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-intro">
        <div className="brand">
          <img src="/icon.png" alt="" />
          dailyRep
        </div>
        <div>
          <span className="eyebrow">MAKE EVERY DAY COUNT</span>
          <h1>
            每一次坚持，
            <br />
            都有回响。
          </h1>
          <p>
            记录运动，看见成长。
            <br />
            一片只属于你的运动空间。
          </p>
        </div>
        <small>深海蓝 · 暖米色 · 柔金色</small>
      </div>
      <form className="login-form" onSubmit={submit}>
        <Lock className="login-lock" size={30} />
        <h2>{register ? '创建个人账号' : '欢迎回来'}</h2>
        <p>{register ? '注册后开始记录你的第一场运动' : '登录后查看你的个人运动记录'}</p>
        <label>
          邮箱
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="你的邮箱"
          />
        </label>
        <label>
          密码
          <input
            name="password"
            type="password"
            autoComplete={register ? 'new-password' : 'current-password'}
            minLength={register ? 8 : undefined}
            maxLength={1024}
            required
            placeholder={register ? '设置密码，至少8位' : '输入密码'}
          />
        </label>
        {register && <>
          <label>确认密码<input name="confirmPassword" type="password" autoComplete="new-password" required placeholder="再次输入密码" /></label>
          <label>首次注册邀请码<input name="setupCode" type="password" autoComplete="off" required placeholder="输入服务所有者的邀请码" /></label>
        </>}
        {(err || error) && (
          <p className="error" role="alert">
            {err || error}
          </p>
        )}
        <button className="gold" disabled={busy}>
          {busy ? "正在处理…" : register ? '注册并进入' : "登录查看数据"}
          <ArrowUpRight size={18} />
        </button>
        {(registrationAvailable || register) && <button type="button" className="auth-switch" disabled={busy} onClick={() => { setRegister(!register); setErr(''); }}>
          {register ? '已有账号？返回登录' : '首次使用？创建个人账号'}
        </button>}
        <p className="quiet">
          <Lock size={14} />
          个人账号 · 数据私密保存
        </p>
      </form>
    </div>
  );
}
function SetInputs({values, onChange, disabled}) {
  return <div className="set-editor">
    {values.map((value,index) => <div className="set-row" key={index}>
      <label>第 {index+1} 组 <input aria-label={`第${index+1}组个数`} type="number" min="1" max="100000" step="1" required disabled={disabled} value={value} onChange={e => onChange(values.map((v,i) => i === index ? e.target.value : v))} placeholder="个数" /></label><span>个</span>
      {values.length > 1 && <button type="button" aria-label={`移除第${index+1}组`} disabled={disabled} onClick={() => onChange(values.filter((_,i) => i !== index))}><X size={18}/></button>}
    </div>)}
    {values.length < 100 && <button type="button" className="outline" disabled={disabled} onClick={() => onChange([...values,""])}><Plus size={18}/>添加一组</button>}
    <p>{values.length} 组 · 合计 {values.reduce((sum,v) => sum+(Number(v)||0),0)} 个</p>
  </div>;
}
function Checkin({ sport, plans, initialPlanId, onClose, onSaved }) {
  const s = sports[sport],
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState(null),
    [preview, setPreview] = useState(null),
    [details, setDetails] = useState([{id: "0", subtype: subtypeOptions(sport)[0]?.value || "", sets: [""]}]),
    [pushupSets, setPushupSets] = useState([""]);
  const [when,setWhen]=useState(localTime()),[planId,setPlanId]=useState(initialPlanId||plans.find(p=>p.sport===sport&&p.status==='active'&&isDue(p,dateInZone(new Date(),p.timeZone)))?.id||'');
  const eligiblePlans=Number.isFinite(new Date(when).getTime())?plans.filter(p=>p.sport===sport&&p.status!=='archived'&&dateInZone(new Date(when),p.timeZone)>=p.startDate&&dateInZone(new Date(when),p.timeZone)<=p.endDate):[];
  useEffect(()=>{if(planId&&!eligiblePlans.some(p=>p.id===planId))setPlanId('');},[when,plans,planId]);
  const nextDetailId = useRef(1);
  const hasDetails = subtypeOptions(sport).length > 0;
  const camera = useRef(),
    album = useRef(),
    dialog = useRef();
  useEffect(() => {
    dialog.current?.focus();
    const fn = (e) => {
      if (e.key === "Escape" && !busy) onClose();
      if (e.key === "Tab") {
        const nodes = [
          ...dialog.current.querySelectorAll("button,input,select"),
        ].filter((n) => !n.disabled && n.type !== "file");
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0].focus();
        }
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [busy]);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  function choose(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (
      f.size > 8 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(f.type)
    ) {
      setError("请选择不超过8MB的JPEG、PNG或WebP照片");
      return;
    }
    setError("");
    setFile(f);
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const minutes = Number(f.get("minutes")),
        seconds = Number(f.get("seconds"));
      if (hasDetails) {
        const entries = details.map(d => {
          const minutes = Number(f.get(`minutes_${d.id}`)), seconds = Number(f.get(`seconds_${d.id}`));
          if (!Number.isInteger(minutes) || minutes < 0 || !Number.isInteger(seconds) || seconds < 0 || seconds > 59) throw new Error("请检查每项明细的时长");
          return {subtype: d.subtype, value: Number(f.get(`value_${d.id}`)), duration: minutes*60+seconds, ...(sport === "abs" ? {sets: d.sets.map(Number)} : {})};
        });
        f.set("details", JSON.stringify(entries));
      }
      if (sport === "pushups") f.set("details", JSON.stringify([{subtype:null,sets:pushupSets.map(Number),duration:minutes*60+seconds}]));
      f.set("sport", sport);if(planId)f.set('planId',planId);
      f.set("duration", String(minutes * 60 + seconds));
      f.set("occurredAt", new Date(f.get("occurredAt")).toISOString());
      if (file) f.set("photo", file);
      await api("/records", { method: "POST", body: f });
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overlay">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-title"
        tabIndex={-1}
        ref={dialog}
      >
        <div className="modal-heading">
          <h2 id="form-title">{s.name}打卡</h2>
          <button aria-label="关闭" onClick={onClose} disabled={busy}>
            <X />
          </button>
        </div>
        <form onSubmit={submit}>
          <label className="field">
            运动时间
            <input
              name="occurredAt"
              type="datetime-local"
              value={when}
              onChange={e=>setWhen(e.target.value)}
              max={localTime()}
              required
            />
            <small>默认当前时间，可修改补打卡</small>
          </label>
          <label className="field">关联长期计划（可选）<select value={planId} onChange={e=>setPlanId(e.target.value)}><option value="">自由打卡，不关联计划</option>{eligiblePlans.map(plan=><option key={plan.id} value={plan.id}>{plan.title}{isDue(plan,dateInZone(new Date(when),plan.timeZone))?' · 当天计划':' · 额外训练'}</option>)}</select><small>同一天多次打卡只算一个训练日；补打卡按运动日期计算。</small></label>
          {hasDetails ? <div className="session-details">
            <h3>{sport === "swimming" ? "本次游泳明细" : "本次训练明细"}</h3>
            <p>添加本次运动包含的类型，共用日期和照片，保存后算一次打卡。</p>
            {details.map((detail,index) => <fieldset key={detail.id} className="session-detail">
              <legend>明细 {index+1}</legend>
              {details.length > 1 && <button type="button" className="detail-remove" aria-label={`移除明细${index+1}`} disabled={busy} onClick={() => setDetails(rows => rows.filter(d => d.id !== detail.id))}><X size={20} /></button>}
              <label className="field">{sport === "swimming" ? "泳姿" : "训练类型"}
                <select value={detail.subtype} onChange={e => setDetails(rows => rows.map(d => d.id === detail.id ? {...d,subtype:e.target.value} : d))}>
                  {subtypeOptions(sport).filter(option => option.value === detail.subtype || !details.some(d => d.subtype === option.value)).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              {sport === "abs" ? <SetInputs values={detail.sets} disabled={busy} onChange={sets => setDetails(rows => rows.map(d => d.id === detail.id ? {...d,sets} : d))} /> : (
              <label className="field">{sport === "swimming" ? "距离" : "训练量"}（{s.unit}）<input aria-label={`${subtypeLabel(sport,detail.subtype)}运动量`} name={`value_${detail.id}`} type="number" min="0.01" max="100000" step="0.01" required placeholder="0" /></label>              )}
              <div className="field"><span>时长</span><div className="duration-input">
                <label><input aria-label={`${subtypeLabel(sport,detail.subtype)}分钟数`} name={`minutes_${detail.id}`} type="number" min="0" max="1440" step="1" required placeholder="0" />分钟</label>
                <label><input aria-label={`${subtypeLabel(sport,detail.subtype)}秒数`} name={`seconds_${detail.id}`} type="number" min="0" max="59" step="1" required defaultValue="0" />秒</label>
              </div></div>
            </fieldset>)}
            {details.length < subtypeOptions(sport).length && <button type="button" className="outline" disabled={busy} onClick={() => {
              const next = subtypeOptions(sport).find(option => !details.some(d => d.subtype === option.value));
              if (next) setDetails(rows => [...rows,{id:String(nextDetailId.current++),subtype:next.value,sets:[""]}]);
            }}><Plus size={18} />{sport === "swimming" ? "添加泳姿" : "添加训练项目"}</button>}
            <p>以上所有明细合计为 1 次打卡。</p>
          </div> : <>
          <div className="field">
            {sport === "running"
              ? "跑量"
              : sport === "swimming"
                ? "游泳距离"
                : sport === "pushups"
                  ? "俯卧撑次数"
                  : "训练时长"}
            （{s.unit}）
            {sport === "pushups" ? <SetInputs values={pushupSets} onChange={setPushupSets} disabled={busy} /> : (
            <input
              name="value"
              aria-label="运动量"
              type="number"
              min={sport === "pushups" ? "1" : "0.01"}
              step={sport === "pushups" ? "1" : "0.01"}
              max="100000"
              required
              placeholder="0"
            />            )}

          </div>
          <div className="field">
            <span>运动时长</span>
            <div className="duration-input">
              <label>
                <input
                  name="minutes"
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                  required
                  defaultValue="30"
                />
                分钟
              </label>
              <label>
                <input
                  name="seconds"
                  type="number"
                  min="0"
                  max="59"
                  step="1"
                  required
                  defaultValue="0"
                />
                秒
              </label>
            </div>
          </div>
          </>}
          <div className="field">
            <span>
              打卡照片 <small>可选 · 最大8MB</small>
            </span>
            <input
              ref={camera}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              hidden
              onChange={choose}
            />
            <input
              ref={album}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={choose}
            />
            <div className="photo-buttons">
              <button
                type="button"
                className="outline"
                onClick={() => camera.current.click()}
              >
                <Camera size={18} />
                拍照
              </button>
              <button
                type="button"
                className="outline"
                onClick={() => album.current.click()}
              >
                <ImageIcon size={18} />
                从相册选择
              </button>
            </div>
            {preview && (
              <div className="preview">
                <img src={preview} alt="待上传打卡照片" />
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  aria-label="移除照片"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="gold save" disabled={busy}>
            <Check size={18} />
            {busy ? "正在保存…" : "保存打卡"}
          </button>
        </form>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
