import {buildModel,effectiveData,parseAmount} from './cloud-model.mjs';
export const isCloud=!['localhost','127.0.0.1','[::1]'].includes(location.hostname);
let sdk,auth,db,seed,changes=[],moves=[],unsubscribers=[];
const root='households/main';
async function refresh(){const s=await Promise.all(['changes','moves'].map(name=>sdk.getDocs(sdk.collection(db,`${root}/${name}`))));changes=s[0].docs.map(d=>({...d.data(),id:d.id}));moves=s[1].docs.map(d=>d.data());}
export async function cloudRequest(url,options={}) {
  if(!auth?.currentUser||!seed) throw new Error('Sign in to access your household budget.');
  const method=options.method||'GET';
  if(method==='GET') return buildModel(effectiveData(seed,changes,moves),new URL(url,location.origin).searchParams.get('period'));
  if(!navigator.onLine)throw new Error('Connect to the internet before saving changes.');
  const p=options.body?JSON.parse(options.body):{};
  if(url==='/api/moves') {
    const amount=parseAmount(p.amount),eligible=id=>seed.budget_allocations.some(b=>b.category_id===id&&b.allocation_period_id===p.period_id);
    if(amount<0||p.from_category_id===p.to_category_id||!eligible(p.from_category_id)||!eligible(p.to_category_id)) throw new Error('Choose different envelopes and a positive amount.');
    await sdk.addDoc(sdk.collection(db,`${root}/moves`),{period_id:p.period_id,from_category_id:p.from_category_id,to_category_id:p.to_category_id,amount_cents:amount,description:p.description||'',created_by:auth.currentUser.uid,created_at:sdk.serverTimestamp()});
  } else {
    const id=url.startsWith('/api/transactions/')?url.split('/').at(-1):`app_${crypto.randomUUID()}`;
    await sdk.runTransaction(db,async tx=>{
      const reference=sdk.doc(db,`${root}/changes/${id}`),snapshot=await tx.get(reference),old=snapshot.exists()?snapshot.data():null,revision=old?.revision||0;
      if(method!=='POST'&&revision!==(p.expected_revision??changes.find(t=>t.id===id)?.revision??0)) throw new Error('This transaction changed on another device. Reload before editing it.');
      if(method!=='POST'&&!seed.transactions.some(t=>String(t.id)===id)&&(!old||old.deleted)) throw new Error('Transaction not found.');
      const common={id,revision:revision+1,updated_by:auth.currentUser.uid,updated_at:sdk.serverTimestamp()};
      if(method==='DELETE') tx.set(reference,{...common,deleted:true});
      else {
        const amount=parseAmount(p.amount),category=seed.categories.find(c=>c.id===p.category_id);
        if(!category||!seed.accounts.some(a=>a.id===p.account_id)) throw new Error('Choose a valid category and account.');
        if(!/^2026-\d{2}-\d{2}$/.test(p.transaction_date)||new Date(`${p.transaction_date}T00:00:00Z`).toISOString().slice(0,10)!==p.transaction_date) throw new Error('Choose a valid date in 2026.');
        const kind=['income','currency'].includes(category.category_type)?'income':['carryover','transfer'].includes(category.category_type)?category.category_type:amount<0?'refund_credit':'expense';
        tx.set(reference,{...common,transaction_date:p.transaction_date,description:p.description||'',category_id:p.category_id,account_id:p.account_id,amount_cents:amount,transaction_type:kind,deleted:false});
      }
    });
  }
  await refresh();return {saved:true};
}
export async function startCloud(onReady,onError) {
  const appSdk=await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js');
  const authSdk=await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js');
  sdk=await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
  const response=await fetch('/__/firebase/init.json');if(!response.ok) throw new Error('Firebase configuration is unavailable.');
  const app=appSdk.initializeApp(await response.json());auth=authSdk.getAuth(app);db=sdk.getFirestore(app);
  const main=document.querySelector('main'),login=document.querySelector('#cloud-login');
  main.classList.add('hidden');login.classList.remove('hidden');
  document.querySelector('#cloud-signin').onclick=()=>authSdk.signInWithPopup(auth,new authSdk.GoogleAuthProvider()).catch(e=>document.querySelector('#login-error').textContent=e.message);
  document.querySelector('#cloud-signout').onclick=()=>authSdk.signOut(auth);
  document.querySelector('.local-status').textContent='Household account';
  document.querySelector('footer').lastElementChild.textContent='Private household records · Synced with Firebase';
  authSdk.onAuthStateChanged(auth,async user=>{
    unsubscribers.forEach(stop=>stop());unsubscribers=[];
    seed=null;changes=[];moves=[];main.classList.add('hidden');login.classList.remove('hidden');document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    document.querySelector('#cloud-signout').classList.toggle('hidden',!user);
    if(!user)return;
    if(!user.emailVerified||!['creaghan1@gmail.com','cmlmullin@gmail.com'].includes(user.email?.toLowerCase())){document.querySelector('#login-error').textContent='This account does not have household access.';return;}
    try{
      const snapshot=await sdk.getDocs(sdk.collection(db,`${root}/seed`));seed={};
      for(const d of snapshot.docs){const r=d.data();if(r.table)(seed[r.table]??=[]).push(...r.rows);}
      if(!seed.allocation_periods?.length)throw new Error('Household data migration is not yet complete.');
      await refresh();await onReady();login.classList.add('hidden');main.classList.remove('hidden');
      if(auth.currentUser?.uid!==user.uid){seed=null;main.classList.add('hidden');login.classList.remove('hidden');return;}
      for(const name of ['changes','moves'])unsubscribers.push(sdk.onSnapshot(sdk.collection(db,`${root}/${name}`),snapshot=>{
        if(auth.currentUser?.uid!==user.uid)return;
        const rows=snapshot.docs.map(d=>({...d.data(),id:d.id}));
        if(name==='changes')changes=rows;else moves=rows;
        if(!snapshot.metadata.hasPendingWrites&&!document.querySelector('dialog[open]'))onReady().catch(e=>onError?.(e));
      },e=>onError?.(e)));
    }catch(error){seed=null;document.querySelector('#login-error').textContent=error.message;}
  });
  window.addEventListener('focus',async()=>{if(seed&&!document.querySelector('dialog[open]'))try{await refresh();await onReady();}catch(e){onError?.(e);}});
}
export async function downloadBackup() {
  if(!seed)throw new Error('Sign in before exporting a backup.');
  await refresh();
  const blob=new Blob([JSON.stringify({format:'budget-firestore-v1',exported_at:new Date().toISOString(),seed,changes,moves})],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`budget-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
