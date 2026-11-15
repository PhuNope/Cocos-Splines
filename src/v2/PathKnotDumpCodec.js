'use strict';
/**
 * Creator IProperty array values may have a CCClass dump at different
 * nesting levels depending on whether they were queried from Scene or
 * rendered by Inspector. Never flatten/replace the surrounding metadata.
 *
 * Only accepts finite numeric XYZ and known value-wrapper shapes; this is
 * intentionally not a generic recursive search for an accidental Vec3.
 */
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const axisValue=value=>{
    if(typeof value==='number')return value;
    if(isObject(value)&&typeof value.value==='number')return value.value;
    return NaN;
};
const vectorAt=point=>{
    if(!isObject(point))return null;
    const x=axisValue(point.x),y=axisValue(point.y),z=axisValue(point.z);
    return [x,y,z].every(Number.isFinite)?{x,y,z}:null;
};
function locate(entry){
    const nodes=[
        entry?.value?.position,entry?.value?.value?.position,
        entry?.position,entry?.value?.__value__?.position
    ];
    for(const item of nodes){
        let candidate=item;
        for(let depth=0;depth<4;depth++){
            if(!isObject(candidate))break;
            const point=vectorAt(candidate);
            if(point)return {container:candidate,point};
            candidate=candidate.value;
        }
    }
    return null;
}
function knotPosition(entry){
    return locate(entry)?.point||null;
}
function setKnotPosition(entry,point){
    if(!vectorAt(point))throw new Error('Invalid finite Vec3 Knot target');
    const found=locate(entry);
    if(!found)throw new Error('Unsupported serialized Vec3 Knot position shape');
    for(const axis of ['x','y','z']){
        const current=found.container[axis];
        if(isObject(current)&&typeof current.value==='number')
            current.value=point[axis];
        else found.container[axis]=point[axis];
    }
}
/** Report structure only; never print serialized Knot values or full dumps. */
function knotDumpShape(entry){
    if(entry==null)return 'null';
    if(!isObject(entry))return typeof entry;
    const node=entry.value?.value??entry.value??entry;
    const pos=node?.position;
    if(pos===null)return 'position:null';
    if(pos===undefined)return 'position:missing';
    if(isObject(pos)){
        const p=pos.value??pos;
        return 'position fields '+(isObject(p)?Object.keys(p).sort().join(','):'non-object');
    }
    return 'position:'+typeof pos;
}
module.exports={knotPosition,setKnotPosition,knotDumpShape};
