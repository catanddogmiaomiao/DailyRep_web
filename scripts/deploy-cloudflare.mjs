import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const cli = 'node_modules/wrangler/bin/wrangler.js';
const env = {...process.env, WRANGLER_SEND_METRICS:'false', CI:'true'};
function run(args, quiet=false) {
  const result = spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8',timeout:180000});
  if (!quiet || result.status !== 0) {
    if(result.stdout) process.stdout.write(result.stdout);
    if(result.stderr) process.stderr.write(result.stderr);
  }
  if(result.error) throw result.error;
  if(result.status !== 0) throw new Error('Cloudflare command failed: '+args.slice(0,3).join(' '));
  return result.stdout;
}
const identity = JSON.parse(run(['whoami','--json'],true));
if(!identity.loggedIn) throw new Error('请先运行 npx wrangler login');
const config = JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(!config.account_id) {
  if(identity.accounts.length !== 1) throw new Error('检测到多个 Cloudflare 账号，请在 wrangler.jsonc 设置 account_id');
  config.account_id=identity.accounts[0].id;
}
env.CLOUDFLARE_ACCOUNT_ID=config.account_id;
console.log('Preparing D1 database…');
let databases = JSON.parse(run(['d1','list','--json'],true));
const binding = config.d1_databases[0];
let database = databases.find(db=>db.name===binding.database_name);
if(!database) {
  run(['d1','create',binding.database_name,'--location','apac']);
  databases=JSON.parse(run(['d1','list','--json'],true));
  database=databases.find(db=>db.name===binding.database_name);
}
if(!database?.uuid) throw new Error('Cloudflare 未返回数据库标识，停止部署');
binding.database_id=database.uuid;
writeFileSync('wrangler.jsonc',JSON.stringify(config,null,2)+'\n');
console.log('Preparing private R2 photo bucket…');
const buckets=run(['r2','bucket','list'],true);
const bucket=config.r2_buckets[0].bucket_name;
if(!buckets.split('\n').some(line=>line.trim().match(/^name:\s*(.*)$/)?.[1]===bucket)) run(['r2','bucket','create',bucket,'--location','apac']);
run(['d1','migrations','apply',binding.database_name,'--remote']);
if(!existsSync('.dev.vars')) writeFileSync('.dev.vars','SETUP_CODE='+randomBytes(6).toString('hex')+'\n',{mode:0o600});
console.log('Deploying website and API…');
const output=run(['deploy','--secrets-file','.dev.vars','--keep-vars']);
const url=output.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0];
if(!url) throw new Error('发布命令完成但未返回 workers.dev 地址，请检查 Cloudflare 控制台');
mkdirSync('.wrangler',{recursive:true});
writeFileSync('.wrangler/deployed.json',JSON.stringify({url,at:new Date().toISOString()},null,2)+'\n');
const response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(30000)});
if(!response.ok || !(await response.json()).ok) throw new Error('已上传，但线上健康检查未通过');
console.log('Verified deployment: '+url);
console.log('首次注册邀请码保存在本机 .dev.vars 中；账号创建后注册会自动关闭。');
