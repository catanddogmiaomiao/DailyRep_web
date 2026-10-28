import ExcelJS from 'exceljs';
import { validateRecord, sports } from '../server/domain.js';
import {subtypeOptions, subtypeLabel, matchesSubtype} from '../src/subtypes.js';

const encoder = new TextEncoder();
const TTL = 7 * 86400000;
const MAX_PHOTO = 8 * 1024 * 1024;
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
const random = size => hex(crypto.getRandomValues(new Uint8Array(size)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256'}, key, 256));
}
function equal(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
const json = (body, status = 200, headers = {}) => Response.json(body, {status, headers});
const fail = (message, status) => { throw Object.assign(new Error(message), {status}); };
async function credentials(request) {
  if (Number(request.headers.get('content-length') || 0) > 16384) fail('请求内容过大', 413);
  const text = await request.text();
  if (text.length > 16384) fail('请求内容过大', 413);
  let data;
  try { data = JSON.parse(text); } catch { fail('请输入邮箱和密码', 400); }
  if (!data || typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()) || data.email.length > 254 || typeof data.password !== 'string' || !data.password || data.password.length > 1024) fail('请输入有效的邮箱和密码', 400);
  return {...data, email: data.email.trim().toLowerCase()};
}
async function limitAuth(request, env) {
  const now = Date.now(), window = 15 * 60000;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const key = await digest(ip + ':' + Math.floor(now / window));
  await env.DB.prepare('DELETE FROM auth_attempts WHERE expires < ?').bind(now).run();
  const row = await env.DB.prepare('INSERT INTO auth_attempts(key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key, now + window).first();
  if (row.attempts > 10) fail('尝试次数过多，请15分钟后重试', 429);
}
async function session(env, email, request, status = 200) {
  const token = random(32), now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now),
    env.DB.prepare('INSERT INTO sessions VALUES (?,?)').bind(await digest(token), now + TTL),
  ]);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return json({token, email}, status, {'Set-Cookie': `dailyrep=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`});
}
function tokenOf(request) {
  return request.headers.get('Authorization')?.replace(/^Bearer /, '') || request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith('dailyrep='))?.slice(9) || '';
}
function imageType(b) {
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((n,i) => b[i] === n)) return 'image/png';
  if (String.fromCharCode(...b.slice(0,4)) === 'RIFF' && String.fromCharCode(...b.slice(8,12)) === 'WEBP') return 'image/webp';
  return null;
}
async function api(request, env) {
  const url = new URL(request.url), route = url.pathname.slice(4), method = request.method;
  if (route === '/health' && method === 'GET') {
    await env.DB.prepare('SELECT 1').first();
    return json({ok: true});
  }
  if (route === '/setup' && method === 'GET') {
    const account = await env.DB.prepare('SELECT id FROM account').first();
    return json({registrationAvailable: !account && !!env.SETUP_CODE});
  }
  if (['/register', '/login'].includes(route) && method === 'POST') {
    await limitAuth(request, env);
    const data = await credentials(request);
    const account = await env.DB.prepare('SELECT * FROM account').first();
    if (route === '/register') {
      if (account) fail('个人账号已创建，请登录', 409);
      if (!env.SETUP_CODE) fail('尚未开启首次注册，请联系服务所有者', 403);
      if (typeof data.setupCode !== 'string' || !equal(await digest(data.setupCode), await digest(env.SETUP_CODE))) fail('首次注册邀请码不正确', 403);
      if (data.password.length < 8) fail('密码至少需要8位', 400);
      const salt = random(16), hash = await passwordHash(data.password, salt);
      const inserted = await env.DB.prepare('INSERT OR IGNORE INTO account VALUES (1,?,?,?)').bind(data.email, salt, hash).run();
      if (!inserted.meta.changes) fail('个人账号已创建，请登录', 409);
      return session(env, data.email, request, 201);
    }
    // A fixed dummy salt also performs the expensive operation before setup.
    const candidate = await passwordHash(data.password, account?.salt || 'dailyrep-not-yet-initialized');
    if (!account || !equal(candidate, account.hash) || account.email !== data.email) fail('邮箱或密码错误', 401);
    return session(env, account.email, request);
  }
  const token = tokenOf(request);
  if (!/^[a-f0-9]{64}$/.test(token)) fail('请先登录', 401);
  const tokenHash = await digest(token);
  const auth = await env.DB.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').bind(tokenHash, Date.now()).first();
  if (!auth) fail('请先登录', 401);
  if (route === '/me' && method === 'GET') return json(await env.DB.prepare('SELECT email FROM account').first());
  if (route === '/logout' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(tokenHash).run();
    return new Response(null, {status: 204, headers: {'Set-Cookie': 'dailyrep=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure'}});
  }
  if (route === '/records' && method === 'GET') return json((await env.DB.prepare('SELECT * FROM records ORDER BY occurredAt DESC').all()).results);
  if (route === '/records' && method === 'POST') {
    if (Number(request.headers.get('content-length') || 0) > MAX_PHOTO + 65536) fail('照片不能超过8MB', 413);
    // Limit chunked requests too, before form parsing allocates a large buffer.
    const reader = request.body?.getReader();
    const chunks = []; let length = 0;
    if (!reader) fail('请填写运动记录', 400);
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_PHOTO + 65536) { await reader.cancel(); fail('照片不能超过8MB', 413); }
      chunks.push(value);
    }
    let form;
    try { form = await new Response(new Blob(chunks), {headers: {'Content-Type': request.headers.get('Content-Type') || ''}}).formData(); }
    catch { fail('请使用有效的运动打卡表单', 400); }
    let data;
    try { data = validateRecord(Object.fromEntries(form)); } catch (e) { fail(e.message, 400); }
    const file = form.get('photo'); let photo = null;
    if (file && typeof file !== 'string' && file.size) {
      if (file.size > MAX_PHOTO) fail('照片不能超过8MB', 400);
      const bytes = new Uint8Array(await file.arrayBuffer()), type = imageType(bytes);
      // Mobile multipart MIME labels can be inaccurate. The actual bytes are
      // authoritative; save the detected type instead of trusting the label.
      if (!type) fail('暂不支持此照片格式，请更新 App 后重新选择照片（会自动转换为 JPEG）', 400);
      photo = random(16);
      await env.PHOTOS.put(photo, bytes, {httpMetadata: {contentType: type}});
    }
    const record = {id: random(16), ...data, photo};
    try { await env.DB.prepare('INSERT INTO records(id,sport,value,duration,occurredAt,photo,subtype) VALUES (?,?,?,?,?,?,?)').bind(record.id, data.sport, data.value, data.duration, data.occurredAt, photo, data.subtype).run(); }
    catch (e) { if (photo) await env.PHOTOS.delete(photo); throw e; }
    return json(record, 201);
  }
  if (route.startsWith('/photos/') && method === 'GET') {
    const id = route.slice(8);
    if (!/^[a-f0-9]{32}$/.test(id)) fail('照片不存在', 404);
    const object = await env.PHOTOS.get(id);
    if (!object) fail('照片不存在', 404);
    return new Response(object.body, {headers: {'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream'}});
  }
  if (route.startsWith('/records/') && method === 'DELETE') {
    const row = await env.DB.prepare('SELECT * FROM records WHERE id=?').bind(route.slice(9)).first();
    if (!row) fail('记录不存在', 404);
    if (row.photo) await env.PHOTOS.delete(row.photo);
    await env.DB.prepare('DELETE FROM records WHERE id=?').bind(row.id).run();
    return new Response(null, {status: 204});
  }
  if (route === '/export' && method === 'GET') {
    const sport = url.searchParams.get('sport');
    const query = sports.includes(sport) ? env.DB.prepare('SELECT * FROM records WHERE sport=? ORDER BY occurredAt DESC').bind(sport) : env.DB.prepare('SELECT * FROM records ORDER BY occurredAt DESC');
    const subtype = url.searchParams.get('subtype') || '';
    if (subtype && subtype !== 'unclassified' && !subtypeOptions(sport).some(s => s.value === subtype)) fail('请选择有效的运动类型',400);
    const rows = (await query.all()).results.filter(r => matchesSubtype(r, subtype));
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('运动记录');
    sheet.columns = [{header:'项目',key:'sport',width:15},{header:'运动时间 (UTC)',key:'occurredAt',width:28},{header:'运动量',key:'value',width:14},{header:'单位',key:'unit',width:12},{header:'时长（秒）',key:'duration',width:16},{header:'运动类型',key:'subtype',width:18}];
    const names = {running:'跑步',swimming:'游泳',pushups:'俯卧撑',abs:'腹肌训练'}, units = {running:'km',swimming:'m',pushups:'次',abs:'分钟'};
    rows.forEach(row => sheet.addRow({...row,sport:names[row.sport],unit:units[row.sport],subtype:subtypeLabel(row.sport,row.subtype)}));
    sheet.getRow(1).font = {bold:true,color:{argb:'FF1F2A44'}};
    sheet.views = [{state:'frozen',ySplit:1}]; sheet.autoFilter = 'A1:F1';
    return new Response(await book.xlsx.writeBuffer(), {headers: {'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="dailyRep.xlsx"'}});
  }
  fail('接口不存在', 404);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin');
    const allowed = origin === url.origin || (env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN);
    const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
    if (origin && allowed) Object.assign(headers, {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Vary':'Origin'});
    let response;
    try {
      if (origin && !allowed && request.method !== 'GET') fail('请求来源不受信任', 403);
      response = request.method === 'OPTIONS' ? new Response(null, {status:204}) : await api(request, env);
    } catch (error) {
      if (!error.status) console.error('API failure', request.method, url.pathname, error.message);
      response = json({error: error.status ? error.message : '服务暂时不可用，请重试'}, error.status || 500);
    }
    const result = new Response(response.body, response);
    for (const [key,value] of Object.entries(headers)) result.headers.set(key,value);
    return result;
  }
};
