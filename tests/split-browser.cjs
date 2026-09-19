// End-to-end split workflow against a disposable local database, never production.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const deps=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const {chromium}=require(path.join(deps,'node/node_modules/playwright'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'budget-split-')),database=path.join(temp,'budget.sqlite3');
fs.copyFileSync('.local/refresh-2026/d2e0097b.sqlite3',database);
const server=spawn(path.join(deps,'python/python.exe'),['-m','budget.cli','serve','--database',database,'--port','8772'],{windowsHide:true,stdio:'pipe'});
let browser;
async function ready(){for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8772/api/model')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server did not start');}
async function current(){return (await fetch('http://127.0.0.1:8772/api/model?period=19')).json();}
(async()=>{try{
  await ready();browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8772/#transactions');await page.locator('#transactions .activity-row').first().waitFor();await page.locator('#add-transaction').click();await page.locator('#transaction-dialog').waitFor({state:'visible'});
  await page.locator('#transaction-date').fill('2026-09-12');await page.locator('#transaction-amount').fill('86.43');await page.locator('#transaction-description').fill('Walmart');await page.locator('#transaction-category').selectOption('25');await page.locator('#transaction-account').selectOption('1');
  await page.locator('#split-transaction').click();assert.equal(await page.locator('.split-row').count(),2);assert.match(await page.locator('[data-remainder-value]').innerText(),/\$86\.43/);
  await page.locator('[data-split-amount="1"]').fill('18.29');await page.locator('#add-split').click();await page.locator('[data-split-amount="2"]').fill('15.97');
  assert.match(await page.locator('[data-remainder-value]').innerText(),/\$52\.17/);assert.match(await page.locator('#split-summary').innerText(),/\$0\.00 remaining/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Split form overflows mobile viewport');
  await page.locator('#save-transaction').click();await page.locator('#transaction-dialog').waitFor({state:'hidden'});
  let model=await current(),item=model.transactions.find(t=>t.description==='Walmart');assert(item);assert.equal(item.amount_cents,8643);assert.deepEqual(item.allocations.map(a=>a.amount_cents),[5217,1829,1597]);
  assert.equal(new Set(item.allocations.map(a=>a.category_id)).size,3);
  await page.locator(`[data-transaction="${item.id}"]`).click();assert.match(await page.locator('#transaction-detail-splits').innerText(),/\$52\.17/);assert.match(await page.locator('#transaction-detail-splits').innerText(),/\$18\.29/);
  await page.locator('#transaction-detail-edit').click();page.once('dialog',d=>d.accept());await page.locator('#use-one-envelope').click();await page.locator('#save-transaction').click();await page.locator('#transaction-dialog').waitFor({state:'hidden'});
  model=await current();item=model.transactions.find(t=>t.description==='Walmart');assert.deepEqual(item.allocations,[]);
  const id=item.id;await page.reload();await page.locator(`[data-edit="${id}"]`).click();page.once('dialog',d=>d.accept());await page.locator('#delete-transaction').click();await page.locator('#transaction-dialog').waitFor({state:'hidden'});assert.equal((await current()).transactions.some(t=>String(t.id)===String(id)),false);
  assert.deepEqual(errors,[]);console.log('PASS: mobile split remainder, atomic save, detail, collapse, reload, and delete.');
}finally{if(browser)await browser.close();server.kill();if(server.exitCode===null)await new Promise(r=>server.once('close',r));if(path.dirname(temp)!==os.tmpdir()||!path.basename(temp).startsWith('budget-split-'))throw Error('Unsafe cleanup');fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
