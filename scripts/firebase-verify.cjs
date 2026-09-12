const fs=require('node:fs');
const assert=require('node:assert/strict');
const {client}=require('./firebase-admin.cjs');
function decode(v){if('nullValue'in v)return null;if('integerValue'in v)return Number(v.integerValue);if('booleanValue'in v)return v.booleanValue;if('stringValue'in v)return v.stringValue;if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));throw new Error('Unexpected seed field type.');}
async function main(){
  const request=await client(),actual={};let token;
  do{const page=await request('https://firestore.googleapis.com/v1/projects/budget-24acc/databases/(default)/documents/households/main/seed?pageSize=100'+(token?'&pageToken='+encodeURIComponent(token):''));
    for(const doc of page.documents||[]){const record=Object.fromEntries(Object.entries(doc.fields).map(([k,v])=>[k,decode(v)]));if(record.table)(actual[record.table]??=[]).push(...record.rows);}token=page.nextPageToken;
  }while(token);
  const expected=JSON.parse(fs.readFileSync('.local/firebase/seed.json'));
  for(const table of Object.keys(expected))assert.deepEqual(actual[table],expected[table],table);
  console.log('PASS: every uploaded source record matches the local SQLite export, including raw provenance and exceptions.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
