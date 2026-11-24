/** Opt-in WORLD-motion prediction for traffic proximity.
 * Baseline linear velocity remains unchanged; advanced constant acceleration
 * and a conservative angular envelope are separately opt-in.
 * Not a physics solver or a guarantee for unknown future motion.
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

/** Max measured constant acceleration used for bounded relative prediction. */
export const MAX_PREDICTION_ACCELERATION=80; // WORLD units / sec²
export const MAX_PREDICTION_ANGULAR_SPEED=30; // radians / sec
export interface PredictionOptions {
    readonly acceleration?:boolean;
    /** Replace rotating non-spherical narrowphase with its circumscribed sphere.
     * Conservative over the assumed translated center, NOT exact rotation. */
    readonly rotationEnvelope?:boolean;
}
export interface PredictionQuaternion {x:number;y:number;z:number;w:number}
export function validPredictionAcceleration(a:PredictionPoint|null|undefined):
    a is PredictionPoint {
    return !!a&&[a.x,a.y,a.z].every(finite)&&
        Math.hypot(a.x,a.y,a.z)<=MAX_PREDICTION_ACCELERATION;
}
export function validPredictionAngularSpeed(rate:number|null|undefined):rate is number {
    return typeof rate==='number'&&finite(rate)&&rate>=0&&
        rate<=MAX_PREDICTION_ANGULAR_SPEED;
}
/** Measured shortest-path quaternion angle / frame seconds.
 * Negated quaternions represent the same orientation. Reject invalid
 * measurements; no Cocos Engine quaternion API is needed here. */
export function measuredPredictionAngularSpeed(
    before:PredictionQuaternion|null|undefined,
    after:PredictionQuaternion|null|undefined,dt:number,
):number|null{
    if(!before||!after||!finite(dt)||dt<=0)return null;
    const a=[before.x,before.y,before.z,before.w],
        b=[after.x,after.y,after.z,after.w];
    if(!a.every(finite)||!b.every(finite))return null;
    const an=Math.hypot(...a),bn=Math.hypot(...b);
    if(an<=1e-12||bn<=1e-12)return null;
    const cosine=Math.min(1,Math.max(0,Math.abs(
        (a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])/(an*bn))));
    const rate=2*Math.acos(cosine)/dt;
    return validPredictionAngularSpeed(rate)?rate:null;
}
/** Constant-acceleration relative endpoint transform; callers must inflate
 * narrowphase radius by the quadratic chord-deviation bound to avoid
 * missing collisions BETWEEN these linearized endpoints. */
export function relativeAcceleratedPredictionSegment(
    start:PredictionPoint,end:PredictionPoint,
    velocity:PredictionPoint,acceleration:PredictionPoint,
    seconds:number,from:number,to:number,
):{start:PredictionPoint;end:PredictionPoint;maxChordError:number}{
    if(!validPredictionVelocity(velocity)||!validPredictionAcceleration(acceleration)||
       !validPredictionSeconds(seconds)||!finite(from)||!finite(to)||
       from<0||from>to||to>1)
        throw Error('Invalid accelerated proximity prediction.');
    const translate=(p:PredictionPoint,t:number):PredictionPoint=>{
        const time=seconds*t;
        return {x:p.x-velocity.x*time-.5*acceleration.x*time*time,
            y:p.y-velocity.y*time-.5*acceleration.y*time*time,
            z:p.z-velocity.z*time-.5*acceleration.z*time*time};
    };
    const segmentSeconds=seconds*(to-from);
    return {start:translate(start,from),end:translate(end,to),
        maxChordError:Math.hypot(acceleration.x,acceleration.y,acceleration.z)*
            segmentSeconds*segmentSeconds/8};
}
