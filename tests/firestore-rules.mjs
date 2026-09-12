import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,serverTimestamp} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-budget',firestore:{host:'127.0.0.1',port:8088,rules:readFileSync('firestore.rules','utf8')}});
try {
  await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'households/main/seed/catalog'),{category_ids:[1,2],category_types:{'1':'expense','2':'income'},account_ids:[1],period_ids:[1],envelope_ids:[1,2],transaction_ids:['5'],valid_dates:['2026-01-01']}));
  const db=env.authenticatedContext('craig',{email:'creaghan1@gmail.com',email_verified:true}).firestore();
  const wife=env.authenticatedContext('wife',{email:'cmlmullin@gmail.com',email_verified:true}).firestore();
  const outsider=env.authenticatedContext('stranger',{email:'stranger@gmail.com',email_verified:true}).firestore();
  const unverified=env.authenticatedContext('fake',{email:'creaghan1@gmail.com',email_verified:false}).firestore();
  const catalog='households/main/seed/catalog';
  await assertSucceeds(getDoc(doc(db,catalog)));await assertSucceeds(getDoc(doc(wife,catalog)));
  await assertFails(getDoc(doc(outsider,catalog)));await assertFails(getDoc(doc(unverified,catalog)));await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),catalog)));
  await assertFails(setDoc(doc(db,catalog),{}));
  const change={id:'5',transaction_date:'2026-01-01',description:'Food',category_id:1,account_id:1,amount_cents:1234,transaction_type:'expense',deleted:false,revision:1,updated_by:'craig',updated_at:serverTimestamp()};
  await assertSucceeds(setDoc(doc(db,'households/main/changes/5'),change));
  await assertFails(setDoc(doc(db,'households/main/changes/5'),{...change,revision:1}));
  await assertFails(setDoc(doc(db,'households/main/changes/5'),{...change,revision:2,amount_cents:1.5}));
  await assertFails(setDoc(doc(db,'households/main/changes/5'),{...change,revision:2,transaction_type:'income'}));
  await assertFails(setDoc(doc(db,'households/main/changes/5'),{...change,revision:2,transaction_date:'2026-02-30'}));
  await assertSucceeds(setDoc(doc(db,'households/main/changes/5'),{id:'5',deleted:true,revision:2,updated_by:'craig',updated_at:serverTimestamp()}));
  const move={period_id:1,from_category_id:1,to_category_id:2,amount_cents:100,description:'Gas',created_by:'craig',created_at:serverTimestamp()};
  await assertSucceeds(setDoc(doc(db,'households/main/moves/test'),move));
  await assertFails(setDoc(doc(db,'households/main/moves/test'),move));
  await assertFails(setDoc(doc(db,'households/main/moves/bad'),{...move,to_category_id:1}));
  await assertFails(setDoc(doc(db,'households/main/moves/bad'),{...move,amount_cents:-1}));
  await assertFails(setDoc(doc(outsider,'households/main/moves/bad'),move));
  console.log('PASS: household access, immutable source, revision conflicts, transaction validation, and linked moves.');
}finally{await env.cleanup();}
