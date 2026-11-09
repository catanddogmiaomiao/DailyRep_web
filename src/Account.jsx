import React,{useEffect,useRef,useState} from 'react';
import {X, UserRound} from 'lucide-react';

const avatars={wave:'🌊',sun:'☀️',mountain:'⛰️',bolt:'⚡'};
const send=(api,path,body)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function Input({label,name,autoComplete,...props}) {
  return <label>{label}<input name={name} required autoComplete={autoComplete} {...props}/></label>;
}
const Password=({name='currentPassword',label='当前密码',fresh=false})=><Input label={label} name={name} type="password" autoComplete={fresh?'new-password':'current-password'} minLength={fresh?8:undefined} maxLength={1024}/>;
function NewPassword(){return <><Password name="newPassword" label="新密码（至少8位）" fresh/><Password name="confirmPassword" label="确认新密码" fresh/></>;}
function match(d){if(d.newPassword!==d.confirmPassword)throw new Error('两次输入的密码不一致');}

export function Account({api,onClose,onUpdated,onSignedOut}) {
  const dialog=useRef(null), [profile,setProfile]=useState(null),[sessions,setSessions]=useState(null);
  const [panel,setPanel]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[code,setCode]=useState(''),[target,setTarget]=useState('');
  const [avatar,setAvatar]=useState('wave');
  const refresh=async()=>{const data=await api('/me');setProfile(data);setAvatar(data.avatar||'wave');onUpdated(data);};
  const run=async task=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await task();}catch(e){if(e.status===401)onSignedOut();else setError(e.message);}finally{setBusy(false);}};
  useEffect(()=>{dialog.current.showModal();void run(refresh);},[]);
  const open=key=>{setPanel(key);setError('');setNotice('');setCode('');setTarget('');setAvatar(profile.avatar||'wave');if(key==='sessions')void run(async()=>setSessions(await api('/account/sessions')));};
  const submit=(task,{clear=true}={})=>e=>{e.preventDefault();const form=e.currentTarget,d=Object.fromEntries(new FormData(form));void run(async()=>{await task(d);if(clear)form.reset();});};
  const logout=()=>void run(async()=>{await send(api,'/logout',{});onSignedOut();});
  const revoke=id=>void run(async()=>{await send(api,'/account/sessions/revoke',{id});setSessions(await api('/account/sessions'));setNotice('已退出所选设备。');});
  return <dialog ref={dialog} className="modal account-modal" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <div className="modal-heading"><h2>账号管理</h2><button type="button" className="icon" aria-label="关闭账号管理" onClick={onClose} disabled={busy}><X/></button></div>
    {profile&&<div className="account-summary"><span>{avatars[profile.avatar]||<UserRound/>}</span><div><strong>{profile.nickname||'我的账号'}</strong><div>{profile.email}</div><small>{profile.emailVerified?'邮箱已验证':'邮箱未验证'}</small></div></div>}
    {profile&&!panel&&<div className="account-menu">
      {Object.entries({profile:'昵称与头像',password:'修改密码',email:'验证或更换邮箱',sessions:'已登录设备',recovery:'密码恢复码',delete:'删除账号'}).map(([key,label])=><button className="outline" key={key} disabled={busy} onClick={()=>open(key)}>{label}</button>)}
      <button className="outline" disabled={busy} onClick={logout}>退出登录</button>
    </div>}
    {panel&&<button type="button" className="auth-switch" disabled={busy} onClick={()=>open('')}>‹ 返回账号管理</button>}
    {panel==='profile'&&<form onSubmit={submit(async d=>{await send(api,'/account/profile',{nickname:d.nickname,avatar});await refresh();setNotice('资料已保存。');},{clear:false})}>
      <label>昵称<input name="nickname" maxLength={24} defaultValue={profile.nickname} placeholder="可留空"/></label>
      <div className="account-avatars" aria-label="选择头像">{Object.entries(avatars).map(([key,value])=><button type="button" key={key} className="outline" aria-label={{wave:'海浪',sun:'太阳',mountain:'山峰',bolt:'闪电'}[key]} aria-pressed={avatar===key} onClick={()=>setAvatar(key)}>{value}</button>)}</div>
      <button className="gold" disabled={busy}>保存资料</button>
    </form>}
    {panel==='password'&&<form onSubmit={submit(async d=>{match(d);await send(api,'/account/password',d);setNotice('密码已修改，其他设备已退出。');})}>
      <p>修改后，其他设备需要重新登录。</p><Password/><NewPassword/><button className="gold" disabled={busy}>修改密码</button>
    </form>}
    {panel==='email'&&(!profile.emailAvailable?<p>邮件验证码暂未启用。请在「密码恢复码」中生成恢复码并妥善保存。</p>:target?
      <form key="confirm" onSubmit={submit(async d=>{await send(api,'/account/email/confirm',{...d,email:target});setTarget('');await refresh();setNotice('邮箱已验证。请用这个邮箱登录。');})}>
        <p>验证码已发送到 {target}，10 分钟内有效。</p><Input label="邮箱验证码" name="code" autoComplete="one-time-code" maxLength={24}/><Password/>
        <button className="gold" disabled={busy}>确认邮箱</button><button type="button" className="auth-switch" onClick={()=>setTarget('')} disabled={busy}>返回或重发</button>
      </form>:<form key="send" onSubmit={submit(async d=>{await send(api,'/account/email/send',d);setTarget(d.email.trim().toLowerCase());})}>
        <p>换绑成功后，其他设备需要用新邮箱重新登录。</p><Input label="要验证的邮箱" name="email" type="email" defaultValue={profile.email} maxLength={254}/><Password/><button className="gold" disabled={busy}>发送验证码</button>
      </form>)}
    {panel==='sessions'&&sessions&&<div className="account-sessions">
      {sessions.map(d=><div className="account-session" key={d.id}><span><strong>{d.device}{d.current?'（当前）':''}</strong><small>{d.createdAt?'登录于 '+new Date(d.createdAt).toLocaleString('zh-CN'):'登录时间未记录'}</small></span>{!d.current&&<button className="outline" disabled={busy} onClick={()=>revoke(d.id)}>退出</button>}</div>)}
      {sessions.some(d=>!d.current)&&<button className="outline" disabled={busy} onClick={()=>revoke('others')}>退出其他所有设备</button>}
    </div>}
    {panel==='recovery'&&(code?<div><p>请把恢复码保存到密码管理器。关闭后无法再次查看，使用一次后失效。</p><output className="account-code">{code}</output><button className="outline" type="button" onClick={()=>void run(async()=>{await navigator.clipboard.writeText(code);setNotice('恢复码已复制。');})}>复制恢复码</button></div>:
      <form onSubmit={submit(async d=>{const result=await send(api,'/account/recovery-code',d);setCode(result.code);setProfile(p=>({...p,hasRecoveryCode:true}));})}><p>忘记密码时，可在登录页用恢复码重设密码。重新生成会使旧码失效。</p><Password/><button className="gold" disabled={busy}>{profile.hasRecoveryCode?'重新生成恢复码':'生成恢复码'}</button></form>)}
    {panel==='delete'&&<form onSubmit={submit(async d=>{if(d.confirmEmail!==profile.email)throw new Error('请输入当前登录邮箱以确认删除');await send(api,'/account/delete',d);onSignedOut();})}>
      <p>会永久删除账号、打卡、照片和训练计划，并退出所有设备。需要保留记录时，请先在报告页导出 Excel。</p><Input label="输入当前登录邮箱以确认" name="confirmEmail" type="email" autoComplete="off"/><Password/><button className="outline account-danger" disabled={busy}>永久删除账号</button>
    </form>}
    {busy&&<p role="status">正在处理…</p>}{error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!profile&&!busy&&<button className="outline" onClick={()=>void run(refresh)}>重试</button>}
  </dialog>;
}

export function ResetForm({api,emailAvailable,onBack,onDone}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[byEmail,setByEmail]=useState(false);
  const run=async work=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError(e.message);}finally{setBusy(false);}};
  return <form className="login-form" onSubmit={e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));void run(async()=>{match(d);await send(api,'/password-reset',{...d,method:byEmail?'email':'recovery'});onDone();});}}>
    <h2>重设密码</h2><p>{byEmail?'用已验证的邮箱接收验证码。':'输入之前在账号管理中保存的一次性恢复码。'}</p>
    <Input label="登录邮箱" name="email" type="email" autoComplete="username"/>
    {byEmail&&<button type="button" className="outline" disabled={busy} onClick={e=>{const field=e.currentTarget.form.elements.email;if(field.reportValidity())void run(async()=>{await send(api,'/password-reset/email',{email:field.value});setNotice('如果该邮箱已验证，你会收到验证码。');});}}>发送验证码</button>}
    <Input key={String(byEmail)} label={byEmail?'邮件验证码':'恢复码'} name="code" autoComplete="one-time-code" maxLength={80}/>
    <NewPassword/><button className="gold" disabled={busy}>{busy?'正在处理…':'重设密码'}</button>
    {emailAvailable&&<button type="button" className="auth-switch" disabled={busy} onClick={()=>{setByEmail(!byEmail);setNotice('');setError('');}}>{byEmail?'改用恢复码':'改用邮件验证码'}</button>}
    <button type="button" className="auth-switch" disabled={busy} onClick={onBack}>返回登录</button>
    {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </form>;
}
