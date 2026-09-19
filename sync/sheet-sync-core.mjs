export const HEADERS=['Date','Merchant','Category','Amount','Account','Check #','Reconciled Date','Cleared Marker','Notes'];
export const META=['Budget Transaction ID','Budget Split ID','Budget Revision','Budget Status','Budget Updated At','Budget Source'];

export function desiredRows(change,categories,accounts){
  if(change.deleted)return [];
  const allocations=(change.allocations||[]).filter(a=>a.active!==false);
  const parts=allocations.length?allocations:[{category_id:change.category_id,amount_cents:change.amount_cents}];
  return parts.map(part=>({
    transaction_id:String(change.id),
    split_id:allocations.length?`${change.id}:category:${part.category_id}`:`${change.id}:single`,
    revision:change.revision,
    date:change.transaction_date,
    description:change.description||'',
    category:categories[String(part.category_id)]||'',
    amount_cents:part.amount_cents,
    account:accounts[String(change.account_id)]||'',notes:change.notes||'',vacation_trip:change.vacation_trip||'',vacation_type:change.vacation_type||''
  }));
}

export function planReconciliation(desired,existing){
  const wanted=new Map(desired.map(r=>[r.split_id,r]));
  const seen=new Map();
  const update=[],retire=[],duplicate=[];
  for(const row of existing){
    if(seen.has(row.split_id)){duplicate.push(row);retire.push(row);continue;}
    seen.set(row.split_id,row);
    if(!wanted.has(row.split_id))retire.push(row);
    else update.push({existing:row,desired:wanted.get(row.split_id)});
  }
  const create=desired.filter(r=>!seen.has(r.split_id));
  return {create,update,retire,duplicate};
}

export function reconciliationReport(desired,existing){
  const plan=planReconciliation(desired,existing),findings=[];
  for(const row of plan.create)findings.push({code:'missing_row',split_id:row.split_id});
  for(const row of plan.duplicate)findings.push({code:'duplicate_row',split_id:row.split_id,row:row.row});
  for(const pair of plan.update){
    const d=pair.desired,e=pair.existing;
    if(e.revision>d.revision)findings.push({code:'stale_job',split_id:d.split_id});
    else if(e.revision<d.revision)findings.push({code:'stale_row',split_id:d.split_id});
    if(e.amount_cents!==d.amount_cents)findings.push({code:'incorrect_amount',split_id:d.split_id});
  }
  for(const row of plan.retire.filter(r=>!plan.duplicate.includes(r)))findings.push({code:'orphaned_row',split_id:row.split_id});
  const desiredTotal=desired.reduce((s,r)=>s+r.amount_cents,0),sheetTotal=existing.filter(r=>!plan.retire.includes(r)).reduce((s,r)=>s+r.amount_cents,0);
  if(desiredTotal!==sheetTotal)findings.push({code:'total_mismatch',desired_cents:desiredTotal,sheet_cents:sheetTotal});
  return findings;
}
