'use strict';
/** Transaction over real serialized Knot fields / handle Node positions.
 * Scene preflight owns the fingerprint and resolves the whitelist paths.
 * Exactly one snapshot on success, with rollback after any partial failure.
 */
const axes=['x','y','z'];
const vec=p=>!!p&&axes.every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]));
const equal=(a,b)=>typeof a==='number'&&typeof b==='number'?a===b:
    vec(a)&&vec(b)&&axes.every(k=>Math.abs(a[k]-b[k])<=1e-6);
function allowed(w,knot){
 if(!w||typeof w.uuid!=='string'||!w.uuid||typeof w.path!=='string')return false;
 if(w.type==='Enum')return w.uuid===knot&&/^__comps__\.\d+\.mode$/.test(w.path)&&
    Number.isInteger(w.before)&&w.before>=0&&w.before<=4&&w.after===4;
 if(w.type!=='cc.Vec3'||!vec(w.before)||!vec(w.after))return false;
 return w.uuid===knot?/^__comps__\.\d+\.tangent(?:In|Out)$/.test(w.path):
   w.path==='position';
}
async function commitJunctionBrokenConversion(plan,{read,write,snapshot}){
 if(!plan||!plan.guard||typeof plan.guard!=='string'||!plan.targetKnotUuid||
    !Number.isInteger(plan.beforeMode)||plan.beforeMode<0||plan.beforeMode>4||
    !Array.isArray(plan.writes)||plan.writes.length>3||
    !plan.writes.every(w=>allowed(w,plan.targetKnotUuid))||
    !plan.writes.some(w=>w.type==='Enum')||
    [read,write,snapshot].some(fn=>typeof fn!=='function'))
    throw Error('Invalid Junction Broken conversion transaction.');
 const keys=new Set(plan.writes.map(w=>w.uuid+'|'+w.path));
 if(keys.size!==plan.writes.length)throw Error('Duplicate Junction conversion write.');
 const state=async()=>{
   const result=await read();
   if(!result?.ok||!Array.isArray(result.writes))
      throw Error(result?.error||'Junction conversion Scene guard failed.');
   for(const write of plan.writes){
     const matches=result.writes.filter(w=>w.uuid===write.uuid&&w.path===write.path&&
       w.type===write.type);
     if(matches.length!==1)throw Error('Junction conversion write binding changed.');
   }
   return result.writes;
 };
 const check=async(expected)=>{
   const current=await state();
   for(const w of plan.writes){
     const live=current.find(x=>x.uuid===w.uuid&&x.path===w.path);
     if(!equal(live?.value,expected.get(w.uuid+'|'+w.path)))
       throw Error('Junction conversion field changed during transaction.');
   }
 };
 const before=new Map(plan.writes.map(w=>[w.uuid+'|'+w.path,w.before]));
 await check(before);
 let attempted=[];
 try{
   for(const w of plan.writes){
     if(equal(w.before,w.after))continue;
     // Mark before sending; a rejected Editor write may have mutated Scene.
     attempted.push(w);
     await write(w,w.after);
     const expected=new Map(before);
     for(const applied of attempted)
       expected.set(applied.uuid+'|'+applied.path,applied.after);
     await check(expected);
   }
   if(!attempted.length)return {ok:true,changed:false};
   const result=await snapshot();
   if(result===false||(result&&result.ok===false))
     throw Error('Junction conversion snapshot rejected.');
   return {ok:true,changed:true};
 }catch(error){
   try{
     for(const w of attempted.reverse()){
       const current=await state();
       const live=current.find(x=>x.uuid===w.uuid&&x.path===w.path);
       // Only restore a field known to be our after/before value.
       if(!equal(live?.value,w.after)&&!equal(live?.value,w.before))
          throw Error('Rollback target changed externally.');
       if(!equal(live?.value,w.before))await write(w,w.before);
     }
     await check(before);
   }catch(rollback){
     throw Error(String(error?.message||error)+'; rollback skipped/failed: '+
       String(rollback?.message||rollback));
   }
   throw error;
 }
}
module.exports={commitJunctionBrokenConversion};
