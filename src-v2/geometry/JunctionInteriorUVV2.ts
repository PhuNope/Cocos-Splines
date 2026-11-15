import {type Vec2MeshV2} from './MeshData';

/**
 * A bounded, deterministic Laplacian smooth of ONE interior UV ring.
 * This is purely a UV *presentation* option, not a topology repair:
 * - the source Road end-ring is never modified;
 * - origin stays unchanged;
 * - indexed triangulation and UV2 are unaffected;
 * - projected/world UV or profiled roads are intentionally not handled here.
 *
 * Lambda in [0,.5] is a stable single diffusion step on the circular ring.
 * It reduces rapid angular changes in UV stretching without claiming that
 * conflicting Road UV directions can be made globally distortion-free.
 */
export function smoothJunctionInteriorUVRingV2(
    boundary:ReadonlyArray<Vec2MeshV2>,
    origin:Vec2MeshV2,
    radius:number,
    smoothing:number
):ReadonlyArray<Vec2MeshV2> {
    if(boundary.length<9||boundary.length>96||
        !Number.isFinite(origin.x)||!Number.isFinite(origin.y)||
        !Number.isFinite(radius)||radius<=0||radius>=1||
        !Number.isFinite(smoothing)||smoothing<0||smoothing>.5)
        throw new Error('Invalid Junction interior UV smoothing parameters');
    const base=boundary.map((uv,i)=>{
        if(!uv||!Number.isFinite(uv.x)||!Number.isFinite(uv.y))
            throw new Error('Invalid Road boundary UV at vertex '+i);
        return {
            x:origin.x+(uv.x-origin.x)*radius,
            y:origin.y+(uv.y-origin.y)*radius
        };
    });
    if(smoothing===0)return base;
    const n=base.length;
    return base.map((uv,i)=>{
        const previous=base[(i+n-1)%n],next=base[(i+1)%n];
        const x=uv.x+smoothing*(.5*(previous.x+next.x)-uv.x);
        const y=uv.y+smoothing*(.5*(previous.y+next.y)-uv.y);
        if(!Number.isFinite(x)||!Number.isFinite(y))
            throw new Error('Junction interior UV smoothing overflow');
        return {x,y};
    });
}
