export const syncJobId=(transactionId,revision)=>`${transactionId}_${revision}`;

export function latestSyncJobs(jobs=[]){
  const latest=new Map();
  for(const job of jobs){
    const current=latest.get(String(job.transaction_id));
    if(!current||Number(job.transaction_revision)>Number(current.transaction_revision))latest.set(String(job.transaction_id),job);
  }
  return latest;
}

export function attachSyncState(model,jobs=[],enabled=false){
  const latest=latestSyncJobs(jobs);
  const decorate=t=>({...t,sheet_sync:enabled?(latest.get(String(t.id))||null):null});
  model.transactions=model.transactions.map(decorate);
  model.period_transactions=model.period_transactions.map(decorate);
  const values=[...latest.values()];
  model.sheet_sync={
    enabled,
    pending:values.filter(j=>['pending','processing'].includes(j.status)).length,
    failed:values.filter(j=>j.status==='failed').length,
    last_synced_at:values.filter(j=>j.status==='synced'&&j.synced_at).map(j=>j.synced_at).sort().at(-1)||null
  };
  return model;
}
