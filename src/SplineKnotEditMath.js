'use strict';
/**
 * Phase 2 knot placement operations. All calculations are container-LOCAL
 * and pure: callers persist Node positions through the Cocos Scene API.
 */
const AXES=Object.freeze(['x','y','z']);
function dimensionAxes(dimension){
    return dimension===1?['x','y']:dimension===2?['x','z']:AXES;
}
function validPoint(point){
    return !!point&&AXES.every(axis=>typeof point[axis]==='number'&&Number.isFinite(point[axis]));
}
function gridStep(step){
    if(typeof step!=='number'||!Number.isFinite(step)||step<=0||step>1e6)
        throw new Error('Grid step must be a finite number greater than zero and at most 1,000,000.');
    return step;
}
function validatedKnots(knots,ids){
    if(!Array.isArray(knots)||!Array.isArray(ids)||ids.length<1||ids.length>512)
        throw new Error('Select 1 to 512 knots in the same spline.');
    if(ids.some(id=>typeof id!=='string'||!id))throw new Error('Invalid Knot UUID.');
    const unique=new Set(ids);
    if(unique.size!==ids.length)throw new Error('Duplicate Knot UUID.');
    const byId=new Map(knots.map(k=>[k.uuid,k]));
    if(unique.size>byId.size)throw new Error('Selection exceeds knot count.');
    for(const id of unique)if(!byId.has(id))throw new Error('Knot selection must belong to the active spline.');
    const ordered=knots.filter(k=>unique.has(k.uuid));
    if(ordered.some(k=>!validPoint(k.position)))throw new Error('Knot position must be finite.');
    return ordered;
}
function rounded(value,step){
    const result=Math.round(value/step)*step;
    if(!Number.isFinite(result))throw new Error('Snap result is not finite.');
    return Math.abs(result)<1e-10?0:result;
}
function planKnotPositions(knots,ids,operation,options={},dimension=0){
    const selected=validatedKnots(knots,ids);
    const axes=dimensionAxes(dimension);
    if(operation!=='snap'&&operation!=='align')throw new Error('Unknown knot operation.');
    if(operation==='snap')gridStep(options.step);
    if(operation==='align'&&(!AXES.includes(options.axis)||!axes.includes(options.axis)))
        throw new Error('Alignment axis is not active in this spline dimension.');
    const anchor=selected[0].position;
    return selected.map(knot=>{
        const old={x:knot.position.x,y:knot.position.y,z:knot.position.z};
        const next={...old};
        if(operation==='snap')for(const axis of axes)next[axis]=rounded(old[axis],options.step);
        else next[options.axis]=anchor[options.axis];
        const changed=AXES.some(axis=>Math.abs(next[axis]-old[axis])>1e-10);
        return {uuid:knot.uuid,before:old,after:next,changed};
    }).filter(item=>item.changed);
}
module.exports={dimensionAxes,gridStep,validatedKnots,planKnotPositions};
