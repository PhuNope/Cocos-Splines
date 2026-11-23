/** Opt-in, approximate swept-sphere world-proximity admission.
 * All registered followers are modeled as stationary spheres at their latest
 * known world positions. Segment-sphere intersections prevent large dt from
 * tunneling across the sampled polyline of a follower's candidate path.
 * NOT a rigid-body collision solver or a multiplayer authoritative system.
 */
import {SplineSpatialHash3D} from './SplineSpatialHash3D';
import {sweptSphereAabbEntry,validProximityAabb,type ProximityAabb} from './SplineProximityShapes';
export interface ProximityPoint {x:number;y:number;z:number}
export interface ProximityTelemetry {
    occupants:number;spatialCells:number;queries:number;fallbackQueries:number;
    lastCandidates:number;lastSegmentTests:number;lastSamplePoints:number;
    lastVisitedCells:number;lastFallback:boolean;totalCandidates:number;
    totalSegmentTests:number;
}
export interface ProximityOccupant {
    position:ProximityPoint;radius:number;
    /** Opt-in actual world AABB of a Cocos 3D Collider; absent = sphere. */
    bounds?:ProximityAabb;
}
export interface ProximityPlan {
    fraction:number;
    limited:boolean;
    stopped:boolean;
    obstacle:object|null;
    nearestWorldDistance:number|null;
}
const finite=(x:number)=>Number.isFinite(x);
const ownValid=(o:object)=>!!o&&typeof o==='object';
const validPoint=(p:ProximityPoint)=>!!p&&finite(p.x)&&finite(p.y)&&finite(p.z);
const d2=(a:ProximityPoint,b:ProximityPoint)=>{
    const x=a.x-b.x,y=a.y-b.y,z=a.z-b.z;return x*x+y*y+z*z;
};
function segmentEntry(a:ProximityPoint,b:ProximityPoint,center:ProximityPoint,radius:number):number|null{
    const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z;
    const dx=a.x-center.x,dy=a.y-center.y,dz=a.z-center.z;
    const c=dx*dx+dy*dy+dz*dz-radius*radius;
    if(c<=0)return 0; // Pre-existing overlap stops until reconfigured/moved
    const aa=ux*ux+uy*uy+uz*uz;
    if(aa<=1e-14)return null;
    const halfB=dx*ux+dy*uy+dz*uz;
    if(halfB>=0)return null; // Moving away
    const disc=halfB*halfB-aa*c;
    if(disc<0)return null;
    const hit=(-halfB-Math.sqrt(Math.max(0,disc)))/aa;
    return hit>=0&&hit<=1?hit:null;
}
/** Bounded static-obstacle polyline sweep. fraction is the maximum safe
 * fraction of the requested movement, conservatively before first entry.
 */
export function planSplineProximity(
    own:object,points:(fraction:number)=>ProximityPoint,
    occupants:ReadonlyMap<object,ProximityOccupant>,
    radius:number,safetyGap:number,samples=16,
    metrics?:{segmentTests:number},
):ProximityPlan{
    if(!own||typeof points!=='function'||!finite(radius)||radius<=0||radius>100||
       !finite(safetyGap)||safetyGap<0||safetyGap>100||
       !Number.isInteger(samples)||samples<2||samples>64)
        throw Error('Invalid spline proximity sweep.');
    const sampled:ProximityPoint[]=[];
    for(let i=0;i<=samples;i++){
        const value=points(i/samples);
        if(!validPoint(value))throw Error('Invalid proximity path world position.');
        sampled.push(value);
    }
    const start=sampled[0];
    let first=1,obstacle:object|null=null,nearest=Infinity;
    for(const [id,other] of occupants){
        if(id===own)continue;
        if(!other||!validPoint(other.position)||!finite(other.radius)||
           other.radius<=0||other.radius>100)continue;
        nearest=Math.min(nearest,Math.sqrt(d2(start,other.position)));
        const threshold=radius+other.radius+safetyGap;
        let previous=start;
        for(let j=1;j<=samples;j++){
            const point=sampled[j];
            if(metrics)metrics.segmentTests++;
            const entry=other.bounds?
                sweptSphereAabbEntry(previous,point,other.bounds,radius+safetyGap):
                segmentEntry(previous,point,other.position,threshold);
            if(entry!==null){
                const hit=(j-1+entry)/samples;
                if(hit<first){
                    first=Math.max(0,hit-1e-5);
                    obstacle=id;
                }
                break;
            }
            previous=point;
        }
    }
    // Conservative tolerance for imminent contact: without this, repeated
    // sweeps can asymptotically creep toward a sphere by microscopic steps,
    // never entering an actual stopped state or firing the blocked event.
    const safeFraction=first<=1e-3?0:first;
    return {fraction:safeFraction,limited:safeFraction<1-1e-8,
        stopped:safeFraction===0,obstacle,
        nearestWorldDistance:nearest===Infinity?null:nearest};
}
export class SplineProximityRegistry {
    private readonly occupants=new Map<object,ProximityOccupant>();
    private readonly index=new SplineSpatialHash3D();
    private _maxRadius=0;
    private _queries=0;
    private _fallbackQueries=0;
    private _totalCandidates=0;
    private _totalSegmentTests=0;
    private _lastCandidates=0;
    private _lastSegmentTests=0;
    private _lastSamplePoints=0;
    private _lastVisitedCells=0;
    private _lastFallback=false;
    private recalculateMaxRadius():void{
        this._maxRadius=0;
        for(const value of this.occupants.values())
            this._maxRadius=Math.max(this._maxRadius,value.radius);
    }
    /** Read-only telemetry. No global Scene scan or instrumentation objects
     * created for every follower when the feature is disabled.
     */
    public getTelemetry():ProximityTelemetry{
        return {occupants:this.occupants.size,spatialCells:this.index.cellCount,
            queries:this._queries,fallbackQueries:this._fallbackQueries,
            lastCandidates:this._lastCandidates,lastSegmentTests:this._lastSegmentTests,
            lastSamplePoints:this._lastSamplePoints,lastVisitedCells:this._lastVisitedCells,
            lastFallback:this._lastFallback,totalCandidates:this._totalCandidates,
            totalSegmentTests:this._totalSegmentTests};
    }
    public set(owner:object,position:ProximityPoint,radius:number,bounds?:ProximityAabb):void{
        if(!owner||!validPoint(position)||!finite(radius)||radius<=0||radius>100||
           (bounds!==undefined&&!validProximityAabb(bounds)))
            throw Error('Invalid spline proximity occupant.');
        const previous=this.occupants.get(owner);
        this.occupants.set(owner,{position:{x:position.x,y:position.y,z:position.z},radius,
            ...(bounds?{bounds:{min:{...bounds.min},max:{...bounds.max}}}:{})});
        this.index.set(owner,position);
        if(radius>this._maxRadius)this._maxRadius=radius;
        else if(previous&&previous.radius>=this._maxRadius&&radius<previous.radius)
            this.recalculateMaxRadius();
    }
    public remove(owner:object):void{
        const previous=this.occupants.get(owner);
        if(!previous)return;
        this.occupants.delete(owner);
        this.index.remove(owner);
        if(previous.radius>=this._maxRadius)this.recalculateMaxRadius();
    }
    public get(owner:object):ProximityOccupant|null{
        const value=this.occupants.get(owner);
        return value?{radius:value.radius,position:{...value.position},
            ...(value.bounds?{bounds:{min:{...value.bounds.min},max:{...value.bounds.max}}}:{})}:null;
    }
    public get size():number{return this.occupants.size;}
    public limit(owner:object,points:(fraction:number)=>ProximityPoint,
        radius:number,safetyGap:number,samples=16):ProximityPlan{
        if(!ownValid(owner)||typeof points!=='function'||!finite(radius)||
           radius<=0||radius>100||!finite(safetyGap)||safetyGap<0||
           safetyGap>100||!Number.isInteger(samples)||samples<2||samples>64)
            throw Error('Invalid spline proximity sweep.');
        // Sample the candidate path ONCE, regardless of the number of nearby
        // followers. A swept AABB encloses the whole sampled polyline, not
        // just its endpoints (which would miss U-shaped/hairpin paths).
        const sampled:ProximityPoint[]=[];
        const min:ProximityPoint={x:Infinity,y:Infinity,z:Infinity};
        const max:ProximityPoint={x:-Infinity,y:-Infinity,z:-Infinity};
        for(let i=0;i<=samples;i++){
            const pt=points(i/samples);
            if(!validPoint(pt))throw Error('Invalid proximity path world position.');
            sampled.push(pt);
            min.x=Math.min(min.x,pt.x);min.y=Math.min(min.y,pt.y);min.z=Math.min(min.z,pt.z);
            max.x=Math.max(max.x,pt.x);max.y=Math.max(max.y,pt.y);max.z=Math.max(max.z,pt.z);
        }
        const margin=radius+safetyGap+this._maxRadius;
        const lower={x:min.x-margin,y:min.y-margin,z:min.z-margin};
        const upper={x:max.x+margin,y:max.y+margin,z:max.z+margin};
        const safe=[...Object.values(lower),...Object.values(upper)].every(Number.isFinite);
        const query=safe?this.index.query(lower,upper):null;
        const fallback=query===null||query.fallback;
        // Index is center-based. Expanding by the largest known radius
        // guarantees an overlapping sphere center is a candidate.
        const selected=new Map<object,ProximityOccupant>();
        if(fallback){
            for(const [id,state] of this.occupants)if(id!==owner)selected.set(id,state);
        }else{
            for(const id of query.owners){
                if(id===owner)continue;
                const state=this.occupants.get(id);
                if(state)selected.set(id,state);
            }
        }
        const metrics={segmentTests:0};
        const report=planSplineProximity(owner,
            fraction=>sampled[Math.min(samples,Math.max(0,Math.round(fraction*samples)))],
            selected,radius,safetyGap,samples,metrics);
        this._queries++;
        if(fallback)this._fallbackQueries++;
        this._lastCandidates=selected.size;
        this._lastSegmentTests=metrics.segmentTests;
        this._lastSamplePoints=sampled.length;
        this._lastVisitedCells=query?.visitedCells??0;
        this._lastFallback=fallback;
        this._totalCandidates+=selected.size;
        this._totalSegmentTests+=metrics.segmentTests;
        return report;
    }
    public clear():void{
        this.occupants.clear();this.index.clear();this._maxRadius=0;
        this._queries=0;this._fallbackQueries=0;this._totalCandidates=0;
        this._totalSegmentTests=0;this._lastCandidates=0;
        this._lastSegmentTests=0;this._lastSamplePoints=0;
        this._lastVisitedCells=0;this._lastFallback=false;
    }
}
export const splineProximityRegistry=new SplineProximityRegistry();
