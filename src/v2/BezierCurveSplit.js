'use strict';
/**
 * Original geometry-only De Casteljau Bézier split (Cocos plugin code).
 * Caller commits complete Knot records through one native property write.
 * All Vec3 positions/handles are Path-local and are never mutated here.
 */
const finite=p=>p&&typeof p==='object'&&
    ['x','y','z'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]));
const point=p=>({x:p.x,y:p.y,z:p.z});
const plus=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const minus=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const scale=(a,s)=>({x:a.x*s,y:a.y*s,z:a.z*s});
const mix=(a,b,t)=>plus(scale(a,1-t),scale(b,t));
function splitBezierCurve(a,b,handleOut,handleIn,t=.5){
    if(![a,b,handleOut,handleIn].every(finite))
        throw new Error('Cannot split a Bezier segment with invalid Vec3 handles');
    if(!Number.isFinite(t)||t<=0||t>=1)
        throw new Error('Split parameter must be strictly between 0 and 1');
    // Old control polygon: A, A + Out, B + In, B.
    const p0=point(a),p3=point(b),p1=plus(a,handleOut),p2=plus(b,handleIn);
    const a0=mix(p0,p1,t),a1=mix(p1,p2,t),a2=mix(p2,p3,t);
    const b0=mix(a0,a1,t),b1=mix(a1,a2,t);
    const centre=mix(b0,b1,t);
    const result={
        startHandleOut:minus(a0,p0),
        endHandleIn:minus(a2,p3),
        position:centre,
        handleIn:minus(b0,centre),
        handleOut:minus(b1,centre)
    };
    if(!Object.values(result).every(finite))
        throw new Error('Split Bezier control points overflow');
    return result;
}
module.exports={splitBezierCurve};
