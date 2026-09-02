const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((cents||0)/100);
const dateLabel = value => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
const amountClass = cents => cents < 0 ? 'negative' : '';
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
let model;

async function load(period){
  const response=await fetch(`/api/model${period?`?period=${period}`:''}`);
  if(!response.ok) throw new Error('Unable to load budget data');
  model=await response.json(); render();
}
function render(){
  document.querySelector('#as-of').textContent=`Ledger through ${dateLabel(model.as_of)} · period beginning ${dateLabel(model.selected_period.label_date)}`;
  const select=document.querySelector('#period');
  if(!select.options.length){select.innerHTML=model.periods.map(p=>`<option value="${p.sequence}">${String(p.sequence).padStart(2,'0')} · ${dateLabel(p.label_date)}</option>`).join('');}
  select.value=model.selected_period.sequence;
  const cards=[['True income',model.summary.income_cents,'Transfers and carryover excluded'],['Household spending',model.summary.spending_cents,'Refunds and credits included'],['Envelope balance',model.summary.ending_envelope_cents,'At selected period end'],['Ledger entries',model.summary.transaction_count.toLocaleString(),'Imported source rows']];
  document.querySelector('#summary').innerHTML=cards.map(([label,value,note],i)=>`<article class="card"><span class="label">${label}</span><strong class="${i<3?amountClass(value):''}">${i<3?money(value):value}</strong><small>${note}</small></article>`).join('');
  renderEnvelopes();
  document.querySelector('#transactions').innerHTML=model.transactions.map(t=>`<div class="activity-row"><span class="muted">${dateLabel(t.transaction_date)}</span><div><p>${esc(t.description||'No description')}</p><p class="detail">${esc(t.raw_category||'Uncategorized')} · ${esc(t.raw_account||'No account')} · Expenses row ${t.source_row}</p></div><span class="amount ${amountClass(t.amount_cents)}">${money(t.amount_cents)}</span></div>`).join('');
  document.querySelector('#exceptions').innerHTML=model.exceptions.map(e=>`<div class="exception"><span class="code">${esc(e.exception_code)}</span><p>${esc(e.description)}</p><p><strong>Resolution:</strong> ${esc(e.resolution)}</p><p class="source">${esc(e.source_sheet)}!${esc(e.source_cell)}${e.raw_value?` · raw ${esc(e.raw_value)}`:''}</p></div>`).join('');
}
function renderEnvelopes(){const q=document.querySelector('#envelope-filter').value.trim().toLowerCase();const rows=model.envelopes.filter(e=>e.category.toLowerCase().includes(q));document.querySelector('#envelopes').innerHTML=rows.map(e=>`<tr title="Source: Budget 2026 row ${e.source.row}; actual ${esc(e.source.actual_cell)}; ending ${esc(e.source.ending_cell)}"><td>${esc(e.category)}</td><td class="${amountClass(e.budget_cents)}">${money(e.budget_cents)}</td><td class="${amountClass(e.actual_cents)}">${money(e.actual_cents)}</td><td class="${amountClass(e.ending_cents)}">${money(e.ending_cents)}</td></tr>`).join('');}
document.querySelector('#period').addEventListener('change',e=>load(e.target.value).catch(showError));
document.querySelector('#envelope-filter').addEventListener('input',renderEnvelopes);
function showError(error){document.querySelector('main').innerHTML=`<section class="panel"><h2>Budget data is unavailable</h2><p>${error.message}</p></section>`;}
load().catch(showError);
