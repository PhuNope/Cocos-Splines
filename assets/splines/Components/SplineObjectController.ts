import { _decorator, Component, Prefab, Node, instantiate, Vec3, Quat, Enum, Collider, PhysicsSystem, geometry } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer } from '../Core/SplineContainer';
import { SplineModifiers } from './SplineModifiers';
import { SplineNoise } from './SplineNoise';
import { InstantiateMethod } from './SplineInstantiate';
import {PopulationCandidate,PopulationDensityKey,PopulationExclusion,PopulationPolicy,planPopulation} from '../Core/SplinePopulationMath';
import {PopulationWorldAabb,filterObstacleCandidates,validatePrefabWeights,selectWeightedPrefab} from '../Core/SplinePopulationPlacementMath';
import {PopulationSurfacePlacement,PopulationSurfaceSettings,projectSurfaceCandidates,surfaceBasis} from '../Core/SplinePopulationSurfaceMath';
const {ccclass,property,menu}=_decorator;

/** Serializable density control point along normalized arc progress. */
@ccclass('Splines.SplinePopulationDensityKey')
export class SplinePopulationDensityKey implements PopulationDensityKey {
    @property({range:[0,1,0.001],slide:true}) progress=0;
    @property({range:[0,1,0.01],slide:true}) density=1;
}

/** Forbidden spawn interval. On closed loops start > end wraps over the seam. */
@ccclass('Splines.SplinePopulationExclusion')
export class SplinePopulationExclusion implements PopulationExclusion {
    @property({range:[0,1,0.001],slide:true}) startProgress=0;
    @property({range:[0,1,0.001],slide:true}) endProgress=0;
}

/** Distribute multiple prefab variants over arc distance with deterministic jitter,
 * lane offsets and keyframed modifiers. Only runtime-owned instances are cleared
 * on disable; manually saved instances remain intact.
 */
@ccclass('Splines.SplineObjectController')
@menu('Splines/Spline Object Controller')
export class SplineObjectController extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:[Prefab],tooltip:'Prefab variations. Selection is deterministic for the seed.'}) prefabs:Prefab[]=[];
    @property({tooltip:'Opt-in weighted selection of Prefabs. Disabled uses the legacy uniform seeded variant RNG.'})
    usePrefabWeights=false;
    @property({type:[Number],tooltip:'Weights aligned by index to Prefabs. Exactly one value per slot, zero disables a variant; max 128.'})
    prefabWeights:number[]=[];
    @property({type:Node,tooltip:'Generated children parent; defaults to this Node.'}) parentNode:Node|null=null;
    @property({type:SplineModifiers}) modifiers:SplineModifiers|null=null;
    @property({type:SplineNoise,tooltip:'Optional seeded layered offset in spline-frame Right/Up/Forward coordinates. No Knot changes.'})
    noise:SplineNoise|null=null;
    @property({type:Enum(InstantiateMethod)}) method:InstantiateMethod=InstantiateMethod.Count;
    @property({min:1,max:2048,step:1}) count=12;
    @property({min:0.001}) spacing=2;
    @property({range:[0,1,0.001],slide:true}) startProgress=0;
    @property({range:[0,1,0.001],slide:true}) endProgress=1;
    @property({type:Vec3,tooltip:'Right/Up/Forward offset in spline frame.'}) offset=new Vec3();
    @property({type:Vec3}) randomPosition=new Vec3();
    @property({type:Vec3,tooltip:'Euler jitter in degrees.'}) randomRotation=new Vec3();
    @property({min:0,max:1,tooltip:'Uniform scale variation (+/- fraction).'}) randomScale=0;
    @property({min:0.01}) scaleMultiplier=1;
    @property({tooltip:'Seed for prefab choice and all jitter axes.'}) seed=12345;
    @property({tooltip:'Opt-in deterministic candidate filter. Disabled keeps legacy output identical.'})
    enablePopulationRules=false;
    @property({range:[0,1,0.01],slide:true,tooltip:'Uniform retention probability before density mask.'})
    density=1;
    @property({type:[SplinePopulationDensityKey],tooltip:'Optional linear density mask over normalized arc progress (max 64 distinct keys).'})
    densityKeys:SplinePopulationDensityKey[]=[];
    @property({type:[SplinePopulationExclusion],tooltip:'Blocked normalized arc intervals; start > end wraps on CLOSED splines (max 64).'})
    exclusions:SplinePopulationExclusion[]=[];
    @property({min:0,max:10000,tooltip:'Optional minimum WORLD distance between final placed prefab centers, after all jitter/noise (0 disables). Not collider overlap.'})
    minWorldSpacing=0;
    @property({tooltip:'Opt-in explicit Collider avoidance using conservative World AABB bounds. No physics simulation / auto-scene discovery.'})
    avoidObstacleColliders=false;
    @property({type:[Collider],tooltip:'Only these assigned active Colliders are considered (max 64). Not a Physics overlap query.'})
    obstacleColliders:Collider[]=[];
    @property({min:0,max:10000,tooltip:'World-unit radius around each candidate center kept clear of assigned Collider World AABBs.'})
    obstacleClearance=0;
    @property({tooltip:'Opt-in: drop prefab centers onto explicitly assigned Physics 3D Collider/TerrainCollider surfaces. No source geometry changes.'})
    conformToSurface=false;
    @property({type:[Collider],tooltip:'1–64 explicit target 3D Colliders including TerrainCollider. Other raycast hits are ignored.'})
    surfaceColliders:Collider[]=[];
    @property({min:0,max:10000,tooltip:'Start vertical DOWN ray this many World units above the original candidate center.'})
    surfaceRayHeight=10;
    @property({min:0,max:10000,tooltip:'Continue downward this many World units below the original candidate center.'})
    surfaceRayDepth=50;
    @property({min:-1000,max:1000,tooltip:'Offset final point along the hit surface normal, in World units.'})
    surfaceOffset=0;
    @property({range:[0,1,0.01],slide:true,tooltip:'Minimum hit normal World Y. 0 accepts vertical faces, 1 only accepts horizontal upward faces.'})
    minSurfaceNormalY=.3;
    @property({tooltip:'If no valid target hit, discard candidate. Off = keep unprojected candidate.'})
    skipMissingSurface=true;
    @property({tooltip:'If Align To Spline is on, align prefab local Y to hit normal while keeping projected spline forward. Does not affect positional offsets.'})
    alignToSurfaceNormal=false;
    @property alignToSpline=true;
    @property includeEndPoint=true;
    @property rebuildOnChange=false;
    @property({tooltip:'Spawn at Play only when the scene has no manually spawned instances.'}) spawnOnStart=true;
    @property({type:Node,visible:false}) spawnedRoot:Node|null=null;
    private _runtimeSpawned=false;
    private _generated:Node[]=[];
    private _signature='';
    private rand(index:number,channel:number):number{
        let v=(this.seed|0)^Math.imul(index+13,0x9e3779b9)^Math.imul(channel+7,0x85ebca6b);
        v=Math.imul(v^(v>>>16),0x7feb352d);v=Math.imul(v^(v>>>15),0x846ca68b);
        return ((v^(v>>>16))>>>0)/4294967296;
    }
    /** Snapshot explicit Collider.worldBounds without touching the physics scene or generated Nodes. */
    private obstacleBounds():PopulationWorldAabb[]{
        if(!Array.isArray(this.obstacleColliders)||this.obstacleColliders.length>64)
            throw Error('Population obstacle list must have no more than 64 Collider references.');
        const boxes:PopulationWorldAabb[]=[];
        for(const collider of this.obstacleColliders){
            if(!collider)throw Error('Population obstacle list contains a missing Collider reference.');
            if(collider.enabled===false||collider.node?.activeInHierarchy===false)continue;
            const bounds=collider.worldBounds;
            if(!bounds||!bounds.center||!bounds.halfExtents)
                throw Error('Assigned Collider has no readable World AABB bounds.');
            boxes.push({center:{x:bounds.center.x,y:bounds.center.y,z:bounds.center.z},
                halfExtents:{x:bounds.halfExtents.x,y:bounds.halfExtents.y,z:bounds.halfExtents.z}});
        }
        return boxes;
    }
    /** Read only explicit, active surface targets; no Scene-wide auto-discovery. */
    private surfaceTargets():Collider[]{
        if(!Array.isArray(this.surfaceColliders)||this.surfaceColliders.length<1||
           this.surfaceColliders.length>64)
            throw Error('Surface Conform needs 1–64 explicitly assigned 3D Colliders.');
        for(const collider of this.surfaceColliders)
            if(!collider)throw Error('Surface Conform contains a missing Collider reference.');
        const active=this.surfaceColliders.filter(c=>c.enabled!==false&&
            c.node?.isValid!==false&&c.node?.activeInHierarchy!==false);
        if(active.length===0)throw Error('Surface Conform has no active target Collider.');
        return active;
    }
    /** PhysicsSystem raycastResults are transient engine-owned results; copy values
     * inside each call, and permit only hits on the explicit target components. */
    private conformCandidates(candidates:PopulationCandidate[]):PopulationSurfacePlacement[]{
        const targets=this.surfaceTargets();
        const settings:PopulationSurfaceSettings={
            rayHeight:this.surfaceRayHeight,rayDepth:this.surfaceRayDepth,
            surfaceOffset:this.surfaceOffset,minNormalY:this.minSurfaceNormalY,
            skipMissing:this.skipMissingSurface,targetCount:targets.length,
        };
        if(!PhysicsSystem?.instance||typeof PhysicsSystem.instance.raycast!=='function'||
           typeof geometry?.Ray!=='function')
            throw Error('Surface Conform requires a working Physics 3D raycast in the active Scene.');
        const physics=PhysicsSystem.instance;
        return projectSurfaceCandidates(candidates,settings,(origin,length)=>{
            const ray=new geometry.Ray(origin.x,origin.y,origin.z,0,-1,0);
            if(!physics.raycast(ray,0xffffffff,length,false))return [];
            const results=physics.raycastResults;
            if(!Array.isArray(results))throw Error('Physics raycastResults must be an array.');
            return results.map(hit=>{
                const index=targets.indexOf(hit.collider);
                const p=hit.hitPoint,n=hit.hitNormal;
                return {targetIndex:index,distance:hit.distance,
                    point:{x:p?.x,y:p?.y,z:p?.z},normal:{x:n?.x,y:n?.y,z:n?.z}};
            });
        });
    }
    private signature():string{
        const spline=this.spline||this.node.parent?.getComponent(SplineContainer)||null;
        return JSON.stringify([spline?.getRevision(),spline?.node.worldMatrix,this.prefabs.map(p=>p?.uuid),
            this.usePrefabWeights,this.usePrefabWeights?this.prefabWeights:null,this.parentNode?.uuid,
            this.modifiers?.getRevision(),this.noise?.node.uuid,this.noise?.getRevision(),this.method,this.count,this.spacing,this.startProgress,this.endProgress,this.offset,
            this.randomPosition,this.randomRotation,this.randomScale,this.scaleMultiplier,this.seed,
            this.enablePopulationRules,this.enablePopulationRules?[
                this.density,this.densityKeys.map(k=>[k.progress,k.density]),
                this.exclusions.map(x=>[x.startProgress,x.endProgress]),this.minWorldSpacing,
            ]:null,this.avoidObstacleColliders,this.avoidObstacleColliders?[
                this.obstacleClearance,
                this.obstacleColliders.map(c=>{
                    if(!c)return null;
                    if(c.enabled===false||c.node?.activeInHierarchy===false)return [c.node?.uuid,false];
                    const bounds=c.worldBounds;
                    return [c.node?.uuid,true,bounds?.center,bounds?.halfExtents];
                }),
            ]:null,this.conformToSurface,this.conformToSurface?[
                this.surfaceRayHeight,this.surfaceRayDepth,this.surfaceOffset,
                this.minSurfaceNormalY,this.skipMissingSurface,this.alignToSurfaceNormal,
                this.surfaceColliders.map(c=>{
                    if(!c)return null;
                    const bounds=c.worldBounds;
                    return [c.node?.uuid,c.enabled,c.node?.activeInHierarchy,
                        c.node?.worldMatrix,bounds?.center,bounds?.halfExtents];
                }),
            ]:null,this.alignToSpline,this.includeEndPoint]);
    }
    onEnable():void{if(!EDITOR_NOT_IN_PREVIEW&&this.spawnOnStart)this.spawn();}
    update():void{if(!EDITOR_NOT_IN_PREVIEW&&this._runtimeSpawned&&this.rebuildOnChange&&this.signature()!==this._signature)this.respawn();}
    /** Spawn only if the serialized/generated root has no children. */
    public spawn():number{
        if(this.spawnedRoot?.isValid&&this.spawnedRoot.children.length){this._signature=this.signature();return 0;}
        return this.respawn();
    }
    /** Replace only the instances owned by this component. */
    public respawn():number{
        // Reject malformed noise configs BEFORE destroying previously spawned objects.
        if(this.noise)this.noise.sample(0);
        const spline=this.spline||this.node.parent?.getComponent(SplineContainer)||null;
        const variants=this.prefabs.filter((p):p is Prefab=>!!p);
        if(!spline||spline.count<2||!variants.length){
            this.clear();this._signature=this.signature();return 0;
        }
        // The opt-in weighted picker uses the SAME deterministic prefab RNG channel 0.
        // Validate before clear(); source null slots never consume a positive weight.
        let weights:number[]|null=null;
        if(this.usePrefabWeights){
            validatePrefabWeights(this.prefabWeights,this.prefabs.length);
            weights=this.prefabs.map((p,i)=>p?this.prefabWeights[i]:null)
                .filter((v):v is number=>v!==null);
            validatePrefabWeights(weights,variants.length);
        }
        const start=Math.max(0,Math.min(1,this.startProgress)),end=Math.max(0,Math.min(1,this.endProgress));
        if(end<start){this.clear();this._signature=this.signature();return 0;}
        const range=end-start;
        const closedLoop=spline.closed&&range>=1-1e-6;
        const span=spline.length*range;
        const steps=Math.max(0.001,this.spacing);
        const total=this.method===InstantiateMethod.Distance
            ? Math.min(2048,Math.max(1,Math.floor(span/steps)+1))
            : Math.min(2048,Math.max(1,Math.floor(this.count)));
        // Plan ALL final World-space positions before destroying previously spawned
        // Nodes. Strict policy errors cannot destroy a valid existing population.
        // The legacy (opt-out) path below is otherwise unchanged.
        let accepted:Set<number>|null=null;
        const surfacePlan=new Map<number,PopulationSurfacePlacement>();
        if(this.enablePopulationRules||this.avoidObstacleColliders||this.conformToSurface){
            const policy:PopulationPolicy=this.enablePopulationRules?{
                seed:this.seed,closed:spline.closed===true,density:this.density,
                densityKeys:this.densityKeys,exclusions:this.exclusions,
                minWorldSpacing:this.minWorldSpacing,
            }:{
                seed:this.seed,closed:spline.closed===true,density:1,
                densityKeys:[],exclusions:[],minWorldSpacing:0,
            };
            const candidates:PopulationCandidate[]=[];
            for(let i=0;i<total;i++){
                const d=this.method===InstantiateMethod.Distance?Math.min(span,i*steps):
                    (total>1?span*i/((closedLoop||!this.includeEndPoint)?total:total-1):0);
                if(closedLoop&&d>=span-1e-6&&i>0)break;
                const progress=start+(spline.length>1e-8?d/spline.length:0);
                const modifier=this.modifiers?.sample(progress),noise=this.noise?.sample(progress);
                const frame=new Quat();Quat.multiply(frame,spline.node.worldRotation,spline.evaluateRotation(progress));
                const jitter=(axis:number,range:number)=>(this.rand(i,axis)*2-1)*range;
                const delta=new Vec3(
                    this.offset.x+(modifier?.offset.x||0)+(noise?.x||0)+jitter(1,this.randomPosition.x),
                    this.offset.y+(modifier?.offset.y||0)+(noise?.y||0)+jitter(2,this.randomPosition.y),
                    this.offset.z+(modifier?.offset.z||0)+(noise?.z||0)+jitter(3,this.randomPosition.z));
                Vec3.transformQuat(delta,delta,frame);
                const pos=spline.evaluateWorldPosition(progress);Vec3.add(pos,pos,delta);
                candidates.push({index:i,progress,position:{x:pos.x,y:pos.y,z:pos.z}});
            }
            // Surface projection happens before AABB and World-spacing filters.
            // The projected position is also reused at commit, never recomputed.
            const projected=this.conformToSurface?this.conformCandidates(candidates):candidates;
            if(this.conformToSurface)for(const hit of projected as PopulationSurfacePlacement[])
                surfacePlan.set(hit.index,hit);
            // Exclude occupied obstacle centers BEFORE pairwise spacing.
            const viable=this.avoidObstacleColliders?
                filterObstacleCandidates(projected,this.obstacleBounds(),this.obstacleClearance):
                projected;
            accepted=new Set(planPopulation(viable,policy));
        }
        this.clear();
        for(let i=0;i<total;i++){
            const d=this.method===InstantiateMethod.Distance?Math.min(span,i*steps):
                (total>1?span*i/((closedLoop||!this.includeEndPoint)?total:total-1):0);
            if(closedLoop&&d>=span-1e-6&&i>0)break;
            if(accepted&&!accepted.has(i))continue;
            const progress=start+(spline.length>1e-8?d/spline.length:0);
            const modifier=this.modifiers?.sample(progress);
            const noise=this.noise?.sample(progress);
            const variantIndex=weights?
                selectWeightedPrefab(weights,this.rand(i,0)):
                Math.min(variants.length-1,Math.floor(this.rand(i,0)*variants.length));
            const template=variants[variantIndex];
            const node=instantiate(template);node.name=`Spline Object ${String(i).padStart(3,'0')}`;
            node.setParent(this.ensureSpawnRoot('Spline Objects'));
            const frame=new Quat();Quat.multiply(frame,spline.node.worldRotation,spline.evaluateRotation(progress));
            const jitter=(axis:number,range:number)=>(this.rand(i,axis)*2-1)*range;
            const delta=new Vec3(this.offset.x+(modifier?.offset.x||0)+(noise?.x||0)+jitter(1,this.randomPosition.x),
                this.offset.y+(modifier?.offset.y||0)+(noise?.y||0)+jitter(2,this.randomPosition.y),
                this.offset.z+(modifier?.offset.z||0)+(noise?.z||0)+jitter(3,this.randomPosition.z));
            Vec3.transformQuat(delta,delta,frame);
            const planned=surfacePlan.get(i);
            const pos=spline.evaluateWorldPosition(progress);Vec3.add(pos,pos,delta);
            if(planned)pos.set(planned.position.x,planned.position.y,planned.position.z);
            node.setWorldPosition(pos);
            if(this.alignToSpline){
                if(this.conformToSurface&&this.alignToSurfaceNormal&&planned?.surfaceNormal){
                    const forward=new Vec3();
                    Vec3.transformQuat(forward,new Vec3(0,0,1),frame);
                    const axes=surfaceBasis(planned.surfaceNormal,forward);
                    Quat.fromAxes(frame,
                        new Vec3(axes.right.x,axes.right.y,axes.right.z),
                        new Vec3(axes.up.x,axes.up.y,axes.up.z),
                        new Vec3(axes.forward.x,axes.forward.y,axes.forward.z));
                }
                const r=Quat.fromEuler(new Quat(),jitter(4,this.randomRotation.x),jitter(5,this.randomRotation.y),
                    jitter(6,this.randomRotation.z)+(modifier?.roll||0));
                Quat.multiply(frame,frame,r);node.setWorldRotation(frame);
            }
            const s=node.scale.clone();const f=this.scaleMultiplier*(1+jitter(7,this.randomScale));
            s.x*=f*(modifier?.scale.x||1);s.y*=f*(modifier?.scale.y||1);s.z*=f*(modifier?.scale.z||1);
            node.setScale(s);
            this._generated.push(node);
        }
        this._signature=this.signature();
        this._runtimeSpawned=!EDITOR_NOT_IN_PREVIEW;
        return this._generated.length;
    }
    private ensureSpawnRoot(name:string):Node{
        if(this.spawnedRoot?.isValid)return this.spawnedRoot;
        const root=new Node(name+' (Generated)');root.setParent(this.parentNode||this.node);
        this.spawnedRoot=root;return root;
    }
    public clear():void{
        if(this.spawnedRoot?.isValid){
            for(const n of [...this.spawnedRoot.children]){n.removeFromParent();n.destroy();}
        }
        this._generated=[];this._runtimeSpawned=false;
    }
    onDisable():void{if(!EDITOR_NOT_IN_PREVIEW&&this._runtimeSpawned)this.clear();}
    onDestroy():void{if(!EDITOR_NOT_IN_PREVIEW&&this._runtimeSpawned)this.clear();}
}
