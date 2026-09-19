// Replace pre-launch production state from an audited workbook archive.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {client}=require('./firebase-admin.cjs');
const {decode}=require('./firebase-refresh-audit.cjs');
const prefix='projects/budget-24acc/databases/(default)/documents';
const api=`https://firestore.googleapis.com/v1/${prefix}`,root='households/main';
const mode=process.argv[2],source=process.argv[3],directory=process.argv[4],configFile=process.argv[5];
assert(['prepare','activate','verify'].includes(mode)&&source&&directory&&configFile,'Usage: prepare|activate|verify workbook export-directory config-json');
function value(v){if(v===null)return{nullValue:null};if(Array.isArray(v))return{arrayValue:{values:v.map(value)}};if(typeof v==='object')return{mapValue:{fields:fields(v)}};if(typeof v==='number'){assert(Number.isSafeInteger(v));return{integerValue:String(v)}};if(typeof v==='boolean')return{booleanValue:v};return{stringValue:String(v)}}
function fields(v){return Object.fromEntries(Object.entries(v).map(([k,v])=>[k,value(v)]))}
function data(d){return Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,decode(v)]))}
async function list(request,path){const docs=[];let token;do{const p=await request(`${api}/${path}?pageSize=100${token?'&pageToken='+encodeURIComponent(token):''}`);docs.push(...p.documents||[]);token=p.nextPageToken;}while(token);return docs}
async function main(){
 const request=await client(),seed=JSON.parse(fs.readFileSync(`${directory}/seed.json`)),config=JSON.parse(fs.readFileSync(configFile));
 const version=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),archive=`${root}/source_versions/${version}/seed`;
 assert.equal(seed.transactions.length,1604);assert.equal(Math.max(...seed.transactions.map(t=>t.transaction_date.replaceAll('-',''))),20260912);
 assert.equal(config.start_date,'2026-09-25');assert.equal(config.defaults.reduce((a,v)=>a+v,0),356399);assert(!config.periods['19']);
 const current=await list(request,`${root}/seed`),catalogDoc=current.find(d=>d.name.endsWith('/catalog')),paydayDoc=current.find(d=>d.name.endsWith('/payday')),activeDoc=current.find(d=>d.name.endsWith('/active_source'));
 assert(catalogDoc&&paydayDoc&&activeDoc);
 if(mode==='prepare'){
   assert.equal((await list(request,archive)).length,0,'This workbook archive already exists.');
   const writes=[];for(const [table,rows] of Object.entries(seed))for(let i=0;i<Math.max(rows.length,1);i+=100)writes.push({update:{name:`${prefix}/${archive}/${table}_${String(i/100).padStart(3,'0')}`,fields:fields({table,rows:rows.slice(i,i+100)})},currentDocument:{exists:false}});
   assert(writes.length<=450);await request(`${api}:commit`,'POST',{writes});
 }
 const archived=await list(request,archive),actual={};for(const d of archived){const r=data(d);(actual[r.table]??=[]).push(...r.rows)}assert.deepEqual(actual,seed,'Private archive differs from workbook export');
 if(mode==='activate'){
   const mutable=[];for(const name of ['changes','moves','settings','sessions','extras','expected'])mutable.push(...await list(request,`${root}/${name}`));
   const children=[];for(const session of mutable.filter(d=>d.name.includes('/sessions/')))children.push(...await list(request,`${session.name.slice(prefix.length+1)}/checks`));
   const catalog={...data(catalogDoc),source_hash:crypto.createHash('sha256').update(fs.readFileSync(`${directory}/seed.json`)).digest('hex'),transaction_ids:seed.transactions.map(t=>String(t.id))};
   const writes=[...children,...mutable].map(d=>({delete:d.name,currentDocument:{updateTime:d.updateTime}}));
   writes.push({update:{name:catalogDoc.name,fields:fields(catalog)},currentDocument:{updateTime:catalogDoc.updateTime}});
   writes.push({update:{name:paydayDoc.name,fields:fields(config)},currentDocument:{updateTime:paydayDoc.updateTime}});
   writes.push({update:{name:activeDoc.name,fields:fields({version,transaction_count:seed.transactions.length,latest_transaction_date:'2026-09-12',activated_at:new Date().toISOString()})},currentDocument:{updateTime:activeDoc.updateTime}});
   assert(writes.length<=450);await request(`${api}:commit`,'POST',{writes});
 }
 if(mode!=='prepare'){
   const live=await list(request,`${root}/seed`);assert.equal(data(live.find(d=>d.name.endsWith('/active_source'))).version,version);assert.deepEqual(data(live.find(d=>d.name.endsWith('/payday'))),config);
   for(const name of ['changes','moves','settings','sessions','extras','expected'])assert.equal((await list(request,`${root}/${name}`)).length,0,`${name} was not reset`);
 }
 console.log(`PASS ${mode}: ${seed.transactions.length} transactions through 2026-09-12; defaults ${config.defaults.reduce((a,v)=>a+v,0)} cents from ${config.start_date}.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
