// The forward unallocated pool starts at zero; historical funding is untouched.
export function budgetToday(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=type=>parts.find(p=>p.type===type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function allocationAmount(raw) {
  const m=String(raw).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if(!m)throw new Error('Enter a nonnegative amount with at most two decimal places.');
  const cents=Number(m[1])*100+Number((m[2]||'').padEnd(2,'0'));
  if(!Number.isSafeInteger(cents)||cents>100000000)throw new Error('Amount must be at most $1,000,000.');
  return cents;
}
export const allocationTotal=values=>values.reduce((s,v)=>s+v,0);
export function applyAllocations(data,config,sessions=[],extras=[]) {
  if(!config)return data;
  const budgets=data.budget_allocations.map(b=>({...b}));
  for(const session of sessions.filter(s=>s.status==='completed')) {
    if(!config.periods[String(session.period_id)])continue;
    config.envelope_ids.forEach((id,i)=>{
      const b=budgets.find(b=>b.allocation_period_id===session.period_id&&b.category_id===id);
      if(b){b.amount_cents+=session.allocations[i];b.application_budget_cents=(b.application_budget_cents||0)+session.allocations[i];}
    });
  }
  for(const extra of extras) {
    if(!config.periods[String(extra.period_id)])continue;
    const b=budgets.find(b=>b.allocation_period_id===extra.period_id&&b.category_id===extra.category_id);
    if(b){b.amount_cents+=extra.amount_cents;b.application_budget_cents=(b.application_budget_cents||0)+extra.amount_cents;}
  }
  return {...data,budget_allocations:budgets};
}
export function paydayState(data,config,periodId,settings=[],sessions=[],extras=[],expected=[],today=budgetToday()) {
  if(!config)return null;
  const period=config.periods[String(periodId)];
  const end=period?.end||config.start_date;
  const posted=data.transactions.filter(t=>t.transaction_type==='income'&&t.transaction_date>=config.start_date&&t.transaction_date<end&&t.transaction_date<=today).reduce((s,t)=>s+(t.amount_cents||0),0);
  const prior=sessions.filter(s=>s.status==='completed'&&config.periods[String(s.period_id)]?.start<end);
  const additions=extras.filter(e=>config.periods[String(e.period_id)]?.start<end&&e.allocation_date<=today);
  const committed=prior.reduce((s,v)=>s+allocationTotal(v.allocations),0)+additions.reduce((s,e)=>s+e.amount_cents,0);
  const defaults=settings.find(s=>s.id==='defaults');
  return {eligible:!!period,config,defaults:defaults?.allocations||config.defaults,defaults_revision:defaults?.revision||0,
    session:sessions.find(s=>s.period_id===periodId)||null,posted_cents:posted,committed_cents:committed,remaining_cents:posted-committed,
    expected:expected.filter(e=>e.status==='pending'),extras:extras.filter(e=>e.period_id===periodId),today};
}
