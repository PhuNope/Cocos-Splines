'use strict';
/**
 * Portable, versioned, geometry-only JSON. No node UUIDs, prefab refs or
 * arbitrary component payloads are deserialized. The resolved cubic handles
 * are expressed in the SplineContainer's LOCAL coordinates.
 */
const FORMAT='cocos-splines/geometry';
const VERSION=1,MAX_BYTES=200000,MAX_KNOTS=256,MAX_ABS=10000000;
const AXIS_EPS=1e-7;
function obj(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function number(n){return typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=MAX_ABS;}
function vector(v,size,label){
    if(!Array.isArray(v)||v.length!==size||v.some(n=>!number(n)))
        throw Error(label+' must be a finite '+size+'-element array within ±1e7.');
    return v.slice();
}
function fromVec(v,label){
    if(!obj(v))throw Error(label+' must be a vector object.');
    return vector([v.x,v.y,v.z],3,label);
}
function fromQuat(v,label){
    if(!obj(v))throw Error(label+' must be a quaternion object.');
    return vector([v.x,v.y,v.z,v.w],4,label);
}
function checkQuaternion(v){
    const len=Math.hypot(...v);
    if(Math.abs(len-1)>1e-3)throw Error('Spline local rotation quaternion must be normalized.');
}
function parseModel(model){
    if(!obj(model)||model.format!==FORMAT||model.version!==VERSION||
        model.space!=='container-local')
        throw Error('Unsupported spline JSON format/version/space. Expected cocos-splines/geometry v1.');
    if(!Number.isInteger(model.dimension)||model.dimension<0||model.dimension>2)
        throw Error('Spline dimension must be 0 (3D), 1 (XY2D) or 2 (XZ2D).');
    if(typeof model.closed!=='boolean'||typeof model.reversed!=='boolean')
        throw Error('closed and reversed must be Boolean.');
    if(!Number.isInteger(model.samplesPerCurve)||model.samplesPerCurve<4||
        model.samplesPerCurve>256)
        throw Error('samplesPerCurve must be an integer from 4 to 256.');
    if(!obj(model.localTransform))throw Error('Missing localTransform.');
    const root={
        position:vector(model.localTransform.position,3,'localTransform.position'),
        rotation:vector(model.localTransform.rotation,4,'localTransform.rotation'),
        scale:vector(model.localTransform.scale,3,'localTransform.scale'),
    };
    checkQuaternion(root.rotation);
    if(!Array.isArray(model.knots)||model.knots.length<2||model.knots.length>MAX_KNOTS)
        throw Error('Spline JSON requires 2–256 Knots.');
    const knots=model.knots.map((k,index)=>{
        if(!obj(k))throw Error('Invalid Knot at '+index);
        const p=vector(k.position,3,'knot '+index+' position');
        const ti=vector(k.tangentIn,3,'knot '+index+' tangentIn');
        const to=vector(k.tangentOut,3,'knot '+index+' tangentOut');
        const hidden=model.dimension===1?2:model.dimension===2?1:-1;
        if(hidden!==-1&&[p[hidden],ti[hidden],to[hidden]].some(v=>Math.abs(v)>AXIS_EPS))
            throw Error('Knot '+index+' has values outside its 2D local plane.');
        return {position:p,tangentIn:ti,tangentOut:to};
    });
    return {format:FORMAT,version:VERSION,space:'container-local',
        dimension:model.dimension,closed:model.closed,reversed:model.reversed,
        samplesPerCurve:model.samplesPerCurve,localTransform:root,knots};
}
function parseSplineJSON(input){
    if(typeof input!=='string'||input.length<2||input.length>MAX_BYTES)
        throw Error('Spline JSON text must be 2–200,000 characters.');
    let json;
    try{json=JSON.parse(input);}catch(e){throw Error('Invalid spline JSON syntax.');}
    return parseModel(json);
}
function serializeSplineJSON(scene){
    if(!obj(scene)||!Array.isArray(scene.knots))
        throw Error('Scene geometry response is missing Knots.');
    if(!obj(scene.localTransform))
        throw Error('Scene geometry response is missing localTransform.');
    // Never use spread for external Scene data; export a strict value-only allowlist.
    const model={
        format:FORMAT,version:VERSION,space:'container-local',
        dimension:scene.dimension,closed:scene.closed===true,
        reversed:scene.reversed===true,samplesPerCurve:scene.samplesPerCurve,
        localTransform:{
            position:fromVec(scene.localTransform.position,'localTransform.position'),
            rotation:fromQuat(scene.localTransform.rotation,'localTransform.rotation'),
            scale:fromVec(scene.localTransform.scale,'localTransform.scale'),
        },
        knots:scene.knots.map((k,i)=>({
            position:fromVec(k.position,'knot '+i+' position'),
            tangentIn:fromVec(k.tangentIn,'knot '+i+' tangentIn'),
            tangentOut:fromVec(k.tangentOut,'knot '+i+' tangentOut'),
        })),
    };
    const checked=parseModel(model);
    const output=JSON.stringify(checked,null,2)+'\n';
    if(output.length>MAX_BYTES)throw Error('Spline JSON exceeds 200,000 characters.');
    return output;
}
module.exports={FORMAT,VERSION,MAX_BYTES,MAX_KNOTS,parseModel,parseSplineJSON,serializeSplineJSON};
