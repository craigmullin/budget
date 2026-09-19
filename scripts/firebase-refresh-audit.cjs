// Read-only production audit. Private backup stays outside Hosting; credentials stay in memory.
const fs=require('node:fs');
const {client}=require('./firebase-admin.cjs');
const base='https://firestore.googleapis.com/v1/projects/budget-24acc/databases/(default)/documents/households/main';
function decode(v){if('nullValue'in v)return null;if('integerValue'in v)return Number(v.integerValue);if('booleanValue'in v)return v.booleanValue;if('stringValue'in v)return v.stringValue;if('timestampValue'in v)return v.timestampValue;if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));throw Error('Unknown field');}
async function main(){const request=await client(),backup={};
 for(const collection of ['seed','changes','moves','settings','sessions','extras','expected']){let token;backup[collection]=[];do{const page=await request(`${base}/${collection}?pageSize=100${token?'&pageToken='+encodeURIComponent(token):''}`);for(const doc of page.documents||[])backup[collection].push({id:doc.name.split('/').at(-1),updateTime:doc.updateTime,data:Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decode(v)]))});token=page.nextPageToken;}while(token);}
 const directory='.local/refresh-2026';fs.mkdirSync(directory,{recursive:true});const file=`${directory}/live-${Date.now()}.json`;fs.writeFileSync(file,JSON.stringify(backup),{flag:'wx'});
 console.log(JSON.stringify({backup:file,counts:Object.fromEntries(Object.entries(backup).map(([k,v])=>[k,v.length]))}));
}
exports.decode=decode;
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
