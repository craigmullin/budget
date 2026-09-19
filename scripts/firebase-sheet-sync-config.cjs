const assert=require('node:assert/strict');
const {client}=require('./firebase-admin.cjs');
const {decode}=require('./firebase-refresh-audit.cjs');

const prefix='projects/budget-24acc/databases/(default)/documents';
const api=`https://firestore.googleapis.com/v1/${prefix}`;
const root='households/main';
const mode=process.argv[2];
assert(['activate','verify'].includes(mode),'Usage: activate|verify');

function value(v){
  if(v===null)return {nullValue:null};
  if(Array.isArray(v))return {arrayValue:{values:v.map(value)}};
  if(typeof v==='object')return {mapValue:{fields:fields(v)}};
  if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(typeof v==='boolean')return {booleanValue:v};
  return {stringValue:String(v)};
}
function fields(v){return Object.fromEntries(Object.entries(v).map(([k,item])=>[k,value(item)]));}
function data(doc){return Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decode(v)]));}
async function get(request,path){try{return await request(`${api}/${path}`);}catch(e){if(String(e.message).includes('(404)'))return null;throw e;}}
async function list(request,path){const docs=[];let token;do{const page=await request(`${api}/${path}?pageSize=100${token?'&pageToken='+encodeURIComponent(token):''}`);docs.push(...page.documents||[]);token=page.nextPageToken;}while(token);return docs;}

async function main(){
  const request=await client();
  const configPath=`${root}/seed/sheet_sync`;
  const expected={
    enabled:true,
    spreadsheet_id:'1Dmj39m5cMjW1kFm_oFzetUQBWT5ls73jORSzKr-JL5g',
    sheet_name:'Expenses',
    first_app_row:1606,
    metadata_start_column:12,
    metadata_end_column:17,
    worker_script_id:'13rhoA7EblaVmsnebu1KDs5i4TaAt4rxLS_FHzwZzfYZiWyjDMk5Mbp4D'
  };
  if(mode==='activate'){
    assert.equal(await get(request,configPath),null,'Sheet sync is already activated.');
    const changes=await list(request,`${root}/changes`);
    const now=new Date().toISOString();
    const writes=[{update:{name:`${prefix}/${configPath}`,fields:fields({...expected,activated_at:now})},currentDocument:{exists:false}}];
    for(const doc of changes){
      const change=data(doc),id=String(change.id||doc.name.split('/').pop());
      if(!id.startsWith('app_')||change.deleted)continue;
      const revision=Number(change.revision),jobId=`${id}_${revision}`;
      assert(Number.isSafeInteger(revision)&&revision>0);
      writes.push({update:{name:`${prefix}/${root}/sheet_sync/${jobId}`,fields:fields({transaction_id:id,operation:'create',transaction_revision:revision,requested_at:now,requested_by_uid:String(change.updated_by||'activation'),status:'pending',attempt_count:0,payload_version:1})},currentDocument:{exists:false}});
    }
    await request(`${api}:commit`,'POST',{writes});
  }
  const config=await get(request,configPath);assert(config,'Sheet sync config is missing.');
  const actual=data(config);for(const [key,val] of Object.entries(expected))assert.deepEqual(actual[key],val,`Unexpected ${key}`);
  const jobs=(await list(request,`${root}/sheet_sync`)).map(data);
  assert(jobs.every(job=>job.payload_version===1));
  if(mode==='verify'){
    assert(jobs.length>0,'Expected at least one sync job after activation.');
    assert(jobs.every(job=>job.status==='synced'&&job.result==='applied'),'One or more live Sheet jobs are not fully synced.');
  }
  console.log(`PASS ${mode}: live Sheet sync enabled; ${jobs.length} job(s) ${mode==='verify'?'synced':'present'}.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
