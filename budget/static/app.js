import {isCloud,cloudRequest,startCloud,downloadBackup} from './cloud.mjs';
import {renderPayday} from './payday.mjs';
import {budgetToday} from './payday-model.mjs';
import {parsePositiveCents,calculateSplit} from './split-model.mjs';
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((cents||0)/100);
const dateLabel = value => value ? new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`)) : 'No transactions';
const amountClass = cents => cents < 0 ? 'negative' : '';
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
let model;
let view = 'home';
let detailId;
let transactionRevision=0;
let transactionSplits=null;
let remainderIndex=null;
let transactionCreateId=null;
let transactionDetail=null;
const signedMoney = cents => `${cents > 0 ? '+' : ''}${money(cents)}`;
const periodRange = () => {
  const end = new Date(`${model.selected_period.end_date_exclusive}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate()-1);
  return `${dateLabel(model.selected_period.label_date)} – ${dateLabel(end.toISOString().slice(0,10))}`;
};

async function request(url, options={}) {
  if(isCloud)return cloudRequest(url,options);
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The change could not be saved');
  return payload;
}
async function load(period) {
  model = await request(`/api/model${period ? `?period=${period}` : ''}`);
  render();
}
function render() {
  view = ['home','envelopes','transactions','budget','more'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  document.querySelectorAll('[data-nav]').forEach(a => {if(a.dataset.nav===view) a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  document.querySelector('#page-title').textContent={home:'Current period',envelopes:'Envelopes',transactions:'Transactions',budget:'Payday Budget',more:'Source & records'}[view];
  document.querySelector('#page-kicker').textContent=view==='home'?'Your household ledger':'Budget · 2026';
  document.querySelector('#as-of').textContent=`${periodRange()} · Ledger through ${dateLabel(model.as_of)}`;
  const select=document.querySelector('#period');
  select.innerHTML=model.periods.map(p=>`<option value="${p.sequence}">${String(p.sequence).padStart(2,'0')} · ${dateLabel(p.label_date)}</option>`).join('');
  select.value=model.selected_period.sequence;
  document.querySelector('#summary').classList.toggle('hidden',view!=='home');
  document.querySelector('#summary').innerHTML=`<p class="available-label">Available</p><p class="available-amount ${amountClass(model.summary.ending_envelope_cents)}">${money(model.summary.ending_envelope_cents)}</p><p class="available-note">Across envelopes at the selected period end</p><div class="supporting"><div><span>Income this period</span><strong>${money(model.period_summary.income_cents)}</strong></div><div><span>Spent this period</span><strong>${money(model.period_summary.spending_cents)}</strong></div></div>`;
  document.querySelector('#envelope-section').classList.toggle('hidden',!['home','envelopes'].includes(view));
  document.querySelector('#transaction-section').classList.toggle('hidden',!['home','transactions'].includes(view));
  document.querySelector('#more-section').classList.toggle('hidden',view!=='more');
  document.querySelector('#envelope-filter').classList.toggle('hidden',view==='home');
  document.querySelector('#all-envelopes').classList.toggle('hidden',view!=='home');
  document.querySelector('#all-transactions').classList.toggle('hidden',view!=='home');
  document.querySelector('#ledger-heading').textContent=view==='transactions'?'Your transaction ledger':'Recent transactions';
  document.querySelector('#ledger-note').textContent=view==='transactions'?'Latest 100':'Latest 6';
  renderEnvelopes();
  document.querySelector('#transactions').innerHTML=transactionRows(view==='home'?model.transactions.slice(0,6):model.transactions);
  document.querySelector('#year-summary').innerHTML=[['Income',money(model.summary.income_cents)],['Spent',money(model.summary.spending_cents)],['Ledger entries',model.summary.transaction_count.toLocaleString()]].map(([label,value])=>`<div><p>${label}</p><strong>${value}</strong></div>`).join('');
  document.querySelector('#exceptions').innerHTML=model.exceptions.map(e=>`<div class="exception"><span class="code">${esc(e.exception_code)}</span><p>${esc(e.description)}</p><p><strong>Resolution:</strong> ${esc(e.resolution)}</p><p class="source">${esc(e.source_sheet)}!${esc(e.source_cell)}${e.raw_value?` · raw ${esc(e.raw_value)}`:''}</p></div>`).join('');
  populateForms();
  renderPayday(model,request,()=>load(model.selected_period.sequence),toast);
  if(detailId && document.querySelector('#envelope-dialog').open) renderDetail();
}
function transactionRows(rows) {
  return rows.length ? rows.map(t=>`<div class="activity-row"><div><p>${esc(t.description||'No description')}</p><p class="detail">${dateLabel(t.transaction_date)} · ${esc(t.raw_category||'Uncategorized')} · ${esc(t.raw_account||'No account')}</p></div><span class="amount">${money(t.amount_cents)}</span><button class="text-action" type="button" data-transaction="${t.id}" aria-label="View ${esc(t.description||'transaction')}">View</button><button class="text-action" type="button" data-edit="${t.id}" aria-label="Edit ${esc(t.description||'transaction')}">Edit</button></div>`).join('') : '<p class="empty">No transactions to show.</p>';
}
function renderEnvelopes() {
  const q=document.querySelector('#envelope-filter').value.trim().toLowerCase();
  const rows=view==='home' ? [...model.envelopes.filter(e=>e.ending_cents<0),...model.envelopes.filter(e=>e.ending_cents>=0)].slice(0,8) : model.envelopes.filter(e=>e.category.toLowerCase().includes(q));
  document.querySelector('#envelope-heading').textContent=view==='home'?'A few balances to know.':'A place for every dollar.';
  document.querySelector('#envelopes').innerHTML=rows.length ? rows.map(e=>`<div class="envelope-row"><button class="envelope-name" type="button" data-detail="${e.id}">${esc(e.category)}</button><span class="envelope-balance ${amountClass(e.ending_cents)}">${money(e.ending_cents)}</span><button class="text-action" type="button" data-move="${e.id}" aria-label="Move money from ${esc(e.category)}">Move</button></div>`).join('') : '<p class="empty">No matching envelopes.</p>';
}
function renderDetail() {
  const e=model.envelopes.find(e=>e.id===detailId); if(!e) return;
  document.querySelector('#envelope-title').textContent=e.category;
  document.querySelector('#envelope-total').innerHTML=`<span class="${amountClass(e.ending_cents)}">${money(e.ending_cents)}</span> <small>available</small>`;
  document.querySelector('#envelope-breakdown').innerHTML=[['Starting balance',money(e.starting_cents)],['Budget',signedMoney(e.budget_cents)],['Spent',signedMoney(-e.actual_cents)],['Moved / source adjustments',signedMoney(e.moved_cents)],['Available',money(e.ending_cents)]].map(([label,value],i)=>`<div class="${i===4?'total':''}"><span>${label}</span><span class="${i===4?amountClass(e.ending_cents):''}">${value}</span></div>`).join('');
  document.querySelector('#envelope-transactions').innerHTML=transactionRows(model.period_transactions.filter(t=>t.category_id===e.id||t.allocations?.some(a=>a.category_id===e.id)));
  document.querySelector('#envelope-source').textContent=`${periodRange()} · Source: ${e.source.sheet}, row ${e.source.row}. Actual ${e.source.actual_cell}; envelope ${e.source.ending_cell}.${e.application_budget_cents?` Includes ${money(e.application_budget_cents)} of new application allocations; imported source values remain unchanged.`:''}`;
}
function populateForms() {
  const categories=model.categories.map(c=>`<option value="${c.id}">${esc(c.canonical_name)}</option>`).join('');
  const accounts=model.accounts.map(a=>`<option value="${a.id}">${esc(a.canonical_name)}</option>`).join('');
  document.querySelector('#transaction-category').innerHTML=categories;
  document.querySelector('#transaction-account').innerHTML=accounts;
  const envelopes=model.envelopes.map(e=>`<option value="${e.id}">${esc(e.category)} · ${money(e.ending_cents)}</option>`).join('');
  document.querySelector('#move-from').innerHTML=envelopes;
  document.querySelector('#move-to').innerHTML=envelopes;
}
function openTransaction(item) {
  transactionRevision=item?.revision||0;
  transactionCreateId=item?null:`app_${crypto.randomUUID()}`;
  document.querySelector('#envelope-dialog').close();
  document.querySelector('#transaction-detail-dialog').close();
  const form=document.querySelector('#transaction-form'); form.reset(); form.querySelector('.form-error').textContent='';
  document.querySelector('#transaction-id').value=item?.id||'';
  document.querySelector('#transaction-title').textContent=item?'Edit transaction':'Add transaction';
  document.querySelector('#transaction-date').value=item?.transaction_date||model.as_of||'2026-01-01';
  document.querySelector('#transaction-amount').value=item ? (item.amount_cents/100).toFixed(2) : '';
  document.querySelector('#transaction-description').value=item?.description||'';
  if(item){document.querySelector('#transaction-category').value=item.category_id;document.querySelector('#transaction-account').value=item.account_id;}
  transactionSplits=item?.allocations?.length?item.allocations.map(a=>({category_id:a.category_id,raw:(a.amount_cents/100).toFixed(2)})):null;
  remainderIndex=null;
  renderSplitEditor();
  document.querySelector('#delete-transaction').classList.toggle('hidden',!item);
  document.querySelector('#transaction-dialog').showModal();
}
function totalCents(){return parsePositiveCents(document.querySelector('#transaction-amount').value);}
function splitValues(){if(!transactionSplits)return null;const result=calculateSplit(document.querySelector('#transaction-amount').value,transactionSplits,remainderIndex);result.allocations.forEach((a,i)=>transactionSplits[i].amount_cents=a.amount_cents);return result;}
function splitOptions(selected,index){const used=new Set(transactionSplits.map((r,i)=>i===index?null:r.category_id));return model.categories.filter(c=>c.category_type==='expense').map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''} ${used.has(c.id)?'disabled':''}>${esc(c.canonical_name)}</option>`).join('');}
function updateSplitSummary(){if(!transactionSplits)return;const state=splitValues(),summary=document.querySelector('#split-summary');document.querySelectorAll('[data-remainder-value]').forEach(el=>{const amount=transactionSplits[Number(el.dataset.remainderValue)].amount_cents||0;el.textContent=money(amount);el.classList.toggle('negative',amount<0);});const label=state.remainder_cents<0?`${money(-state.remainder_cents)} over`:state.remaining===null?'Enter the transaction total':state.remaining===0?'$0.00 remaining':state.remaining>0?`${money(state.remaining)} remaining`:`${money(-state.remaining)} over`;summary.innerHTML=`<span>Remaining</span><strong>${label}</strong>`;summary.classList.toggle('over',state.remainder_cents<0||state.remaining!==null&&state.remaining<0);document.querySelector('#save-transaction').disabled=!state.valid||state.remaining!==0;}
function renderSplitEditor(){const active=!!transactionSplits;document.querySelector('#split-editor').classList.toggle('hidden',!active);document.querySelector('#split-transaction').classList.toggle('hidden',active);document.querySelector('#single-category').classList.toggle('hidden',active);document.querySelector('#transaction-category').required=!active;if(!active){document.querySelector('#save-transaction').disabled=false;return;}document.querySelector('#split-rows').innerHTML=transactionSplits.map((row,i)=>`<div class="split-row"><label>Envelope<select data-split-category="${i}" required>${splitOptions(row.category_id,i)}</select></label><label>Amount${i===remainderIndex?`<span class="remainder-value" data-remainder-value="${i}">${money(row.amount_cents||0)}</span>`:`<input data-split-amount="${i}" inputmode="decimal" value="${esc(row.raw||'')}" placeholder="0.00" required>`}</label><div class="row-actions"><button class="text-action" data-remainder="${i}" type="button">${i===remainderIndex?'Fixed amount':'Use remainder'}</button><button class="text-action" data-remove-split="${i}" type="button" ${transactionSplits.length<=2?'disabled':''}>Remove</button></div></div>`).join('');document.querySelector('#add-split').disabled=transactionSplits.length>=6;updateSplitSummary();}
function beginSplit(){const category=Number(document.querySelector('#transaction-category').value);if(!category){document.querySelector('#transaction-form .form-error').textContent='Choose an envelope before splitting.';return;}transactionSplits=[{category_id:category,raw:''},{category_id:model.categories.find(c=>c.category_type==='expense'&&c.id!==category)?.id,raw:''}];remainderIndex=0;renderSplitEditor();}
function showTransactionDetail(item){transactionDetail=item;document.querySelector('#transaction-detail-title').textContent=item.description||'No description';document.querySelector('#transaction-detail-total').textContent=money(item.amount_cents);document.querySelector('#transaction-detail-meta').textContent=`${dateLabel(item.transaction_date)} · ${item.raw_account||'No account'}`;const rows=item.allocations?.length?item.allocations:[{category:item.raw_category||'Uncategorized',amount_cents:item.amount_cents}];document.querySelector('#transaction-detail-splits').innerHTML=rows.map((a,i)=>`<div class="${i===rows.length-1?'total':''}"><span>${esc(a.category)}</span><span>${money(a.amount_cents)}</span></div>`).join('');document.querySelector('#transaction-detail-dialog').showModal();}
function openMove(fromId) {
  document.querySelector('#envelope-dialog').close();
  const form=document.querySelector('#move-form'); form.reset(); form.querySelector('.form-error').textContent='';
  populateForms(); document.querySelector('#move-from').value=fromId;
  const alternative=model.envelopes.find(e=>e.id!==Number(fromId)); if(alternative) document.querySelector('#move-to').value=alternative.id;
  document.querySelector('#move-period').textContent=`${periodRange()}. Total money available stays the same.`;
  document.querySelector('#move-submit').textContent='Move money';
  document.querySelector('#move-dialog').showModal();
}
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');setTimeout(()=>el.classList.remove('visible'),2400);}
function busy(form,value){form.querySelectorAll('button').forEach(button=>button.disabled=value);}

document.querySelector('#period').addEventListener('change',e=>load(e.target.value).catch(showError));
document.querySelector('#envelope-filter').addEventListener('input',renderEnvelopes);
document.querySelector('#add-transaction').addEventListener('click',()=>openTransaction());
document.querySelector('#cloud-backup').classList.toggle('hidden',!isCloud);
document.querySelector('#cloud-backup').addEventListener('click',()=>downloadBackup().catch(error=>toast(error.message)));
document.querySelector('#move-money').addEventListener('click',()=>openMove(model.envelopes[0].id));
document.querySelector('#detail-move').addEventListener('click',()=>openMove(detailId));
document.querySelector('#move-amount').addEventListener('input',event=>{document.querySelector('#move-submit').textContent=Number(event.target.value)>0?`Move ${money(Math.round(Number(event.target.value)*100))}`:'Move money';});
document.querySelector('#transaction-amount').addEventListener('input',updateSplitSummary);
document.querySelector('#split-transaction').addEventListener('click',beginSplit);
document.querySelector('#add-split').addEventListener('click',()=>{if(transactionSplits.length<6){transactionSplits.push({category_id:model.categories.find(c=>c.category_type==='expense'&&!transactionSplits.some(r=>r.category_id===c.id))?.id,raw:''});renderSplitEditor();}});
document.querySelector('#use-one-envelope').addEventListener('click',()=>{if(transactionSplits.some((r,i)=>i>0&&parsePositiveCents(r.raw))&&!confirm('Use one envelope and discard the other split amounts?'))return;document.querySelector('#transaction-category').value=transactionSplits[0].category_id;transactionSplits=null;remainderIndex=null;renderSplitEditor();});
document.querySelector('#transaction-detail-edit').addEventListener('click',()=>openTransaction(transactionDetail));
window.addEventListener('hashchange',()=>{if(!model)return;if(location.hash==='#budget'&&model.payday&&!model.payday.eligible){const today=budgetToday();const period=[...model.periods].reverse().find(p=>p.label_date<=today);if(period){load(period.sequence).catch(showError);return;}}render();});
document.addEventListener('click',event=>{
  const edit=event.target.closest('[data-edit]'); if(edit) openTransaction([...model.transactions,...model.period_transactions].find(t=>String(t.id)===edit.dataset.edit));
  const transaction=event.target.closest('[data-transaction]');if(transaction)showTransactionDetail([...model.transactions,...model.period_transactions].find(t=>String(t.id)===transaction.dataset.transaction));
  const detail=event.target.closest('[data-detail]'); if(detail){detailId=Number(detail.dataset.detail);renderDetail();document.querySelector('#envelope-dialog').showModal();}
  const move=event.target.closest('[data-move]'); if(move) openMove(move.dataset.move);
  const remainder=event.target.closest('[data-remainder]');if(remainder){const i=Number(remainder.dataset.remainder);if(remainderIndex===i){const state=splitValues();transactionSplits[i].raw=((state?.total-state?.fixed)/100).toFixed(2);remainderIndex=null;}else remainderIndex=i;renderSplitEditor();}
  const remove=event.target.closest('[data-remove-split]');if(remove&&transactionSplits.length>2){const i=Number(remove.dataset.removeSplit);transactionSplits.splice(i,1);if(remainderIndex===i)remainderIndex=null;else if(remainderIndex>i)remainderIndex--;renderSplitEditor();}
  if(event.target.closest('[data-close]')) event.target.closest('dialog').close();
});
document.addEventListener('input',event=>{if(event.target.matches('[data-split-amount]')){transactionSplits[Number(event.target.dataset.splitAmount)].raw=event.target.value;updateSplitSummary();}});
document.addEventListener('change',event=>{if(event.target.matches('[data-split-category]')){transactionSplits[Number(event.target.dataset.splitCategory)].category_id=Number(event.target.value);renderSplitEditor();}});
document.querySelector('#transaction-form').addEventListener('submit',async event=>{
  event.preventDefault(); const form=event.currentTarget; busy(form,true); form.querySelector('.form-error').textContent='';
  const id=document.querySelector('#transaction-id').value;
  const payload={transaction_date:document.querySelector('#transaction-date').value,amount:document.querySelector('#transaction-amount').value,description:document.querySelector('#transaction-description').value,category_id:Number(document.querySelector('#transaction-category').value),account_id:Number(document.querySelector('#transaction-account').value)};
  if(transactionSplits){const state=splitValues();if(!state.valid||state.remaining!==0){form.querySelector('.form-error').textContent=state.remaining<0?`${money(-state.remaining)} over`:`Split amounts must equal ${money(state.total)}`;busy(form,false);updateSplitSummary();return;}payload.allocations=transactionSplits.map(r=>({category_id:r.category_id,amount_cents:r.amount_cents}));payload.category_id=payload.allocations[0].category_id;}
  else if(!id)payload.id=transactionCreateId;
  if(isCloud)payload.expected_revision=transactionRevision;
  try{await request(id?`/api/transactions/${id}`:'/api/transactions',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});form.closest('dialog').close();await load(model.selected_period.sequence);toast(id?'Transaction updated':'Transaction added');}catch(error){form.querySelector('.form-error').textContent=error.message;}finally{busy(form,false);}
});
document.querySelector('#delete-transaction').addEventListener('click',async()=>{
  if(!confirm('Delete this transaction? This cannot be undone.')) return;
  const form=document.querySelector('#transaction-form'); busy(form,true);
  try{await request(`/api/transactions/${document.querySelector('#transaction-id').value}`,{method:'DELETE',body:JSON.stringify({expected_revision:transactionRevision})});form.closest('dialog').close();await load(model.selected_period.sequence);toast('Transaction deleted');}catch(error){form.querySelector('.form-error').textContent=error.message;}finally{busy(form,false);}
});
document.querySelector('#move-form').addEventListener('submit',async event=>{
  event.preventDefault(); const form=event.currentTarget; busy(form,true); form.querySelector('.form-error').textContent='';
  const payload={period_id:model.selected_period.id,from_category_id:Number(document.querySelector('#move-from').value),to_category_id:Number(document.querySelector('#move-to').value),amount:document.querySelector('#move-amount').value,description:document.querySelector('#move-description').value};
  try{await request('/api/moves',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});form.closest('dialog').close();await load(model.selected_period.sequence);toast(`${money(Math.round(Number(payload.amount)*100))} moved from ${model.envelopes.find(e=>e.id===payload.from_category_id).category}`);}catch(error){form.querySelector('.form-error').textContent=error.message;}finally{busy(form,false);}
});
function showError(error){document.querySelector('main').innerHTML=`<section class="panel"><h2>Budget data is unavailable</h2><p>${esc(error.message)}</p></section>`;}
if(isCloud)startCloud(()=>load(model?.selected_period.sequence),error=>toast(error.message)).catch(showError);else load().catch(showError);
