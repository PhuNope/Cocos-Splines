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
