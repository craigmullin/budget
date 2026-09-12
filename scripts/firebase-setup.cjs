const {client}=require('./firebase-admin.cjs');
async function main(){
  const request=await client();
  for(const api of ['firestore.googleapis.com','identitytoolkit.googleapis.com'])await request(`https://serviceusage.googleapis.com/v1/projects/686980740586/services/${api}:enable`,'POST',{});
  console.log('Requested the Firestore and Authentication APIs; no billing changes.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
