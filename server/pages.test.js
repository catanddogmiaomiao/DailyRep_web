import {test} from 'node:test';
import assert from 'node:assert/strict';
import proxy from '../pages/site/_worker.js';
test('dailyRep address forwards authenticated origin/cookies and binary download without changing headers',async()=>{
 const request=new Request('https://dailyrep-j7h.pages.dev/api/export?sport=abs',{headers:{Cookie:'session=local-test-only',Origin:'https://dailyrep-j7h.pages.dev'}});
 const binary=new Uint8Array([80,75,3,4]),response=new Response(binary,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="dailyRep.xlsx"','Set-Cookie':'session=local-test-only; HttpOnly; Secure; SameSite=Strict'}});
 const result=await proxy.fetch(request,{DAILYREP:{fetch:async received=>{assert.equal(received,request);assert.equal(received.headers.get('Origin'),new URL(received.url).origin);assert.equal(received.headers.get('Cookie'),'session=local-test-only');return response;}}});
 assert.equal(result,response);assert.deepEqual(new Uint8Array(await result.arrayBuffer()),binary);assert.match(result.headers.get('Set-Cookie'),/HttpOnly/);assert.match(result.headers.get('Content-Disposition'),/attachment/);
});
