// DOM regression test; no personal account or production API access.
const assert=require('node:assert/strict');
const {JSDOM}=require(process.env.DAILYREP_JSDOM_MODULE||'jsdom');
const {buildSync}=require('esbuild');
(async()=>{
 const bundle=buildSync({entryPoints:['src/main.jsx'],bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
 const dom=new JSDOM('<div id="root"></div>',{url:'https://dailyrep.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;const downloads=[];const revoked=[];let urls=0;let fail=false;
 w.scrollTo=()=>{};w.AbortSignal=AbortSignal;
 w.URL.createObjectURL=()=>`blob:test-${++urls}`;w.URL.revokeObjectURL=url=>revoked.push(url);
 w.HTMLAnchorElement.prototype.click=function(){downloads.push({href:this.href,name:this.download,attached:this.isConnected});};
 w.fetch=async url=>{
  if(url==='/api/me')return {ok:true,json:async()=>({email:'test@example.com'})};
  if(url==='/api/records'||url==='/api/plans')return {ok:true,json:async()=>[]};
  if(url.startsWith('/api/export?'))return fail?{ok:false,json:async()=>({error:'请重新登录'})}:{ok:true,blob:async()=>new Blob(['test export'])};
  throw Error('Unexpected API '+url);
 };
 w.eval(bundle);
 const wait=async check=>{for(let n=0;n<100;n++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('DOM assertion timed out');};
 await wait(()=>w.document.querySelector('aside'));
 [...w.document.querySelectorAll('aside button')].find(b=>b.textContent==='跑步').click();
 await wait(()=>w.document.querySelector('.period'));
 for(const [label,count] of [['月',new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()],['年',12],['周',7]]){
  [...w.document.querySelectorAll('.period button')].find(b=>b.textContent===label).click();
  await wait(()=>w.document.querySelectorAll('.bar-column').length===count);
  assert.equal(w.document.querySelector('.period .chosen').textContent,label);
 }
 const exportButton=()=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.includes('导出 Excel'));
 exportButton().click();await wait(()=>downloads.length===1);
 assert.equal(downloads[0].attached,true);assert.equal(downloads[0].name,'dailyRep-running.xlsx');
 await wait(()=>w.document.querySelector('.download-status a'));
 assert.equal(w.document.querySelector('.download-status a').href,downloads[0].href);
 assert.equal(revoked.length,0,'download must remain usable until replaced or leaving the report');
 fail=true;exportButton().click();await wait(()=>w.document.querySelector('[role=alert]')?.textContent.includes('请重新登录'));
 [...w.document.querySelectorAll('aside button')].find(b=>b.textContent==='游泳').click();await wait(()=>revoked.length===1);
 dom.window.close();console.log('PASS: month/year/week changes, attached download link, persistent fallback, export errors and URL cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
