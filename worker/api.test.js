import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTestHarness} from 'wrangler';
import ExcelJS from 'exceljs';

test('Cloudflare runtime: single-owner signup, auth, R2 photos, records, real XLSX, limits', {timeout:60000}, async () => {
  const server = createTestHarness({workers:[{configPath:'./wrangler.jsonc', secrets:{SETUP_CODE:'local-test-invitation'}}]});
  try {
    await server.listen();
    const env = await server.getWorker().getEnv();
    const schema = await readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
    for (const sql of schema.split(';').map(s=>s.trim()).filter(Boolean)) await env.DB.prepare(sql).run();
    let token = '';
    const call = async (route, init={}) => {
      // Serialize with the same browser multipart encoder before crossing the
      // harness's separate undici implementation.
      if (init.body instanceof FormData) {
        const request = new Request('https://dailyrep.test', {method:'POST',body:init.body});
        init = {...init, headers:{...init.headers,'Content-Type':request.headers.get('Content-Type')}, body:new Uint8Array(await request.arrayBuffer())};
      }
      return server.fetch('https://dailyrep.test/api'+route, {...init, headers:{...init.headers,...(token?{Authorization:'Bearer '+token}:{})}});
    };
    const post = (route, data, headers={}) => call(route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
    const owner = {email:'owner@example.com',password:'test-password-1234',setupCode:'local-test-invitation'};
    assert.equal((await call('/records')).status,401);
    assert.equal((await call('/export')).status,401);
    assert.equal((await (await call('/setup')).json()).registrationAvailable,true);
    assert.equal((await post('/register',{...owner,setupCode:'wrong'})).status,403);
    assert.equal((await post('/register',{...owner,password:'short'})).status,400);
    assert.equal((await post('/register',owner,{Origin:'https://evil.test'})).status,403);
    const signup = await post('/register',owner);
    assert.equal(signup.status,201,await signup.clone().text());
    // The local harness dispatches over HTTP; production HTTPS adds Secure.
    assert.match(signup.headers.get('Set-Cookie'),/HttpOnly.*SameSite=Strict/);
    token = (await signup.json()).token;
    assert.equal((await (await call('/setup')).json()).registrationAvailable,false);
    assert.equal((await post('/register',{...owner,email:'intruder@example.com'})).status,409);
    assert.equal((await (await call('/me')).json()).email,owner.email);
    const session = await env.DB.prepare('SELECT token FROM sessions').first();
    assert.notEqual(session.token,token,'stored session is a hash, not the bearer token');
    const form = new FormData();
    for (const [key,value] of Object.entries({sport:'running',value:'7.25',duration:'2520',occurredAt:'2025-10-22T07:30:00+08:00'})) form.set(key,value);
    form.set('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'photo.png');
    const created = await call('/records',{method:'POST',body:form});
    assert.equal(created.status,201,await created.clone().text());
    const record = await created.json();
    assert.equal(record.value,7.25);
    assert.equal((await call('/photos/'+record.photo)).headers.get('Content-Type'),'image/png');
    const savedToken = token; token='';
    assert.equal((await call('/photos/'+record.photo)).status,401); token=savedToken;
    const book = new ExcelJS.Workbook();
    const exported = await call('/export?sport=running');
    assert.equal(exported.status,200,await exported.clone().text().then(t=>t.slice(0,100)));
    await book.xlsx.load(Buffer.from(await exported.arrayBuffer()));
    assert.equal(book.worksheets[0].getCell('C2').value,7.25);
    const bad = new FormData();
    for (const [key,value] of Object.entries({sport:'pushups',value:'1.5',duration:'10',occurredAt:'2025-01-01'})) bad.set(key,value);
    assert.equal((await call('/records',{method:'POST',body:bad})).status,400);
    const fake = new FormData();
    for (const [key,value] of Object.entries({sport:'running',value:'1',duration:'10',occurredAt:'2025-01-01'})) fake.set(key,value);
    fake.set('photo',new Blob(['not an image'],{type:'image/png'}),'fake.png');
    assert.equal((await call('/records',{method:'POST',body:fake})).status,400);
    assert.equal((await call('/records/'+record.id,{method:'DELETE'})).status,204);
    assert.equal((await call('/photos/'+record.photo)).status,404);
    assert.deepEqual(await (await call('/records')).json(),[]);
    assert.equal((await call('/logout',{method:'POST'})).status,204);
    assert.equal((await call('/records')).status,401);
    assert.equal((await post('/login',{...owner,password:'wrong'})).status,401);
    const login = await post('/login',owner); assert.equal(login.status,200);
    token = (await login.json()).token;
    await env.DB.prepare('UPDATE sessions SET expires=0').run();
    assert.equal((await call('/me')).status,401);
    for(let i=0;i<10;i++) await post('/login',{...owner,password:'wrong'},{'CF-Connecting-IP':'192.0.2.10'});
    assert.equal((await post('/login',owner,{'CF-Connecting-IP':'192.0.2.10'})).status,429);
    assert.equal((await call('/health')).status,200);
  } catch(e) { server.debug(); throw e; }
  finally {await server.close();}
});
