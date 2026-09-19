import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyAllocations,paydayState,allocationAmount,allocationTotal,budgetToday} from '../budget/static/payday-model.mjs';
import {effectiveData,buildModel} from '../budget/static/cloud-model.mjs';
const seed=JSON.parse(readFileSync('.local/firebase/seed.json'));
const config=JSON.parse(readFileSync('.local/firebase/payday-config.json'));
assert.equal(allocationTotal(config.defaults),356399);
assert.equal(budgetToday(new Date('2026-09-12T02:00:00Z')),'2026-09-11');
assert.equal(allocationAmount('0.00'),0);assert.equal(allocationAmount('0.01'),1);assert.equal(allocationAmount('3583.60'),358360);
for(const invalid of ['-1','0.001','NaN','Infinity','1e2','1000000.01',''])assert.throws(()=>allocationAmount(invalid));
const periodId=Number(Object.keys(config.periods)[0]),start=config.periods[String(periodId)].start;
const original=JSON.stringify(seed),posted={id:'app_income',category_id:1,transaction_type:'income',transaction_date:start,amount_cents:319900};
const data=effectiveData(seed,[posted]);
const expected=[{id:'wife',status:'pending',source:'Wife paycheck',amount_cents:62000,expected_date:'2026-09-18'}];
const draft={period_id:periodId,status:'draft',allocations:[...config.defaults],session_date:start};
assert.deepEqual(applyAllocations(data,config,[draft]).budget_allocations,data.budget_allocations);
assert.equal(paydayState(data,config,periodId,[],[draft],[],expected,start).remaining_cents,319900);
// Representative parallel decisions: several exceptions, unchanged envelopes, negative balances,
// expected income excluded. Independently evaluate the workbook roll-forward equation in cents.
const completed={...draft,status:'completed'};
completed.allocations[0]=9000;completed.allocations[10]=50000;completed.allocations[55]=0;
const before=buildModel(data,periodId),after=buildModel(applyAllocations(data,config,[completed]),periodId);
for(let i=0;i<63;i++){
  const id=config.envelope_ids[i],b=before.envelopes.find(e=>e.id===id),a=after.envelopes.find(e=>e.id===id);
  assert.equal(a.budget_cents,completed.allocations[i]);
  assert.equal(a.ending_cents,b.starting_cents+completed.allocations[i]-b.actual_cents+b.moved_cents);
}
assert.ok(after.envelopes.some(e=>e.ending_cents<0));
assert.equal(paydayState(data,config,periodId,[],[completed],[],expected,start).remaining_cents,319900-allocationTotal(completed.allocations));
assert.equal(paydayState(data,config,periodId+1,[],[completed],[],expected,config.periods[String(periodId+1)].start).remaining_cents,319900-allocationTotal(completed.allocations));
const gift={period_id:periodId,category_id:15,amount_cents:10000,allocation_date:start};
const withGift=buildModel(applyAllocations(data,config,[completed],[gift]),periodId);
assert.equal(withGift.envelopes.find(e=>e.id===15).ending_cents,after.envelopes.find(e=>e.id===15).ending_cents+10000);
assert.equal(paydayState(data,config,periodId,[],[completed],[gift],expected,start).remaining_cents,319900-allocationTotal(completed.allocations)-10000);
assert.equal(JSON.stringify(seed),original);
assert.deepEqual(buildModel(applyAllocations(data,config,[completed],[gift]),periodId-1).envelopes,buildModel(data,periodId-1).envelopes);
console.log('PASS: 63 forward defaults, draft isolation, independent cent roll-forward, negative remainder, carryover, extras, and unchanged history.');
