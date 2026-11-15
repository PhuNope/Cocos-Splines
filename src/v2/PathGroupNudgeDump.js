'use strict';
/**
 * Creator 3.8 recordable Knot array planner for a bounded group translation.
 * One entire typed knots dump, one scene.set-property(record:true) history
 * entry. Never edits live Scene data or flattens unknown CCClass properties.
 */
const {knotPosition,setKnotPosition,knotDumpShape}=require('./PathKnotDumpCodec');
const copy=value=>JSON.parse(JSON.stringify(value));
const finite=v=>v!=null&&[v.x,v.y,v.z].every(Number.isFinite);
const plus=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.z-b.z));
function planPathGroupNudgeDump(nodeDump,plan){
    const indices=plan?.indices,expected=plan?.expectedPositions,delta=plan?.deltaLocal;
    if(!Array.isArray(indices)||indices.length<2||indices.length>32||
       new Set(indices).size!==indices.length||
       indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=128)||
       !Array.isArray(expected)||expected.length!==indices.length||
       !expected.every(finite)||!finite(delta)||
       !Number.isSafeInteger(plan.knotCount)||plan.knotCount<2||
       plan.knotCount>128||[delta.x,delta.y,delta.z].some(x=>Math.abs(x)>20))
        throw new Error('Invalid Group Nudge proposal; no Knot data changed');
    const comps=nodeDump?.__comps__;
    if(!Array.isArray(comps))throw new Error('Creator Path dump unavailable');
    const matches=comps.map((c,i)=>c?.type==='Spline.Path'||
        (c?.value?.knots&&c?.value?.gizmoKnotIndex&&c?.value?.interpolation)?i:-1)
        .filter(i=>i>=0);
    if(matches.length!==1)throw new Error('Expected one Spline.Path component');
    const componentIndex=matches[0],knots=comps[componentIndex].value.knots;
    if(!Array.isArray(knots?.value)||knots.value.length!==plan.knotCount)
        throw new Error('Knot topology changed since Group Nudge check');
    const result=copy(knots);
    for(let i=0;i<indices.length;i++){
        const index=indices[i],source=knots.value[index],current=knotPosition(source);
        if(!current||distance(current,expected[i])>1e-5)
            throw new Error('Knot '+index+' changed since Group Nudge check ('+
                knotDumpShape(source)+'); reselect and retry');
        const next=plus(current,delta);
        if(!finite(next))throw new Error('Group Nudge would create an invalid Vec3');
        setKnotPosition(result.value[index],next);
    }
    const noOp=Math.max(Math.abs(delta.x),Math.abs(delta.y),
        Math.abs(delta.z))<=1e-9;
    return {componentIndex,field:'knots',dump:result,
        indices:indices.slice(),count:indices.length,
        record:!noOp,noOp};
}
module.exports={planPathGroupNudgeDump};
