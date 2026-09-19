export function parsePositiveCents(raw){
  const match=String(raw).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if(!match)return null;
  const value=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));
  return Number.isSafeInteger(value)&&value>0?value:null;
}

export function calculateSplit(totalRaw,rows,remainderIndex=null){
  const total=parsePositiveCents(totalRaw);let fixed=0,valid=true;
  const allocations=rows.map((row,index)=>{
    const amount=index===remainderIndex?null:parsePositiveCents(row.raw);
    if(index!==remainderIndex){if(amount===null)valid=false;else fixed+=amount;}
    return {category_id:Number(row.category_id)||0,amount_cents:amount};
  });
  const remainderCents=remainderIndex!==null&&total!==null?total-fixed:null;
  if(remainderIndex!==null&&allocations[remainderIndex])allocations[remainderIndex].amount_cents=remainderCents;
  const sum=allocations.reduce((value,row)=>value+(row.amount_cents||0),0),remaining=total===null?null:total-sum;
  const categories=allocations.map(row=>row.category_id);
  valid=valid&&total!==null&&allocations.length>=2&&allocations.length<=6
    &&allocations.every(row=>row.category_id&&row.amount_cents>0)&&new Set(categories).size===categories.length;
  return {total,fixed,sum,remaining,remainder_cents:remainderCents,valid,allocations};
}
