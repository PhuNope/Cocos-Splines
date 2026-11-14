'use strict';
/**
 * Pure Cocos Creator 3.8 IProperty dump planner for a single Endpoint Snap.
 * A recorded edit replaces exactly one Path Knot position inside a cloned
 * typed Array dump. Never mutates live Cocos CCClass objects in main process.
 */
const copy=value=>JSON.parse(JSON.stringify(value));
const isFinite3=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
const position=entry=>entry?.value?.position?.value;
const vecEqual=(a,b,epsilon=1e-5)=>
    Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.z-b.z))<=epsilon;
const isPath=c=>c?.type==='SplinesV2.SplinePath'||
    (c?.value?.knots&&c?.value?.interpolation&&c?.value?.gizmoKnotIndex);
function planEndpointSnapDump(nodeDump,branch){
    if(!branch||!Number.isSafeInteger(branch.knotIndex)||branch.knotIndex<0||
       !Number.isSafeInteger(branch.knotCount)||branch.knotCount<2||
       !isFinite3(branch.expectedLocal)||!isFinite3(branch.targetLocal))
        throw new Error('Invalid Endpoint Snap target metadata');
    const components=nodeDump?.__comps__;
    if(!Array.isArray(components))throw new Error('Creator Path node dump unavailable');
    const indexes=components.map((c,i)=>isPath(c)?i:-1).filter(i=>i>=0);
    if(indexes.length!==1)
        throw new Error('Endpoint Snap requires exactly one SplinePath component on each Path Node');
    const componentIndex=indexes[0];
    const array=components[componentIndex]?.value?.knots;
    if(!array||!Array.isArray(array.value)||array.value.length!==branch.knotCount)
        throw new Error('Path Knot topology changed since Endpoint Snap preview');
    if(branch.knotIndex!==0&&branch.knotIndex!==array.value.length-1)
        throw new Error('Endpoint Snap only edits first/last Knot');
    const current=position(array.value[branch.knotIndex]);
    if(!isFinite3(current)||!vecEqual(current,branch.expectedLocal))
        throw new Error('Path Knot changed since snap proposal; Check again');
    const out=copy(array);
    out.value[branch.knotIndex].value.position.value={
        x:branch.targetLocal.x,y:branch.targetLocal.y,z:branch.targetLocal.z
    };
    return {componentIndex,field:'knots',dump:out,record:true,
        pathUuid:branch.pathUuid,knotIndex:branch.knotIndex,
        noOp:vecEqual(current,branch.targetLocal,1e-7)};
}
module.exports={planEndpointSnapDump};
