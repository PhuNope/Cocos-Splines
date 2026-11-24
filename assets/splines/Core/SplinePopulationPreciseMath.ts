/**
 * Opt-in shape-aware population placement: sphere(center, footprint+clearance)
 * against stationary BoxCollider OBB / CapsuleCollider capsule with AABB fallback.
 * Pure world-space geometry; never touches Physics or scene Nodes.
 */
import type {PopulationCandidate,PopulationVector} from './SplinePopulationMath';
import type {PopulationWorldAabb} from './SplinePopulationPlacementMath';
import {validProximityObb,validProximityCapsule,
    type ProximityObb,type ProximityCapsule} from './SplineProximityShapes';
import {sphereMeshContact,type ProximityTriangleMesh} from './SplineProximityMesh';

export type PopulationObstacleShape =
    {kind:'aabb';bounds:PopulationWorldAabb} |
    {kind:'obb';box:ProximityObb} |
    {kind:'capsule';capsule:ProximityCapsule} |
    {kind:'mesh';mesh:ProximityTriangleMesh};

const finite=(n:number):boolean=>typeof n==='number'&&Number.isFinite(n);
const point=(p:PopulationVector):boolean=>!!p&&
    finite(p.x)&&finite(p.y)&&finite(p.z)&&
    [p.x,p.y,p.z].every(n=>Math.abs(n)<=1e7);
const dot=(a:PopulationVector,b:PopulationVector):number=>a.x*b.x+a.y*b.y+a.z*b.z;
function squaredToAabb(p:PopulationVector,b:PopulationWorldAabb):number{
    const dx=Math.max(0,Math.abs(p.x-b.center.x)-b.halfExtents.x);
    const dy=Math.max(0,Math.abs(p.y-b.center.y)-b.halfExtents.y);
    const dz=Math.max(0,Math.abs(p.z-b.center.z)-b.halfExtents.z);
    return dx*dx+dy*dy+dz*dz;
}
function squaredToObb(p:PopulationVector,b:ProximityObb):number{
    const d={x:p.x-b.center.x,y:p.y-b.center.y,z:p.z-b.center.z};
    const x=Math.max(0,Math.abs(dot(d,b.axes[0]))-b.half.x);
    const y=Math.max(0,Math.abs(dot(d,b.axes[1]))-b.half.y);
    const z=Math.max(0,Math.abs(dot(d,b.axes[2]))-b.half.z);
    return x*x+y*y+z*z;
}
function squaredToCapsule(p:PopulationVector,c:ProximityCapsule):number{
    const ax=c.b.x-c.a.x,ay=c.b.y-c.a.y,az=c.b.z-c.a.z;
    const len2=ax*ax+ay*ay+az*az;
    const px=p.x-c.a.x,py=p.y-c.a.y,pz=p.z-c.a.z;
    const t=len2>1e-14?Math.max(0,Math.min(1,(px*ax+py*ay+pz*az)/len2)):0;
    const dx=px-ax*t,dy=py-ay*t,dz=pz-az*t;
    return dx*dx+dy*dy+dz*dz;
}
function validateObstacle(shape:PopulationObstacleShape):void{
    if(!shape)throw Error('Population obstacle shape is missing.');
    if(shape.kind==='aabb'){
        const b=shape.bounds;
        if(!b||!point(b.center)||!point(b.halfExtents)||
           b.halfExtents.x<0||b.halfExtents.y<0||b.halfExtents.z<0)
            throw Error('Population AABB has invalid World bounds.');
    }else if(shape.kind==='obb'){
        if(!validProximityObb(shape.box)||!point(shape.box.center)||
           !point(shape.box.half))
            throw Error('Population OBB must have a valid finite orthonormal basis.');
    }else if(shape.kind==='capsule'){
        if(!validProximityCapsule(shape.capsule)||!point(shape.capsule.a)||
           !point(shape.capsule.b))
            throw Error('Population Capsule has invalid World geometry.');
    }else if(shape.kind==='mesh'){
        if(!shape.mesh?.root||!Number.isInteger(shape.mesh.triangleCount)||
           shape.mesh.triangleCount<1||shape.mesh.triangleCount>16384)
            throw Error('Population Mesh BVH has invalid geometry.');
    }else throw Error('Unsupported population obstacle shape.');
}
/** Clearance is additional space around a candidate footprint sphere.
 * At radius 0, a center inside/touching an obstacle still gets rejected.
 * Reject input entirely before returning any filtered result.
 */
export function filterPopulationShapeCandidates(
    candidates:ReadonlyArray<PopulationCandidate>,
    obstacles:ReadonlyArray<PopulationObstacleShape>,
    clearance:number,footprintRadius:number,
):PopulationCandidate[]{
    if(!Array.isArray(candidates)||candidates.length>2048||
       !Array.isArray(obstacles)||obstacles.length>64||
       !finite(clearance)||clearance<0||clearance>10000||
       !finite(footprintRadius)||footprintRadius<0||footprintRadius>100)
        throw Error('Population precise obstacle/footprint limits exceeded.');
    for(const obstacle of obstacles)validateObstacle(obstacle);
    let previous=-1;
    for(const c of candidates){
        if(!c||!Number.isSafeInteger(c.index)||c.index<=previous||c.index>2047||
           !finite(c.progress)||c.progress<0||c.progress>1||!point(c.position))
            throw Error('Population precise candidates must have finite ordered positions.');
        previous=c.index;
    }
    const r=clearance+footprintRadius,r2=r*r;
    return candidates.filter(c=>!obstacles.some(obstacle=>{
        if(obstacle.kind==='aabb')return squaredToAabb(c.position,obstacle.bounds)<=r2;
        if(obstacle.kind==='obb')return squaredToObb(c.position,obstacle.box)<=r2;
        if(obstacle.kind==='mesh')return sphereMeshContact(c.position,obstacle.mesh,r);
        const capsule=obstacle.capsule;
        const radius=capsule.radius+r;
        return squaredToCapsule(c.position,capsule)<=radius*radius;
    }));
}
