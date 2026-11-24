/** Constant-velocity WORLD motion estimate for opt-in traffic proximity.
 * Prediction only translates an occupied shape; it does not rotate it,
 * accelerate it, account for traffic rules or replace a physics solver.
 */
export interface PredictionPoint {x:number;y:number;z:number}
const finite=(n:number)=>Number.isFinite(n);
export const MAX_PREDICTION_SPEED=100; // world units/sec
export const MAX_PREDICTION_SECONDS=1;
export function validPredictionVelocity(v:PredictionPoint|null|undefined):
    v is PredictionPoint{
    return !!v&&[v.x,v.y,v.z].every(finite)&&
        Math.hypot(v.x,v.y,v.z)<=MAX_PREDICTION_SPEED;
}
export function validPredictionSeconds(seconds:number):boolean{
    return finite(seconds)&&seconds>=0&&seconds<=MAX_PREDICTION_SECONDS;
}
export function predictionMagnitude(v:PredictionPoint|null|undefined):number{
    return v?Math.hypot(v.x,v.y,v.z):0;
}
/** Evaluate a moving query segment relative to a linearly translating
 * obstacle. From/to are normalized time fractions in [0,1].
 * This reduction works for spheres, AABBs, OBBs, capsules and static BVH
 * geometry without copying or rebuilding the obstacle each query.
 */
export function relativePredictionSegment(
    start:PredictionPoint,end:PredictionPoint,velocity:PredictionPoint,
    seconds:number,from:number,to:number,
):{start:PredictionPoint;end:PredictionPoint}{
    if(!validPredictionVelocity(velocity)||!validPredictionSeconds(seconds)||
       !finite(from)||!finite(to)||from<0||from>to||to>1)
        throw Error('Invalid moving proximity prediction.');
    const translate=(p:PredictionPoint,t:number):PredictionPoint=>({
        x:p.x-velocity.x*seconds*t,y:p.y-velocity.y*seconds*t,
        z:p.z-velocity.z*seconds*t,
    });
    return {start:translate(start,from),end:translate(end,to)};
}
