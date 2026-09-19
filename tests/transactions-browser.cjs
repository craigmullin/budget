// Transaction count and account filters against a disposable local database.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const deps=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const {chromium}=require(path.join(deps,'node/node_modules/playwright'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'budget-transactions-')),database=path.join(temp,'budget.sqlite3');
fs.copyFileSync('.local/refresh-2026/d2e0097b.sqlite3',database);
const server=spawn(path.join(deps,'python/python.exe'),['-m','budget.cli','serve','--database',database,'--port','8773'],{windowsHide:true,stdio:'pipe'});
let browser;
async function ready(){for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8773/api/model')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server did not start');}
(async()=>{try{
  await ready();const model=await (await fetch('http://127.0.0.1:8773/api/model')).json();assert(model.transactions.length>500);
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8773/#transactions');await page.locator('#transactions .activity-row').first().waitFor();
  assert.equal(await page.locator('#transaction-account-filter option').count(),model.accounts.length+1);
  assert.equal(await page.locator('#transactions .activity-row').count(),100);
  await page.locator('#transaction-limit').selectOption('250');assert.equal(await page.locator('#transactions .activity-row').count(),250);
  const account=model.accounts.find(a=>a.canonical_name==='NFCU')||model.accounts[0],expected=model.transactions.filter(t=>t.account_id===account.id).length;
  await page.locator('#transaction-account-filter').selectOption(String(account.id));
  assert.equal(await page.locator('#transactions .activity-row').count(),Math.min(250,expected));
  const details=await page.locator('#transactions .activity-row .detail').allTextContents();assert(details.every(text=>text.endsWith(`· ${account.canonical_name}`)));
  await page.locator('#transaction-limit').selectOption('all');assert.equal(await page.locator('#transactions .activity-row').count(),expected);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Transaction filters overflow mobile viewport');
  assert.deepEqual(errors,[]);console.log('PASS: transaction count and dynamic account filters.');
}finally{if(browser)await browser.close();server.kill();if(server.exitCode===null)await new Promise(r=>server.once('close',r));if(path.dirname(temp)!==os.tmpdir()||!path.basename(temp).startsWith('budget-transactions-'))throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
