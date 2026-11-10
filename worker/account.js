const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,'0')).join('');
export const random = size => hex(crypto.getRandomValues(new Uint8Array(size)));
export const digest = async value => hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
export function equal(a,b) {
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
export const fail = (message,status) => {throw Object.assign(new Error(message),{status});};
export const json = (body,status=200,headers={}) => Response.json(body,{status,headers});
export const loggedOut = request => new Response(null,{status:204,headers:{'Set-Cookie':'dailyrep=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(new URL(request.url).protocol==='https:'?'; Secure':'')}});
const avatarOptions=['wave','sun','mountain','bolt'];
const pwd = value => typeof value==='string' && value.length>0 && value.length<=1024;
const emailAddress = value => typeof value==='string' && value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
const emailEnabled = env => !!(env.RESEND_API_KEY && env.ACCOUNT_EMAIL_FROM);
const profile = (account,env) => ({email:account.email,nickname:account.nickname,avatar:account.avatar,avatarImage:account.avatarImage||null,emailVerified:!!account.verifiedAt,emailAvailable:emailEnabled(env),hasRecoveryCode:!!account.recoveryHash});
const usedCode = '验证码不正确或已失效，请重新获取';
const newPassword = value => {if(!pwd(value)||value.length<8) fail('密码须为8至1024位',400);return value;};
export async function accountBody(request, maxBytes = 16384) {
  const reader=request.body?.getReader(), chunks=[];let length=0;
  if(!reader) fail('请填写所需信息',400);
  for(;;) {
    const {done,value}=await reader.read(); if(done)break;
    length+=value.byteLength;
    if(length>maxBytes){await reader.cancel();fail('请求内容过大',413);}
    chunks.push(value);
  }
  let data;
  try {data=JSON.parse(await new Blob(chunks).text());}catch{fail('请求格式无效',400);}
  if(!data||typeof data!=='object'||Array.isArray(data))fail('请求格式无效',400);
  return data;
}
export function deviceLabel(request) {
  const ua=request.headers.get('User-Agent')||'';
  if(request.headers.get('X-DailyRep-Client')==='ios'||/CFNetwork/.test(ua)) return 'dailyRep · iPhone';
  if(/iPad/i.test(ua))return '网页 · iPad';
  if(/iPhone/i.test(ua))return '网页 · iPhone';
  if(/Android/i.test(ua))return '网页 · Android';
  if(/Macintosh/i.test(ua))return '网页 · Mac';
  if(/Windows/i.test(ua))return '网页 · Windows';
  return '网页或其他设备';
}
export async function drainDeletedPhotos(env) {
  const rows=(await env.DB.prepare('SELECT photo FROM account_photo_cleanup LIMIT 100').all()).results;
  if(!rows.length)return;
  const keys=rows.map(r=>r.photo);
  await env.PHOTOS.delete(keys);
  await env.DB.prepare('DELETE FROM account_photo_cleanup WHERE photo IN (SELECT value FROM json_each(?))').bind(JSON.stringify(keys)).run();
}
async function sendCode(env, email, code, purpose) {
  const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({
    from:env.ACCOUNT_EMAIL_FROM,to:[email],
    subject:purpose==='reset'?'dailyRep 密码重置验证码':'dailyRep 邮箱验证码',
    text:`验证码：${code}\n10 分钟内有效。若不是你本人操作，请忽略此邮件。`,
  })}).catch(()=>null);
  if(!response?.ok)fail('验证码邮件暂时无法发送，请稍后重试',503);
}
export async function accountRoute(request,env,{route,tokenHash,limitAuth,passwordHash,ctx}) {
  const db=env.DB, method=request.method, now=Date.now();
  const q=(sql,...args)=>{const stmt=db.prepare(sql);return args.length?stmt.bind(...args):stmt;};
  const account=await q('SELECT * FROM account').first();
  if(route==='/password-reset' || route==='/password-reset/email') {
    if(method!=='POST')fail('接口不存在',404);
    await limitAuth(request,env,'reset');
    const data=await accountBody(request),email=emailAddress(data.email);
    if(!email)fail('请输入有效邮箱',400);
    if(route.endsWith('/email')){
      if(!emailEnabled(env))fail('邮件服务尚未启用，请使用恢复码',503);
      if(account?.email===email && account.verifiedAt)await issueCode('reset',email);
      return json({ok:true});
    }
    const password=newPassword(data.newPassword);
    if(!account||account.email!==email)fail('邮箱或恢复凭据不正确',400);
    const viaEmail=data.method==='email';
    const code=normalizeCode(data.code);
    const codeHash=await digest(code);
    const proof=viaEmail?await checkCode('reset',codeHash):null;
    if(viaEmail?!proof:!account.recoveryHash||!equal(codeHash,account.recoveryHash))fail('邮箱或恢复凭据不正确',400);
    const salt=random(16), hash=await passwordHash(password,salt);
    const condition=viaEmail?'EXISTS (SELECT 1 FROM account_email_codes WHERE purpose=? AND hash=? AND expires>? AND accountHash=account.hash)':'recoveryHash=?';
    const result=await db.batch([
      q('UPDATE account SET salt=?, hash=?, recoveryHash=NULL WHERE id=1 AND hash=? AND '+condition,salt,hash,account.hash,...(viaEmail?['reset',codeHash,Date.now()]:[codeHash])),
      q('DELETE FROM sessions WHERE EXISTS (SELECT 1 FROM account WHERE hash=?)',hash),
      q('DELETE FROM account_email_codes WHERE EXISTS (SELECT 1 FROM account WHERE hash=?)',hash),
    ]);
    if(!result[0].meta.changes)fail('恢复凭据已失效，请重试',409);
    return loggedOut(request);
  }
  if(!account)fail('请先登录',401);
  if(route==='/me' && method==='GET')return json(profile(account,env));
  if(route==='/account/weight' && method==='GET'){
    const {results}=await q('SELECT day, grams / 1000.0 AS kg FROM weight_entries ORDER BY day DESC LIMIT 90').all();
    return json(results);
  }
  if(route==='/account/sessions' && method==='GET'){
    // A legacy session may have been created between the schema migration and deployment.
    await q('UPDATE sessions SET publicId=lower(hex(randomblob(16))) WHERE publicId IS NULL').run();
    const rows=(await q('SELECT publicId AS id,device,createdAt,expires,token=? AS current FROM sessions WHERE expires>? ORDER BY current DESC,createdAt DESC',tokenHash,now).all()).results;
    return json(rows.map(row=>({...row,current:!!row.current})));
  }
  if(method!=='POST')fail('接口不存在',404);
  if(route==='/account/sessions/revoke'){
    const {id}=await accountBody(request);
    const active='EXISTS (SELECT 1 FROM sessions AS caller WHERE caller.token=? AND caller.expires>?)';
    if(id==='others')await q('DELETE FROM sessions WHERE token<>? AND '+active,tokenHash,tokenHash,Date.now()).run();
    else {
      if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))fail('请选择有效设备',400);
      await q('DELETE FROM sessions WHERE publicId=? AND token<>? AND '+active,id,tokenHash,tokenHash,Date.now()).run();
    }
    return new Response(null,{status:204});
  }
  const data=await accountBody(request,route==='/account/avatar'?100000:16384);
  const active='EXISTS (SELECT 1 FROM sessions WHERE token=? AND expires>?)';
  if(route==='/account/weight'){
    const {day,kg}=data;
    const date=typeof day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day+'T00:00:00Z') : null;
    if(!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==day)
      fail('请选择有效的打卡日期',400);
    if(typeof kg!=='number'||!Number.isFinite(kg)||kg<1||kg>1000)
      fail('请输入 1 到 1000 公斤之间的体重',400);
    const grams=Math.round(kg*1000);
    const result=await q('INSERT INTO weight_entries(day,grams) SELECT ?,? WHERE '+active+' ON CONFLICT(day) DO UPDATE SET grams=excluded.grams',day,grams,tokenHash,Date.now()).run();
    if(!result.meta.changes)fail('请先登录',401);
    return json({day,kg:grams/1000});
  }
  if(route==='/account/avatar'){
    const {image}=data;
    if(image!==null){
      if(typeof image!=='string'||image.length>98304||!image.startsWith('/9j/')||!/^[A-Za-z0-9+/]+={0,2}$/.test(image))
        fail('请选择有效的 JPEG 头像',400);
      let bytes;
      try {bytes=atob(image);}catch{fail('请选择有效的 JPEG 头像',400);}
      if(bytes.length<16||!bytes.endsWith('\xff\xd9'))fail('请选择有效的 JPEG 头像',400);
    }
    const result=await q('UPDATE account SET avatarImage=? WHERE id=1 AND '+active,image,tokenHash,Date.now()).run();
    if(!result.meta.changes)fail('请先登录',401);
    return json(profile(await q('SELECT * FROM account').first(),env));
  }
  if(route==='/account/profile'){
    const nickname=typeof data.nickname==='string'?data.nickname.trim():null;
    if(nickname===null||[...nickname].length>24||/[\x00-\x1f\x7f]/.test(nickname)||!avatarOptions.includes(data.avatar))fail('昵称最多24个字符，请选择有效头像',400);
    const result=await q('UPDATE account SET nickname=?,avatar=? WHERE id=1 AND '+active,nickname,data.avatar,tokenHash,Date.now()).run();
    if(!result.meta.changes)fail('请先登录',401);
    return json(profile(await q('SELECT * FROM account').first(),env));
  }
  await limitAuth(request,env,'account');
  if(!pwd(data.currentPassword)||!equal(await passwordHash(data.currentPassword,account.salt),account.hash))fail('当前密码不正确',400);
  if(route==='/account/password'){
    const password=newPassword(data.newPassword);
    if(password===data.currentPassword)fail('新密码须与当前密码不同',400);
    const salt=random(16),hash=await passwordHash(password,salt);
    const results=await db.batch([
      q('UPDATE account SET salt=?,hash=? WHERE id=1 AND hash=? AND '+active,salt,hash,account.hash,tokenHash,Date.now()),
      q('DELETE FROM sessions WHERE token<>? AND EXISTS (SELECT 1 FROM account WHERE hash=?)',tokenHash,hash),
      q('DELETE FROM account_email_codes WHERE EXISTS (SELECT 1 FROM account WHERE hash=?)',hash),
    ]);
    if(!results[0].meta.changes)fail('账号已变更，请重新登录',409);
    return new Response(null,{status:204});
  }
  if(route==='/account/recovery-code'){
    const value=random(16);
    const result=await q('UPDATE account SET recoveryHash=? WHERE id=1 AND hash=? AND '+active,await digest(value),account.hash,tokenHash,Date.now()).run();
    if(!result.meta.changes)fail('账号已变更，请重新登录',409);
    return json({code:value.match(/.{4}/g).join('-')});
  }
  if(route==='/account/email/send'){
    if(!emailEnabled(env))fail('邮件服务尚未启用',503);
    const email=emailAddress(data.email);
    if(!email)fail('请输入有效邮箱',400);
    if(email===account.email&&account.verifiedAt)fail('当前邮箱已验证',400);
    await issueCode('verify',email);
    return json({ok:true});
  }
  if(route==='/account/email/confirm'){
    const email=emailAddress(data.email), codeHash=await digest(normalizeCode(data.code));
    const pending=await checkCode('verify',codeHash);
    if(!pending||pending.email!==email)fail(usedCode,400);
    const changed=email!==account.email;
    const results=await db.batch([
      q('UPDATE account SET email=?,verifiedAt=? WHERE id=1 AND hash=? AND '+active+' AND EXISTS (SELECT 1 FROM account_email_codes WHERE purpose=? AND hash=? AND email=? AND expires>? AND accountHash=account.hash)',email,now,account.hash,tokenHash,Date.now(),'verify',codeHash,email,Date.now()),
      q('DELETE FROM sessions WHERE ?=1 AND token<>? AND EXISTS (SELECT 1 FROM account WHERE email=? AND verifiedAt=? AND hash=?)',changed?1:0,tokenHash,email,now,account.hash),
      q('DELETE FROM account_email_codes WHERE EXISTS (SELECT 1 FROM account WHERE email=? AND verifiedAt=? AND hash=?)',email,now,account.hash),
    ]);
    if(!results[0].meta.changes)fail(usedCode,409);
    return json(profile({...account,email,verifiedAt:now},env));
  }
  if(route==='/account/delete'){
    if(data.confirmEmail!==account.email)fail('请输入当前登录邮箱以确认删除',400);
    // All personal DB rows are removed atomically. R2 is retried separately.
    const marker=random(16);
    const deleted='EXISTS (SELECT 1 FROM account WHERE hash=?)';
    const results=await db.batch([
      q('UPDATE account SET hash=? WHERE id=1 AND hash=? AND email=? AND '+active,marker,account.hash,account.email,tokenHash,Date.now()),
      q('INSERT OR IGNORE INTO account_deleted(id) SELECT 1 WHERE '+deleted,marker),
      q('INSERT OR IGNORE INTO account_photo_cleanup(photo) SELECT photo FROM records WHERE photo IS NOT NULL AND '+deleted,marker),
      ...['widget_links','widget_collections','records','training_plans','account_email_codes','weight_entries','sessions'].map(table=>q('DELETE FROM '+table+' WHERE '+deleted,marker)),
      q('DELETE FROM account WHERE hash=?',marker),
    ]);
    if(!results[0].meta.changes)fail('账号已变更，请重新登录',409);
    const cleanup=drainDeletedPhotos(env).catch(()=>console.error('Pending account photo cleanup will be retried'));
    if(ctx)ctx.waitUntil(cleanup);else await cleanup;
    return loggedOut(request);
  }
  fail('接口不存在',404);

  async function issueCode(purpose,email) {
    const code=random(6), codeHash=await digest(code);
    // Reserve before sending so concurrent requests cannot send two usable codes.
    const result=await q('INSERT INTO account_email_codes(purpose,email,hash,expires,accountHash) SELECT ?,?,?,?,hash FROM account WHERE id=1 AND hash=? AND email=? ON CONFLICT(purpose) DO UPDATE SET email=excluded.email,hash=excluded.hash,expires=excluded.expires,accountHash=excluded.accountHash WHERE account_email_codes.expires<=?',purpose,email,codeHash,now+600000,account.hash,account.email,now+540000).run();
    if(!result.meta.changes) {
      if(purpose==='reset')return;
      fail('请等待1分钟再发送验证码',429);
    }
    try {await sendCode(env,email,code,purpose);}
    catch(e){await q('DELETE FROM account_email_codes WHERE purpose=? AND hash=?',purpose,codeHash).run();if(purpose!=='reset')throw e;}
  }
  async function checkCode(purpose,codeHash) {
    const pending=await q('SELECT * FROM account_email_codes WHERE purpose=? AND accountHash=? AND expires>?',purpose,account.hash,Date.now()).first();
    return pending&&equal(codeHash,pending.hash)?pending:null;
  }
}
function normalizeCode(value) {
  return typeof value==='string'&&value.length<=80?value.replace(/[\s-]/g,'').toLowerCase():'';
}
