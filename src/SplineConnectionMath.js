'use strict';
/**
 * Pure geometry diagnostics/planning for SplineJunction connections.
 * No Cocos runtime state or Editor writes. Positions and tangents are WORLD.
 */
const {transformFrame}=require('./SplineKnotEditMath');
const vec=v=>v&&['x','y','z'].every(a=>typeof v[a]==='number'&&Number.isFinite(v[a]));
const magnitude=v=>Math.hypot(v.x,v.y,v.z);
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
function worldTangent(local,matrix){
    if(!vec(local)||!Array.isArray(matrix)||matrix.length!==16||matrix.some(n=>!Number.isFinite(n)))
        throw Error('Invalid connector tangent or world matrix.');
    const p={x:matrix[0]*local.x+matrix[4]*local.y+matrix[8]*local.z,
        y:matrix[1]*local.x+matrix[5]*local.y+matrix[9]*local.z,
        z:matrix[2]*local.x+matrix[6]*local.y+matrix[10]*local.z};
    if(!vec(p))throw Error('Invalid world tangent.');
    const len=magnitude(p);
    return len>1e-9?{x:p.x/len,y:p.y/len,z:p.z/len}:null;
}
function analyzeConnections(samples,positionTolerance=.1,angleTolerance=15){
    if(!Array.isArray(samples)||samples.length<2||samples.length>64||
        !Number.isFinite(positionTolerance)||positionTolerance<0||positionTolerance>1e6||
        !Number.isFinite(angleTolerance)||angleTolerance<0||angleTolerance>90)
        throw Error('Connector diagnostics requires 2–64 links and valid tolerances.');
    const ids=new Set();
    for(const s of samples){
        if(!s||!Number.isInteger(s.index)||s.index<0||ids.has(s.index)||
           !vec(s.position)||(s.tangent!==null&&s.tangent!==undefined&&!vec(s.tangent)))
            throw Error('Invalid or duplicate Junction link sample.');
        ids.add(s.index);
    }
    const pairs=[];
    for(let i=0;i<samples.length;i++){
        for(let j=i+1;j<samples.length;j++){
            const a=samples[i],b=samples[j],gap=magnitude(sub(a.position,b.position));
            const an=a.tangent&&magnitude(a.tangent)>1e-9;
            const bn=b.tangent&&magnitude(b.tangent)>1e-9;
            const cosine=an&&bn?Math.max(-1,Math.min(1,dot(a.tangent,b.tangent)/
                (magnitude(a.tangent)*magnitude(b.tangent)))):null;
            // Axis angle ignores sign because exitDirection can reverse travel.
            // "same/opposed" is included so users can verify travel continuity.
            const angle=cosine===null?null:Math.acos(Math.abs(cosine))*180/Math.PI;
            pairs.push({from:a.index,to:b.index,gap,axisAngleDeg:angle,
                orientation:cosine===null?'unknown':cosine>=0?'same':'opposed',
                positionOK:gap<=positionTolerance,
                tangentOK:angle!==null&&angle<=angleTolerance});
        }
    }
    return {pairCount:pairs.length,positionTolerance,angleTolerance,
        maxGap:Math.max(...pairs.map(p=>p.gap)),
        maxAxisAngleDeg:pairs.some(p=>p.axisAngleDeg===null)?null:
            Math.max(...pairs.map(p=>p.axisAngleDeg)),
        positionFailures:pairs.filter(p=>!p.positionOK).length,
        tangentFailures:pairs.filter(p=>!p.tangentOK).length,
        pairs};
}
function planEndpointSnap({anchorWorld,targetLocal,worldMatrix,progress,closed,dimension}){
    if(!vec(anchorWorld)||!vec(targetLocal)||!Number.isFinite(progress)||
       progress<0||progress>1||closed!==false||![0,1,2].includes(dimension))
        throw Error('Invalid connector endpoint snap inputs.');
    if(Math.min(progress,1-progress)>1e-8)
        throw Error('Snap is available only for exact start/end link on an open spline.');
    const frame=transformFrame(worldMatrix),local=frame.toLocal(anchorWorld);
    if(!vec(local))throw Error('Connector snap produced an invalid target.');
    // XY/XZ runtime dimensions project the unused local axis to zero.
    // Reject an off-plane anchor rather than silently moving onto a wrong plane.
    const hidden=dimension===1?'z':dimension===2?'y':null;
    if(hidden&&Math.abs(local[hidden])>1e-4)
        throw Error('Junction anchor is outside target spline 2D plane.');
    const after={...local};
    if(hidden)after[hidden]=targetLocal[hidden];
    if(['x','y','z'].some(k=>Math.abs(after[k])>1e7))
        throw Error('Connector snap exceeds safe local coordinate range.');
    return {before:{...targetLocal},after,changed:
        ['x','y','z'].some(k=>Math.abs(after[k]-targetLocal[k])>1e-6)};
}
module.exports={vec,worldTangent,analyzeConnections,planEndpointSnap};
