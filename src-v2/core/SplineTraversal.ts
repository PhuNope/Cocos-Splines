/**
 * Deterministic distance-based playback, independent of engine Update loops.
 * Dreamteck Follower and Curvy SplineController expose useful Speed/Time and
 * Clamp/Loop/PingPong behaviors; this is an original small pure implementation.
 */
export type SplineWrapModeV2='clamp'|'loop'|'pingpong';
export interface SplineTraversalStateV2 {
    readonly distance:number;
    /** 1 or -1; used by PingPong reflection, independently of playback speed. */
    readonly direction:1|-1;
}
export interface SplineTraversalResultV2 extends SplineTraversalStateV2 {
    readonly reachedStart:boolean;
    readonly reachedEnd:boolean;
}
const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,v));
const modulo=(x:number,d:number)=>((x%d)+d)%d;
/** Supports arbitrarily large deltaDistance and handles multiple bounces
 * without while loops; does not emit events (consumer owns notifications).
 */
export function advanceSplineDistanceV2(
    length:number,state:SplineTraversalStateV2,deltaDistance:number,
    mode:SplineWrapModeV2
):SplineTraversalResultV2 {
    if(!Number.isFinite(length)||length<0)
        throw new Error('Spline length must be finite and non-negative');
    if(!Number.isFinite(state.distance)||
       (state.direction!==1&&state.direction!==-1)||
       !Number.isFinite(deltaDistance))
        throw new Error('Invalid spline traversal state');
    if(!['clamp','loop','pingpong'].includes(mode))
        throw new Error('Unsupported wrap mode');
    if(length<=1e-12)return Object.freeze({
        distance:0,direction:state.direction,
        reachedStart:false,reachedEnd:false
    });
    if(deltaDistance<0)throw new Error('deltaDistance must be non-negative; use direction');
    const initial=clamp(state.distance,0,length);
    const travel=state.direction*deltaDistance;
    const raw=initial+travel;
    const reachedStart=raw<=0&&travel<0;
    const reachedEnd=raw>=length&&travel>0;
    if(mode==='clamp')return Object.freeze({
        distance:clamp(raw,0,length),
        direction:state.direction,reachedStart,reachedEnd
    });
    if(mode==='loop')return Object.freeze({
        distance:modulo(raw,length),
        direction:state.direction,reachedStart,reachedEnd
    });
    // A reflected sawtooth in [0, 2L] handles both directions and
    // any number of boundary reflections in one constant-time step.
    const unfolded=state.direction===1?initial:2*length-initial;
    const phase=modulo(unfolded+deltaDistance,2*length);
    const direction:1|-1=phase===0?1:phase>=length?-1:1;
    return Object.freeze({
        distance:phase<=length?phase:2*length-phase,
        direction,reachedStart,reachedEnd
    });
}
/** Unclamped progress only makes sense with a positive length. */
export function normalizedSplineDistanceV2(length:number,distance:number):number {
    if(!Number.isFinite(length)||!Number.isFinite(distance)||length<0)
        throw new Error('Invalid spline distance');
    return length>1e-12?clamp(distance/length,0,1):0;
}
