import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker,{passwordHash} from '../worker/index.js';
import {digest,drainDeletedPhotos} from '../worker/account.js';
import {sqliteD1} from './sqlite-d1.js';

function setup(t){
  const db=new DatabaseSync(':memory:'), dir=new URL('../migrations/',import.meta.url);
  for(const file of readdirSync(dir).sort().filter(f=>f<'0007'))db.exec(readFileSync(new URL(file,dir),'utf8'));
  const photos=new Set(),pending=[];
  const env={DB:sqliteD1(db),SETUP_CODE:'invite',PHOTOS:{delete:async keys=>keys.forEach(key=>photos.delete(key))}};
  const call=(route,{data,token,ip='test',headers={}}={})=>worker.fetch(new Request('https://dailyrep.test/api'+route,{
    method:data===undefined?'GET':'POST',headers:{'CF-Connecting-IP':ip,...(token?{Authorization:'Bearer '+token}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data),
  }),env,{waitUntil:p=>pending.push(p)});
  const migrate=()=>{for(const file of ['0007_account_management.sql','0008_weight_and_avatar.sql'])db.exec(readFileSync(new URL(file,dir),'utf8'));};
  const get=async(p,options,status=200)=>{const response=await call(p,options);assert.equal(response.status,status,await response.clone().text());return status===204?null:response.json();};
  t.after(async()=>{await Promise.all(pending);db.close();});
  return {env,db,photos,pending,get,migrate};
}

test('migration preserves account, workouts and sessions; profile, device revocation and password changes work',async t=>{
  const {db,get,migrate}=setup(t);
  const email='owner@example.com',token='a'.repeat(64),password='original-password';
  db.prepare('INSERT INTO account VALUES (1,?,?,?)').run(email,'salt',await passwordHash(password,'salt'));
  db.prepare('INSERT INTO sessions VALUES (?,?)').run(await digest(token),Date.now()+60000);
  db.exec("INSERT INTO records(id,sport,value,duration,occurredAt) VALUES ('workout','running',2,300,'2026-01-01')");
  migrate();
  const other=(await get('/login',{data:{email,password},headers:{'X-DailyRep-Client':'ios'}})).token;
  const settings=await get('/me',{token});
  assert.equal(settings.email,email);assert.equal(settings.emailAvailable,false);
  await get('/account/profile',{token,data:{nickname:'  海边训练  ',avatar:'mountain'}});
  assert.equal((await get('/me',{token:other})).nickname,'海边训练');
  const devices=await get('/account/sessions',{token});
  assert.equal(devices[0].current,true);assert.equal(devices[1].device,'dailyRep · iPhone');
  assert.ok(devices.every(d=>!d.token));
  await get('/account/sessions/revoke',{token,data:{id:devices[1].id}},204);
  await get('/me',{token:other},401);
  const fresh=(await get('/login',{data:{email,password}})).token;
  await get('/account/password',{token,data:{currentPassword:'wrong',newPassword:'changed-password'}},400);
  await get('/account/password',{token,data:{currentPassword:password,newPassword:'too-short'.slice(0,5)}},400);
  await get('/account/password',{token,data:{currentPassword:password,newPassword:'changed-password'}},204);
  await get('/me',{token:fresh},401);
  await get('/login',{data:{email,password}},401);
  await get('/login',{data:{email,password:'changed-password'}});
  assert.equal((await get('/records',{token}))[0].id,'workout');
});

test('email verification and recovery codes are single use; deletion removes data and retries photos',async t=>{
  const {db,env,photos,pending,get,migrate}=setup(t);
  migrate();
  const owner={email:'first@example.com',password:'password123',setupCode:'invite'};
  const {token}=await get('/register',{data:owner},201);
  const other=(await get('/login',{data:owner})).token;
  env.RESEND_API_KEY='mock';env.ACCOUNT_EMAIL_FROM='sender@example.com';
  const mail=[];
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    assert.equal(url,'https://api.resend.com/emails');mail.push(JSON.parse(options.body));return new Response(null,{status:200});
  });
  const email='changed@example.com';
  await get('/account/email/send',{token,data:{currentPassword:owner.password,email}});
  assert.equal(mail[0].to[0],email);
  const code=mail[0].text.match(/[a-f0-9]{12}/)[0];
  await get('/account/email/confirm',{token,data:{currentPassword:owner.password,email,code:'wrong'}},400);
  const result=await get('/account/email/confirm',{token,data:{currentPassword:owner.password,email,code}});
  assert.equal(result.emailVerified,true);
  await get('/me',{token:other},401);
  await get('/login',{data:owner},401);
  const recovery=(await get('/account/recovery-code',{token,data:{currentPassword:owner.password}})).code;
  await get('/password-reset',{data:{email,code:recovery,newPassword:'next-pass'}},204);
  await get('/password-reset',{data:{email,code:recovery,newPassword:'cannot-reuse'}},400);
  await get('/me',{token},401);
  await get('/password-reset/email',{data:{email}});
  assert.equal(mail[1].to[0],email);
  const mailCode=mail[1].text.match(/[a-f0-9]{12}/)[0];
  await get('/password-reset',{data:{email,code:mailCode,newPassword:'final-pass',method:'email'}},204);
  const signed=(await get('/login',{data:{email,password:'final-pass'}})).token;
  db.exec("INSERT INTO records(id,sport,value,duration,occurredAt,photo) VALUES ('workout','running',2,300,'2026-01-01','photo-a')");
  db.exec("INSERT INTO training_plans VALUES ('plan','running','active',1,'{}')");
  db.exec("INSERT INTO widget_links VALUES ('secret','plan')");
  photos.add('photo-a'); const deletePhotos=env.PHOTOS.delete;
  env.PHOTOS.delete=async()=>{throw new Error('temporary storage failure');};
  await get('/account/delete',{token:signed,ip:'delete',data:{currentPassword:'final-pass',confirmEmail:'wrong@example.com'}},400);
  await get('/account/delete',{token:signed,ip:'delete',data:{currentPassword:'final-pass',confirmEmail:email}},204);
  await Promise.all(pending);
  assert.equal(db.prepare('SELECT count(*) AS n FROM account_photo_cleanup').get().n,1);
  for(const table of ['account','sessions','records','training_plans','widget_links','account_email_codes'])
    assert.equal(db.prepare('SELECT count(*) AS n FROM '+table).get().n,0,table);
  await get('/records',{token:signed},401);
  assert.equal((await get('/setup')).registrationAvailable,false);
  await get('/register',{data:owner},409);
  assert.throws(()=>db.exec("INSERT INTO training_plans VALUES ('raced','running','active',1,'{}')"),/account deleted/);
  env.PHOTOS.delete=deletePhotos;
  await drainDeletedPhotos(env);
  assert.equal(photos.size,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM account_photo_cleanup').get().n,0);
});

test('weight records replace the same local day and uploaded avatars are private and removable',async t=>{
  const {db,get,migrate}=setup(t);
  migrate();
  const owner={email:'owner@example.com',password:'password123',setupCode:'invite'};
  const {token}=await get('/register',{data:owner},201);
  const day='2026-11-10';
  await get('/account/weight',{},401);
  await get('/account/weight',{token,data:{day:'2026-02-30',kg:70}},400);
  await get('/account/weight',{token,data:{day,kg:0}},400);
  assert.deepEqual(await get('/account/weight',{token,data:{day,kg:70.125}}),{day,kg:70.125});
  assert.deepEqual(await get('/account/weight',{token,data:{day,kg:70.25}}),{day,kg:70.25});
  assert.deepEqual(await get('/account/weight',{token}),[{day,kg:70.25}]);

  const avatar=readFileSync(new URL('../public/coast.jpg',import.meta.url)).toString('base64');
  await get('/account/avatar',{token,data:{image:'bad'}},400);
  await get('/account/avatar',{data:{image:avatar}},401);
  assert.equal((await get('/account/avatar',{token,data:{image:avatar}})).avatarImage,avatar);
  const other=(await get('/login',{data:owner})).token;
  assert.equal((await get('/me',{token:other})).avatarImage,avatar);
  assert.equal((await get('/account/avatar',{token,data:{image:null}})).avatarImage,null);
  await get('/account/delete',{token,data:{currentPassword:owner.password,confirmEmail:owner.email}},204);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM weight_entries').get().n,0);
});
