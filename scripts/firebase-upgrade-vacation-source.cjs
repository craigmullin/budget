// Non-destructively add the authoritative workbook's Vacation J:K fields to a
// new immutable source version. Existing app changes, moves and budget records
// are deliberately preserved.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {client}=require('./firebase-admin.cjs');
const {decode}=require('./firebase-refresh-audit.cjs');
const prefix='projects/budget-24acc/databases/(default)/documents';
const api=`https://firestore.googleapis.com/v1/${prefix}`,root='households/main';
const mode=process.argv[2],directory=process.argv[3];
assert(['prepare','activate','verify'].includes(mode)&&directory,'Usage: prepare|activate|verify export-directory');
function value(v){if(v===null)return{nullValue:null};if(Array.isArray(v))return{arrayValue:{values:v.map(value)}};if(typeof v==='object')return{mapValue:{fields:fields(v)}};if(typeof v==='number'){assert(Number.isSafeInteger(v));return{integerValue:String(v)}};if(typeof v==='boolean')return{booleanValue:v};return{stringValue:String(v)}}
function fields(v){return Object.fromEntries(Object.entries(v).map(([k,v])=>[k,value(v)]))}
function data(d){return Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,decode(v)]))}
async function list(request,path){const docs=[];let token;do{const p=await request(`${api}/${path}?pageSize=100${token?'&pageToken='+encodeURIComponent(token):''}`);docs.push(...p.documents||[]);token=p.nextPageToken;}while(token);return docs}
async function main(){
  const request=await client(),raw=fs.readFileSync(`${directory}/seed.json`),seed=JSON.parse(raw);
  assert.equal(seed.transactions.length,1604);assert.equal(Math.max(...seed.transactions.map(t=>t.transaction_date.replaceAll('-',''))),20260912);
  assert.equal(seed.transactions.filter(t=>t.vacation_trip).length,111);
  const version=crypto.createHash('sha256').update(raw).digest('hex'),archive=`${root}/source_versions/${version}/seed`;
  if(mode==='prepare'){
    assert.equal((await list(request,archive)).length,0,'This Vacation source archive already exists.');
    const writes=[];for(const [table,rows] of Object.entries(seed))for(let i=0;i<Math.max(rows.length,1);i+=100)writes.push({update:{name:`${prefix}/${archive}/${table}_${String(i/100).padStart(3,'0')}`,fields:fields({table,rows:rows.slice(i,i+100)})},currentDocument:{exists:false}});
    assert(writes.length<=450);await request(`${api}:commit`,'POST',{writes});
  }
  const archived=await list(request,archive),actual={};for(const d of archived){const r=data(d);(actual[r.table]??=[]).push(...r.rows)}assert.deepEqual(actual,seed,'Private Vacation archive differs from export');
  const seedDocs=await list(request,`${root}/seed`),active=seedDocs.find(d=>d.name.endsWith('/active_source')),catalogDoc=seedDocs.find(d=>d.name.endsWith('/catalog'));
  assert(active&&catalogDoc);
  if(mode==='activate'){
    const catalog={...data(catalogDoc),source_hash:version,transaction_ids:seed.transactions.map(t=>String(t.id))};
    const writes=[
      {update:{name:catalogDoc.name,fields:fields(catalog)},currentDocument:{updateTime:catalogDoc.updateTime}},
      {update:{name:active.name,fields:fields({version,transaction_count:1604,latest_transaction_date:'2026-09-12',activated_at:new Date().toISOString()})},currentDocument:{updateTime:active.updateTime}},
    ];
    await request(`${api}:commit`,'POST',{writes});
  }
  if(mode!=='prepare')assert.equal(data((await list(request,`${root}/seed`)).find(d=>d.name.endsWith('/active_source'))).version,version);
  console.log(`PASS ${mode}: ${seed.transactions.filter(t=>t.vacation_trip).length} Vacation transactions; mutable household records preserved.`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
