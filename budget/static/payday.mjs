import {allocationAmount,allocationTotal} from './payday-model.mjs';
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dollars=c=>(c/100).toFixed(2);
const sumExpected=p=>p.expected.reduce((s,e)=>s+e.amount_cents,0);
let current,api,reload,notify,slots=new Map(),review=null;
const section=()=>document.querySelector('#budget-section');
function slotFor(m){
  const p=m.payday,key=m.selected_period.id;
  let slot=slots.get(key);
  if(!slot||(!slot.dirty&&!slot.saving&&!slot.invalid)){
    const period=p.config.periods[String(key)];
    slot={period_id:key,revision:p.session?.revision||0,allocations:[...(p.session?.allocations||p.defaults)],
      session_date:p.session?.session_date||(p.today>=period?.start&&p.today<period?.end?p.today:period?.start),dirty:false,version:0,saving:false};
    slots.set(key,slot);
  }
  slot.context=p;
  return slot;
}
function totals(slot,p){const allocated=allocationTotal(slot.allocations),available=p.remaining_cents;return {allocated,available,remaining:available-allocated,expected:sumExpected(p)};}
function summary(t){return `<div class="budget-summary breakdown">${[['Available to budget now',t.available],['Proposed allocation',t.allocated],['Remaining after allocation',t.remaining],['Expected later · not available',t.expected]].map(([label,value])=>`<div><span>${label}</span><span class="${value<0?'negative':''}">${money(value)}</span></div>`).join('')}</div>`;}
function updateTotals(){if(!current?.payday?.eligible)return;const slot=slots.get(current.selected_period.id);const target=document.querySelector('#budget-totals');if(target)target.innerHTML=summary(totals(slot,current.payday));}
function snapshot(slot,status='draft'){
  const p=current?.selected_period.id===slot.period_id?current.payday:slot.context,t=totals(slot,p);
  return {period_id:slot.period_id,session_date:slot.session_date,allocations:[...slot.allocations],expected_revision:slot.revision,status,
    available_cents:t.available,expected_cents:t.expected,expected_summary:p.expected.map(e=>`${e.source}: ${money(e.amount_cents)}, expected ${e.expected_date}${e.note?` (${e.note})`:''}`).join('\n')};
}
async function save(slot){
  if(slot.invalid)throw new Error('Correct the invalid draft amount before saving.');
  if(slot.saving)return slot.promise;
  const payload=snapshot(slot),version=slot.version;
  slot.saving=true;
  slot.promise=(async()=>{
    try{await api('/api/payday/session',{method:'POST',body:JSON.stringify(payload)});slot.revision++;if(slot.version===version)slot.dirty=false;slot.error='';}
    catch(e){slot.error=e.message;notify(e.message);throw e;}
    finally{slot.saving=false;await reload();}
    if(slot.dirty)return save(slot);
  })();
  return slot.promise;
}
function changed(slot){slot.dirty=true;slot.version++;slot.error='';slot.invalid=[...section().querySelectorAll('input')].some(i=>!i.checkValidity());updateTotals();clearTimeout(slot.timer);if(!slot.invalid)slot.timer=setTimeout(()=>save(slot).catch(()=>{}),700);const status=document.querySelector('#draft-status');if(status)status.textContent=slot.invalid?'Correct the invalid draft amount.':'Saving draft…';}
function allocationRows(m,values,editable=true){return m.payday.config.envelope_ids.map((id,i)=>{
    const e=m.envelopes.find(e=>e.id===id);
    return `<div class="budget-row"><div><label for="allocation-${i}">${esc(e.category)}</label><small class="${e.ending_cents<0?'negative':''}">${money(e.ending_cents)} ${editable?'available before this allocation':'available now'}</small></div>${editable?`<input id="allocation-${i}" data-allocation="${i}" aria-label="Add to ${esc(e.category)}" inputmode="decimal" type="text" value="${dollars(values[i])}">`:`<span>${money(values[i])}</span>`}</div>`;
}).join('');}
export function renderPayday(m,request,refresh,toast){
  current=m;api=request;reload=refresh;notify=toast;
  const el=section(),p=m.payday;
  el.classList.toggle('hidden',location.hash!=='#budget');
  if(!p){el.innerHTML='<p>Payday Budget configuration is not available on this copy yet.</p>';return;}
  if(!p.eligible){el.innerHTML='<h2>Preserved spreadsheet budget</h2><p>This period already belongs to the imported history. New default allocations begin September 11, 2026.</p>';return;}
  const slot=slotFor(m);
  if(el.contains(document.activeElement)&&document.activeElement.matches('input')){updateTotals();const status=el.querySelector('#draft-status');if(status)status.textContent=slot.error||(slot.dirty?'Saving draft…':'Draft saved · Shared with your household');return;}
  const completed=p.session?.status==='completed';
  el.innerHTML=`<div class="panel-heading"><div><p class="kicker">One session per two-week period</p><h2>${completed?'Completed Payday Budget':p.session?'Payday Budget draft':'Payday Budget'}</h2></div><button id="edit-defaults" class="secondary">Envelope defaults</button></div>
    <p class="form-help">The unallocated balance starts at $0 on September 11. Posted income adds to it; finished allocations subtract from it. Expected income stays separate. Weekly reconciliation does not apply defaults.</p>
    ${completed?`<p>Session date: ${esc(p.session.session_date)} · Allocation period: ${esc(m.selected_period.label_date)}</p>${summary({available:p.session.available_cents,allocated:allocationTotal(p.session.allocations),remaining:p.session.available_cents-allocationTotal(p.session.allocations),expected:p.session.expected_cents})}<p class="form-help">Saved completion snapshot. Current unallocated balance: ${money(p.remaining_cents)}.</p>${p.session.expected_summary?`<pre class="expected-snapshot">${esc(p.session.expected_summary)}</pre>`:''}${allocationRows(m,p.session.allocations,false)}`:
      p.session?`<label class="session-date">Session date<input id="session-date" type="date" min="${p.config.periods[String(slot.period_id)].start}" max="${new Date(new Date(p.config.periods[String(slot.period_id)].end).getTime()-86400000).toISOString().slice(0,10)}" value="${slot.session_date}"></label><div id="budget-totals">${summary(totals(slot,p))}</div><p id="draft-status" role="status">${esc(slot.error|| (slot.dirty?'Unsaved changes':slot.saving?'Saving draft…':'Draft saved · Shared with your household'))}</p><div class="actions"><button id="reset-defaults" class="secondary">Reset to defaults</button><button id="save-draft" class="secondary">Save draft</button><button id="review-budget">Review budget</button><button id="reload-budget" class="text-action">Reload shared draft</button></div><p class="form-help">Add amounts below. These do not change envelope balances until you finish.</p>${allocationRows(m,slot.allocations)}`:
      `<p>Current unallocated balance: <span class="${p.remaining_cents<0?'negative':''}">${money(p.remaining_cents)}</span></p><p>Active defaults total ${money(allocationTotal(p.defaults))}.</p><button id="start-budget">Start Payday Budget</button>`}
    <div class="budget-secondary"><h3>Expected later</h3><p class="form-help">Projections only. Mark received after entering the real income transaction; this never creates a transaction.</p>${p.expected.map(e=>`<div class="activity-row"><div>${esc(e.source)}<small>${esc(e.expected_date)} · ${esc(e.note)}</small></div><span>${money(e.amount_cents)}</span><button class="text-action" data-expected-received="${esc(e.id)}">Received</button><button class="text-action" data-expected-dismissed="${esc(e.id)}">Remove</button></div>`).join('')||'<p class="muted">No pending expected income.</p>'}<button id="add-expected" class="secondary">Add expected income</button><h3>Extra-income allocations</h3><p class="form-help">Enter the real income transaction first. Allocate any day without applying defaults again. This subtracts from the same unallocated balance, not from another envelope.</p>${p.extras.map(e=>`<p>${esc(e.allocation_date)} · ${esc(m.envelopes.find(v=>v.id===e.category_id)?.category)} · ${money(e.amount_cents)} · ${esc(e.description)}</p>`).join('')}<button id="allocate-extra" class="secondary">Allocate extra income</button></div>`;
  el.querySelector('#start-budget')?.addEventListener('click',async()=>{slot.dirty=true;await save(slot).catch(()=>{});});
  el.querySelector('#reset-defaults')?.addEventListener('click',()=>{slot.allocations=[...current.payday.defaults];el.querySelectorAll('[data-allocation]').forEach(input=>{input.value=dollars(slot.allocations[Number(input.dataset.allocation)]);input.setCustomValidity('');});changed(slot);});
  el.querySelector('#save-draft')?.addEventListener('click',()=>{if([...el.querySelectorAll('input')].every(i=>i.reportValidity()))save(slot).catch(()=>{});});
  el.querySelector('#reload-budget')?.addEventListener('click',()=>{if((slot.dirty||slot.invalid)&&!confirm('Discard unsaved changes and reload the shared draft?'))return;clearTimeout(slot.timer);slots.delete(slot.period_id);reload();});
  el.querySelector('#session-date')?.addEventListener('change',event=>{slot.session_date=event.target.value;changed(slot);});
  el.querySelectorAll('[data-allocation]').forEach(input=>input.addEventListener('input',()=>{
    try{slot.allocations[Number(input.dataset.allocation)]=allocationAmount(input.value);input.setCustomValidity('');changed(slot);}catch(e){slot.invalid=true;input.setCustomValidity(e.message);clearTimeout(slot.timer);document.querySelector('#draft-status').textContent=e.message;}
  }));
  el.querySelector('#review-budget')?.addEventListener('click',async()=>{
    if([...el.querySelectorAll('input')].some(i=>!i.reportValidity()))return;
    clearTimeout(slot.timer);try{await save(slot);review=snapshot(slot,'completed');const t=totals(slot,current.payday);
      showDialog('Review Payday Budget',`${summary(t)}<p>${slot.allocations.filter(v=>v>0).length} envelopes funded · ${slot.allocations.filter((v,i)=>v===current.payday.defaults[i]).length} at their default</p><p>${current.payday.config.envelope_ids.filter((id,i)=>current.envelopes.find(e=>e.id===id).ending_cents+slot.allocations[i]<0).length} envelopes remain below zero.</p><p>Negative envelopes and a negative remainder are allowed.</p>`,'Finish Budget Session',async()=>{
        // A changed pool/expectation requires a fresh review; a shared draft conflict is checked on commit.
        await reload();const fresh=snapshot(slot,'completed');if(fresh.available_cents!==review.available_cents||fresh.expected_summary!==review.expected_summary)throw new Error('Income or expected income changed. Return to editing and review again.');
        await api('/api/payday/session',{method:'POST',body:JSON.stringify(review)});slots.delete(slot.period_id);await reload();notify('Payday Budget completed');
      });
    }catch(e){notify(e.message);}
  });
  el.querySelector('#edit-defaults').addEventListener('click',()=>{
    const revision=p.defaults_revision;
    showDialog('Active envelope defaults',`<p>Changes affect future drafts and Reset to defaults, not completed sessions.</p>${p.config.envelope_ids.map((id,i)=>`<label class="default-row">${esc(m.envelopes.find(e=>e.id===id).category)}<input data-default="${i}" inputmode="decimal" value="${dollars(p.defaults[i])}"></label>`).join('')}`,'Save defaults',async()=>{
      const allocations=[...document.querySelectorAll('[data-default]')].map(i=>allocationAmount(i.value));
      await api('/api/payday/defaults',{method:'POST',body:JSON.stringify({allocations,expected_revision:revision})});await reload();notify('Defaults saved');
    });
  });
  el.querySelector('#add-expected').addEventListener('click',()=>showDialog('Expected income','<label>Source<input id="expected-source" required maxlength="100"></label><label>Amount<input id="expected-amount" inputmode="decimal" required></label><label>Expected date<input id="expected-date" type="date" min="2026-01-01" max="2026-12-31" required></label><label>Note<input id="expected-note" maxlength="250"></label>','Save expected income',async()=>{
    const amount=allocationAmount(document.querySelector('#expected-amount').value);if(!amount)throw new Error('Expected amount must be positive.');
    await api('/api/payday/expected',{method:'POST',body:JSON.stringify({source:document.querySelector('#expected-source').value.trim(),amount_cents:amount,expected_date:document.querySelector('#expected-date').value,note:document.querySelector('#expected-note').value,status:'pending',expected_revision:0})});await reload();
  }));
  for(const status of ['received','dismissed'])el.querySelectorAll(`[data-expected-${status}]`).forEach(button=>button.addEventListener('click',async()=>{
    const item=p.expected.find(e=>e.id===button.getAttribute(`data-expected-${status}`));try{await api('/api/payday/expected',{method:'POST',body:JSON.stringify({...item,status,expected_revision:item.revision})});await reload();}catch(e){notify(e.message);}
  }));
  el.querySelector('#allocate-extra').addEventListener('click',()=>{
    const periodId=m.selected_period.id;
    showDialog('Allocate extra income',`<p>Unallocated balance now: ${money(p.remaining_cents)}. Defaults will not be applied.</p><label>Envelope<select id="extra-envelope">${m.envelopes.map(e=>`<option value="${e.id}">${esc(e.category)}</option>`).join('')}</select></label><label>Amount<input id="extra-amount" inputmode="decimal" required></label><label>Date<input id="extra-date" type="date" value="${slot.session_date}" min="${p.config.periods[String(periodId)].start}" max="${new Date(new Date(p.config.periods[String(periodId)].end).getTime()-86400000).toISOString().slice(0,10)}" required></label><label>Note<input id="extra-note" maxlength="250"></label>`,'Allocate income',async()=>{
      allocationAmount(document.querySelector('#extra-amount').value);
      await api('/api/payday/extras',{method:'POST',body:JSON.stringify({period_id:periodId,category_id:Number(document.querySelector('#extra-envelope').value),amount:document.querySelector('#extra-amount').value,allocation_date:document.querySelector('#extra-date').value,description:document.querySelector('#extra-note').value})});await reload();notify('Extra income allocated');
    });
  });
}
function showDialog(title,html,label,onSubmit){
  const dialog=document.querySelector('#budget-dialog');
  dialog.innerHTML=`<form><div class="dialog-heading"><h2>${esc(title)}</h2><button type="button" class="icon-button" data-close aria-label="Close">×</button></div>${html}<p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" data-close>Return</button><button type="submit">${label}</button></div></form>`;
  dialog.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const buttons=dialog.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{await onSubmit();dialog.close();}catch(e){dialog.querySelector('.form-error').textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}});dialog.showModal();
}
window.addEventListener('budget-account-reset',()=>{for(const slot of slots.values())clearTimeout(slot.timer);slots=new Map();review=null;current=null;});
export async function flushPayday(){for(const slot of slots.values()){clearTimeout(slot.timer);if(slot.invalid)throw new Error('Correct the invalid draft amount or reload the shared draft before signing out.');if(slot.dirty||slot.saving)await save(slot);}}
window.addEventListener('beforeunload',event=>{if([...slots.values()].some(s=>s.dirty||s.saving||s.invalid)){event.preventDefault();event.returnValue='';}});
