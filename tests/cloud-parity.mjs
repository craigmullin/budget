import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {calculateEnvelopes,buildModel,effectiveData,parseAmount} from '../budget/static/cloud-model.mjs';
const seed=JSON.parse(readFileSync('.local/firebase/seed.json'));
const oracle=JSON.parse(readFileSync('.local/firebase/oracle.json'));
const results=calculateEnvelopes(seed);
assert.equal(results.length,oracle.length);
for(let i=0;i<oracle.length;i++) for(const key of Object.keys(oracle[i])) assert.equal(results[i][key],oracle[i][key],`${i}: ${key}`);
const models=JSON.parse(readFileSync('.local/firebase/models.json'));
for(const expected of models) {
  const actual=buildModel(seed,expected.selected_period.sequence);
  assert.deepEqual(actual.envelopes,expected.envelopes);
  assert.deepEqual(actual.summary,expected.summary);
  assert.deepEqual(actual.period_summary,expected.period_summary);
}
const p=seed.allocation_periods[1], c=seed.budget_allocations[0].category_id;
const edited=effectiveData(seed,[{id:'app_test',transaction_date:p.calculation_start_date,category_id:c,amount_cents:1234}]);
assert.equal(calculateEnvelopes(edited).find(r=>r.period_id===p.id&&r.category_id===c).actual_cents,results.find(r=>r.period_id===p.id&&r.category_id===c).actual_cents+1234);
const deleted=effectiveData(seed,[{id:seed.transactions[0].id,deleted:true}]); assert.equal(deleted.transactions.length,seed.transactions.length-1);
const envelopeIds=[...new Set(seed.budget_allocations.map(b=>b.category_id))];
const moved=effectiveData(seed,[],[{period_id:p.id,from_category_id:envelopeIds[0],to_category_id:envelopeIds[1],amount_cents:1000}]);
const beforeModel=buildModel(seed,p.sequence),afterModel=buildModel(moved,p.sequence);
assert.equal(afterModel.summary.ending_envelope_cents,beforeModel.summary.ending_envelope_cents);
assert.equal(afterModel.envelopes.find(e=>e.id===envelopeIds[0]).ending_cents,beforeModel.envelopes.find(e=>e.id===envelopeIds[0]).ending_cents-1000);
assert.equal(parseAmount('-13.43'),-1343); assert.equal(parseAmount('0.01'),1);
assert.throws(()=>parseAmount('1.001')); assert.throws(()=>parseAmount('0'));
console.log(`PASS: ${results.length} envelope calculations and all 26 period models match SQLite exactly.`);
