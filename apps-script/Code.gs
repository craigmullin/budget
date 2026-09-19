const BUDGET_HEADERS=['Date','Merchant','Category','Amount','Account','Check #','Reconciled','','Notes'];
const BUDGET_META=['Budget Transaction ID','Budget Split ID','Budget Revision','Budget Status','Budget Updated At','Budget Source'];

function budgetProps_(){
  const p=PropertiesService.getScriptProperties();
  return {project:p.getProperty('FIRESTORE_PROJECT'),sheet:p.getProperty('SHEET_NAME')||'Expenses',header:Number(p.getProperty('HEADER_ROW')),first:Number(p.getProperty('FIRST_APP_ROW')),deleted:p.getProperty('DELETE_SHEET')||'Budget Deleted'};
}
function verifyBudgetSheet(){
  const c=budgetProps_();if(!c.project||!c.header||!c.first)throw new Error('Required Script Properties are incomplete.');
  const s=SpreadsheetApp.getActive().getSheetByName(c.sheet);if(!s)throw new Error('Configured Expenses sheet was not found.');
  const actual=s.getRange(c.header,1,1,9).getDisplayValues()[0];
  if(JSON.stringify(actual)!==JSON.stringify(BUDGET_HEADERS))throw new Error('A:I header contract does not match: '+JSON.stringify(actual));
  if(c.first<=c.header)throw new Error('FIRST_APP_ROW must be after the header.');
  return {spreadsheetId:SpreadsheetApp.getActive().getId(),sheet:c.sheet,headerRow:c.header,firstAppRow:c.first,headers:actual};
}
function installBudgetSync(){
  verifyBudgetSheet();ensureBudgetMetadata_();
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='runBudgetSheetSync').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runBudgetSheetSync').timeBased().everyMinutes(5).create();
}
function ensureBudgetMetadata_(){
  const c=budgetProps_(),s=SpreadsheetApp.getActive().getSheetByName(c.sheet);
  if(s.getMaxColumns()<17)s.insertColumnsAfter(s.getMaxColumns(),17-s.getMaxColumns());
  const range=s.getRange(c.header,12,1,6),values=range.getDisplayValues()[0];
  if(values.some(Boolean)&&JSON.stringify(values)!==JSON.stringify(BUDGET_META))throw new Error('Metadata columns L:Q are already in use.');
  range.setValues([BUDGET_META]);s.showColumns(10,2);s.hideColumns(12,6);
  const protection=s.getRange(c.header,12,s.getMaxRows()-c.header+1,6).protect().setDescription('Budget sync metadata');
  protection.setWarningOnly(false);
}
function runBudgetSheetSync(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{
    verifyBudgetSheet();
    const jobs=fsList_('households/main/sheet_sync').filter(j=>j.status==='pending').sort((a,b)=>String(a.requested_at).localeCompare(String(b.requested_at))).slice(0,20);
    jobs.forEach(job=>processBudgetJob_(job));
  }finally{lock.releaseLock();}
}
function processBudgetJob_(job){
  try{
    fsPatch_('households/main/sheet_sync/'+job.__id,{status:'processing',attempt_count:Number(job.attempt_count||0)+1,processing_at:new Date(),worker:'apps-script'});
    const change=fsGet_('households/main/changes/'+job.transaction_id);
    if(Number(change.revision)>Number(job.transaction_revision)){fsPatch_('households/main/sheet_sync/'+job.__id,{status:'synced',synced_at:new Date(),result:'superseded'});return;}
    if(Number(change.revision)!==Number(job.transaction_revision))throw new Error('REVISION_MISMATCH: authoritative change revision is unavailable.');
    const names=loadBudgetNames_(),desired=budgetDesiredRows_(change,names.categories,names.accounts);
    reconcileBudgetTransaction_(String(job.transaction_id),desired);
    const findings=reconcileBudgetTransactionReport_(String(job.transaction_id),desired);
    if(findings.length)throw new Error('VERIFY_FAILED: '+JSON.stringify(findings));
    fsPatch_('households/main/sheet_sync/'+job.__id,{status:'synced',synced_at:new Date(),result:'applied'});
  }catch(e){
    const message=String(e.message),code=message.split(':')[0].slice(0,80),attempt=Number(job.attempt_count||0)+1;
    const permanent=['REVISION_MISMATCH','VERIFY_FAILED'].includes(code)||code.indexOf('FIRESTORE_4')===0;
    fsPatch_('households/main/sheet_sync/'+job.__id,{status:permanent||attempt>=3?'failed':'pending',failed_at:new Date(),error_code:code,error_message:message.slice(0,500)});
  }
}
function budgetDesiredRows_(change,categories,accounts){
  if(change.deleted)return [];
  const allocations=(change.allocations||[]).filter(a=>a.active!==false),parts=allocations.length?allocations:[{category_id:change.category_id,amount_cents:change.amount_cents}];
  return parts.map(a=>({transaction_id:String(change.id),split_id:allocations.length?change.id+':category:'+a.category_id:change.id+':single',revision:Number(change.revision),date:change.transaction_date,description:change.description||'',category:categories[String(a.category_id)]||'',amount_cents:Number(a.amount_cents),account:accounts[String(change.account_id)]||'',notes:change.notes||'',vacation_trip:change.vacation_trip||'',vacation_type:change.vacation_type||''}));
}
function existingBudgetRows_(transactionId){
  const c=budgetProps_(),s=SpreadsheetApp.getActive().getSheetByName(c.sheet),last=s.getLastRow();if(last<c.first)return [];
  const values=s.getRange(c.first,1,last-c.first+1,17).getValues(),rows=[];
  values.forEach((v,i)=>{if(String(v[11])===transactionId)rows.push({row:c.first+i,transaction_id:String(v[11]),split_id:String(v[12]),revision:Number(v[13]),date:sheetDate_(v[0]),description:String(v[1]||''),category:String(v[2]||''),amount_cents:Math.round(Number(v[3])*100),account:String(v[4]||''),notes:String(v[8]||''),vacation_trip:String(v[9]||''),vacation_type:String(v[10]||'')});});return rows;
}
function sheetDate_(value){if(value instanceof Date)return Utilities.formatDate(value,SpreadsheetApp.getActive().getSpreadsheetTimeZone(),'yyyy-MM-dd');return String(value||'');}
function reconcileBudgetTransaction_(transactionId,desired){
  const c=budgetProps_(),s=SpreadsheetApp.getActive().getSheetByName(c.sheet),existing=existingBudgetRows_(transactionId),wanted={};desired.forEach(r=>wanted[r.split_id]=r);
  const keep={},retire=[];existing.forEach(r=>{if(keep[r.split_id]||!wanted[r.split_id])retire.push(r);else keep[r.split_id]=r;});
  desired.forEach(r=>{if(keep[r.split_id])writeBudgetRow_(s,keep[r.split_id].row,r);else{const row=Math.max(c.first,s.getLastRow()+1);writeBudgetRow_(s,row,r);}});
  retire.sort((a,b)=>b.row-a.row).forEach(r=>archiveBudgetRow_(s,r.row));
}
function writeBudgetRow_(sheet,row,d){
  ensureVacationTrip_(d.vacation_trip);
  const parts=d.date.split('-').map(Number),date=new Date(parts[0],parts[1]-1,parts[2]);
  sheet.getRange(row,1,1,6).setValues([[date,d.description,d.category,d.amount_cents/100,d.account,'']]);
  sheet.getRange(row,9,1,3).setValues([[d.notes,d.vacation_trip,d.vacation_type]]);
  sheet.getRange(row,12,1,6).setValues([[d.transaction_id,d.split_id,d.revision,'Active',new Date(),'Budget']]);
  sheet.getRange(row,1).setNumberFormat('m/d/yyyy');sheet.getRange(row,4).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
}
function ensureVacationTrip_(trip){
  trip=String(trip||'').trim();if(!trip)return;
  const book=SpreadsheetApp.getActive(),sheet=book.getSheetByName('Vacation');if(!sheet)throw new Error('VACATION_SHEET_MISSING: Vacation sheet was not found.');
  const last=Math.max(2,sheet.getLastColumn()),headers=sheet.getRange(1,2,1,last-1).getDisplayValues()[0];
  if(headers.some(value=>String(value).trim().toLowerCase()===trip.toLowerCase()))return;
  let column=headers.findIndex(value=>!String(value).trim())+2;
  if(column<2){column=last+1;sheet.insertColumnAfter(last);}
  const source=Math.max(2,column-1);
  sheet.getRange(1,source,10,1).copyTo(sheet.getRange(1,column,10,1),SpreadsheetApp.CopyPasteType.PASTE_NORMAL,false);
  sheet.getRange(1,column).setValue(trip);
  sheet.getRange(13,16).setFormula('=SUM(B10:'+columnLetter_(column)+'10)');
}
function columnLetter_(column){let result='';while(column){column--;result=String.fromCharCode(65+column%26)+result;column=Math.floor(column/26);}return result;}
function archiveBudgetRow_(source,row){
  const c=budgetProps_(),book=SpreadsheetApp.getActive(),deleted=book.getSheetByName(c.deleted)||book.insertSheet(c.deleted);
  if(deleted.getLastRow()===0)deleted.getRange(1,1,1,17).setValues([[...BUDGET_HEADERS,'Vacation Trip','Vacation Type',...BUDGET_META]]);
  const values=source.getRange(row,1,1,17).getValues();values[0][14]='Deleted';values[0][15]=new Date();deleted.getRange(deleted.getLastRow()+1,1,1,17).setValues(values);source.getRange(row,1,1,17).clearContent();
}
function reconcileBudgetSheet(){
  verifyBudgetSheet();const findings=[];
  fsList_('households/main/changes').filter(c=>String(c.id||'').indexOf('app_')===0).forEach(change=>{const n=loadBudgetNames_(),d=budgetDesiredRows_(change,n.categories,n.accounts);findings.push(...reconcileBudgetTransactionReport_(String(change.id),d));});
  return findings;
}
function reconcileBudgetTransactionReport_(transactionId,desired){
  const existing=existingBudgetRows_(transactionId),wanted={},seen={},findings=[];desired.forEach(r=>wanted[r.split_id]=r);
  existing.forEach(r=>{if(seen[r.split_id])findings.push({code:'duplicate_row',transaction_id:transactionId,split_id:r.split_id,row:r.row});seen[r.split_id]=true;if(!wanted[r.split_id])findings.push({code:'orphaned_row',transaction_id:transactionId,split_id:r.split_id,row:r.row});else{const d=wanted[r.split_id];if(r.revision<d.revision)findings.push({code:'stale_row',transaction_id:transactionId,split_id:r.split_id,row:r.row});['date','description','category','amount_cents','account','notes','vacation_trip','vacation_type'].forEach(field=>{if(r[field]!==d[field])findings.push({code:'incorrect_'+field,transaction_id:transactionId,split_id:r.split_id,row:r.row});});}});
  desired.forEach(d=>{if(!seen[d.split_id])findings.push({code:'missing_row',transaction_id:transactionId,split_id:d.split_id});});
  const wantedTotal=desired.reduce((s,r)=>s+r.amount_cents,0),sheetTotal=existing.filter(r=>wanted[r.split_id]).reduce((s,r)=>s+r.amount_cents,0);if(wantedTotal!==sheetTotal)findings.push({code:'total_mismatch',transaction_id:transactionId,desired_cents:wantedTotal,sheet_cents:sheetTotal});return findings;
}
function loadBudgetNames_(){
  const seed=fsList_('households/main/seed'),active=seed.find(d=>d.__id==='active_source'),docs=active&&active.version?fsList_('households/main/source_versions/'+active.version+'/seed'):seed,categories={},accounts={};
  docs.forEach(d=>(d.rows||[]).forEach(r=>{if(d.table==='categories')categories[String(r.id)]=r.canonical_name;if(d.table==='accounts')accounts[String(r.id)]=r.canonical_name;}));return {categories:categories,accounts:accounts};
}
function fsBase_(){return 'https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(budgetProps_().project)+'/databases/(default)/documents/';}
function fsFetch_(url,options){options=options||{};options.headers=Object.assign({},options.headers||{},{Authorization:'Bearer '+ScriptApp.getOAuthToken()});options.muteHttpExceptions=true;const response=UrlFetchApp.fetch(url,options),code=response.getResponseCode(),text=response.getContentText();if(code<200||code>=300)throw new Error('FIRESTORE_'+code+': '+text.slice(0,300));return text?JSON.parse(text):{};}
function fsGet_(path){const d=fsFetch_(fsBase_()+path);return fsDecodeDoc_(d);}
function fsList_(path){let token='',result=[];do{const q=token?'?pageSize=100&pageToken='+encodeURIComponent(token):'?pageSize=100',body=fsFetch_(fsBase_()+path+q);result=result.concat((body.documents||[]).map(fsDecodeDoc_));token=body.nextPageToken||'';}while(token);return result;}
function fsPatch_(path,values){const masks=Object.keys(values).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&'),body={fields:{}};Object.keys(values).forEach(k=>body.fields[k]=fsEncode_(values[k]));return fsFetch_(fsBase_()+path+'?'+masks,{method:'patch',contentType:'application/json',payload:JSON.stringify(body)});}
function fsDecodeDoc_(doc){const out={__id:doc.name.split('/').pop(),__updateTime:doc.updateTime};Object.keys(doc.fields||{}).forEach(k=>out[k]=fsDecode_(doc.fields[k]));return out;}
function fsDecode_(v){if('nullValue'in v)return null;if('stringValue'in v)return v.stringValue;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return Number(v.doubleValue);if('booleanValue'in v)return v.booleanValue;if('timestampValue'in v)return v.timestampValue;if('arrayValue'in v)return (v.arrayValue.values||[]).map(fsDecode_);if('mapValue'in v){const o={};Object.keys(v.mapValue.fields||{}).forEach(k=>o[k]=fsDecode_(v.mapValue.fields[k]));return o;}return null;}
function fsEncode_(v){if(v instanceof Date)return {timestampValue:v.toISOString()};if(v===null)return {nullValue:null};if(Array.isArray(v))return {arrayValue:{values:v.map(fsEncode_)}};if(typeof v==='boolean')return {booleanValue:v};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};if(typeof v==='object'){const fields={};Object.keys(v).forEach(k=>fields[k]=fsEncode_(v[k]));return {mapValue:{fields:fields}};}return {stringValue:String(v)};}
