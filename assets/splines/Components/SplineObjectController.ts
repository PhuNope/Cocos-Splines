import { _decorator, CCFloat, Component, Prefab, JsonAsset, Node, instantiate, Vec3, Quat, Enum, Collider, BoxCollider, SphereCollider, CapsuleCollider, MeshCollider, Mesh, MeshRenderer, gfx, PhysicsSystem, geometry } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer } from '../Core/SplineContainer';
import { SplineModifiers } from './SplineModifiers';
import { SplineNoise } from './SplineNoise';
import { InstantiateMethod } from './SplineInstantiate';
import {PopulationCandidate,PopulationDensityKey,PopulationExclusion,PopulationPolicy,PopulationRejectReason,planPopulation} from '../Core/SplinePopulationMath';
import {PlacementDiagnostic,PlacementSummary,attributePlacementDiagnostics,summarizePlacementDiagnostics} from '../Core/SplinePlacementDiagnostics';
import {registerGizmos} from 'db://cocos-gizmos/RegisterGizmos';
import {SplinePlacementGizmos} from '../Editor/SplinePlacementGizmos';
import {PopulationWorldAabb,filterObstacleCandidates,validatePrefabWeights,selectWeightedPrefab} from '../Core/SplinePopulationPlacementMath';
import {colliderWorldObb,colliderWorldCapsule} from '../Core/SplineColliderBounds';
import {meshColliderWorldBvh} from '../Core/SplineMeshColliderAdapter';
import type {ProximityTriangleMesh} from '../Core/SplineProximityMesh';
import {filterPopulationShapeCandidates,filterPopulationShapeCandidatesForRadii,
    type PopulationObstacleShape} from '../Core/SplinePopulationPreciseMath';
import {prefabHierarchyRadius,prefabMeshAabbRadius,prefabBoxRadius,
    prefabSphereRadius,prefabCapsuleRadius,parentLinearStretch,scaledPrefabFootprint,
    type FootprintNode} from '../Core/SplinePrefabFootprintMath';
import {PopulationSurfacePlacement,PopulationSurfaceSettings,projectSurfaceCandidates,surfaceBasis} from '../Core/SplinePopulationSurfaceMath';
import {filterSharedOccupancy,type SharedOccupancyCandidate,type SharedOccupant} from '../Core/SplineSharedOccupancyMath';
import {DEFAULT_POPULATION_GRAPH,parsePopulationGraph,PopulationGraphRunner} from '../Core/SplinePopulationGraph';
import type {PopulationGraphPlan,PopulationGraphContext,PopulationGraphInstance,PopulationGraphMetrics} from '../Core/SplinePopulationGraph';
import type {PopulationSurfaceRaycast} from '../Core/SplinePopulationSurfaceMath';
import {samplePopulationGraphSource,stagePopulationGraphInstances} from '../Core/SplinePopulationGraphHost';
const {ccclass,property,menu}=_decorator;
// Offline legacy 'cc' mocks do not all implement this Cocos Editor decorator.
// The real Creator decorator is always used when available.
const executeInEditMode=_decorator.executeInEditMode??
    ((_enabled:boolean):ClassDecorator=>(ctor)=>ctor);

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
@registerGizmos(SplinePlacementGizmos)
@menu('Splines/Spline Object Controller')
@executeInEditMode(true)
export class SplineObjectController extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:[Prefab],tooltip:'Prefab variations. Selection is deterministic for the seed.'}) prefabs:Prefab[]=[];
    @property({tooltip:'Opt-in weighted selection of Prefabs. Disabled uses the legacy uniform seeded variant RNG.'})
    usePrefabWeights=false;
    @property({type:[CCFloat],tooltip:'Weights aligned by index to Prefabs. Exactly one value per slot, zero disables a variant; max 128.'})
    prefabWeights:number[]=[];
    @property({type:Node,tooltip:'Generated children parent; defaults to this Node.'}) parentNode:Node|null=null;
    @property({tooltip:'Use the Population Graph instead of ordinary placement and filtering settings.'}) usePopulationGraph=false;
    @property({type:JsonAsset,tooltip:'Optional Population Graph JSON asset; takes precedence over local graph JSON.'}) populationGraphAsset:JsonAsset|null=null;
    @property({multiline:true,tooltip:'Local typed Population Graph v1 JSON, used when no graph asset is assigned.'}) populationGraphJson=DEFAULT_POPULATION_GRAPH;
    @property({type:SplineContainer}) graphSplineB:SplineContainer|null=null;
    @property({type:SplineContainer}) graphSplineC:SplineContainer|null=null;
    @property({min:2,max:64,step:1,tooltip:'World path sampling per curve for graph distribution.'}) graphSamplesPerCurve=16;
    @property({type:SplineModifiers}) modifiers:SplineModifiers|null=null;
    @property({type:SplineNoise,tooltip:'Optional seeded layered offset in spline-frame Right/Up/Forward coordinates. No Knot changes.'})
    noise:SplineNoise|null=null;
    @property({type:Enum(InstantiateMethod)}) method:InstantiateMethod=InstantiateMethod.Count;
    @property({min:1,max:2048,step:1}) count=12;
    @property({min:0.001}) spacing=2;
    @property({range:[0,1,0.001],slide:true}) startProgress=0;
    @property({range:[0,1,0.001],slide:true}) endProgress=1;
    @property({tooltip:'Right/Up/Forward offset in spline frame.'}) offset=new Vec3();
    @property randomPosition=new Vec3();
    @property({tooltip:'Euler jitter in degrees.'}) randomRotation=new Vec3();
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
    @property({min:0,max:10000,tooltip:'Optional minimum WORLD distance between final placed prefab centers.'})
    minWorldSpacing=0;
    @property({tooltip:'Reject candidates overlapping spawned lower-priority peer controllers.'})
    avoidPeerPopulation=false;
    @property({type:[Node],tooltip:'Explicit peer Nodes with SplineObjectController.'})
    occupancyPeerNodes:Node[]=[];
    @property({min:0,max:32767,step:1,tooltip:'Explicit numeric order.'})
    occupancyPriority=0;
    @property({min:0,max:100,tooltip:'Published conservative World-space sphere radius of EVERY spawned instance.'})
    sharedOccupancyRadius=0;
    @property({min:0,max:10000,tooltip:'Extra World-unit clearance from selected peer prefab footprints.'})
    peerOccupancyClearance=0;
    @property({tooltip:'Opt-in explicit Collider avoidance using conservative World AABB bounds.'})
    avoidObstacleColliders=false;
    @property({type:[Collider],tooltip:'Only these assigned active Colliders are considered (max 64). Not a Physics overlap query.'})
    obstacleColliders:Collider[]=[];
    @property({min:0,max:10000,tooltip:'World-unit radius around each candidate center kept clear of assigned Collider World AABBs.'})
    obstacleClearance=0;
    @property({tooltip:'Opt-in: use validated BoxCollider OBB / CapsuleCollider geometry for population clearance.'})
    usePreciseObstacleShapes=false;
    @property({min:0,max:100,tooltip:'Manual conservative prefab footprint SPHERE radius in World units.'})
    placementFootprintRadius=0;
    @property({tooltip:'Opt-in conservative sphere footprint per selected prefab.'})
    autoPrefabFootprint=false;
    @property({tooltip:'Optional when Precise Obstacle Shapes is enabled: read a non-convex MeshCollider.'})
    useMeshColliderBVH=false;
    @property({tooltip:'Opt-in: drop prefab centers onto explicitly assigned Physics 3D Collider/TerrainCollider surfaces.'})
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
    @property({tooltip:'If Align To Spline is on, align prefab local Y to hit normal while keeping projected spline forward.'})
    alignToSurfaceNormal=false;
    @property alignToSpline=true;
    @property includeEndPoint=true;
    @property rebuildOnChange=false;
    @property({tooltip:'Spawn at Play only when the scene has no manually spawned instances.'}) spawnOnStart=true;
    @property({tooltip:'Draw non-destructive accepted/rejected placement markers only when selected in Scene.'})
    showPlacementGizmos=false;
    @property({min:8,max:256,step:1,tooltip:'Maximum markers drawn; complete planning is evaluated before sampling.'})
    placementGizmoLimit=96;
    @property({min:0.02,max:2,tooltip:'World-space visualization marker radius.'})
    placementGizmoSize=.12;
    @property({tooltip:'Draw estimated prefab sphere footprints in Scene view, when available.'})
    showPlacementFootprints=false;
    @property({type:Node,visible:false}) spawnedRoot:Node|null=null;
    private _runtimeSpawned=false;
    private _generated:Node[]=[];
    private _signature='';
    private _graphMetrics:PopulationGraphMetrics={computed:0,reused:0,nodes:0};
    private _graphWarning='';
    /** Last automatic graph rebuild error; runtime does not spam the console. */
    public getPopulationGraphError():string{return this._graphWarning;}
    public getPopulationGraphMetrics():PopulationGraphMetrics{return {...this._graphMetrics};}
    private rand(index:number,channel:number):number{
        let v=(this.seed|0)^Math.imul(index+13,0x9e3779b9)^Math.imul(channel+7,0x85ebca6b);
        v=Math.imul(v^(v>>>16),0x7feb352d);v=Math.imul(v^(v>>>15),0x846ca68b);
        return ((v^(v>>>16))>>>0)/4294967296;
    }
    /** Read ONLY serialized prefab asset geometry; does not instantiate a Node
     * or touch Physics. Unknown Collider geometry fails closed. */
    private inferPrefabRadius(prefab:Prefab):number {
        const root=prefab?.data;
        if(!root)throw Error('Automatic footprint needs Prefab.data with readable static geometry.');
        const seen=new Set<Node>();
        let visited=0;
        const extract=(node:Node,depth:number):FootprintNode=>{
            // Validate the engine-owned Node graph before recursively copying
            // so malformed/cyclic serialized prefabs cannot bypass math limits.
            if(!node||seen.has(node)||depth>32||++visited>1024||
                !Array.isArray(node.children)||!node.position||!node.scale)
                throw Error('Prefab hierarchy is invalid, cyclic or too large for automatic bounds.');
            seen.add(node);
            const radii:number[]=[];
            for(const collider of node.getComponents(Collider)){
                if(collider instanceof BoxCollider)
                    radii.push(prefabBoxRadius(collider.center,collider.size));
                else if(typeof SphereCollider==='function'&&collider instanceof SphereCollider)
                    radii.push(prefabSphereRadius(collider.center,collider.radius));
                else if(collider instanceof CapsuleCollider)
                    radii.push(prefabCapsuleRadius(collider.center,collider.radius,
                        collider.cylinderHeight));
                else if(collider instanceof MeshCollider){
                    const mesh=collider.mesh;
                    if(!mesh)throw Error('Prefab MeshCollider is missing its Mesh bounds.');
                    radii.push(prefabMeshAabbRadius(mesh.minPosition,mesh.maxPosition)+
                        Math.hypot(collider.center.x,collider.center.y,collider.center.z));
                }else throw Error('Automatic footprint cannot bound an unsupported prefab Collider.');
            }
            for(const renderer of node.getComponents(MeshRenderer)){
                const mesh=renderer.mesh;
                if(!mesh)throw Error('Prefab MeshRenderer has no readable Mesh bounds.');
                radii.push(prefabMeshAabbRadius(mesh.minPosition,mesh.maxPosition));
            }
            return {position:{x:node.position.x,y:node.position.y,z:node.position.z},
                scale:{x:node.scale.x,y:node.scale.y,z:node.scale.z},
                radii,children:node.children.map(child=>extract(child,depth+1))};
        };
        return prefabHierarchyRadius(extract(root,0));
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
        return projectSurfaceCandidates(candidates,settings,this.surfaceRaycast(targets));
    }
    private surfaceRaycast(targets:ReadonlyArray<Collider>):PopulationSurfaceRaycast{
        if(!PhysicsSystem?.instance||typeof PhysicsSystem.instance.raycast!=='function'||
           typeof geometry?.Ray!=='function')
            throw Error('Surface Conform requires a working Physics 3D raycast in the active Scene.');
        const physics=PhysicsSystem.instance;
        return (origin,length)=>{
            const ray=new geometry.Ray(origin.x,origin.y,origin.z,0,-1,0);
            if(!physics.raycast(ray,0xffffffff,length,false))return [];
            const results=physics.raycastResults;
            if(!Array.isArray(results))throw Error('Physics raycastResults must be an array.');
            return results.map(hit=>{
                const index=targets.indexOf(hit.collider);
                const p=hit.hitPoint,n=hit.hitNormal;
                return {targetIndex:index,distance:hit.distance,
                    point:{x:p?.x??NaN,y:p?.y??NaN,z:p?.z??NaN},
                    normal:{x:n?.x??NaN,y:n?.y??NaN,z:n?.z??NaN}};
            });
        };
    }
    /** Cache immutable World BVHs by mesh identity + hash + collider pose/bounds.
     * Weak keys prevent detached obstacle references from being retained.
     * Mesh changes without updated hash require explicit invalidation/reload. */
    private _populationMeshCache=new WeakMap<MeshCollider,{
        asset:Mesh;key:string;geometry:ProximityTriangleMesh|null
    }>();
    private obstacleMeshShape(collider:MeshCollider,
        bounds:PopulationWorldAabb):ProximityTriangleMesh|null{
        const mesh=collider.mesh,node=collider.node;
        if(!mesh||!mesh.allowDataAccess||collider.convex||!node?.worldMatrix||
            !collider.center)return null;
        const m=node.worldMatrix,v=collider.center,b=bounds;
        const key=JSON.stringify([mesh.hash,
            m.m00,m.m01,m.m02,m.m04,m.m05,m.m06,
            m.m08,m.m09,m.m10,m.m12,m.m13,m.m14,
            v.x,v.y,v.z,
            b.center.x,b.center.y,b.center.z,
            b.halfExtents.x,b.halfExtents.y,b.halfExtents.z]);
        const cached=this._populationMeshCache.get(collider);
        if(cached?.asset===mesh&&cached.key===key)return cached.geometry;
        const result=meshColliderWorldBvh(mesh,m,v,b,{
            positionAttribute:gfx.AttributeName.ATTR_POSITION,
            formatTable:gfx.Format as unknown as Readonly<Record<string,number|string>>,
            triangleListMode:gfx.PrimitiveMode.TRIANGLE_LIST,
        });
        this._populationMeshCache.set(collider,{asset:mesh,key,geometry:result});
        return result;
    }
    /** Snapshot all active obstacle shapes once, prior to population clear().
     * Reuses the same strict adapters as SplineAnimate; a rejected OBB/Capsule
     * does NOT fall through to an optimistic approximation: use World AABB. */
    private obstacleShapes():PopulationObstacleShape[]{
        if(!Array.isArray(this.obstacleColliders)||this.obstacleColliders.length>64)
            throw Error('Population obstacle list must have no more than 64 Collider references.');
        const shapes:PopulationObstacleShape[]=[];
        for(const collider of this.obstacleColliders){
            if(!collider)throw Error('Population obstacle list contains a missing Collider reference.');
            if(collider.enabled===false||collider.node?.activeInHierarchy===false)continue;
            const bounds=collider.worldBounds;
            if(!bounds?.center||!bounds?.halfExtents)
                throw Error('Assigned Collider has no readable World AABB bounds.');
            const fallback:PopulationObstacleShape={kind:'aabb',bounds:{
                center:{x:bounds.center.x,y:bounds.center.y,z:bounds.center.z},
                halfExtents:{x:bounds.halfExtents.x,y:bounds.halfExtents.y,z:bounds.halfExtents.z},
            }};
            const matrix=collider.node?.worldMatrix;
            if(matrix&&typeof BoxCollider==='function'&&collider instanceof BoxCollider){
                const obb=colliderWorldObb(collider.center,collider.size,matrix,bounds);
                shapes.push(obb?{kind:'obb',box:obb}:fallback);
            }else if(matrix&&typeof CapsuleCollider==='function'&&collider instanceof CapsuleCollider){
                const capsule=colliderWorldCapsule(collider.center,collider.radius,
                    collider.cylinderHeight,collider.direction,matrix,bounds);
                shapes.push(capsule?{kind:'capsule',capsule}:fallback);
            }else if(matrix&&this.useMeshColliderBVH&&
                typeof MeshCollider==='function'&&collider instanceof MeshCollider){
                // Invalid/unreadable/convex/stale MeshCollider never drops a collision.
                let mesh:ProximityTriangleMesh|null=null;
                try{mesh=this.obstacleMeshShape(collider,fallback.bounds);}
                catch{mesh=null;}
                shapes.push(mesh?{kind:'mesh',mesh}:fallback);
            }else shapes.push(fallback);
        }
        return shapes;
    }
    /** Snapshot only explicitly selected, already spawned and lower-priority peers.
     * Strict monotonic priority gives a DAG (never mutual auto-respawn).
     * Read generated children from Scene so saved/reopened peer populations work.
     * Does not modify, clear or generate peers.
     */
    private peerOccupants():SharedOccupant[]{
        const refs=this.occupancyPeerNodes;
        if(!Array.isArray(refs)||refs.length<1||refs.length>16||
           !Number.isInteger(this.occupancyPriority)||
           this.occupancyPriority<0||this.occupancyPriority>32767||
           !Number.isFinite(this.sharedOccupancyRadius)||
           this.sharedOccupancyRadius<0||this.sharedOccupancyRadius>100||
           !Number.isFinite(this.peerOccupancyClearance)||
           this.peerOccupancyClearance<0||this.peerOccupancyClearance>10000)
            throw Error('Shared Occupancy needs 1–16 peers and valid priority/radius/clearance.');
        const rootOf=(node:Node):Node=>{
            let cursor=node,depth=0;
            const seen=new Set<Node>();
            while(cursor?.parent){
                if(seen.has(cursor)||++depth>128)throw Error('Cyclic/invalid Scene hierarchy.');
                seen.add(cursor);cursor=cursor.parent;
            }
            if(!cursor)throw Error('Unloaded peer Scene.');
            return cursor;
        };
        const sceneRoot=rootOf(this.node),seen=new Set<Node>();
        const entries:SharedOccupant[]=[];
        for(const peerNode of refs){
            if(!peerNode||seen.has(peerNode)||peerNode===this.node||
               peerNode.isValid===false||peerNode.activeInHierarchy===false||
               rootOf(peerNode)!==sceneRoot)
                throw Error('Shared Occupancy peer must be a distinct, active Node in the same Scene.');
            seen.add(peerNode);
            const peer=peerNode.getComponent(SplineObjectController);
            if(!peer||peer===this||peer.enabled===false||
               !Number.isInteger(peer.occupancyPriority)||
               peer.occupancyPriority<0||peer.occupancyPriority>=this.occupancyPriority||
               !Number.isFinite(peer.sharedOccupancyRadius)||
               peer.sharedOccupancyRadius<0||peer.sharedOccupancyRadius>100)
                throw Error('Shared Occupancy peer must have valid, strictly LOWER priority and footprint radius.');
            const generated=peer.spawnedRoot;
            if(!generated?.isValid||rootOf(generated)!==sceneRoot||
               !Array.isArray(generated.children)||generated.children.length>2048)
                throw Error('Peer population must already exist in the same Scene; spawn lower priority first.');
            for(const instance of generated.children){
                if(!instance||instance.isValid===false)
                    throw Error('Peer population contains an invalid generated Node.');
                const p=instance.worldPosition;
                entries.push({position:{x:p?.x,y:p?.y,z:p?.z},
                    radius:peer.sharedOccupancyRadius});
            }
        }
        return entries;
    }
    private graphText():string{
        if(!this.populationGraphAsset)return this.populationGraphJson;
        return JSON.stringify(this.populationGraphAsset.json);
    }
    private graphSource(slot:number):SplineContainer|null{
        return slot===0?(this.spline||this.node.parent?.getComponent(SplineContainer)||null):slot===1?this.graphSplineB:this.graphSplineC;
    }
    private graphSignature(plan:PopulationGraphPlan,text:string):string{
        const matrix=(node:Node|undefined|null)=>{
            const m=node?.worldMatrix;return m?[m.m00,m.m01,m.m02,m.m04,m.m05,m.m06,m.m08,m.m09,m.m10,m.m12,m.m13,m.m14]:null;
        };
        const colliderKey=(c:Collider)=>{
            if(!c)return null;
            const bounds=c.worldBounds;
            return [c.node?.uuid,c.enabled,c.node?.isValid,c.node?.activeInHierarchy,matrix(c.node),bounds?.center,bounds?.halfExtents,
                typeof BoxCollider==='function'&&c instanceof BoxCollider?[c.center,c.size]:null,
                typeof CapsuleCollider==='function'&&c instanceof CapsuleCollider?[c.center,c.radius,c.cylinderHeight,c.direction]:null,
                typeof MeshCollider==='function'&&c instanceof MeshCollider?[c.mesh?.uuid,c.mesh?.hash,c.mesh?.allowDataAccess,c.convex,c.center]:null];
        };
        return JSON.stringify(['populationGraph',text,this.graphSamplesPerCurve,this.prefabs.map(p=>p?.uuid),
            this.parentNode?.uuid,matrix(this.parentNode||this.node),this.spawnedRoot?.isValid?matrix(this.spawnedRoot):matrix(this.parentNode||this.node),
            plan.nodes.filter(n=>n.type==='spline').map(n=>{
                const s=this.graphSource(n.slot??0);return [s?.node?.uuid,s?.getRevision(),s?.closed,s?.enabled,s?.node?.isValid,s?.node?.activeInHierarchy,matrix(s?.node)];
            }),plan.nodes.some(n=>n.type==='surface')?this.surfaceColliders.map(colliderKey):null,
            plan.nodes.some(n=>n.type==='obstacle')?[this.useMeshColliderBVH,this.obstacleColliders.map(colliderKey)]:null]);
    }
    /** Read-only evaluation of current graph inputs. Explicit respawn always
     * uses a fresh runner so moving physics results never reuse stale queries. */
    private prepareGraphPlacement():{instances:PopulationGraphInstance[];metrics:PopulationGraphMetrics;signature:string}{
        const text=this.graphText(),plan=parsePopulationGraph(text);
        if(!Array.isArray(this.prefabs)||this.prefabs.length<1||this.prefabs.length>128||this.prefabs.some(p=>!p))
            throw Error('Population Graph requires 1–128 nonempty Prefab slots; slot order is preserved.');
        const sources:PopulationGraphContext['sources'][number][]=[];
        for(const n of plan.nodes)if(n.type==='spline'){
            const slot=n.slot??0,s=this.graphSource(slot);
            if(!s||s.enabled===false||s.node?.isValid===false||s.node?.activeInHierarchy===false||s.count<2)
                throw Error('Population Graph requires an active SplineContainer in slot '+slot+'.');
            sources[slot]=samplePopulationGraphSource(s,this.graphSamplesPerCurve);
        }
        const context:PopulationGraphContext={sources,prefabSlotCount:this.prefabs.length};
        if(plan.nodes.some(n=>n.type==='surface')){
            const targets=this.surfaceTargets();
            context.surface={revision:'fresh-surface',targetCount:targets.length,raycast:this.surfaceRaycast(targets)};
        }
        if(plan.nodes.some(n=>n.type==='obstacle'))context.obstacles={revision:'fresh-obstacles',shapes:this.obstacleShapes()};
        const result=new PopulationGraphRunner().evaluate(plan,context);
        return {...result,signature:this.graphSignature(plan,text)};
    }
    public previewPopulationGraph():PopulationGraphInstance[]{return this.prepareGraphPlacement().instances;}
    private respawnPopulationGraph():number{
        const prepared=this.prepareGraphPlacement();
        const previous=this.spawnedRoot?.isValid?this.spawnedRoot:null;
        const parent=this.parentNode||this.node;
        // Same generated-root ownership contract as ordinary Object Controller.
        // A new root is staged inactive; existing root transforms are preserved.
        const staged=stagePopulationGraphInstances(previous,parent,this.prefabs,prepared.instances);
        this.spawnedRoot=staged.root;this._generated=staged.nodes;
        this._signature=prepared.signature;this._runtimeSpawned=!EDITOR_NOT_IN_PREVIEW;
        this._graphMetrics=prepared.metrics;this._graphWarning='';
        return staged.nodes.length;
    }
    private signature():string{
        if(this.usePopulationGraph){const text=this.graphText();return this.graphSignature(parsePopulationGraph(text),text);}
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
            ]:null,this.avoidObstacleColliders?[
                this.usePreciseObstacleShapes,
                this.usePreciseObstacleShapes?[
                    this.autoPrefabFootprint?null:this.placementFootprintRadius,
                    this.autoPrefabFootprint,this.useMeshColliderBVH,
                    this.obstacleColliders.map(c=>{
                        if(!c)return null;
                        return [c.node?.worldMatrix,
                            typeof BoxCollider==='function'&&c instanceof BoxCollider?
                                [c.center,c.size]:null,
                            typeof CapsuleCollider==='function'&&c instanceof CapsuleCollider?
                                [c.center,c.radius,c.cylinderHeight,c.direction]:null,
                            this.useMeshColliderBVH&&typeof MeshCollider==='function'&&
                                c instanceof MeshCollider?
                                [c.mesh?.uuid,c.mesh?.hash,c.mesh?.allowDataAccess,
                                    c.convex,c.center]:null];
                    }),
                ]:null,
            ]:null,this.avoidPeerPopulation,this.avoidPeerPopulation?[
                this.occupancyPriority,this.sharedOccupancyRadius,
                this.peerOccupancyClearance,
                this.occupancyPeerNodes.map(node=>{
                    const peer=node?.getComponent(SplineObjectController);
                    return [node?.uuid,peer?.occupancyPriority,
                        peer?.sharedOccupancyRadius,peer?.spawnedRoot?.uuid,
                        peer?.spawnedRoot?.children.map(child=>[
                            child.uuid,child.worldPosition])];
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
    update():void{
        if(EDITOR_NOT_IN_PREVIEW||!this._runtimeSpawned||!this.rebuildOnChange)return;
        if(!this.usePopulationGraph){if(this.signature()!==this._signature)this.respawn();return;}
        try{if(this.signature()!==this._signature)this.respawn();else this._graphWarning='';}
        catch(error){this._graphWarning=String(error);}
    }
    /** Spawn only if the serialized/generated root has no children. */
    public spawn():number{
        if(this.spawnedRoot?.isValid&&this.spawnedRoot.children.length){this._signature=this.signature();return 0;}
        return this.respawn();
    }
    /** Authoritative preflight for both read-only preview and Respawn. */
    public previewPlacement():PlacementDiagnostic[]{
        if(this.usePopulationGraph)return this.previewPopulationGraph().map(p=>({index:p.index,progress:p.progress,position:p.position,radius:0,reason:'accepted'}));
        return this.preparePlacement(true)?.diagnostics??[];
    }
    /** Read-only exact candidate counts (not the limited drawn Gizmo markers). */
    public summarizePlacement():PlacementSummary{
        if(this.usePopulationGraph)throw Error('Population Graph preview shows accepted candidates only; per-stage rejection statistics are not available yet.');
        return summarizePlacementDiagnostics(this.previewPlacement());
    }
    public placementPreviewRevision():string{
        return JSON.stringify([this.signature(),this.showPlacementGizmos,
            this.placementGizmoLimit,this.placementGizmoSize,this.showPlacementFootprints]);
    }
    private preparePlacement(trace:boolean){
        // Reject malformed noise configs BEFORE destroying previously spawned objects.
        if(this.noise)this.noise.sample(0);
        const spline=this.spline||this.node.parent?.getComponent(SplineContainer)||null;
        const variants=this.prefabs.filter((p):p is Prefab=>!!p);
        if(!spline||spline.count<2||!variants.length){
            return null;
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
        if(end<start){return null;}
        const range=end-start;
        const closedLoop=spline.closed&&range>=1-1e-6;
        const span=spline.length*range;
        const steps=Math.max(0.001,this.spacing);
        const total=this.method===InstantiateMethod.Distance
            ? Math.min(2048,Math.max(1,Math.floor(span/steps)+1))
            : Math.min(2048,Math.max(1,Math.floor(this.count)));
        // Auto footprint is opt-in: calculate all selectable prefab asset radii
        // without instantiating, before any generated Node can be cleared.
        const autoFootprints=this.avoidObstacleColliders&&this.usePreciseObstacleShapes&&
            this.autoPrefabFootprint?
            variants.map((prefab,index)=>{
                if(weights&&weights[index]===0)return 0; // slot cannot be selected
                return this.inferPrefabRadius(prefab);
            }):null;
        const placementParent=this.spawnedRoot?.isValid?this.spawnedRoot:
            (this.parentNode||this.node);
        const parentStretch=autoFootprints?
            parentLinearStretch(placementParent.worldMatrix):1;
        // Plan ALL final World-space positions before destroying previously spawned
        // Nodes. Strict policy errors cannot destroy a valid existing population.
        // The legacy (opt-out) path below is otherwise unchanged.
        let accepted:Set<number>|null=null;
        let diagnostics:PlacementDiagnostic[]=[];
        const surfacePlan=new Map<number,PopulationSurfacePlacement>();
        if(this.enablePopulationRules||this.avoidObstacleColliders||this.conformToSurface||this.avoidPeerPopulation||trace){
            const policy:PopulationPolicy=this.enablePopulationRules?{
                seed:this.seed,closed:spline.closed===true,density:this.density,
                densityKeys:this.densityKeys,exclusions:this.exclusions,
                minWorldSpacing:this.minWorldSpacing,
            }:{
                seed:this.seed,closed:spline.closed===true,density:1,
                densityKeys:[],exclusions:[],minWorldSpacing:0,
            };
            const candidates:PopulationCandidate[]=[];
            const candidateRadii=new Map<number,number>();
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
                if(autoFootprints){
                    const selectedVariant=weights?
                        selectWeightedPrefab(weights,this.rand(i,0)):
                        Math.min(variants.length-1,Math.floor(this.rand(i,0)*variants.length));
                    const scaleFactor=this.scaleMultiplier*(1+jitter(7,this.randomScale));
                    const modifierScale={
                        x:modifier?.scale.x||1,y:modifier?.scale.y||1,z:modifier?.scale.z||1,
                    };
                    candidateRadii.set(i,scaledPrefabFootprint(
                        autoFootprints[selectedVariant],{x:parentStretch,y:parentStretch,z:parentStretch},
                        scaleFactor,modifierScale));
                }
            }
            // Surface projection happens before AABB and World-spacing filters.
            // The projected position is also reused at commit, never recomputed.
            const projected=this.conformToSurface?this.conformCandidates(candidates):candidates;
            if(this.conformToSurface)for(const hit of projected as PopulationSurfacePlacement[])
                surfacePlan.set(hit.index,hit);
            // Exclude occupied obstacle centers BEFORE pairwise spacing.
            const viable=this.avoidObstacleColliders?
                (this.usePreciseObstacleShapes?
                    (autoFootprints?
                        filterPopulationShapeCandidatesForRadii(projected,this.obstacleShapes(),
                            this.obstacleClearance,projected.map(c=>{
                                const radius=candidateRadii.get(c.index);
                                if(radius===undefined)throw Error('Missing planned prefab radius.');
                                return radius;
                            })):
                        filterPopulationShapeCandidates(projected,this.obstacleShapes(),
                            this.obstacleClearance,this.placementFootprintRadius)):
                    filterObstacleCandidates(projected,this.obstacleBounds(),this.obstacleClearance)):
                projected;
            const shared=this.avoidPeerPopulation?
                filterSharedOccupancy(viable.map((candidate):SharedOccupancyCandidate=>{
                    const automatic=candidateRadii.get(candidate.index);
                    return {...candidate,radius:Math.max(this.sharedOccupancyRadius,automatic??0)};
                }),this.peerOccupants(),this.peerOccupancyClearance):viable;
            // Peer-rejected candidates never reserve a Min World Spacing cell.
            const finalRejections:{index:number;reason:PopulationRejectReason}[]=[];
            const indices=planPopulation(shared,policy,trace?
                (index,reason)=>finalRejections.push({index,reason}):undefined);
            accepted=new Set(indices);
            if(trace){
                const previewRadii=this.avoidPeerPopulation?
                    new Map([...candidateRadii].map(([index,radius])=>
                        [index,Math.max(radius,this.sharedOccupancyRadius)])):candidateRadii;
                const manual=this.avoidObstacleColliders&&this.usePreciseObstacleShapes&&
                    !this.autoPrefabFootprint?this.placementFootprintRadius:0;
                diagnostics=attributePlacementDiagnostics({
                    planned:candidates,projected,obstacle:viable,peers:shared,
                    accepted:indices,finalRejections,radii:previewRadii,
                    defaultRadius:Math.max(manual,
                        this.avoidPeerPopulation?this.sharedOccupancyRadius:0),
                });
            }
        }
        return {spline,variants,weights,start,closedLoop,span,steps,total,accepted,
            surfacePlan,diagnostics};
    }
    /** Only clear old generated instances AFTER all placement validation. */
    public respawn():number{
        if(this.usePopulationGraph)return this.respawnPopulationGraph();
        const prepared=this.preparePlacement(false);
        if(!prepared){this.clear();this._signature=this.signature();return 0;}
        const {spline,variants,weights,start,closedLoop,span,steps,total,accepted,surfacePlan}=prepared;
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
        this._generated=[];this._runtimeSpawned=false;this._graphMetrics={computed:0,reused:0,nodes:0};this._graphWarning='';
    }
    onDisable():void{if(!EDITOR_NOT_IN_PREVIEW&&this._runtimeSpawned)this.clear();}
    onDestroy():void{if(!EDITOR_NOT_IN_PREVIEW&&this._runtimeSpawned)this.clear();}
}
