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
import { report, movePeriod } from "./stats";
import "./style.css";
const sports = {
  running: { name: "跑步", unit: "km", icon: Footprints },
  swimming: { name: "游泳", unit: "m", icon: Waves },
  pushups: { name: "俯卧撑", unit: "次", icon: Dumbbell },
  abs: { name: "腹肌训练", unit: "分钟", icon: Activity },
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
    [page, setPage] = useState("home"),
    [period, setPeriod] = useState("week"),
    [anchor, setAnchor] = useState(new Date()),
    [modal, setModal] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [photo, setPhoto] = useState(null),
    [exporting, setExporting] = useState(false);
  const generation = useRef(0);
  useEffect(() => { window.scrollTo(0, 0); }, [page, user]);
  const load = async () => {
    const version = generation.current;
    setLoading(true);
    try {
      const rows = await api("/records");
      if (version === generation.current) setRecords(rows);
    } catch (e) {
      if (e.status === 401) {
        generation.current++;
        setUser(null);
        setRecords([]);
      } else setError(e.message);
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
      setRecords([]);
      setPhoto(null);
    } catch (e) {
      setError(e.message);
    }
  };
  const go = (key) => {
    setPage(key);
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
    stats = selected ? report(records, page, period, anchor) : null;
  async function exportFile() {
    setExporting(true);
    try {
      const r = await fetch("/api/export?sport=" + page);
      if (!r.ok) throw new Error("导出失败，请重新登录或稍后重试");
      const u = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = u;
      a.download = "dailyRep-" + page + ".xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    } catch (e) {
      setError(e.message);
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
                <button className="gold" onClick={() => setModal(true)}>
                  <Plus size={18} />
                  {selected.name}打卡
                </button>
              </div>
            </div>
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
                <span>打卡次数</span>
                <strong>
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
                  {records.filter((r) => r.sport === page).length} 条记录
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>运动时间</th>
                      <th>运动量</th>
                      <th>时长</th>
                      <th>打卡照片</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records
                      .filter((r) => r.sport === page)
                      .map((r) => (
                        <tr key={r.id}>
                          <td>
                            {new Date(r.occurredAt).toLocaleString("zh-CN", {
                              hour12: false,
                            })}
                          </td>
                          <td>
                            {fmt(r.value)} {selected.unit}
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
          onClose={() => setModal(false)}
          onSaved={async () => {
            setModal(false);
            setAnchor(new Date());
            await load();
          }}
        />
      )}
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
function Checkin({ sport, onClose, onSaved }) {
  const s = sports[sport],
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState(null),
    [preview, setPreview] = useState(null);
  const camera = useRef(),
    album = useRef(),
    dialog = useRef();
  useEffect(() => {
    dialog.current?.focus();
    const fn = (e) => {
      if (e.key === "Escape" && !busy) onClose();
      if (e.key === "Tab") {
        const nodes = [
          ...dialog.current.querySelectorAll("button,input"),
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
      f.set("sport", sport);
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
              defaultValue={localTime()}
              max={localTime()}
              required
            />
            <small>默认当前时间，可修改补打卡</small>
          </label>
          <label className="field">
            {sport === "running"
              ? "跑量"
              : sport === "swimming"
                ? "游泳距离"
                : sport === "pushups"
                  ? "俯卧撑次数"
                  : "训练时长"}
            （{s.unit}）
            <input
              name="value"
              type="number"
              min={sport === "pushups" ? "1" : "0.01"}
              step={sport === "pushups" ? "1" : "0.01"}
              max="100000"
              required
              placeholder="0"
            />
          </label>
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
