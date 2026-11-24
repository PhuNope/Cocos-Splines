/**
 * Pure surface-conform placement math; Physics adapter lives in ObjectController.
 * Explicit target slot identity prevents accidental hits against unrelated objects.
 */
import type {PopulationCandidate,PopulationVector} from './SplinePopulationMath';

export interface PopulationSurfaceSettings {
    rayHeight:number;
    rayDepth:number;
    surfaceOffset:number;
    minNormalY:number;
    skipMissing:boolean;
    targetCount:number;
}
export interface PopulationSurfaceHit {
    targetIndex:number;
    distance:number;
    point:PopulationVector;
    normal:PopulationVector;
}
export interface PopulationSurfacePlacement extends PopulationCandidate {
    surfaceNormal:PopulationVector|null;
}
export type PopulationSurfaceRaycast=(origin:PopulationVector,length:number)=>
    ReadonlyArray<PopulationSurfaceHit>;

const finite=(v:number):boolean=>typeof v==='number'&&Number.isFinite(v);
const between=(v:number,a:number,b:number):boolean=>finite(v)&&v>=a&&v<=b;
const vec=(v:PopulationVector):boolean=>!!v&&
    between(v.x,-1e7,1e7)&&between(v.y,-1e7,1e7)&&between(v.z,-1e7,1e7);
function unit(v:PopulationVector):PopulationVector|null{
    if(!vec(v))return null;
    const length=Math.hypot(v.x,v.y,v.z);
    if(length<1e-8)return null;
    return {x:v.x/length,y:v.y/length,z:v.z/length};
}
export function validateSurfaceSettings(settings:PopulationSurfaceSettings):void {
    if(!settings||!between(settings.rayHeight,0,10000)||
       !between(settings.rayDepth,0,10000)||
       settings.rayHeight+settings.rayDepth<=1e-6||
       !between(settings.surfaceOffset,-1000,1000)||
       !between(settings.minNormalY,0,1)||
       typeof settings.skipMissing!=='boolean'||
       !Number.isInteger(settings.targetCount)||settings.targetCount<1||settings.targetCount>64)
        throw Error('Invalid surface projection settings; specify 1–64 target Colliders and a nonzero ray range.');
}
/** Orthogonal basis for a prefab's local X (right), Y (up) and Z (forward).
 * The projected spline forward is preserved in the ground tangent plane.
 */
export function surfaceBasis(normal:PopulationVector,
    forward:PopulationVector):{right:PopulationVector;up:PopulationVector;forward:PopulationVector} {
    const up=unit(normal),direction=unit(forward);
    if(!up||!direction)throw Error('Cannot align a surface with zero normal or spline forward.');
    const dot=up.x*direction.x+up.y*direction.y+up.z*direction.z;
    let z=unit({x:direction.x-up.x*dot,y:direction.y-up.y*dot,z:direction.z-up.z*dot});
    if(!z){
        // Choose the world axis least parallel to Up to avoid NaNs.
        const alt=Math.abs(up.x)<.5?{x:1,y:0,z:0}:{x:0,y:0,z:1};
        const proj=up.x*alt.x+up.y*alt.y+up.z*alt.z;
        z=unit({x:alt.x-up.x*proj,y:alt.y-up.y*proj,z:alt.z-up.z*proj});
    }
    if(!z)throw Error('Cannot construct surface basis.');
    const right=unit({x:up.y*z.z-up.z*z.y,y:up.z*z.x-up.x*z.z,z:up.x*z.y-up.y*z.x});
    if(!right)throw Error('Cannot construct surface right axis.');
    const correctedForward={
        x:right.y*up.z-right.z*up.y,
        y:right.z*up.x-right.x*up.z,
        z:right.x*up.y-right.y*up.x,
    };
    return {right,up,forward:correctedForward};
}
/** Raycast results are copied/normalized by caller and consumed immediately.
 * Rejects invalid hit data, negative/upside-down normals and non-targets.
 * The nearest VALID hit wins, not the first hit returned by the engine.
 */
export function projectSurfaceCandidates(candidates:ReadonlyArray<PopulationCandidate>,
    settings:PopulationSurfaceSettings,raycast:PopulationSurfaceRaycast):PopulationSurfacePlacement[]{
    validateSurfaceSettings(settings);
    if(!Array.isArray(candidates)||candidates.length>2048||typeof raycast!=='function')
        throw Error('Invalid surface candidate list or raycast adapter.');
    // Preflight all input positions before issuing any Physics query.
    let last=-1;
    for(const c of candidates){
        if(!c||!Number.isInteger(c.index)||c.index<=last||c.index>2047||
           !between(c.progress,0,1)||!vec(c.position))
            throw Error('Surface candidates must have ordered indexes and finite World positions.');
        last=c.index;
        if(c.position.y+settings.rayHeight>1e7)
            throw Error('Surface ray origin is outside valid World coordinates.');
    }
    const range=settings.rayHeight+settings.rayDepth;
    const results:PopulationSurfacePlacement[]=[];
    for(const c of candidates){
        const origin={x:c.position.x,y:c.position.y+settings.rayHeight,z:c.position.z};
        const hits=raycast(origin,range);
        if(!Array.isArray(hits)||hits.length>2048)throw Error('Surface Physics raycast returned invalid hit array.');
        let choice:PopulationSurfaceHit|null=null,normal:PopulationVector|null=null;
        for(const hit of hits){
            if(!hit||!Number.isInteger(hit.targetIndex)||hit.targetIndex<0||
               hit.targetIndex>=settings.targetCount||!between(hit.distance,0,range+1e-5)||
               !vec(hit.point))continue;
            const n=unit(hit.normal);
            if(!n||n.y+1e-9<settings.minNormalY)continue;
            if(choice&&hit.distance>=choice.distance)continue;
            choice=hit;normal=n;
        }
        if(!choice||!normal){
            if(!settings.skipMissing)results.push({...c,surfaceNormal:null});
            continue;
        }
        const position={
            x:choice.point.x+normal.x*settings.surfaceOffset,
            y:choice.point.y+normal.y*settings.surfaceOffset,
            z:choice.point.z+normal.z*settings.surfaceOffset,
        };
        if(!vec(position))throw Error('Conformed prefab World position is out of range.');
        results.push({index:c.index,progress:c.progress,position,surfaceNormal:normal});
    }
    return results;
}
