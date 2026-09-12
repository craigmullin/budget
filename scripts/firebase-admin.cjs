// Uses the existing Firebase CLI login in memory. Never prints or saves credentials.
const path=require('node:path');
const cliRoot=path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib');
const auth=require(path.join(cliRoot,'auth.js'));
const {requireAuth}=require(path.join(cliRoot,'requireAuth.js'));
exports.client=async()=>{
  const account=auth.getGlobalDefaultAccount();if(!account)throw new Error('Run firebase login first.');
  const options={project:'budget-24acc',...account};await requireAuth(options);
  const tokens=await auth.getAccessToken(account.tokens.refresh_token,options.authScopes);
  return async(url,method='GET',body)=>{
    const r=await fetch(url,{method,headers:{Authorization:`Bearer ${tokens.access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const result=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} failed (${r.status}): ${result.error?.message||r.statusText}`);return result;
  };
};
