/** World-space closest point search for an arbitrary continuous spline sampler.
 * Refinement is done against world positions, so it stays correct under non-uniform scale.
 * Pure TypeScript: no engine or editor dependencies.
 */
export interface ProjectionVector {x:number;y:number;z:number}
export interface ProjectionResult {t:number;squaredDistance:number}
const clamp01=(x:number)=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
export function closestParameter(
    sample:(t:number)=>ProjectionVector,
    point:ProjectionVector,
    steps=128,
):ProjectionResult {
    const divisions=Math.max(8,Math.min(4096,Math.floor(Number.isFinite(steps)?steps:128)));
    const dist=(t:number):number=>{
        const p=sample(clamp01(t));
        const dx=p.x-point.x,dy=p.y-point.y,dz=p.z-point.z;
        const d=dx*dx+dy*dy+dz*dz;
        return Number.isFinite(d)?d:Number.POSITIVE_INFINITY;
    };
    const scored:{t:number,d:number}[]=[];
    for(let i=0;i<=divisions;i++){
        const t=i/divisions;scored.push({t,d:dist(t)});
    }
    const selected=scored.slice().sort((a,b)=>a.d-b.d).slice(0,Math.min(12,scored.length));
    let best:ProjectionResult={t:0,squaredDistance:scored[0].d};
    for(const guess of selected){
        // Global candidate search + golden section refinement of nearby intervals.
        let a=Math.max(0,guess.t-1/divisions),b=Math.min(1,guess.t+1/divisions);
        for(let j=0;j<24;j++){
            const c=b-(b-a)*0.6180339887498949,d=a+(b-a)*0.6180339887498949;
            if(dist(c)<=dist(d))b=d;else a=c;
        }
        for(const t of [guess.t,a,b,(a+b)*.5]){
            const ds=dist(t);
            if(ds<best.squaredDistance)best={t:clamp01(t),squaredDistance:ds};
        }
    }
    return best;
}
