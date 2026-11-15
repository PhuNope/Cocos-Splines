'use strict';
/**
 * Recordable Creator 3.8 typed CCClass Knot array planner.
 * Only endpoint handleIn/handleOut and its mode are edited.
 * All other fields, including Roll, position, opposite handle, unknown
 * metadata and elementTypeData, are preserved from the live dump.
 */
const copy=value=>JSON.parse(JSON.stringify(value));
const finite=p=>p!=null&&[p.x,p.y,p.z].every(Number.isFinite);
const near=(a,b,epsilon=1e-5)=>finite(a)&&finite(b)&&
    Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.z-b.z))<=epsilon;
const isPath=c=>c?.type==='SplinesV2.SplinePath'||
    (c?.value?.knots&&c?.value?.interpolation&&c?.value?.gizmoKnotIndex);
function planJunctionTangentDump(nodeDump,branch){
    if(!branch||!Number.isSafeInteger(branch.knotIndex)||
       !Number.isSafeInteger(branch.knotCount)||branch.knotCount<2||
       typeof branch.pathUuid!=='string'||!branch.pathUuid||
       !['in','out'].includes(branch.handleSide)||
       !finite(branch.expectedPosition)||!finite(branch.expectedHandle)||
       !finite(branch.targetLocalHandle)||
       !Number.isInteger(branch.expectedMode)||branch.expectedMode<0||
       branch.expectedMode>3||!Number.isInteger(branch.targetMode)||
       branch.targetMode<0||branch.targetMode>3)
        throw new Error('Invalid Junction Bezier tangent proposal');
    if(branch.handleSide!==(branch.knotIndex===0?'out':'in')||
       (branch.knotIndex!==0&&branch.knotIndex!==branch.knotCount-1))
        throw new Error('Junction Bezier Tangent can only update a Path endpoint');
    const components=nodeDump?.__comps__;
    if(!Array.isArray(components))throw new Error('Creator Path node dump unavailable');
    const indexes=components.map((c,i)=>isPath(c)?i:-1).filter(i=>i>=0);
    if(indexes.length!==1)
        throw new Error('Junction Tangents require exactly one SplinePath on its Node');
    const componentIndex=indexes[0],props=components[componentIndex].value;
    if(props.interpolation?.value!==1||props.closed?.value===true)
        throw new Error('Junction Tangents require an open Bezier SplinePath');
    const knots=props.knots;
    if(!Array.isArray(knots?.value)||knots.value.length!==branch.knotCount)
        throw new Error('Path Knot topology changed before tangent Apply');
    const entry=knots.value[branch.knotIndex]?.value;
    const handleKey=branch.handleSide==='in'?'handleIn':'handleOut';
    const position=entry?.position?.value,handle=entry?.[handleKey]?.value;
    const mode=entry?.mode?.value;
    if(!near(position,branch.expectedPosition)||
       !near(handle,branch.expectedHandle)||mode!==branch.expectedMode)
        throw new Error('Bezier Knot changed since Check Tangents; Check again');
    const noOp=near(handle,branch.targetLocalHandle,1e-7)&&
        mode===branch.targetMode;
    if(!branch.changed&&!noOp)
        throw new Error('Tangent proposal changed flag is inconsistent');
    if(branch.changed&&branch.expectedMode===0)
        throw new Error('Cannot rewrite Auto tangents without an explicit authoring mode');
    const dump=copy(knots);
    const target=dump.value[branch.knotIndex].value;
    target[handleKey].value={
        x:branch.targetLocalHandle.x,
        y:branch.targetLocalHandle.y,z:branch.targetLocalHandle.z
    };
    target.mode.value=branch.targetMode;
    return {pathUuid:branch.pathUuid,componentIndex,field:'knots',
        dump,record:true,noOp,knotIndex:branch.knotIndex};
}
module.exports={planJunctionTangentDump};
