'use strict';
/**
 * Transaction coordinator for serialized Knot node transforms.
 *
 * All edit plans are computed before entering here. Before and after each
 * batch, read actual Scene Node state to catch stale plans or silently
 * ignored Editor writes. The native Scene snapshot is invoked exactly once
 * only after the Scene matches the requested state.
 *
 * This is NOT a replacement for Creator's native Undo stack. The Editor
 * must still be live-tested for snapshot/redo and prefab override behavior.
 */
const AXES=['x','y','z'];
const QAXES=['x','y','z','w'];
const finite=(v,axes)=>!!v&&axes.every(key=>typeof v[key]==='number'&&Number.isFinite(v[key]));
const close=(a,b)=>Math.abs(a-b)<=1e-5+1e-6*Math.max(Math.abs(a),Math.abs(b));
function equalPosition(a,b){
    return finite(a,AXES)&&finite(b,AXES)&&AXES.every(axis=>close(a[axis],b[axis]));
}
function equalQuaternion(a,b){
    if(!finite(a,QAXES)||!finite(b,QAXES))return false;
    const na=Math.hypot(a.x,a.y,a.z,a.w),nb=Math.hypot(b.x,b.y,b.z,b.w);
    if(na<1e-9||nb<1e-9)return false;
    const dot=QAXES.reduce((sum,axis)=>sum+a[axis]*b[axis],0)/(na*nb);
    return Math.abs(dot)>=1-1e-6; // q and -q are the same rotation
}
function snapshotValid(result){
    return result!==false&&!(result&&typeof result==='object'&&result.ok===false);
}
function indexStates(result,ids){
    if(!result?.ok||!Array.isArray(result.states))
        throw Error(result?.error||'Cannot read Scene Knot transforms.');
    if(result.states.length!==ids.length)throw Error('Scene Knot state count changed during edit.');
    const byId=new Map();
    for(const state of result.states){
        if(typeof state?.uuid!=='string'||byId.has(state.uuid)||
            !finite(state.position,AXES)||!finite(state.rotation,QAXES))
            throw Error('Scene returned invalid or duplicate Knot transform.');
        byId.set(state.uuid,state);
    }
    if(ids.some(id=>!byId.has(id)))throw Error('Scene Knot selection changed during edit.');
    return byId;
}
function ensureStates(edits,actual,phase){
    for(const edit of edits){
        const state=actual.get(edit.uuid);
        const desiredPosition=phase==='before'?edit.before:edit.after;
        if(!equalPosition(state.position,desiredPosition))
            throw Error('Knot '+edit.uuid+' position '+phase+' mismatch; edit aborted.');
        if(edit.rotationChanged){
            const desired=phase==='before'?edit.beforeRotation:edit.afterRotation;
            if(!equalQuaternion(state.rotation,desired))
                throw Error('Knot '+edit.uuid+' rotation '+phase+' mismatch; edit aborted.');
        }
    }
}
async function commitKnotEdits(edits,adapter){
    if(!Array.isArray(edits)||!edits.length||edits.length>512)
        throw Error('Invalid Knot edit transaction.');
    if(!adapter||['read','writePosition','writeRotation','snapshot']
        .some(method=>typeof adapter[method]!=='function'))
        throw Error('Incomplete Knot Scene transaction adapter.');
    const ids=edits.map(edit=>edit.uuid);
    if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)
        throw Error('Transaction Knot IDs must be unique.');
    for(const edit of edits){
        if(!finite(edit.before,AXES)||!finite(edit.after,AXES)||
           (edit.rotationChanged&&(!finite(edit.beforeRotation,QAXES)||
           !finite(edit.afterRotation,QAXES))))
            throw Error('Transaction contains invalid position or rotation.');
    }
    // Guard against editing stale Inspector data after concurrent Scene changes.
    ensureStates(edits,indexStates(await adapter.read(ids),ids),'before');
    const applied=[];
    try{
        for(const edit of edits){
            // Register an operation before invoking Editor: it may throw
            // AFTER mutating the underlying Node, so it must be rolled back.
            if(edit.positionChanged!==false){
                applied.push({uuid:edit.uuid,kind:'position',before:edit.before});
                await adapter.writePosition(edit.uuid,edit.after);
            }
            if(edit.rotationChanged){
                applied.push({uuid:edit.uuid,kind:'rotation',before:edit.beforeRotation});
                await adapter.writeRotation(edit.uuid,edit.afterRotation);
            }
        }
        ensureStates(edits,indexStates(await adapter.read(ids),ids),'after');
        const result=await adapter.snapshot();
        if(!snapshotValid(result))throw Error('Scene snapshot rejected Knot edit.');
        return {ok:true,count:edits.length};
    }catch(error){
        const failures=[];
        for(const op of applied.reverse()){
            try{
                if(op.kind==='position')await adapter.writePosition(op.uuid,op.before);
                else await adapter.writeRotation(op.uuid,op.before);
            }catch(rollbackError){failures.push(op.uuid+':'+String(rollbackError));}
        }
        const msg=String(error?.message||error);
        if(failures.length)
            throw Error(msg+'; rollback failed for '+failures.join(', '));
        throw Error(msg);
    }
}
module.exports={commitKnotEdits,equalPosition,equalQuaternion,snapshotValid};
