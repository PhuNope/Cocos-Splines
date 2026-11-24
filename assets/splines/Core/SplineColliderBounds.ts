import {validProximityObb,validProximityCapsule,type ProximityObb,type ProximityCapsule} from './SplineProximityShapes';
/** Engine-agnostic adapter for Cocos Creator 3.8 3D Collider.worldBounds.
 * Converts an axis-aligned WORLD bounding box into a conservative sphere
 * centered at the follower TARGET (not the possibly offset Collider center).
 * Does not activate physics, perform rigid-body queries, or alter Colliders.
 */
export interface ColliderBoundsPoint {x:number;y:number;z:number}
export interface ColliderWorldBounds {
    center:ColliderBoundsPoint;
    halfExtents:ColliderBoundsPoint;
}
export interface ColliderRadiusResult {
    radius:number;
    valid:boolean;
    source:'collider'|'fallback';
}
const finite=(x:number)=>Number.isFinite(x);
export function colliderProximityRadius(
    bounds:ColliderWorldBounds|null|undefined,
    targetPosition:ColliderBoundsPoint|null|undefined,
    fallbackRadius:number,
):ColliderRadiusResult {
    if(!finite(fallbackRadius)||fallbackRadius<=0||fallbackRadius>100)
        throw Error('Invalid manual proximity radius.');
    if(!bounds||!targetPosition)return {radius:fallbackRadius,valid:false,source:'fallback'};
    const c=bounds.center,e=bounds.halfExtents,p=targetPosition;
    if(!c||!e||![c.x,c.y,c.z,e.x,e.y,e.z,p.x,p.y,p.z].every(finite)||
       e.x<0||e.y<0||e.z<0)
        return {radius:fallbackRadius,valid:false,source:'fallback'};
    const extentRadius=Math.hypot(e.x,e.y,e.z);
    const offset=Math.hypot(c.x-p.x,c.y-p.y,c.z-p.z);
    const result=extentRadius+offset;
    if(!finite(result)||result<=1e-6||result>100)
        return {radius:fallbackRadius,valid:false,source:'fallback'};
    return {radius:result,valid:true,source:'collider'};
}

/** Column-major affine world transform; independent of cc. */
export interface ColliderBoxMatrix {
    m00:number;m01:number;m02:number;m04:number;m05:number;m06:number;
    m08:number;m09:number;m10:number;m12:number;m13:number;m14:number;
}
/** Preview world box adapter. Reject shear, singular/reflected transforms
 * and backend bounds mismatches. Agreement is a sanity check, not proof of
 * native shape fidelity. Callers retain the AABB fallback. */
export function colliderWorldObb(center:ColliderBoundsPoint,size:ColliderBoundsPoint,
    m:ColliderBoxMatrix,bounds:ColliderWorldBounds):ProximityObb|null {
    const point=(p:ColliderBoundsPoint)=>!!p&&[p.x,p.y,p.z].every(finite);
    if(!point(center)||!point(size)||!m||!bounds||!point(bounds.center)||
       !point(bounds.halfExtents)||[size.x,size.y,size.z].some(v=>v<=0)||
       [bounds.halfExtents.x,bounds.halfExtents.y,bounds.halfExtents.z].some(v=>v<0))return null;
    const columns=[{x:m.m00,y:m.m01,z:m.m02},{x:m.m04,y:m.m05,z:m.m06},
        {x:m.m08,y:m.m09,z:m.m10}];
    if(!columns.every(point)||![m.m12,m.m13,m.m14].every(finite))return null;
    const scale=columns.map(v=>Math.hypot(v.x,v.y,v.z));
    if(scale.some(v=>!finite(v)||v<=1e-8))return null;
    const axes=columns.map((v,i)=>({x:v.x/scale[i],y:v.y/scale[i],z:v.z/scale[i]})) as
        [ColliderBoundsPoint,ColliderBoundsPoint,ColliderBoundsPoint];
    const [a,b,c]=axes;
    const det=a.x*(b.y*c.z-b.z*c.y)-a.y*(b.x*c.z-b.z*c.x)+a.z*(b.x*c.y-b.y*c.x);
    if(Math.abs(det-1)>1e-8)return null;
    const box:ProximityObb={axes,center:{
        x:m.m12+m.m00*center.x+m.m04*center.y+m.m08*center.z,
        y:m.m13+m.m01*center.x+m.m05*center.y+m.m09*center.z,
        z:m.m14+m.m02*center.x+m.m06*center.y+m.m10*center.z,
    },half:{x:size.x*scale[0]/2,y:size.y*scale[1]/2,z:size.z*scale[2]/2}};
    if(!validProximityObb(box))return null;
    const h=box.half;
    if(Math.hypot(h.x,h.y,h.z)*(1+1e-7)>100)return null;
    for(const k of ['x','y','z'] as const){
        const extent=Math.abs(a[k])*h.x+Math.abs(b[k])*h.y+Math.abs(c[k])*h.z;
        const tolerance=1e-5+1e-4*Math.max(extent,bounds.halfExtents[k]);
        if(!finite(extent)||Math.abs(box.center[k]-bounds.center[k])>tolerance||
           Math.abs(extent-bounds.halfExtents[k])>tolerance)return null;
    }
    return box;
}

/** Convert a local CapsuleCollider to a world capsule only for positive,
 * uniform, orthogonal transforms. Nonuniform scaling is backend-dependent.
 * Compare derived world AABB against engine bounds before opting in. */
export function colliderWorldCapsule(center:ColliderBoundsPoint,radius:number,
    cylinderHeight:number,direction:number,m:ColliderBoxMatrix,
    bounds:ColliderWorldBounds):ProximityCapsule|null {
    if(!center||!m||!bounds?.center||!bounds.halfExtents||
       ![center.x,center.y,center.z,radius,cylinderHeight,
         bounds.center.x,bounds.center.y,bounds.center.z,
         bounds.halfExtents.x,bounds.halfExtents.y,bounds.halfExtents.z].every(finite)||
       radius<=0||cylinderHeight<0||![0,1,2].includes(direction)||
       [bounds.halfExtents.x,bounds.halfExtents.y,bounds.halfExtents.z].some(v=>v<0))return null;
    const columns=[{x:m.m00,y:m.m01,z:m.m02},{x:m.m04,y:m.m05,z:m.m06},
        {x:m.m08,y:m.m09,z:m.m10}];
    if(!columns.every(v=>[v.x,v.y,v.z].every(finite))||
       ![m.m12,m.m13,m.m14].every(finite))return null;
    const scales=columns.map(v=>Math.hypot(v.x,v.y,v.z));
    const scale=Math.max(...scales);
    if(!finite(scale)||scale<=1e-8||scales.some(v=>v<=1e-8||
       Math.abs(v-scale)>scale*1e-8))return null;
    const axes=columns.map((v,i)=>({x:v.x/scales[i],y:v.y/scales[i],z:v.z/scales[i]})) as
        [ColliderBoundsPoint,ColliderBoundsPoint,ColliderBoundsPoint];
    const [x,y,z]=axes;
    const det=x.x*(y.y*z.z-y.z*z.y)-x.y*(y.x*z.z-y.z*z.x)+x.z*(y.x*z.y-y.y*z.x);
    const c={x:m.m12+m.m00*center.x+m.m04*center.y+m.m08*center.z,
        y:m.m13+m.m01*center.x+m.m05*center.y+m.m09*center.z,
        z:m.m14+m.m02*center.x+m.m06*center.y+m.m10*center.z};
    if(Math.abs(det-1)>1e-8||!validProximityObb({center:c,axes,half:{x:0,y:0,z:0}}))return null;
    const u=axes[direction],h=cylinderHeight*scale/2,r=radius*scale;
    if(!finite(h+r)||h+r>100)return null;
    const result={a:{x:c.x-u.x*h,y:c.y-u.y*h,z:c.z-u.z*h},
        b:{x:c.x+u.x*h,y:c.y+u.y*h,z:c.z+u.z*h},radius:r};
    if(!validProximityCapsule(result))return null;
    for(const k of ['x','y','z'] as const){
        const extent=Math.abs(u[k])*h+r;
        const tolerance=1e-5+1e-4*Math.max(extent,bounds.halfExtents[k]);
        if(Math.abs(c[k]-bounds.center[k])>tolerance||
           Math.abs(extent-bounds.halfExtents[k])>tolerance)return null;
    }
    return result;
}
