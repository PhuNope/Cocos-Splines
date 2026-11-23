'use strict';
/**
 * Converts fitted spline-local Bezier vectors into serialized values for a
 * newly generated Knot. Source handle Nodes are NEVER retained or referenced.
 * Pure Editor-side math; no Cocos runtime dependency.
 */
const finiteVec=v=>!!v&&['x','y','z'].every(axis=>Number.isFinite(v[axis]));
const finiteQuat=q=>finiteVec(q)&&Number.isFinite(q.w)&&
    q.x*q.x+q.y*q.y+q.z*q.z+q.w*q.w>1e-12;
function inverseRotate(q,v){
    if(!finiteQuat(q)||!finiteVec(v))throw Error('Invalid Knot rotation or tangent.');
    const n=q.x*q.x+q.y*q.y+q.z*q.z+q.w*q.w;
    const x=-q.x/Math.sqrt(n),y=-q.y/Math.sqrt(n),z=-q.z/Math.sqrt(n),w=q.w/Math.sqrt(n);
    const tx=2*(y*v.z-z*v.y),ty=2*(z*v.x-x*v.z),tz=2*(x*v.y-y*v.x);
    const result={x:v.x+w*tx+(y*tz-z*ty),
        y:v.y+w*ty+(z*tx-x*tz),
        z:v.z+w*tz+(x*ty-y*tx)};
    if(!finiteVec(result))throw Error('Invalid Knot-local fitted tangent.');
    return result;
}
function planCopiedKnot(knot,meta){
    if(!knot||!meta||!finiteVec(knot.position)||!finiteVec(knot.tangentIn)||
       !finiteVec(knot.tangentOut)||!finiteQuat(meta.rotation)||
       typeof meta.handleIn!=='boolean'||typeof meta.handleOut!=='boolean'||
       typeof meta.tangentsInKnotSpace!=='boolean'||typeof meta.editTangentHandles!=='boolean'||
       !Number.isFinite(meta.tension)||meta.tension<0||meta.tension>1000)
        throw Error('Invalid Simplify Knot copy payload.');
    // Runtime SplineContainer.collect() rotates each handle-backed tangent
    // and every knot-space tangent by this Knot's local rotation. Invert the
    // authored rotation here to keep the evaluated cubic in Container space.
    const tangentIn=meta.handleIn||meta.tangentsInKnotSpace
        ?inverseRotate(meta.rotation,knot.tangentIn):{...knot.tangentIn};
    const tangentOut=meta.handleOut||meta.tangentsInKnotSpace
        ?inverseRotate(meta.rotation,knot.tangentOut):{...knot.tangentOut};
    return {tangentIn,tangentOut,
        handleIn:meta.handleIn,handleOut:meta.handleOut,
        tangentsInKnotSpace:meta.tangentsInKnotSpace,
        editTangentHandles:(meta.handleIn||meta.handleOut)&&meta.editTangentHandles,
        tension:meta.tension};
}
module.exports={finiteQuat,inverseRotate,planCopiedKnot};
