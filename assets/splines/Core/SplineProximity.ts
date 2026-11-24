/** Opt-in, approximate swept-sphere world-proximity admission.
 * Registered obstacles use stationary spheres, AABBs, OBBs or capsules at their
 * latest known world poses. Segment-shape intersections prevent large dt from
 * tunneling across the sampled polyline of a follower's candidate path.
 * NOT a rigid-body collision solver or a multiplayer authoritative system.
 */
import {SplineSpatialHash3D} from './SplineSpatialHash3D';
import {SplineProximityProfileSession,type ProximityProfileSummary} from './SplineProximityProfile';
import {relativePredictionSegment,relativeAcceleratedPredictionSegment,validPredictionVelocity,validPredictionAcceleration,validPredictionAngularSpeed,validPredictionSeconds,predictionMagnitude,type PredictionPoint,type PredictionOptions} from './SplineProximityPrediction';
import {buildProximityTriangleMesh,sweptSphereMeshEntry,type ProximityTriangleMesh} from './SplineProximityMesh';
import {sweptSphereAabbEntry,validProximityAabb,sweptSphereObbEntry,validProximityObb,copyProximityObb,type ProximityAabb,type ProximityObb,sweptSphereCapsuleEntry,validProximityCapsule,copyProximityCapsule,type ProximityCapsule} from './SplineProximityShapes';
export interface ProximityPoint {x:number;y:number;z:number}
export interface ProximityTelemetry {
    occupants:number;spatialCells:number;queries:number;fallbackQueries:number;
    lastCandidates:number;lastSegmentTests:number;lastSamplePoints:number;
    lastVisitedCells:number;lastFallback:boolean;totalCandidates:number;
    totalSegmentTests:number;lastTriangleTests:number;totalTriangleTests:number;
    /** Per-mesh BVH nodes traversed, including nodes rejected by AABB culling. */
    lastBvhNodes:number;totalBvhNodes:number;
    lastPredictedCandidates:number;lastPredictionSeconds:number;
    lastAcceleratedCandidates:number;lastRotationEnvelopeCandidates:number;
}
export interface ProximityOccupant {
    position:ProximityPoint;radius:number;
    /** Opt-in actual world AABB of a Cocos 3D Collider; absent = sphere. */
    bounds?:ProximityAabb;
    /** Explicit stationary world OBB; mutually exclusive with bounds. */
    obb?:ProximityObb;
    /** Explicit stationary world capsule; mutually exclusive with box shapes. */
    capsule?:ProximityCapsule;
    /** Frozen WORLD mesh and BVH; independent of Cocos MeshCollider. */
    mesh?:ProximityTriangleMesh;
    /** Optional measured WORLD linear velocity in units/second. */
    velocity?:PredictionPoint;
    /** Optional bounded acceleration, WORLD units per second squared. */
    acceleration?:PredictionPoint;
    /** Last observed angular rate, radians/second, for optional conservative envelope. */
    angularSpeed?:number;
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
    metrics?:{segmentTests:number;triangleTests?:number;bvhNodes?:number},
    predictionSeconds=0,
    options:PredictionOptions={},
):ProximityPlan{
    if(!own||typeof points!=='function'||!finite(radius)||radius<=0||radius>100||
       !finite(safetyGap)||safetyGap<0||safetyGap>100||
       !Number.isInteger(samples)||samples<2||samples>64||
       !validPredictionSeconds(predictionSeconds)||!options||typeof options!=='object')
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
        const hasVelocity=predictionSeconds>0&&validPredictionVelocity(other.velocity);
        const useAcceleration=hasVelocity&&options.acceleration===true&&
            validPredictionAcceleration(other.acceleration);
        const useEnvelope=predictionSeconds>0&&options.rotationEnvelope===true&&
            validPredictionAngularSpeed(other.angularSpeed)&&other.angularSpeed>1e-4&&
            !!(other.bounds||other.obb||other.capsule||other.mesh);
        let previous=start;
        for(let j=1;j<=samples;j++){
            const point=sampled[j],t0=(j-1)/samples,t1=j/samples;
            const accelerated=useAcceleration?
                relativeAcceleratedPredictionSegment(previous,point,
                    other.velocity!,other.acceleration!,predictionSeconds,t0,t1):null;
            const relative=!accelerated&&hasVelocity&&
                predictionMagnitude(other.velocity)>0?
                relativePredictionSegment(previous,point,other.velocity!,
                    predictionSeconds,t0,t1):null;
            const from=accelerated?.start??relative?.start??previous;
            const to=accelerated?.end??relative?.end??point;
            // A quadratic curve deviates from its linear chord by at most
            // |acceleration| * segmentSeconds² / 8. Inflate every shape sweep.
            const sweepRadius=radius+safetyGap+(accelerated?.maxChordError??0);
            const threshold=sweepRadius+other.radius;
            if(metrics)metrics.segmentTests++;
            const useSphere=useEnvelope||sweepRadius>200;
            const meshMetrics=!useSphere&&other.mesh?{triangleTests:0,visitedNodes:0}:undefined;
            const entry=useSphere?
                segmentEntry(from,to,other.position,threshold):other.mesh?
                sweptSphereMeshEntry(from,to,other.mesh,sweepRadius,meshMetrics):other.capsule?
                sweptSphereCapsuleEntry(from,to,other.capsule,sweepRadius):other.obb?
                sweptSphereObbEntry(from,to,other.obb,sweepRadius):other.bounds?
                sweptSphereAabbEntry(from,to,other.bounds,sweepRadius):
                segmentEntry(from,to,other.position,threshold);
            if(meshMetrics&&metrics){
                if(metrics.triangleTests!==undefined)metrics.triangleTests+=meshMetrics.triangleTests;
                if(metrics.bvhNodes!==undefined)metrics.bvhNodes+=meshMetrics.visitedNodes;
            }
            if(entry!==null){
                const hit=(j-1+entry)/samples;
                if(hit<=first){
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
    private _maxPredictionSpeed=0;
    private _maxPredictionAcceleration=0;
    private _lastAcceleratedCandidates=0;
    private _lastRotationEnvelopeCandidates=0;
    private _profileClock:(()=>number)|null=null;
    private _profileSession:SplineProximityProfileSession|null=null;
    private _lastPredictedCandidates=0;
    private _lastPredictionSeconds=0;
    private _queries=0;
    private _fallbackQueries=0;
    private _totalCandidates=0;
    private _totalSegmentTests=0;
    private _lastCandidates=0;
    private _lastSegmentTests=0;
    private _lastTriangleTests=0;
    private _totalTriangleTests=0;
    private _lastBvhNodes=0;
    private _totalBvhNodes=0;
    private _lastSamplePoints=0;
    private _lastVisitedCells=0;
    private _lastFallback=false;
    private recalculateMaxRadius():void{
        this._maxRadius=0;
        for(const value of this.occupants.values())
            this._maxRadius=Math.max(this._maxRadius,value.radius);
    }
    private recalculateMaxPredictionSpeed():void{
        this._maxPredictionSpeed=0;
        for(const entry of this.occupants.values())
            this._maxPredictionSpeed=Math.max(this._maxPredictionSpeed,
                predictionMagnitude(entry.velocity));
    }
    private recalculateMaxPredictionAcceleration():void{
        this._maxPredictionAcceleration=0;
        for(const entry of this.occupants.values())
            if(validPredictionAcceleration(entry.acceleration))
                this._maxPredictionAcceleration=Math.max(this._maxPredictionAcceleration,
                    predictionMagnitude(entry.acceleration));
    }
    /** Opt-in timer injection for actual limit() calls (not whole frame time).
     * Zero timer calls and no extra objects are created until enabled. */
    public startProfiling(now:()=>number,capacity=2048):void{
        if(typeof now!=='function')throw Error('Invalid proximity profile clock.');
        const session=new SplineProximityProfileSession(capacity);
        this._profileSession=session;
        this._profileClock=now;
    }
    public getProfilingSummary():ProximityProfileSummary|null{
        return this._profileSession?.summary()??null;
    }
    public stopProfiling():ProximityProfileSummary|null{
        const summary=this._profileSession?.summary()??null;
        this._profileSession=null;this._profileClock=null;
        return summary;
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
            lastTriangleTests:this._lastTriangleTests,totalTriangleTests:this._totalTriangleTests,
            lastBvhNodes:this._lastBvhNodes,totalBvhNodes:this._totalBvhNodes,
            lastPredictedCandidates:this._lastPredictedCandidates,
            lastPredictionSeconds:this._lastPredictionSeconds,
            lastAcceleratedCandidates:this._lastAcceleratedCandidates,
            lastRotationEnvelopeCandidates:this._lastRotationEnvelopeCandidates,
            totalSegmentTests:this._totalSegmentTests};
    }
    public set(owner:object,position:ProximityPoint,radius:number,bounds?:ProximityAabb):void{
        if(!owner||!validPoint(position)||!finite(radius)||radius<=0||radius>100||
           (bounds!==undefined&&!validProximityAabb(bounds)))
            throw Error('Invalid spline proximity occupant.');
        const previous=this.occupants.get(owner);
        this.occupants.set(owner,{position:{x:position.x,y:position.y,z:position.z},radius,
            ...(bounds?{bounds:{min:{...bounds.min},max:{...bounds.max}}}:{}),
            ...(previous?.velocity?{velocity:{...previous.velocity}}:{}),
            ...(previous?.acceleration?{acceleration:{...previous.acceleration}}:{}),
            ...(previous?.angularSpeed!==undefined?{angularSpeed:previous.angularSpeed}:{})});
        this.index.set(owner,position);
        if(radius>this._maxRadius)this._maxRadius=radius;
        else if(previous&&previous.radius>=this._maxRadius&&radius<previous.radius)
            this.recalculateMaxRadius();
    }
    /** Register an explicit world OBB. Its circumscribed sphere is computed
     * internally to keep the center-based broadphase conservative.
     * Call setObb again after any transform/size change; set() resets shape. */
    public setObb(owner:object,box:ProximityObb):void{
        if(!validProximityObb(box))throw Error('Invalid spline proximity OBB.');
        const copy=copyProximityObb(box);
        // Tiny inflation covers the accepted orthonormality tolerance.
        const radius=Math.max(1e-6,Math.hypot(copy.half.x,copy.half.y,copy.half.z)*(1+1e-7));
        this.set(owner,copy.center,radius);
        this.occupants.get(owner)!.obb=copy;
    }
    /** Register a stationary capsule and derive its enclosing broadphase sphere.
     * Re-register after motion/resize; set() and setObb() replace the shape. */
    public setCapsule(owner:object,capsule:ProximityCapsule):void{
        if(!validProximityCapsule(capsule))throw Error('Invalid spline proximity capsule.');
        const copy=copyProximityCapsule(capsule);
        const a=copy.a,b=copy.b;
        const center={x:a.x/2+b.x/2,y:a.y/2+b.y/2,z:a.z/2+b.z/2};
        const radius=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/2+copy.radius;
        this.set(owner,center,radius);
        this.occupants.get(owner)!.capsule=copy;
    }
    /** Explicit stationary WORLD triangles. Geometry is copied and frozen at
     * registration; update manually if mesh transforms/vertices change.
     * Large meshes must be spatially divided into chunks. */
    public setMesh(owner:object,vertices:readonly ProximityPoint[],
        indices:readonly number[]):void{
        if(!ownValid(owner))throw Error('Invalid proximity mesh owner.');
        this.setBuiltMesh(owner,buildProximityTriangleMesh(vertices,indices));
    }
    /** Register a previously built immutable BVH without rebuilding per frame.
     * Intended for validated native mesh adapters and static mesh caches. */
    public setBuiltMesh(owner:object,mesh:ProximityTriangleMesh):void{
        if(!ownValid(owner)||!mesh||!Object.isFrozen(mesh)||
           !mesh.root||!Object.isFrozen(mesh.root)||!validProximityAabb(mesh.bounds)||
           !Number.isInteger(mesh.triangleCount)||mesh.triangleCount<1||
           mesh.triangleCount>16384)
            throw Error('Invalid built proximity mesh.');
        const lo=mesh.bounds.min,hi=mesh.bounds.max;
        const center={x:lo.x/2+hi.x/2,y:lo.y/2+hi.y/2,z:lo.z/2+hi.z/2};
        const radius=Math.max(1e-6,Math.hypot(hi.x-lo.x,hi.y-lo.y,hi.z-lo.z)/2);
        if(!finite(radius)||radius>100)
            throw Error('Proximity mesh exceeds 100 world unit broadphase radius.');
        this.set(owner,center,radius);
        this.occupants.get(owner)!.mesh=mesh;
    }
    /** Only already-registered occupants can publish velocity.
     * Invalid/outlier velocities are rejected before modifying the registry. */
    public setVelocity(owner:object,velocity:PredictionPoint):boolean{
        if(!ownValid(owner)||!validPredictionVelocity(velocity))
            throw Error('Invalid proximity prediction velocity.');
        const occupant=this.occupants.get(owner);
        if(!occupant)return false;
        const oldSpeed=predictionMagnitude(occupant.velocity);
        const newSpeed=predictionMagnitude(velocity);
        occupant.velocity={...velocity};
        const oldAcceleration=predictionMagnitude(occupant.acceleration);
        delete occupant.acceleration;
        delete occupant.angularSpeed;
        if(oldAcceleration>=this._maxPredictionAcceleration&&oldAcceleration>0)
            this.recalculateMaxPredictionAcceleration();
        if(newSpeed>this._maxPredictionSpeed)this._maxPredictionSpeed=newSpeed;
        else if(oldSpeed>=this._maxPredictionSpeed&&newSpeed<oldSpeed)
            this.recalculateMaxPredictionSpeed();
        return true;
    }
    /** Set bounded acceleration after the current frame's setVelocity(). */
    public setAcceleration(owner:object,acceleration:PredictionPoint):boolean{
        if(!ownValid(owner)||!validPredictionAcceleration(acceleration))
            throw Error('Invalid proximity prediction acceleration.');
        const state=this.occupants.get(owner);
        if(!state?.velocity)return false;
        const prior=predictionMagnitude(state.acceleration);
        const next=predictionMagnitude(acceleration);
        state.acceleration={...acceleration};
        if(next>this._maxPredictionAcceleration)this._maxPredictionAcceleration=next;
        else if(prior>=this._maxPredictionAcceleration&&next<prior)
            this.recalculateMaxPredictionAcceleration();
        return true;
    }
    /** Angle is used only as the opt-in conservative shape-envelope trigger. */
    public setAngularSpeed(owner:object,angularSpeed:number):boolean{
        if(!ownValid(owner)||!validPredictionAngularSpeed(angularSpeed))
            throw Error('Invalid proximity angular speed.');
        const state=this.occupants.get(owner);
        if(!state?.velocity)return false;
        state.angularSpeed=angularSpeed;
        return true;
    }
    /** Clear all inferred motion when prediction is disabled, paused or teleported. */
    public clearVelocity(owner:object):void{
        const occupant=this.occupants.get(owner);
        if(!occupant)return;
        const old=predictionMagnitude(occupant.velocity);
        const oldAcceleration=predictionMagnitude(occupant.acceleration);
        delete occupant.velocity;
        delete occupant.acceleration;
        delete occupant.angularSpeed;
        if(old>=this._maxPredictionSpeed&&old>0)this.recalculateMaxPredictionSpeed();
        if(oldAcceleration>=this._maxPredictionAcceleration&&oldAcceleration>0)
            this.recalculateMaxPredictionAcceleration();
    }
    public remove(owner:object):void{
        const previous=this.occupants.get(owner);
        if(!previous)return;
        this.occupants.delete(owner);
        this.index.remove(owner);
        if(previous.radius>=this._maxRadius)this.recalculateMaxRadius();
        if(predictionMagnitude(previous.velocity)>=this._maxPredictionSpeed)
            this.recalculateMaxPredictionSpeed();
        if(predictionMagnitude(previous.acceleration)>=this._maxPredictionAcceleration)
            this.recalculateMaxPredictionAcceleration();
    }
    public get(owner:object):ProximityOccupant|null{
        const value=this.occupants.get(owner);
        return value?{radius:value.radius,position:{...value.position},
            ...(value.bounds?{bounds:{min:{...value.bounds.min},max:{...value.bounds.max}}}:{}),
            ...(value.obb?{obb:copyProximityObb(value.obb)}:{}),
            ...(value.capsule?{capsule:copyProximityCapsule(value.capsule)}:{}),
            ...(value.mesh?{mesh:value.mesh}:{}),
            ...(value.velocity?{velocity:{...value.velocity}}:{}),
            ...(value.acceleration?{acceleration:{...value.acceleration}}:{}),
            ...(value.angularSpeed!==undefined?{angularSpeed:value.angularSpeed}:{})}:null;
    }
    public get size():number{return this.occupants.size;}
    public limit(owner:object,points:(fraction:number)=>ProximityPoint,
        radius:number,safetyGap:number,samples=16,predictionSeconds=0,
        options:PredictionOptions={}):ProximityPlan{
        if(!ownValid(owner)||typeof points!=='function'||!finite(radius)||
           radius<=0||radius>100||!finite(safetyGap)||safetyGap<0||
           safetyGap>100||!Number.isInteger(samples)||samples<2||samples>64||
           !validPredictionSeconds(predictionSeconds)||!options||typeof options!=='object')
            throw Error('Invalid spline proximity sweep.');
        const measuredAt=this._profileClock?.();
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
        const margin=radius+safetyGap+this._maxRadius+
            this._maxPredictionSpeed*predictionSeconds+
            (options.acceleration===true?
                .5*this._maxPredictionAcceleration*predictionSeconds*predictionSeconds:0);
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
        const metrics={segmentTests:0,triangleTests:0,bvhNodes:0};
        let predictedCandidates=0,acceleratedCandidates=0,rotationCandidates=0;
        if(predictionSeconds>0)for(const state of selected.values()){
            if(predictionMagnitude(state.velocity)>0)predictedCandidates++;
            if(options.acceleration===true&&validPredictionVelocity(state.velocity)&&
               validPredictionAcceleration(state.acceleration))
                acceleratedCandidates++;
            if(options.rotationEnvelope===true&&
               validPredictionAngularSpeed(state.angularSpeed)&&
               state.angularSpeed>1e-4&&
               !!(state.bounds||state.obb||state.capsule||state.mesh))
                rotationCandidates++;
        }
        const report=planSplineProximity(owner,
            fraction=>sampled[Math.min(samples,Math.max(0,Math.round(fraction*samples)))],
            selected,radius,safetyGap,samples,metrics,predictionSeconds,options);
        this._queries++;
        if(fallback)this._fallbackQueries++;
        this._lastCandidates=selected.size;
        this._lastPredictedCandidates=predictedCandidates;
        this._lastPredictionSeconds=predictionSeconds;
        this._lastAcceleratedCandidates=acceleratedCandidates;
        this._lastRotationEnvelopeCandidates=rotationCandidates;
        this._lastSegmentTests=metrics.segmentTests;
        this._lastTriangleTests=metrics.triangleTests;
        this._totalTriangleTests+=metrics.triangleTests;
        this._lastBvhNodes=metrics.bvhNodes;
        this._totalBvhNodes+=metrics.bvhNodes;
        this._lastSamplePoints=sampled.length;
        this._lastVisitedCells=query?.visitedCells??0;
        this._lastFallback=fallback;
        this._totalCandidates+=selected.size;
        this._totalSegmentTests+=metrics.segmentTests;
        // Profiling is explicitly opt-in; sampled duration excludes external
        // Cocos Component, renderer and physics-backend work.
        if(measuredAt!==undefined&&this._profileClock&&this._profileSession){
            const elapsed=this._profileClock()-measuredAt;
            if(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<=60000)
                this._profileSession.record(elapsed,this.getTelemetry());
        }
        return report;
    }
    public clear():void{
        this.occupants.clear();this.index.clear();this._maxRadius=0;
        this._maxPredictionSpeed=0;this._maxPredictionAcceleration=0;
        this._lastPredictedCandidates=0;this._lastPredictionSeconds=0;
        this._lastAcceleratedCandidates=0;this._lastRotationEnvelopeCandidates=0;
        this._queries=0;this._fallbackQueries=0;this._totalCandidates=0;
        this._totalSegmentTests=0;this._totalTriangleTests=0;this._lastTriangleTests=0;
        this._lastBvhNodes=0;this._totalBvhNodes=0;this._lastCandidates=0;
        this._lastSegmentTests=0;this._lastSamplePoints=0;
        this._lastVisitedCells=0;this._lastFallback=false;
        this._profileSession?.reset();
    }
}
export const splineProximityRegistry=new SplineProximityRegistry();
