'use strict';
// Runs inside Cocos Creator scene process. Persistent knot/Container property
// changes use native scene messages; preview methods temporarily set transforms
// and SplineAnimate restores them when its edit preview ends.
function resolve(id) {
    const {director}=require('cc');
    const root=director.getScene();
    if(!root||!id)return null;
    const find=(n)=>{
        if(n.uuid===id)return n;
        for(const c of n.children){const found=find(c);if(found)return found;}
        return null;
    };
    return find(root);
}
function classOf(c){return require('cc').js.getClassName(c);}
function containerOf(node) {
    let n=node;
    while(n){if(n.components.some(c=>classOf(c)==='Splines.SplineContainer'))return n;n=n.parent;}
    return null;
}
function query(uuid){
    const node=resolve(uuid),root=node?containerOf(node):null;
    if(!root)return {found:false,message:'Hãy chọn Spline Container hoặc Knot thuộc spline.'};
    const {js}=require('cc');
    const containerIndex=root.components.findIndex(c=>js.getClassName(c)==='Splines.SplineContainer');
    const component=root.components[containerIndex];
    const knots=[];
    for(const child of root.children){
        const i=child.components.findIndex(c=>js.getClassName(c)==='Splines.SplineKnot');
        if(i<0)continue;
        const k=child.components[i];
        knots.push({uuid:child.uuid,name:child.name,index:knots.length,componentIndex:i,
            position:{x:child.position.x,y:child.position.y,z:child.position.z},mode:k.mode,tension:k.tension,tangentsInKnotSpace:!!k.tangentsInKnotSpace,
            hasHandles:!!(k.tangentInHandle||k.tangentOutHandle),editTangentHandles:!!k.editTangentHandles,
            tangentIn:{x:k.tangentIn.x,y:k.tangentIn.y,z:k.tangentIn.z},
            tangentOut:{x:k.tangentOut.x,y:k.tangentOut.y,z:k.tangentOut.z}});
    }
    let length=0,segments=0;
    if(component && typeof component.evaluateByDistance==='function') {
        try{length=component.length;segments=component.segmentCount;}
        catch(err){return {found:true,rootUuid:root.uuid,rootName:root.name,parentUuid:root.parent?.uuid,containerIndex,knots,warning:String(err)};}
    }
    return {found:true,rootUuid:root.uuid,rootName:root.name,parentUuid:root.parent?.uuid,containerIndex,closed:component.closed,dimension:component.dimension,
      reversed:component.reversed,length,segments,knots};
}
function queryKnotEditFrame(rootUuid){
    const root=resolve(rootUuid);
    if(!root||containerOf(root)!==root||
       !root.components.some(c=>classOf(c)==='Splines.SplineContainer'))
        return {ok:false,error:'Not an active SplineContainer.'};
    const m=root.worldMatrix;
    // The Cocos Mat4 field order matches Vec3.transformMat4 and keeps parent
    // rotation, translation and non-uniform scale. Only return JSON numbers.
    const matrix=[
        m.m00,m.m01,m.m02,m.m03,m.m04,m.m05,m.m06,m.m07,
        m.m08,m.m09,m.m10,m.m11,m.m12,m.m13,m.m14,m.m15,
    ];
    if(matrix.some(x=>typeof x!=='number'||!Number.isFinite(x)))
        return {ok:false,error:'Spline world matrix has invalid values.'};
    return {ok:true,matrix};
}
const COLLIDER_CLASSES=new Set([
    'BoxCollider','SphereCollider','CapsuleCollider','CylinderCollider',
    'ConeCollider','MeshCollider','TerrainCollider','PlaneCollider','SimplexCollider',
]);
function activePhysicsColliders(node){
    return node.components.filter(component=>{
        const name=classOf(component).replace(/^cc\./,'');
        return COLLIDER_CLASSES.has(name)&&component.enabled!==false&&component.isValid!==false;
    });
}
/**
 * Returns explicit targets rather than snapping against every Scene mesh.
 * Prevents accidental snaps onto the spline's own generated road/extrusion.
 */
function listSurfaceTargets(rootUuid){
    const root=resolve(rootUuid);
    if(!root||containerOf(root)!==root)return {ok:false,error:'Select a SplineContainer.'};
    const {director}=require('cc');
    const scene=director.getScene();
    const targets=[];
    const isInsideSpline=n=>{
        for(let p=n;p;p=p.parent)if(p===root)return true;
        return false;
    };
    const walk=node=>{
        if(targets.length>=128)return;
        if(!isInsideSpline(node)){
            const renderer=node.components.find(c=>classOf(c)==='cc.MeshRenderer'||classOf(c)==='MeshRenderer');
            const mesh=renderer?.mesh;
            if(mesh&&mesh.isValid!==false&&mesh.allowDataAccess&&mesh.struct?.primitives?.length===1&&targets.length<128)
                targets.push({uuid:node.uuid,name:node.name,kind:'mesh'});
            const colliders=activePhysicsColliders(node);
            if(colliders.length&&targets.length<128)
                targets.push({uuid:node.uuid,name:node.name,kind:'collider',
                    colliderTypes:colliders.map(c=>classOf(c).replace(/^cc./,''))});
        }
        for(const child of node.children)walk(child);
    };
    if(scene)walk(scene);
    return {ok:true,targets};
}
function snapToSurfaceTarget(rootUuid,targetUuid,origins,options={}){
    const spline=resolve(rootUuid),node=resolve(targetUuid);
    if(!spline||containerOf(spline)!==spline||!node||
       !spline.components.some(c=>classOf(c)==='Splines.SplineContainer'))
        return {ok:false,error:'Invalid spline or surface target.'};
    for(let p=node;p;p=p.parent)if(p===spline)
        return {ok:false,error:'Cannot snap against mesh inside the edited spline.'};
    const kind=options.kind===undefined?'mesh':options.kind;
    if(kind!=='mesh'&&kind!=='collider')
        return {ok:false,error:'Surface target kind must be mesh or collider.'};
    if(kind==='collider'){
        try{
            const colliders=activePhysicsColliders(node);
            const {PhysicsSystem,geometry}=require('cc');
            const physics=PhysicsSystem?.instance;
            if(!physics||typeof physics.raycast!=='function'||typeof geometry?.Ray!=='function')
                return {ok:false,error:'3D Physics raycasting is unavailable in this Scene; enable Physics or use MeshRenderer.'};
            const {snapColliderOrigins}=require('./SplineColliderSnapMath');
            const hits=snapColliderOrigins(origins,colliders,options,(origin,depth)=>{
                const ray=new geometry.Ray(origin.x,origin.y,origin.z,0,-1,0);
                if(!physics.raycast(ray,0xffffffff,depth,false))return [];
                // PhysicsRayResult objects are engine-owned/reused; consume
                // them immediately, before the next raycast call.
                return physics.raycastResults;
            });
            return {ok:true,hits,source:'collider'};
        }catch(error){return {ok:false,error:String(error?.message||error)};}
    }
    const {gfx}=require('cc');
    const renderer=node.components.find(c=>classOf(c)==='cc.MeshRenderer'||classOf(c)==='MeshRenderer');
    const mesh=renderer?.mesh;
    if(!mesh)return {ok:false,error:'Target node must contain a MeshRenderer with a mesh.'};
    if(!mesh.allowDataAccess)
        return {ok:false,error:'Enable Allow Data Access on the target mesh import.'};
    if(mesh.struct?.primitives?.length!==1)
        return {ok:false,error:'Surface target must have one submesh (20,000 triangles max).'};
    try{
        const positions=mesh.readAttribute(0,gfx.AttributeName.ATTR_POSITION);
        const indices=mesh.readIndices(0);
        const format=mesh.readAttributeFormat(0,gfx.AttributeName.ATTR_POSITION);
        const formatName=typeof format==='string'?format:format?.name;
        if(!positions||!indices||!(positions instanceof Float32Array)||
            (formatName&&formatName!=='RGB32F'))
            return {ok:false,error:'Surface requires readable RGB32F position attributes. Reimport mesh without compressed positions.'};
        const m=node.worldMatrix;
        const matrix=[m.m00,m.m01,m.m02,m.m03,m.m04,m.m05,m.m06,m.m07,
            m.m08,m.m09,m.m10,m.m11,m.m12,m.m13,m.m14,m.m15];
        const {prepareSurface,snapOrigins}=require('./SplineSurfaceSnapMath');
        const geometry=prepareSurface(Array.from(positions),Array.from(indices),matrix);
        const hits=snapOrigins(geometry,origins,options);
        return {ok:true,hits,triangles:geometry.triangleCount};
    }catch(error){
        return {ok:false,error:String(error?.message||error)};
    }
}
/** Read-only scene orientation query, used only when Align Normal is enabled. */
function queryKnotOrientations(rootUuid,uuids){
    const root=resolve(rootUuid);
    if(!root||containerOf(root)!==root||!Array.isArray(uuids)||
       uuids.length<1||uuids.length>64||new Set(uuids).size!==uuids.length)
        return {ok:false,error:'Invalid spline or orientation selection.'};
    const pack=q=>q&&{x:q.x,y:q.y,z:q.z,w:q.w};
    const parentRotation=pack(root.worldRotation);
    const rotations=[];
    for(const uuid of uuids){
        const knot=resolve(uuid);
        if(!knot||knot.parent!==root||
           !knot.components.some(c=>classOf(c)==='Splines.SplineKnot'))
            return {ok:false,error:'Selected Knot is no longer a child of this SplineContainer.'};
        rotations.push({uuid,rotation:pack(knot.rotation)});
    }
    return {ok:true,parentRotation,rotations};
}
/**
 * Read-back contract for Editor batch transactions. Only immediate Knot
 * children of the selected spline may participate, and no Node is modified.
 */
function queryKnotBatchState(rootUuid,uuids){
    const root=resolve(rootUuid);
    if(!root||containerOf(root)!==root||
       !root.components.some(c=>classOf(c)==='Splines.SplineContainer')||
       !Array.isArray(uuids)||uuids.length<1||uuids.length>512||
       uuids.some(id=>typeof id!=='string'||!id)||
       new Set(uuids).size!==uuids.length)
        return {ok:false,error:'Invalid spline or batch Knot selection.'};
    const states=[];
    for(const uuid of uuids){
        const node=resolve(uuid);
        if(!node||node.parent!==root||
           !node.components.some(c=>classOf(c)==='Splines.SplineKnot'))
            return {ok:false,error:'Knot no longer belongs to selected SplineContainer.'};
        const p=node.position,q=node.rotation;
        const position={x:p.x,y:p.y,z:p.z};
        const rotation={x:q.x,y:q.y,z:q.z,w:q.w};
        if(!Object.values(position).every(Number.isFinite)||
           !Object.values(rotation).every(Number.isFinite))
            return {ok:false,error:'Invalid Knot Node transform in Scene.'};
        states.push({uuid,position,rotation});
    }
    return {ok:true,states};
}
function refreshPreview(uuid){
    const root=resolve(uuid);if(!root)return {ok:false,error:'Spline not found'};
    const {js}=require('cc');let count=0;
    const walk=(node)=>{
        for(const c of node.components){
            const name=js.getClassName(c);
            if(['Splines.SplineExtrude','Splines.SplineRoad','Splines.Spline2DPath','Splines.SplineMeshDeform'].includes(name)&&typeof c.rebuild==='function'){
                c.rebuild();count++;
            }
        }
        for(const child of node.children)walk(child);
    };
    walk(root);
    return {ok:true,rebuilds:count};
}
function rebuildComponent(uuid,expectedClass){
    const node=resolve(uuid);if(!node)return {ok:false,error:'Node not found'};
    const root=containerOf(node)||node;let count=0;
    const walk=(n)=>{
        for(const c of n.components)if(classOf(c)===expectedClass&&typeof c.rebuild==='function'){
            c.rebuild();count++;
        }
        for(const child of n.children)walk(child);
    };
    walk(root);
    return {ok:true,rebuilds:count,message:count+' component(s) rebuilt'};
}
function describeHandles(uuid){
    const knot=resolve(uuid),root=knot?containerOf(knot):null;
    if(!knot||!root||knot.parent!==root)return {ok:false,error:'Select a direct SplineKnot child.'};
    const k=knot.components.find(c=>classOf(c)==='Splines.SplineKnot');
    const spline=root.components.find(c=>classOf(c)==='Splines.SplineContainer');
    if(!k||!spline)return {ok:false,error:'Knot or SplineContainer not found'};
    if(k.tangentInHandle||k.tangentOutHandle)return {ok:true,hasHandles:true,rootUuid:root.uuid,inUuid:k.tangentInHandle?.isValid?k.tangentInHandle.uuid:null,outUuid:k.tangentOutHandle?.isValid?k.tangentOutHandle.uuid:null};
    const nodes=root.children.filter(n=>n.components.some(c=>classOf(c)==='Splines.SplineKnot'));
    const index=nodes.indexOf(knot);
    const resolved=spline.getNaturalResolvedKnots()[index];
    if(!resolved)return {ok:false,error:'Cannot evaluate knot'};
    const {Vec3,Quat}=require('cc');
    const inverse=Quat.invert(new Quat(),knot.rotation);
    const local=(value)=>{
        const v=Vec3.transformQuat(new Vec3(),new Vec3(value.x,value.y,value.z),inverse);
        return {x:v.x,y:v.y,z:v.z};
    };
    return {ok:true,hasHandles:false,rootUuid:root.uuid,inLocal:local(resolved.tangentIn),outLocal:local(resolved.tangentOut)};
}
function rebuildRoad(uuid){
    const node=resolve(uuid);if(!node)return {ok:false,error:'Không tìm thấy Node'};
    const container=containerOf(node);
    if(!container)return {ok:false,error:'Road cần SplineContainer ở ancestor hoặc trường Spline reference.'};
    // All roads below container are refreshed: allows a one-click road refresh
    // from both Road Inspector and Container Inspector, without an Editor panel.
    let count=0;
    const walk=(n)=>{
        for(const c of n.components)if(classOf(c)==='Splines.SplineRoad'&&typeof c.rebuild==='function'){
            c.rebuild();count++;
        }
        for(const child of n.children)walk(child);
    };
    walk(container);
    return {ok:true,message:count+' Road mesh đã cập nhật.',rebuilds:count};
}
function animate(uuid){
    const n=resolve(uuid);
    if(!n)return {found:false};
    const i=n.components.findIndex(c=>classOf(c)==='Splines.SplineAnimate');
    if(i<0)return {found:false};
    return {found:true,uuid:n.uuid,componentIndex:i,previewInEditor:!!n.components[i].previewInEditor};
}
function previewAnimate(uuid){
    const info=animate(uuid);if(!info.found)return {ok:false,error:'SplineAnimate not found'};
    const comp=resolve(uuid).components[info.componentIndex];
    if(typeof comp.previewAt!=='function')return {ok:false,error:'Reimport SplineAnimate.ts để dùng Editor Preview.'};
    const result=comp.previewPositionMode===1&&typeof comp.previewAtDistance==='function'
        ? comp.previewAtDistance(comp.previewDistance)
        : comp.previewPositionMode===2&&typeof comp.previewAtT==='function'
        ? comp.previewAtT(comp.previewProgress)
        : comp.previewAt(comp.previewProgress);
    return result?{ok:true,message:'Preview position applied.'}:{ok:false,error:'Chưa gán SplineContainer hoặc spline thiếu knot.'};
}
function restoreAnimate(uuid){
    const info=animate(uuid);if(!info.found)return {ok:false,error:'SplineAnimate not found'};
    const comp=resolve(uuid).components[info.componentIndex];
    if(typeof comp.restorePreview==='function')comp.restorePreview();
    return {ok:true,message:'Restored original transform.'};
}
function describeSplit(uuid){
    const knot=resolve(uuid),root=knot?containerOf(knot):null;
    if(!knot||!root)return {ok:false,error:'Không tìm thấy Knot / Container.'};
    const {js}=require('cc');
    const comp=root.components.find(c=>js.getClassName(c)==='Splines.SplineContainer');
    const nodes=root.children.filter(n=>n.components.some(c=>js.getClassName(c)==='Splines.SplineKnot'));
    const index=nodes.indexOf(knot);
    if(index<0||(!comp.closed&&index===nodes.length-1))return {ok:false,error:'Knot cuối trên spline mở không có segment sau nó.'};
    const next=nodes[(index+1)%nodes.length];
    const before=knot.components.find(c=>js.getClassName(c)==='Splines.SplineKnot');
    const after=next.components.find(c=>js.getClassName(c)==='Splines.SplineKnot');
    if(before.tangentInHandle||before.tangentOutHandle||after.tangentInHandle||after.tangentOutHandle)
        return {ok:false,error:'Split segment hiện chưa hỗ trợ knot dùng Tangent Handle Node. Hãy bỏ reference handle trước khi Split.'};
    try {
        const split=comp.describeSplitAfter(index,0.5);
        const {Vec3,Quat}=require('cc');
        const local=(vec,node)=>{
            const input=new Vec3(vec.x,vec.y,vec.z),inverse=Quat.invert(new Quat(),node.rotation);
            Vec3.transformQuat(input,input,inverse);
            return {x:input.x,y:input.y,z:input.z};
        };
        if(before.tangentsInKnotSpace){
            split.before.tangentIn=local(split.before.tangentIn,knot);
            split.before.tangentOut=local(split.before.tangentOut,knot);
        }
        if(after.tangentsInKnotSpace){
            split.after.tangentIn=local(split.after.tangentIn,next);
            split.after.tangentOut=local(split.after.tangentOut,next);
        }
        return {ok:true,rootUuid:root.uuid,firstUuid:knot.uuid,lastUuid:next.uuid,split};
    }
    catch(e){return {ok:false,error:String(e)};}
}
function moveKnot(uuid,position){
    const knot=resolve(uuid),root=knot?containerOf(knot):null;
    if(!knot||!root||knot.parent!==root)return {ok:false,error:'Knot không hợp lệ.'};
    const {js}=require('cc');
    const knots=root.children.filter(n=>n.components.some(c=>js.getClassName(c)==='Splines.SplineKnot'));
    const index=knots.indexOf(knot);
    if(index<0)return {ok:false,error:'Knot không có trong spline.'};
    const to=position==='up'?index-1:position==='down'?index+1:position==='after'?-1:NaN;
    if(position==='up'||position==='down'){
        if(to<0||to>=knots.length)return {ok:false,error:'Knot nằm ở đầu hoặc cuối.'};
        knot.setSiblingIndex(knots[to].getSiblingIndex());
        return {ok:true};
    }
    return {ok:false,error:'Invalid move.'};
}
function placeAfter(newUuid,previousUuid){
    const knot=resolve(newUuid),previous=resolve(previousUuid);
    if(!knot||!previous||!knot.parent||knot.parent!==previous.parent)return {ok:false,error:'Knot nodes must have same parent.'};
    knot.setSiblingIndex(previous.getSiblingIndex()+1);
    return {ok:true};
}

/** Inspector-only tool actions; never serialize temporary editor preview transforms. */
function executeTool(uuid,kind,action){
    const n=resolve(uuid);if(!n)return {ok:false,error:'Node not found'};
    const c=n.components.find(x=>classOf(x)===kind);
    if(!c)return {ok:false,error:'Component not found: '+kind};
    if(action==='preview'){if(!c.previewInEditor)return {ok:false,error:'Bật Preview in Editor trong Positioner trước khi preview.'};return {ok:!!c.preview(),message:'Spline Positioner preview applied; turn off Preview in Editor to restore.'};}
    if(action==='restore'){c.restore();return {ok:true,message:'Restored target transform.'};}
    if(action==='rebuild'){if(kind==='Splines.SplineObjectBender'&&!c.previewInEditor)return {ok:false,error:'Bật Preview in Editor trước khi uốn mesh trong Scene Editor.'};if(typeof c.rebuild!=='function')return {ok:false,error:'No rebuild method'};c.rebuild();return {ok:true,message:'Mesh regenerated.'};}
    if(action==='apply'){if(kind==='Splines.SplineMorph'&&!c.previewInEditor)return {ok:false,error:'Bật Preview in Editor trước khi Morph trong Scene Editor.'};if(typeof c.apply!=='function')return {ok:false,error:'No apply method'};return {ok:!!c.apply(),message:'Spline Morph applied.'};}
    if(action==='project'){
        const p=c.projectNow();
        return p?{ok:true,t:p.t,progress:p.progress,distance:p.distance,separation:p.separation,
            message:'Nearest: t='+p.t.toFixed(4)+', distance='+p.distance.toFixed(3)+', gap='+p.separation.toFixed(3)}:
            {ok:false,error:'Assign Spline and Source Node; spline needs at least 2 knots.'};
    }
    if(action==='length'){
        const length=c.getSpline()?.length;
        return Number.isFinite(length)?{ok:true,length,message:'Spline length (local units): '+length.toFixed(3)}:
            {ok:false,error:'Assign a valid SplineContainer.'};
    }
    return {ok:false,error:'Unknown tool action'};
}
function spawnPrefabs(uuid,kind,action){
    const node=resolve(uuid);
    if(!node)return {ok:false,error:'Node not found.'};
    const className=kind==='instantiate'?'Splines.SplineInstantiate':kind==='objectController'?'Splines.SplineObjectController':null;
    if(!className||!['spawn','respawn','clear'].includes(action))return {ok:false,error:'Unsupported spawn action.'};
    const comp=node.components.find(c=>classOf(c)===className);
    if(!comp)return {ok:false,error:'Missing '+className};
    try{
        const before=comp.spawnedRoot?.isValid?comp.spawnedRoot.children.length:0;
        const count=action==='clear'?(comp.clear(),0):comp[action]();
        const after=comp.spawnedRoot?.isValid?comp.spawnedRoot.children.length:0;
        return {ok:true,count:after,changed:action==='respawn'||before!==after,message:action==='clear'?'Cleared spawned nodes.':
            action==='spawn'&&before>0?'Scene instances already exist; no duplicates created.':
            'Spawned '+after+' prefab instances in Scene Hierarchy.'};
    }catch(error){return {ok:false,error:String(error)};}
}
exports.methods={spawnPrefabs,executeTool,querySpline:query,queryKnotEditFrame,listSurfaceTargets,snapToSurfaceTarget,queryKnotOrientations,queryKnotBatchState,refreshPreview,rebuildRoad,rebuildComponent,describeHandles,queryAnimate:animate,previewAnimate,restoreAnimate,describeSplit,moveKnot,placeAfter};
exports.load=function(){};exports.unload=function(){};
