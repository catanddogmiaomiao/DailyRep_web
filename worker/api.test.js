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
    const migration = await readFile(new URL('../migrations/0002_record_subtype.sql',import.meta.url),'utf8');
    await env.DB.prepare(migration.trim().replace(/;$/, '')).run();
    await env.DB.prepare((await readFile(new URL('../migrations/0003_record_details.sql',import.meta.url),'utf8')).trim().replace(/;$/, '')).run();
    await env.DB.prepare((await readFile(new URL('../migrations/0004_record_quantity_unit.sql',import.meta.url),'utf8')).trim().replace(/;$/, '')).run();
    const plansSchema=await readFile(new URL('../migrations/0005_training_plans.sql',import.meta.url),'utf8');
    for(const sql of plansSchema.split(';').map(s=>s.trim()).filter(Boolean))await env.DB.prepare(sql).run();
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
    const owner = {email:'owner@example.com',password:'Test1234',setupCode:'local-test-invitation'};
    assert.equal((await call('/records')).status,401);
    assert.equal((await call('/export')).status,401);
    assert.equal((await (await call('/setup')).json()).registrationAvailable,true);
    assert.equal((await post('/register',{...owner,setupCode:'wrong'})).status,403);
    assert.equal((await post('/register',{...owner,password:'Test123'})).status,400);
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
    const planStart=new Date(Date.now()-1000).toISOString().slice(0,10);
    const planBody={sport:'abs',title:'腹肌100天',startDate:planStart,goalDays:100,timeZone:'UTC',reminderEnabled:true,reminderTime:'19:00',repeat:{frequency:'daily'}};
    const planResponse=await post('/plans',planBody);assert.equal(planResponse.status,201,await planResponse.clone().text());
    let trainingPlan=await planResponse.json();const planId=trainingPlan.id;
    assert.equal((await post('/plans',planBody)).status,409);
    assert.equal((await post('/plans',{...planBody,sport:'swimming',goalDays:0})).status,400);
    const plannedForm=new FormData();
    for(const [key,value] of Object.entries({sport:'abs',details:JSON.stringify([{subtype:'situps',sets:[20,20,15],duration:300}]),planId,occurredAt:new Date(Date.now()-1000).toISOString()}))plannedForm.set(key,value);
    const plannedResponse=await call('/records',{method:'POST',body:plannedForm});assert.equal(plannedResponse.status,201,await plannedResponse.clone().text());
    const planned=await plannedResponse.json();assert.equal(planned.planId,planId);
    const planList=await (await call('/plans')).json();assert.equal(planList[0].progress.completedDays,1);
    for(const command of [{action:'pause'},{action:'resume'},{action:'extend',goalDays:110},{action:'extend',goalDays:120}]) {
      const response=await post('/plans/'+planId,{...command,revision:trainingPlan.revision});assert.equal(response.status,200,await response.clone().text());trainingPlan=await response.json();
    }
    assert.equal(trainingPlan.id,planId);assert.equal(trainingPlan.goalDays,120);assert.equal(trainingPlan.milestones.length,2);
    assert.equal((await post('/plans/'+planId,{action:'extend',goalDays:130,revision:1})).status,409);
    const wrongPlan=new FormData();for(const [key,value] of Object.entries({sport:'running',value:'1',duration:'60',occurredAt:new Date(Date.now()-1000).toISOString(),planId}))wrongPlan.set(key,value);
    assert.equal((await call('/records',{method:'POST',body:wrongPlan})).status,400);
    const linkedExport=new ExcelJS.Workbook();await linkedExport.xlsx.load(Buffer.from(await (await call('/export?sport=abs&planId='+planId)).arrayBuffer()));assert.equal(linkedExport.worksheets[0].getCell('I2').value,'腹肌100天');
    const link=await post('/widget-links',{planId});assert.equal(link.status,201);const linkData=await link.json();assert.match(linkData.code,/^[a-f0-9]{12}$/);
    const authToken=token;token='';
    const widget=await call('/widget-state',{headers:{'X-DailyRep-Widget-Key':linkData.code}});assert.equal(widget.status,200);const widgetData=await widget.json();assert.equal(widgetData.progress.goalDays,120);assert.equal(widgetData.progress.completedDays,1);assert.equal(widgetData.email,undefined);assert.equal(widgetData.records,undefined);
    assert.equal((await call('/plans')).status,401);assert.equal((await call('/widget-state')).status,401);
    token=authToken;
    assert.equal((await call('/widget-links',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId})})).status,200);
    assert.equal((await call('/widget-state',{headers:{'X-DailyRep-Widget-Key':linkData.code}})).status,401);
    assert.equal((await call('/records/'+planned.id,{method:'DELETE'})).status,204);
    assert.equal((await post('/plans/'+planId,{action:'finish',revision:trainingPlan.revision})).status,200);
    const form = new FormData();
    for (const [key,value] of Object.entries({sport:'running',value:'7.25',duration:'2520',occurredAt:'2025-10-22T07:30:00+08:00'})) form.set(key,value);
    // Regression: older iPhone builds labeled a real PNG as checkin.jpg.
    form.set('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=','base64')],{type:'image/jpeg'}),'checkin.jpg');
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
    // Verify persistence, history compatibility and filtered real Excel files.
    const extraIds = [];
    for (const [sport,subtype,value] of [['swimming','breaststroke',500],['swimming','butterfly',200],['swimming','freestyle',800],['abs','situps',10],['abs','abwheel',5],['swimming',null,100]]) {
      const body = new FormData();
      for (const [key,val] of Object.entries({sport,value,duration:300,occurredAt:'2026-10-01T08:00:00Z',...(subtype ? {subtype} : {})})) body.set(key,String(val));
      const response = await call('/records',{method:'POST',body});
      assert.equal(response.status,201,await response.clone().text());
      const row = await response.json(); assert.equal(row.subtype,subtype); extraIds.push(row.id);
    }
    const saved = await (await call('/records')).json();
    assert.equal(saved.filter(r => r.subtype).length,5);
    for (const [sport,subtype,label,value] of [['swimming','freestyle','自由泳',800],['abs','abwheel','腹肌轮',5],['swimming','unclassified','未分类',100]]) {
      const response = await call(`/export?sport=${sport}&subtype=${subtype}`);
      assert.equal(response.status,200);
      const xlsx = new ExcelJS.Workbook(); await xlsx.xlsx.load(Buffer.from(await response.arrayBuffer()));
      const sheet = xlsx.worksheets[0]; assert.equal(sheet.rowCount,2);
      assert.equal(sheet.getCell('C2').value,value); assert.equal(sheet.getCell('F2').value,label);
    }
    assert.equal((await call('/export?sport=abs&subtype=freestyle')).status,400);
    const invalidType = new FormData();
    for (const [key,val] of Object.entries({sport:'abs',subtype:'freestyle',value:10,duration:60,occurredAt:'2026-10-01'})) invalidType.set(key,String(val));
    assert.equal((await call('/records',{method:'POST',body:invalidType})).status,400);
    for (const id of extraIds) assert.equal((await call('/records/'+id,{method:'DELETE'})).status,204);
    const multiForm = new FormData();
    const multiDetails = [{subtype:'breaststroke',value:400,duration:240},{subtype:'butterfly',value:100,duration:60},{subtype:'freestyle',value:1000,duration:600}];
    for (const [key,val] of Object.entries({sport:'swimming',details:JSON.stringify(multiDetails),occurredAt:'2026-10-20'})) multiForm.set(key,val);
    multiForm.set('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'shared.png');
    const multiResponse=await call('/records',{method:'POST',body:multiForm});
    assert.equal(multiResponse.status,201,await multiResponse.clone().text());
    const multi=await multiResponse.json();assert.equal(multi.value,1500);assert.equal(multi.duration,900);assert.deepEqual(multi.details,multiDetails);
    assert.equal((await call('/photos/'+multi.photo)).status,200,'all details share the parent photo');
    const fetched=await (await call('/records')).json();
    assert.equal(fetched.filter(r=>r.sport==='swimming').length,1,'three strokes are a single database record');
    assert.deepEqual(fetched.find(r=>r.id===multi.id).details,multiDetails);
    const multiBook=new ExcelJS.Workbook();await multiBook.xlsx.load(Buffer.from(await (await call('/export?sport=swimming')).arrayBuffer()));
    assert.equal(multiBook.worksheets[0].rowCount,4);
    assert.equal(multiBook.worksheets[0].getCell('G2').value,multi.id);assert.equal(multiBook.worksheets[0].getCell('G4').value,multi.id);
    const filteredBook=new ExcelJS.Workbook();await filteredBook.xlsx.load(Buffer.from(await (await call('/export?sport=swimming&subtype=butterfly')).arrayBuffer()));
    assert.equal(filteredBook.worksheets[0].rowCount,2);assert.equal(filteredBook.worksheets[0].getCell('C2').value,100);
    assert.equal((await call('/records/'+multi.id,{method:'DELETE'})).status,204);
    assert.equal((await call('/photos/'+multi.photo)).status,404);
    for (const [sport,items,total] of [['abs',[{subtype:'situps',sets:[20,20,15],duration:600},{subtype:'abwheel',sets:[10,10,8],duration:300}],83],['pushups',[{subtype:null,sets:[20,15,10],duration:180}],45]]) {
      const setsForm = new FormData();
      for (const [key,val] of Object.entries({sport,details:JSON.stringify(items),occurredAt:'2026-10-20'})) setsForm.set(key,val);
      const response = await call('/records',{method:'POST',body:setsForm}); assert.equal(response.status,201,await response.clone().text());
      const row=await response.json();assert.equal(row.value,total);assert.deepEqual(row.details[0].sets,items[0].sets);
      if(sport==='abs')assert.equal(row.quantityUnit,'reps');
      const fetched=await (await call('/records')).json();assert.deepEqual(fetched.find(r=>r.id===row.id).details[0].sets,items[0].sets);
      const setsBook=new ExcelJS.Workbook();await setsBook.xlsx.load(Buffer.from(await (await call('/export?sport='+sport)).arrayBuffer()));
      assert.match(setsBook.worksheets[0].getCell('H2').value,/第1组 20/);
      assert.equal(setsBook.worksheets[0].getCell('D2').value,sport==='abs'?'个':'次');
      assert.equal((await call('/records/'+row.id,{method:'DELETE'})).status,204);
    }
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
