/**
 * Pure, deterministic shared occupancy filter for multiple SplineObjectControllers.
 * No Scene access and no mutation. Earlier-priority controllers supply immutable
 * snapshots of their *already spawned* world-space occupants.
 */
import type {PopulationCandidate,PopulationVector} from './SplinePopulationMath';
export interface SharedOccupancyCandidate extends PopulationCandidate {
    radius:number;
}
export interface SharedOccupant {
    position:PopulationVector;
    radius:number;
}
const finite=(x:number):boolean=>typeof x==='number'&&Number.isFinite(x);
const validPosition=(v:PopulationVector):boolean=>!!v&&
    finite(v.x)&&finite(v.y)&&finite(v.z)&&
    Math.abs(v.x)<=1e7&&Math.abs(v.y)<=1e7&&Math.abs(v.z)<=1e7;
const validRadius=(x:number):boolean=>finite(x)&&x>=0&&x<=100;
const gridKey=(x:number,y:number,z:number):string=>x+','+y+','+z;
/** Returns the original candidates in original order, not reindexed.
 * Any touching footprint spheres are considered colliding. A shared spatial
 * grid keeps typical candidate/occupant checks near O(N), with a worst case
 * equal to checking all occupied centers for extremely concentrated scenes.
 */
export function filterSharedOccupancy(
    candidates:ReadonlyArray<SharedOccupancyCandidate>,
    occupied:ReadonlyArray<SharedOccupant>,
    clearance:number,
):SharedOccupancyCandidate[] {
    if(!Array.isArray(candidates)||candidates.length>2048||
       !Array.isArray(occupied)||occupied.length>32768||
       !finite(clearance)||clearance<0||clearance>10000)
        throw Error('Shared occupancy candidate/peer/clearance limits exceeded.');
    let previous=-1,maxCandidateRadius=0,maxOccupiedRadius=0;
    for(const c of candidates){
        if(!c||!Number.isInteger(c.index)||c.index<=previous||c.index>2047||
           !finite(c.progress)||c.progress<0||c.progress>1||
           !validPosition(c.position)||!validRadius(c.radius))
            throw Error('Shared occupancy candidates require ordered indexes, finite World points and valid radii.');
        previous=c.index;
        maxCandidateRadius=Math.max(maxCandidateRadius,c.radius);
    }
    for(const item of occupied){
        if(!item||!validPosition(item.position)||!validRadius(item.radius))
            throw Error('Shared occupancy peer contains invalid World position or radius.');
        maxOccupiedRadius=Math.max(maxOccupiedRadius,item.radius);
    }
    if(!occupied.length||!candidates.length)return candidates.slice();
    const cell=Math.max(0.001,maxCandidateRadius+maxOccupiedRadius+clearance);
    const keyFor=(v:PopulationVector,dx=0,dy=0,dz=0):string=>
        gridKey(Math.floor(v.x/cell)+dx,Math.floor(v.y/cell)+dy,Math.floor(v.z/cell)+dz);
    const grid=new Map<string,SharedOccupant[]>();
    for(const item of occupied){
        const key=keyFor(item.position),list=grid.get(key);
        if(list)list.push(item);
        else grid.set(key,[item]);
    }
    return candidates.filter(candidate=>{
        const center=candidate.position;
        for(let dx=-1;dx<=1;dx++)
            for(let dy=-1;dy<=1;dy++)
                for(let dz=-1;dz<=1;dz++){
                    const entries=grid.get(keyFor(center,dx,dy,dz));
                    if(!entries)continue;
                    for(const item of entries){
                        const x=center.x-item.position.x,
                            y=center.y-item.position.y,
                            z=center.z-item.position.z;
                        const radius=clearance+candidate.radius+item.radius;
                        if(x*x+y*y+z*z<=radius*radius)return false;
                    }
                }
        return true;
    });
}
