/** Pure swept sphere vs world-axis-aligned Collider AABB narrowphase.
 * Conservative against actual rotated collider/mesh shapes: the engine AABB
 * encloses them. Computes exact first sphere-AABB contact along LINE SEGMENT,
 * including rounded corners, rather than sweeping an expanded sharp-corner box.
 */
export interface ProximityVec3 {x:number;y:number;z:number}
export interface ProximityAabb {min:ProximityVec3;max:ProximityVec3}
const finite=(n:number)=>Number.isFinite(n);
export function validProximityAabb(b:ProximityAabb|null|undefined):b is ProximityAabb {
    if(!b?.min||!b?.max)return false;
    for(const axis of ['x','y','z'] as const)
        if(!finite(b.min[axis])||!finite(b.max[axis])||
           b.min[axis]>b.max[axis])return false;
    return true;
}
export function aabbFromCenterHalfExtents(
    center:ProximityVec3,half:ProximityVec3,
):ProximityAabb|null {
    if(!center||!half||!['x','y','z'].every(k=>{
        const key=k as keyof ProximityVec3;
        return finite(center[key])&&finite(half[key])&&half[key]>=0;
    }))return null;
    const min={x:center.x-half.x,y:center.y-half.y,z:center.z-half.z};
    const max={x:center.x+half.x,y:center.y+half.y,z:center.z+half.z};
    const bounds={min,max};
    return validProximityAabb(bounds)?bounds:null;
}
function distanceSquared(p:ProximityVec3,b:ProximityAabb):number{
    let result=0;
    for(const axis of ['x','y','z'] as const){
        const delta=p[axis]<b.min[axis]?p[axis]-b.min[axis]:
            p[axis]>b.max[axis]?p[axis]-b.max[axis]:0;
        result+=delta*delta;
    }
    return result;
}
/** First contact t in [0,1], or null. Piecewise quadratic distance to AABB:
 * split the interval at every crossing of a slab plane, then minimize the
 * quadratic on each interval and bisect its FIRST crossing. 8 breakpoints max.
 */
export function sweptSphereAabbEntry(
    start:ProximityVec3,end:ProximityVec3,b:ProximityAabb,radius:number,
):number|null {
    if(!start||!end||!['x','y','z'].every(k=>{
        const a=k as keyof ProximityVec3;
        return finite(start[a])&&finite(end[a]);
    })||!validProximityAabb(b)||!finite(radius)||radius<=0||radius>200)
        throw Error('Invalid swept sphere/AABB query.');
    const delta={x:end.x-start.x,y:end.y-start.y,z:end.z-start.z};
    const r2=radius*radius,at=(t:number):ProximityVec3=>({
        x:start.x+delta.x*t,y:start.y+delta.y*t,z:start.z+delta.z*t,
    });
    const f=(t:number)=>distanceSquared(at(t),b)-r2;
    if(f(0)<=1e-12)return 0;
    const cuts=[0,1];
    for(const axis of ['x','y','z'] as const){
        const d=delta[axis];
        if(Math.abs(d)<=1e-14)continue;
        for(const plane of [b.min[axis],b.max[axis]]){
            const t=(plane-start[axis])/d;
            if(t>0&&t<1)cuts.push(t);
        }
    }
    cuts.sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){
        const lo=cuts[i-1],hi=cuts[i];
        if(hi-lo<1e-14)continue;
        if(f(lo)<=1e-12)return lo;
        const middle=(lo+hi)/2;
        let quadratic=0,linear=0;
        for(const axis of ['x','y','z'] as const){
            const test=start[axis]+delta[axis]*middle;
            const wall=test<b.min[axis]?b.min[axis]:
                test>b.max[axis]?b.max[axis]:null;
            if(wall===null)continue;
            const diff=start[axis]-wall;
            quadratic+=delta[axis]*delta[axis];
            linear+=2*diff*delta[axis];
        }
        const min=quadratic>1e-18?
            Math.max(lo,Math.min(hi,-linear/(2*quadratic))):lo;
        if(f(min)>1e-12)continue;
        let left=lo,right=min;
        for(let pass=0;pass<48;pass++){
            const mid=(left+right)/2;
            if(f(mid)<=0)right=mid;else left=mid;
        }
        return right;
    }
    return null;
}

/** Explicit WORLD OBB. Axes must form an orthonormal basis; no shear or scale.
 * Half extents are world distances along those axes. */
export interface ProximityObb {
    center:ProximityVec3;
    half:ProximityVec3;
    axes:readonly [ProximityVec3,ProximityVec3,ProximityVec3];
}
const validVector=(v:ProximityVec3)=>!!v&&finite(v.x)&&finite(v.y)&&finite(v.z);
const dot=(a:ProximityVec3,b:ProximityVec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
export function validProximityObb(box:ProximityObb|null|undefined):box is ProximityObb {
    if(!box||!validVector(box.center)||!validVector(box.half)||
       box.half.x<0||box.half.y<0||box.half.z<0||
       !Array.isArray(box.axes)||box.axes.length!==3||
       !box.axes.every(validVector))return false;
    const [x,y,z]=box.axes;
    const epsilon=1e-8;
    return [x,y,z].every(a=>Math.abs(dot(a,a)-1)<=epsilon)&&
        Math.abs(dot(x,y))<=epsilon&&Math.abs(dot(x,z))<=epsilon&&
        Math.abs(dot(y,z))<=epsilon;
}
export function copyProximityObb(box:ProximityObb):ProximityObb {
    return {center:{...box.center},half:{...box.half},
        axes:[{...box.axes[0]},{...box.axes[1]},{...box.axes[2]}]};
}
/** First contact of a moving sphere with a stationary explicit OBB.
 * Transform endpoints to the box basis and reuse the rounded AABB sweep.
 * Exact for an orthonormal box and a linear segment, within numeric tolerance. */
export function sweptSphereObbEntry(start:ProximityVec3,end:ProximityVec3,
    box:ProximityObb,radius:number):number|null {
    if(!validProximityObb(box)||!validVector(start)||!validVector(end))
        throw Error('Invalid swept sphere/OBB query.');
    const local=(p:ProximityVec3):ProximityVec3=>{
        const d={x:p.x-box.center.x,y:p.y-box.center.y,z:p.z-box.center.z};
        return {x:dot(d,box.axes[0]),y:dot(d,box.axes[1]),z:dot(d,box.axes[2])};
    };
    const h=box.half;
    return sweptSphereAabbEntry(local(start),local(end),
        {min:{x:-h.x,y:-h.y,z:-h.z},max:{...h}},radius);
}

/** World capsule: the segment between the centers of the two hemispheres,
 * plus a constant world radius. Coincident endpoints represent a sphere. */
export interface ProximityCapsule {
    a:ProximityVec3;b:ProximityVec3;radius:number;
}
export function validProximityCapsule(c:ProximityCapsule|null|undefined):c is ProximityCapsule {
    return !!c&&validVector(c.a)&&validVector(c.b)&&finite(c.radius)&&
        c.radius>0&&c.radius<=100&&finite(Math.hypot(c.b.x-c.a.x,c.b.y-c.a.y,c.b.z-c.a.z));
}
export function copyProximityCapsule(c:ProximityCapsule):ProximityCapsule {
    return {a:{...c.a},b:{...c.b},radius:c.radius};
}
const subtract=(a:ProximityVec3,b:ProximityVec3):ProximityVec3=>
    ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const times=(a:ProximityVec3,s:number):ProximityVec3=>({x:a.x*s,y:a.y*s,z:a.z*s});
/** First contact along one linear segment against a stationary capsule.
 * Inflate the capsule by the moving sphere radius. Split the sweep at the
 * two planes through its end centers: squared distance is quadratic within
 * each cap/cylinder region. Bounded minimization and bisection include grazing
 * contacts, axial/parallel motion and a zero-length capsule. */
export function sweptSphereCapsuleEntry(start:ProximityVec3,end:ProximityVec3,
    capsule:ProximityCapsule,radius:number):number|null {
    if(!validVector(start)||!validVector(end)||!validProximityCapsule(capsule)||
       !finite(radius)||radius<=0||radius>200)throw Error('Invalid swept sphere/capsule query.');
    const axis=subtract(capsule.b,capsule.a);
    const length=Math.hypot(axis.x,axis.y,axis.z);
    const u=length>0?times(axis,1/length):{x:0,y:0,z:0};
    const offset=subtract(start,capsule.a),velocity=subtract(end,start);
    const s=dot(offset,u),v=dot(velocity,u);
    const combined=radius+capsule.radius,r2=combined*combined;
    const eps=1e-12*Math.max(1,r2);
    const cuts=[0,1];
    if(length>0&&v!==0){
        for(const plane of [0,length]){
            const t=(plane-s)/v;
            if(t>0&&t<1)cuts.push(t);
        }
    }
    cuts.sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){
        const lo=cuts[i-1],hi=cuts[i];
        const axial=s+v*((lo+hi)/2);
        let q=offset,w=velocity;
        if(length>0&&axial>=length)q=subtract(offset,axis);
        else if(length>0&&axial>0){
            q=subtract(offset,times(u,s));
            w=subtract(velocity,times(u,v));
        }
        const f=(t:number)=>{
            const x=q.x+w.x*t,y=q.y+w.y*t,z=q.z+w.z*t;
            return x*x+y*y+z*z-r2;
        };
        if(f(lo)<=eps)return lo;
        const speed2=dot(w,w);
        const min=speed2>0?Math.max(lo,Math.min(hi,-dot(q,w)/speed2)):lo;
        if(f(min)>eps)continue;
        let left=lo,right=min;
        for(let pass=0;pass<48;pass++){
            const mid=(left+right)/2;
            if(f(mid)<=eps)right=mid;else left=mid;
        }
        return right;
    }
    return null;
}
