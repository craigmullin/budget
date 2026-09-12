const fs=require('node:fs');
const crypto=require('node:crypto');
const {client}=require('./firebase-admin.cjs');
function value(v){if(v===null)return {nullValue:null};if(Array.isArray(v))return {arrayValue:{values:v.map(value)}};if(typeof v==='object')return {mapValue:{fields:fields(v)}};if(typeof v==='number')return {integerValue:String(v)};if(typeof v==='boolean')return {booleanValue:v};return {stringValue:String(v)};}
function fields(v){return Object.fromEntries(Object.entries(v).map(([k,v])=>[k,value(v)]));}
async function main(){
  const raw=fs.readFileSync('.local/firebase/seed.json'),seed=JSON.parse(raw),hash=crypto.createHash('sha256').update(raw).digest('hex');
  const request=await client(),base='https://firestore.googleapis.com/v1/projects/budget-24acc/databases/(default)/documents';
  const name='projects/budget-24acc/databases/(default)/documents/households/main/seed/';
  // Refuse to overwrite a completed or partially imported seed; do not reset cloud edits.
  const existing=await request(`${base}/households/main/seed?pageSize=1`);
  if(existing.documents?.length)throw new Error('Seed already exists. Refusing to overwrite household data.');
  const docs=[];
  for(const [table,rows]of Object.entries(seed))for(let index=0;index<Math.max(rows.length,1);index+=100)docs.push({id:`${table}_${String(index/100).padStart(3,'0')}`,data:{table,rows:rows.slice(index,index+100)}});
  const dates=[];for(let d=new Date('2026-01-01T00:00:00Z');d.getUTCFullYear()===2026;d.setUTCDate(d.getUTCDate()+1))dates.push(d.toISOString().slice(0,10));
  docs.push({id:'catalog',data:{source_hash:hash,category_ids:seed.categories.map(c=>c.id),category_types:Object.fromEntries(seed.categories.map(c=>[String(c.id),c.category_type])),account_ids:seed.accounts.map(a=>a.id),period_ids:seed.allocation_periods.map(p=>p.id),envelope_ids:[...new Set(seed.budget_allocations.map(b=>b.category_id))],transaction_ids:seed.transactions.map(t=>String(t.id)),valid_dates:dates}});
  const writes=docs.map(d=>({update:{name:name+d.id,fields:fields(d.data)},currentDocument:{exists:false}}));
  // This dataset fits one atomic commit. Either the complete private seed exists or none does.
  if(writes.length>450)throw new Error('Dataset too large for a single safe migration commit.');
  await request(`${base}:commit`,'POST',{writes});
  console.log(`Imported ${docs.length} private seed documents; source hash ${hash}. SQLite remains untouched.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
