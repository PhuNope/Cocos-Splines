'use strict';
/** Pure Cocos-independent G1 / C1 endpoint tangent planning.
 * G1 preserves the target WORLD handle length. C1 sets target world
 * control-vector magnitude equal to the anchor's world control magnitude,
 * i.e. equal endpoint Bezier derivatives with respect to segment parameter u.
 * Both modes align forward (+progress) derivatives by default.
 */
const {transformFrame}=require('./SplineKnotEditMath');
const {inverseRotate}=require('./SplineTopologyCopyMath');
const finiteVec=p=>!!p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const len=p=>Math.hypot(p.x,p.y,p.z);
const worldVector=(v,m)=>{
    if(!finiteVec(v)||!Array.isArray(m)||m.length!==16||m.some(x=>!Number.isFinite(x)))
        throw Error('Invalid connector vector/world matrix.');
    return {x:m[0]*v.x+m[4]*v.y+m[8]*v.z,
            y:m[1]*v.x+m[5]*v.y+m[9]*v.z,
            z:m[2]*v.x+m[6]*v.y+m[10]*v.z};
};
function endpointSide(progress,reversed){
    if(!Number.isFinite(progress)||Math.min(Math.abs(progress),Math.abs(1-progress))>1e-8)
        throw Error('G1/C1 alignment requires an exact endpoint progress 0 or 1.');
    const start=progress<.5;
    return {side:(start!==!!reversed?'out':'in'),sign:start?1:-1};
}
function planJunctionTangent({anchorForward,anchorWorldLength,targetWorldLength,
    matrix,knotRotation,handle=false,tangentsInKnotSpace=false,
    progress,reversed=false,dimension=0,mode='g1',orientation='same',before}){
    if(!['g1','c1'].includes(mode)||!['same','opposed'].includes(orientation)||
       !finiteVec(anchorForward)||!finiteVec(before)||
       !Number.isFinite(anchorWorldLength)||anchorWorldLength<=1e-8||
       anchorWorldLength>1e6||!Number.isFinite(targetWorldLength)||
       targetWorldLength<0||targetWorldLength>1e6||
       ![0,1,2].includes(dimension)||typeof handle!=='boolean'||
       typeof tangentsInKnotSpace!=='boolean')
        throw Error('Invalid G1/C1 tangent plan.');
    const {side,sign}=endpointSide(progress,reversed);
    const forwardLength=len(anchorForward);
    if(forwardLength<=1e-8)throw Error('Anchor endpoint tangent is degenerate.');
    const length=mode==='g1'?targetWorldLength:anchorWorldLength;
    if(length<=1e-8)
        throw Error('Target tangent is zero-length; choose C1 or adjust its handle.');
    const worldDirection=orientation==='same'?1:-1;
    const world={x:anchorForward.x/forwardLength*length*sign*worldDirection,
      y:anchorForward.y/forwardLength*length*sign*worldDirection,
      z:anchorForward.z/forwardLength*length*sign*worldDirection};
    const m=matrix.slice();
    m[12]=m[13]=m[14]=0;
    const local=transformFrame(m).toLocal(world);
    if(!finiteVec(local))throw Error('G1/C1 inverse world transform is invalid.');
    const hidden=dimension===1?'z':dimension===2?'y':null;
    if(hidden&&Math.abs(local[hidden])>1e-4)
        throw Error('Anchor forward tangent is outside target 2D spline plane.');
    const result=handle||tangentsInKnotSpace?inverseRotate(knotRotation,local):local;
    if(!finiteVec(result)||len(result)>1e7)
        throw Error('G1/C1 tangent exceeds safe local coordinates.');
    // For 2D, the excluded axis is never used in evaluation. Avoid overwriting
    // authored off-plane values, which would create unexpected Scene changes.
    if(hidden){
        // Transform the valid projected world tangent via same inverse rotation,
        // then retain only the authored serialized hidden-axis component.
        result[hidden]=before[hidden];
    }
    for(const axis of ['x','y','z'])if(Object.is(result[axis],-0))result[axis]=0;
    const changed=['x','y','z'].some(k=>Math.abs(result[k]-before[k])>1e-6);
    return {side,sign,before:{...before},after:result,changed,
        targetWorldLength:length,mode,orientation};
}
module.exports={finiteVec,worldVector,endpointSide,planJunctionTangent};
