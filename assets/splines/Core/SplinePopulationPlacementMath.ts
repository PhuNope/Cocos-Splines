/**
 * Pure opt-in prefab weights and explicit world-AABB obstacle filtering.
 * No physics queries, Node access, random state or scene mutation here.
 */
import type {PopulationCandidate,PopulationVector} from './SplinePopulationMath';

export interface PopulationWorldAabb {
    center: PopulationVector;
    halfExtents: PopulationVector;
}
const finite=(x:number):boolean=>typeof x==='number'&&Number.isFinite(x);
const bounded=(x:number,a:number,b:number):boolean=>finite(x)&&x>=a&&x<=b;
const xyz=(p:PopulationVector,negative:boolean):boolean=>
    !!p&&bounded(p.x,negative?-1e7:0,1e7)&&
    bounded(p.y,negative?-1e7:0,1e7)&&
    bounded(p.z,negative?-1e7:0,1e7);

/** Weights align with prefab slots (not generated instance indexes). */
export function validatePrefabWeights(weights:ReadonlyArray<number>,slotCount:number):void {
    if(!Array.isArray(weights)||!Number.isInteger(slotCount)||slotCount<1||slotCount>128||
       weights.length!==slotCount||!weights.every(w=>bounded(w,0,10000))||
       !weights.some(w=>w>0))
        throw Error('Weighted prefabs need 1–128 slots, one finite [0,10000] weight per slot and a positive total.');
}
/** Sample [0,1) through a weighted CDF; zero-weight entries are never selected. */
export function selectWeightedPrefab(weights:ReadonlyArray<number>,random01:number):number {
    validatePrefabWeights(weights,weights.length);
    if(!bounded(random01,0,1)||random01===1)
        throw Error('Weighted prefab random value must be in [0,1).');
    let total=0;
    for(const weight of weights)total+=weight;
    const cutoff=random01*total;
    let accumulated=0,last=-1;
    for(let i=0;i<weights.length;i++){
        const weight=weights[i];
        if(weight<=0)continue;
        last=i;accumulated+=weight;
        if(cutoff<accumulated)return i;
    }
    return last; // IEEE rounding at the cumulative upper boundary
}
function touchesExpandedBounds(point:PopulationVector,box:PopulationWorldAabb,radius:number):boolean {
    // Closest point on AABB to the candidate center, sphere-vs-AABB.
    const dx=Math.max(0,Math.abs(point.x-box.center.x)-box.halfExtents.x);
    const dy=Math.max(0,Math.abs(point.y-box.center.y)-box.halfExtents.y);
    const dz=Math.max(0,Math.abs(point.z-box.center.z)-box.halfExtents.z);
    return dx*dx+dy*dy+dz*dz<=radius*radius;
}
/**
 * Does not use the collision system. Explicit Collider.worldBounds provide
 * conservative world AABBs (rotated / mesh colliders may overreject).
 * Filter BEFORE min-world-spacing planning so rejected obstacle points
 * do not reserve space against otherwise valid neighbors.
 */
export function filterObstacleCandidates(
    candidates:ReadonlyArray<PopulationCandidate>,
    boxes:ReadonlyArray<PopulationWorldAabb>,
    clearance:number
):PopulationCandidate[] {
    if(!Array.isArray(candidates)||candidates.length>2048||
       !Array.isArray(boxes)||boxes.length>64||!bounded(clearance,0,10000))
        throw Error('Population obstacle candidate, Collider or clearance limits exceeded.');
    for(const box of boxes)
        if(!box||!xyz(box.center,true)||!xyz(box.halfExtents,false))
            throw Error('Obstacle worldBounds must have finite center and nonnegative half-extents.');
    for(const candidate of candidates)
        if(!candidate||!Number.isSafeInteger(candidate.index)||candidate.index<0||
           candidate.index>2047||!bounded(candidate.progress,0,1)||
           !xyz(candidate.position,true))
            throw Error('Population obstacle candidate has invalid position/progress/index.');
    return candidates.filter(candidate=>
        !boxes.some(box=>touchesExpandedBounds(candidate.position,box,clearance)));
}
