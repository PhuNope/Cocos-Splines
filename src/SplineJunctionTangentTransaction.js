'use strict';
/**
 * Single-field serialized tangent transaction. The Scene planner/guard decides
 * which one vector belongs to the target Knot; this module only coordinates
 * read-back, one snapshot and best-effort rollback.
 */
const axes=['x','y','z'];
const finite=p=>!!p&&axes.every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]));
const same=(a,b)=>finite(a)&&finite(b)&&axes.every(k=>
    Math.abs(a[k]-b[k])<=1e-5+1e-6*Math.max(Math.abs(a[k]),Math.abs(b[k])));
async function commitJunctionTangent(plan,{read,write,snapshot}){
    if(!plan||!finite(plan.before)||!finite(plan.after)||
       !['in','out'].includes(plan.side)||
       !['g1','c1'].includes(plan.mode)||
       typeof plan.guard!=='string'||!plan.guard||
       typeof plan.writeUuid!=='string'||!plan.writeUuid||
       typeof plan.targetKnotUuid!=='string'||!plan.targetKnotUuid||
       typeof plan.writePath!=='string'||!(
         (plan.writePath==='position'&&plan.writeUuid!==plan.targetKnotUuid)||
         (plan.writeUuid===plan.targetKnotUuid&&
           /^__comps__\.\d+\.tangent(?:In|Out)$/.test(plan.writePath) &&
           plan.writePath.endsWith(plan.side==='in'?'In':'Out'))
       )||[read,write,snapshot].some(fn=>typeof fn!=='function'))
       throw Error('Invalid G1/C1 serialized tangent transaction.');
    const state=async expected=>{
       const result=await read();
       if(!result?.ok||result.uuid!==plan.writeUuid||result.path!==plan.writePath||
          !same(result.value,expected))
          throw Error(result?.error||'Junction tangent state changed during transaction.');
    };
    await state(plan.before);
    if(same(plan.before,plan.after))return {ok:true,changed:false};
    let attempted=false;
    try{
        attempted=true; // Editor may mutate and then reject/throw
        await write(plan.after);
        await state(plan.after);
        const result=await snapshot();
        if(result===false||(result&&result.ok===false))
            throw Error('Scene rejected tangent alignment snapshot.');
        return {ok:true,changed:true};
    }catch(error){
        if(attempted){
            try{
                // Never write rollback to an unrelated / switched Scene.
                // Read can fail because the deliberate target field changed,
                // but the Scene guard must still pass inside adapter.read.
                const guard=await read();
                if(!guard?.ok)throw Error(guard?.error||'Scene no longer matches tangent plan.');
                await write(plan.before);
                await state(plan.before);
            }catch(rollbackError){
                throw Error(String(error?.message||error)+'; rollback skipped/failed: '+
                    String(rollbackError?.message||rollbackError));
            }
        }
        throw error;
    }
}
module.exports={commitJunctionTangent,same};
