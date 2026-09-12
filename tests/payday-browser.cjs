// End-to-end checks run only against a disposable local copy, never production records.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const dependencies=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const {chromium}=require(path.join(dependencies,'node/node_modules/playwright'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'budget-payday-'));
const database=path.join(temp,'budget.sqlite3');fs.copyFileSync('.local/pass1/budget-2026.sqlite3',database);
const server=spawn(path.join(dependencies,'python/python.exe'),['-m','budget.cli','serve','--database',database,'--port','8771'],{windowsHide:true,stdio:'pipe'});
let browser;
async function ready(){for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8771/api/model')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Local test server did not start.');}
async function transaction(page,amount,description,date='2026-09-11'){
  await page.locator('[data-nav=transactions]').click();await page.locator('#add-transaction').click();
  await page.locator('#transaction-date').fill(date);await page.locator('#transaction-amount').fill(amount);await page.locator('#transaction-description').fill(description);
  await page.locator('#transaction-category').selectOption('1');await page.locator('#transaction-account').selectOption('1');
  await page.locator('#transaction-form button[type=submit]').click();await page.locator('#transaction-dialog').waitFor({state:'hidden'});
}
async function model(){return (await fetch('http://127.0.0.1:8771/api/model?period=19')).json();}
(async()=>{
  try{
    await ready();browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8771');await page.locator('#add-transaction').waitFor();
    const before=await model();await transaction(page,'3199.00','Test Drees income');
    await page.locator('[data-nav=budget]').click();await page.locator('#start-budget').waitFor();await page.locator('#start-budget').click();
    await page.locator('[data-allocation="0"]').waitFor();assert.equal(await page.locator('[data-allocation]').count(),63);
    assert.match(await page.locator('#budget-totals').innerText(),/\$3,583\.60/);assert.match(await page.locator('#budget-totals').innerText(),/-\$384\.60/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Draft mobile horizontal overflow');
    await page.locator('[data-allocation="0"]').fill('80.00');await page.locator('#reset-defaults').click();assert.equal(await page.locator('[data-allocation="0"]').inputValue(),'100.00');
    await page.locator('[data-allocation="0"]').fill('90.00');await page.locator('[data-allocation="10"]').fill('500.00');
    await page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent.startsWith('Draft saved'));
    await page.reload();await page.locator('[data-allocation="10"]').waitFor();assert.equal(await page.locator('[data-allocation="10"]').inputValue(),'500.00');
    assert.equal((await model()).envelopes[0].budget_cents,0);
    await page.locator('#edit-defaults').click();await page.locator('[data-default="10"]').fill('545.00');await page.locator('#budget-dialog button[type=submit]').click();await page.locator('#budget-dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('[data-allocation="10"]').inputValue(),'500.00');
    await page.locator('#add-expected').click();await page.locator('#expected-source').fill('Wife paycheck');await page.locator('#expected-amount').fill('620.00');await page.locator('#expected-date').fill('2026-09-18');await page.locator('#budget-dialog button[type=submit]').click();await page.locator('#budget-dialog').waitFor({state:'hidden'});
    assert.equal((await model()).payday.remaining_cents,319900);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Expected income mobile overflow');
    fs.mkdirSync('.tmp',{recursive:true});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'.tmp/payday-draft-mobile.png',fullPage:false});
    await page.locator('#review-budget').click();await page.locator('#budget-dialog').waitFor();assert.match(await page.locator('#budget-dialog').innerText(),/-\$324\.60/);
    await page.locator('#budget-dialog button[type=submit]').click();await page.locator('#budget-dialog').waitFor({state:'hidden'});
    const after=await model();assert.equal(after.payday.session.status,'completed');assert.equal(after.payday.remaining_cents,-32460);
    assert.equal(after.envelopes[0].ending_cents,before.envelopes[0].ending_cents+9000);
    await page.reload();await page.locator('#allocate-extra').waitFor();assert.equal(await page.locator('#start-budget').count(),0);
    await transaction(page,'100.00','Test gift','2026-09-12');await page.locator('[data-nav=budget]').click();await page.locator('#allocate-extra').click();
    await page.locator('#extra-envelope').selectOption('15');await page.locator('#extra-amount').fill('100.00');await page.locator('#extra-date').fill('2026-09-12');await page.locator('#extra-note').fill('Test allocation');await page.locator('#budget-dialog button[type=submit]').click();await page.locator('#budget-dialog').waitFor({state:'hidden'});
    const gifted=await model();assert.equal(gifted.payday.remaining_cents,-32460);assert.equal(gifted.envelopes[0].ending_cents,after.envelopes[0].ending_cents+10000);
    assert.equal(gifted.payday.session.allocations[0],9000);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
    fs.mkdirSync('.tmp',{recursive:true});await page.screenshot({path:'.tmp/payday-mobile.png',fullPage:false});assert.deepEqual(errors,[]);
    console.log('PASS: mobile end-to-end draft persistence, independent defaults, expected income, review, negative completion, immutable session, and extra-income allocation.');
  }finally{
    if(browser)await browser.close();server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once('close',resolve));
    // Only remove this script's exact mkdtemp result after the child closes its database.
    if(path.resolve(path.dirname(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('budget-payday-'))throw new Error('Unsafe test cleanup path.');
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
