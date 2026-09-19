// Integer-cent equivalent of budget/calculations.py. No financial rounding here.
export function effectiveData(seed, changes = [], moves = []) {
  const transactions = new Map(seed.transactions.map(t => [String(t.id), {...t}]));
  for (const change of changes) {
    if (change.deleted) transactions.delete(String(change.id));
    else transactions.set(String(change.id), {...transactions.get(String(change.id)), ...change});
  }
  const movements = [...seed.envelope_movements];
  for (const m of moves) {
    movements.push({allocation_period_id:m.period_id,category_id:m.from_category_id,amount_cents:-m.amount_cents});
    movements.push({allocation_period_id:m.period_id,category_id:m.to_category_id,amount_cents:m.amount_cents});
  }
  return {...seed,transactions:[...transactions.values()],envelope_movements:movements};
}
export function calculateEnvelopes(data) {
  const periods = [...data.allocation_periods].sort((a,b)=>a.sequence-b.sequence);
  const categories = data.categories.filter(c=>data.budget_allocations.some(b=>b.category_id===c.id)).sort((a,b)=>a.display_order-b.display_order);
  const balances = new Map(categories.map(c=>[c.id,0]));
  const results=[];
  for(const p of periods) for(const c of categories) {
    const actual=data.transactions.filter(t=>t.transaction_date<p.calculation_end_date_exclusive && (p.calculation_start_date===null || t.transaction_date>=p.calculation_start_date)).reduce((s,t)=>{
      if(Array.isArray(t.allocations)&&t.allocations.some(a=>a.active!==false))return s+t.allocations.filter(a=>a.active!==false&&a.category_id===c.id).reduce((v,a)=>v+a.amount_cents,0);
      return s+(t.category_id===c.id?(t.amount_cents||0):0);
    },0);
    const budget=data.budget_allocations.find(b=>b.allocation_period_id===p.id && b.category_id===c.id).amount_cents;
    const moved=data.envelope_movements.filter(m=>m.allocation_period_id===p.id && m.category_id===c.id).reduce((s,m)=>s+m.amount_cents,0);
    const starting=balances.get(c.id); const ending=starting+budget-actual+moved;
    balances.set(c.id,ending);
    results.push({period_id:p.id,category_id:c.id,actual_cents:actual,ending_envelope_cents:ending,starting_cents:starting,moved_cents:moved});
  }
  return results;
}
export function buildModel(data, sequence) {
  const periods=[...data.allocation_periods].sort((a,b)=>a.sequence-b.sequence);
  const latest=data.transactions.map(t=>t.transaction_date).sort().at(-1)||null;
  const selected=sequence ? periods.find(p=>p.sequence===Number(sequence))||periods.at(-1) : periods.find(p=>latest && latest<p.calculation_end_date_exclusive)||periods.at(-1);
  const calculations=calculateEnvelopes(data).filter(r=>r.period_id===selected.id);
  const envelopes=data.categories.filter(c=>calculations.some(r=>r.category_id===c.id)).sort((a,b)=>a.display_order-b.display_order).map(c=>{
    const r=calculations.find(r=>r.category_id===c.id), b=data.budget_allocations.find(b=>b.category_id===c.id && b.allocation_period_id===selected.id), s=data.source_parity_values.find(s=>s.category_id===c.id && s.allocation_period_id===selected.id);
    return {id:c.id,category:c.canonical_name,budget_cents:b.amount_cents,actual_cents:r.actual_cents,ending_cents:r.ending_envelope_cents,starting_cents:r.starting_cents,moved_cents:r.moved_cents,...(b.application_budget_cents?{application_budget_cents:b.application_budget_cents}:{}),source:{sheet:c.source_sheet,row:c.source_row,actual_cell:s.actual_source_cell,ending_cell:s.ending_source_cell}};
  });
  const tx=data.transactions.map(t=>({...t,
    allocations:(t.allocations||[]).filter(a=>a.active!==false).map(a=>({category_id:a.category_id,amount_cents:a.amount_cents,category:data.categories.find(c=>c.id===a.category_id)?.canonical_name||'Unknown envelope'})),
    raw_category:t.allocation_count?`Split · ${t.allocation_count} envelopes`:data.categories.find(c=>c.id===t.category_id)?.canonical_name||t.raw_category,
    raw_account:data.accounts.find(a=>a.id===t.account_id)?.canonical_name||t.raw_account
  })).sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date)||(typeof a.id==='number'&&typeof b.id==='number'?b.id-a.id:String(b.id).localeCompare(String(a.id))));
  const periodTx=tx.filter(t=>t.transaction_date<selected.calculation_end_date_exclusive && (selected.calculation_start_date===null||t.transaction_date>=selected.calculation_start_date));
  const income=rows=>rows.filter(t=>t.transaction_type==='income').reduce((s,t)=>s+(t.amount_cents||0),0);
  const spending=rows=>rows.filter(t=>['expense','refund_credit'].includes(t.transaction_type)).reduce((s,t)=>s+(t.amount_cents||0),0);
  return {product:'B.',year:2026,as_of:latest,period_summary:{income_cents:income(periodTx),spending_cents:spending(periodTx)},summary:{income_cents:income(tx),spending_cents:spending(tx),ending_envelope_cents:envelopes.reduce((s,e)=>s+e.ending_cents,0),transaction_count:tx.length},periods:periods.map(p=>({id:p.id,sequence:p.sequence,label_date:p.label_date})),selected_period:{id:selected.id,sequence:selected.sequence,label_date:selected.label_date,end_date_exclusive:selected.calculation_end_date_exclusive},categories:data.categories,accounts:[...data.accounts].sort((a,b)=>a.canonical_name.localeCompare(b.canonical_name)),envelopes,transactions:tx.slice(0,100),period_transactions:periodTx,exceptions:data.migration_exceptions};
}
export function parseAmount(raw) {
  const match=String(raw).trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if(!match) throw new Error('Amount must have at most two decimal places.');
  const amount=(Number(match[2])*100+Number((match[3]||'').padEnd(2,'0')))*(match[1]?-1:1);
  if(!Number.isSafeInteger(amount)||!amount||Math.abs(amount)>100000000) throw new Error('Enter a nonzero amount of at most $1,000,000.');
  return amount;
}
