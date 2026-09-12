// Add new immutable configuration only; never overwrite seed or household activity.
const fs=require('node:fs');
const {client}=require('./firebase-admin.cjs');
function value(v){if(v===null)return {nullValue:null};if(Array.isArray(v))return {arrayValue:{values:v.map(value)}};if(typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,v])=>[k,value(v)]))}};if(typeof v==='number')return {integerValue:String(v)};return {stringValue:String(v)};}
async function main(){
  const config=JSON.parse(fs.readFileSync('.local/firebase/payday-config.json','utf8'));
  if(config.opening_cents!==0||config.defaults.length!==63||config.defaults.reduce((s,v)=>s+v,0)!==358360)throw new Error('Unexpected approved configuration.');
  const request=await client(),base='https://firestore.googleapis.com/v1/projects/budget-24acc/databases/(default)/documents';
  await request(`${base}:commit`,'POST',{writes:[{update:{name:'projects/budget-24acc/databases/(default)/documents/households/main/seed/payday',fields:value(config).mapValue.fields},currentDocument:{exists:false}}]});
  console.log('Added immutable forward configuration; existing seed and household changes untouched.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
