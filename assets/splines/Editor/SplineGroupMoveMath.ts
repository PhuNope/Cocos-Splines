/**
 * Pure coordinate constraints for selected Knot group movement.
 * Knot Node positions are authored in SplineContainer LOCAL coordinates.
 * Applying a world-space delta directly breaks XY2D/XZ2D under rotated
 * or non-uniformly scaled parent transforms.
 *
 * No Cocos imports, scene mutation or legacy transform proxies.
 */
export interface SplinePoint3 { x:number; y:number; z:number; }
export type SplinePlaneDimension=0|1|2;

function finite(point:SplinePoint3):boolean {
    return !!point&&[point.x,point.y,point.z].every(Number.isFinite);
}
export function planarMovePositions(
    dimension:SplinePlaneDimension,
    originLocal:SplinePoint3,
    requestedLocal:SplinePoint3,
    initialPositions:readonly SplinePoint3[],
):SplinePoint3[] {
    if(dimension!==1&&dimension!==2)
        throw new Error('Planar Group Move requires XY2D or XZ2D.');
    if(!finite(originLocal)||!finite(requestedLocal)||
       !Array.isArray(initialPositions)||!initialPositions.length||
       initialPositions.some(p=>!finite(p)))
        throw new Error('Planar Group Move requires finite Knot positions.');
    const dx=requestedLocal.x-originLocal.x;
    const dy=dimension===1?requestedLocal.y-originLocal.y:0;
    const dz=dimension===2?requestedLocal.z-originLocal.z:0;
    if(!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(dz))
        throw new Error('Non-finite planar delta.');
    return initialPositions.map(p=>{
        const x=p.x+dx,y=p.y+dy,z=p.z+dz;
        if(![x,y,z].every(Number.isFinite))
            throw new Error('Planar Group Move would produce an invalid Knot position.');
        return {x,y,z};
    });
}
