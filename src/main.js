'use strict';
const NAME='cocos-splines';
const {installSplineExamples}=require('./SplineExampleInstaller');
const {createExampleGalleryWorkflow}=require('./SplineExampleSceneWorkflow');
const {planKnotPositions,planSurfaceKnotPositions,transformFrame,validatedKnots}=require('./SplineKnotEditMath');
const {commitKnotEdits}=require('./SplineBatchEditTransaction');
const {commitJunctionTangent}=require('./SplineJunctionTangentTransaction');
const {commitJunctionBrokenConversion}=require('./SplineJunctionConversionTransaction');
const {parseFanoutTargets,validateFanoutPlan,commitJunctionFanout}=require('./SplineJunctionFanoutEditor');
const {validateMultiJunctionPlan,commitMultiJunctionRoute}=require('./SplineJunctionRouteEditor');
const {finiteQuat:validCopyQuat,planCopiedKnot}=require('./SplineTopologyCopyMath');
const {appearanceWrites,validateContainerAppearance}=require('./SplineTopologyCopyPolicy');
function selected(){return Editor.Selection.getSelected('node')||[];}
// Editor.Selection.select() ADDS a selection in Creator 3.8.
// Use a single-selection helper for all Inspector navigation actions.
function selectOnly(uuid){
    if(!uuid) return;
    const current=selected();
    if(current.length===1&&current[0]===uuid)return;
    Editor.Selection.clear('node');
    Editor.Selection.select('node',uuid);
}
async function invokeScene(method,...args){return Editor.Message.request('scene','execute-scene-script',{name:NAME,method,args});}
function uuidResult(value){return Array.isArray(value)?value[0]:value;}
async function makeNode(parent,name){
    const result=await Editor.Message.request('scene','create-node',{parent,name,snapshot:false});
    const id=uuidResult(result);
    if(typeof id!=='string'||!id)throw new Error(`create-node failed: ${JSON.stringify(result)}`);
    return id;
}
async function component(node,type){await Editor.Message.request('scene','create-component',{uuid:node,component:type});}
async function position(node,xyz){
    const ok=await Editor.Message.request('scene','set-property',{
        uuid:node,path:'position',dump:{type:'cc.Vec3',value:{x:xyz[0],y:xyz[1],z:xyz[2]}},record:false});
    if(ok===false)throw new Error(`Cannot set position of ${node}`);
}
async function property(root,index,key,value,type,record=true){
    const result=await Editor.Message.request('scene','set-property',{
        uuid:root,path:`__comps__.${index}.${key}`,dump:{type,value},record});
    if(result===false||(result&&result.ok===false))throw new Error(`set-property failed for ${key}`);
}
async function snapshot(){
    const result=await Editor.Message.request('scene','snapshot');
    if(result===false||(result&&typeof result==='object'&&result.ok===false))
        throw Error('Scene snapshot was rejected.');
    return result;
}
/** Author a genuine Node serialized field; never use computed Gizmo ports. */
async function setNodeSerialized(uuid,path,type,value){
    const response=await Editor.Message.request('scene','set-property',{
        uuid,path,dump:{type,value},record:false,
    });
    if(response===false||(response&&response.ok===false))
        throw Error('Cannot serialize '+path+' for '+uuid);
}
async function setKnotValue(uuid,key,value,fallbackType,record=false){
    const dump=await Editor.Message.request('scene','query-node',uuid);
    const comps=dump?.__comps__||[];
    const idx=comps.findIndex(c=>c.type==='Splines.SplineKnot'||String(c.type||'').endsWith('SplineKnot')||(c.value?.mode&&c.value?.tangentIn&&c.value?.tangentOut));
    if(idx<0)throw new Error(`Missing SplineKnot on ${uuid}`);
    const prop=comps[idx].value?.[key];
    const result=await Editor.Message.request('scene','set-property',{
        uuid,path:`__comps__.${idx}.${key}`,dump:{type:prop?.type||fallbackType,value},record,
    });
    if(result===false||(result&&result.ok===false))throw new Error(`Cannot set ${key}`);
}
function vec(x){
    if(!Array.isArray(x)||x.length!==3||!x.every(v=>typeof v==='number'&&Number.isFinite(v)))throw new Error('Vec3 phải là [x,y,z] hữu hạn.');
    return {x:x[0],y:x[1],z:x[2]};
}
function decodeJSON(input){
    if(typeof input!=='string'||input.length>200000)throw new Error('JSON phải nhỏ hơn 200 KB.');
    const obj=JSON.parse(input);
    if(!obj||!Array.isArray(obj.knots)||obj.knots.length<2||obj.knots.length>512)throw new Error('Cần từ 2 đến 512 knots.');
    return {closed:obj.closed===true,knots:obj.knots.map((k,i)=>{
        if(!k||!Number.isInteger(k.mode)||k.mode<0||k.mode>4)throw new Error(`Knot ${i}: mode phải từ 0 đến 4.`);
        const r={position:vec(k.position),tangentIn:vec(k.tangentIn),tangentOut:vec(k.tangentOut),mode:k.mode,tension:Number.isFinite(k.tension)?Math.max(0,k.tension):1/3};
        if(k.eulerDegrees)r.eulerDegrees=vec(k.eulerDegrees);
        return r;
    })};
}

async function ensureClasses(){
    // Guard against calling create-component before the asset-db scripts have compiled.
    const valid=await Editor.Message.request('scene','query-component-has-script','Splines.SplineKnot');
    if(!valid)throw new Error('Spline runtime chưa sẵn sàng. Kiểm tra asset-db mount và script compilation trong Console.');
}
async function selectedSpline(){
    const ids=selected();
    if(!ids.length)throw new Error('Chọn Spline Container hoặc một Knot trong Hierarchy trước.');
    return invokeScene('querySpline',ids[0]);
}
function alertError(action,e){console.error(`[Cocos Splines] ${action}:`,e);return {ok:false,error:String(e?.message||e)};}

let knotEditBusy=false;
/** Selection is ordered by sibling index, not by click order, for deterministic align. */
function selectedKnotIds(info,explicit){
    const ids=explicit===undefined
        ?selected().filter(id=>id!==info.rootUuid)
        :explicit;
    return validatedKnots(info.knots,ids).map(k=>k.uuid);
}
async function writeKnotPosition(uuid,value){
    const result=await Editor.Message.request('scene','set-property',{
        uuid,path:'position',dump:{type:'cc.Vec3',value:{x:value.x,y:value.y,z:value.z}},record:false,
    });
    if(result===false)throw new Error('Failed to set knot position: '+uuid);
}
async function writeKnotRotation(uuid,rotation){
    const result=await Editor.Message.request('scene','set-property',{
        uuid,path:'rotation',dump:{type:'cc.Quat',
            value:{x:rotation.x,y:rotation.y,z:rotation.z,w:rotation.w}},record:false,
    });
    if(result===false)throw new Error('Failed to set knot rotation: '+uuid);
}
async function applyKnotPlacement(operation,ids,options){
    if(knotEditBusy)throw new Error('Another knot edit is in progress.');
    knotEditBusy=true;
    try {
        const info=await selectedSpline();
        if(!info?.found)throw new Error(info?.message||'Select a SplineContainer or Knot.');
        const selectedIds=selectedKnotIds(info,ids);
        let edits,arcRevision;
        if(operation==='distribute-arc'){
            const result=await invokeScene('queryArcDistribution',info.rootUuid,selectedIds,options.space);
            if(!result?.ok||!Array.isArray(result.edits)||typeof result.revision!=='string')
                throw Error(result?.error||'Cannot plan arc distribution.');
            if(result.edits.some(edit=>!selectedIds.includes(edit.uuid)))
                throw Error('Arc distribution returned a foreign Knot.');
            edits=result.edits;
            arcRevision=result.revision;
        }else if(operation==='surface'){
            if(info.dimension!==0)throw new Error('Mesh surface snapping supports 3D splines only.');
            if(selectedIds.length>64)throw new Error('Surface snap supports at most 64 Knots per batch.');
            if(typeof options.targetUuid!=='string'||!options.targetUuid)
                throw new Error('Choose a MeshRenderer target before snapping.');
            const matrixResult=await invokeScene('queryKnotEditFrame',info.rootUuid);
            if(!matrixResult?.ok)throw new Error(matrixResult?.error||'Cannot read spline world transform.');
            const frame=transformFrame(matrixResult.matrix);
            const world=selectedIds.map(uuid=>{
                const knot=info.knots.find(k=>k.uuid===uuid);
                return {uuid,position:frame.toWorld(knot.position)};
            });
            const result=await invokeScene('snapToSurfaceTarget',info.rootUuid,
                options.targetUuid,world,{kind:options.targetKind,height:options.height,maxDrop:options.maxDrop,
                    alignNormal:options.alignNormal===true,
                    smoothNormal:options.alignNormal===true && options.smoothNormal===true,
                    creaseAngle:options.creaseAngle});
            if(!result?.ok)throw new Error(result?.error||'Surface raycast failed.');
            if(options.alignNormal===true){
                const rotations=await invokeScene('queryKnotOrientations',info.rootUuid,selectedIds);
                if(!rotations?.ok)throw new Error(rotations?.error||'Cannot read Knot rotations.');
                const rotationMap=new Map(rotations.rotations.map(entry=>[entry.uuid,entry.rotation]));
                const withRotation=info.knots.map(knot=>({
                    ...knot,rotation:rotationMap.get(knot.uuid),
                }));
                edits=planSurfaceKnotPositions(withRotation,selectedIds,result.hits,
                    matrixResult.matrix,true,rotations.parentRotation);
            }else edits=planSurfaceKnotPositions(info.knots,selectedIds,result.hits,matrixResult.matrix);
        }else{
            let frame=null;
            if(options.space==='world'){
                const result=await invokeScene('queryKnotEditFrame',info.rootUuid);
                if(!result?.ok)throw new Error(result?.error||'Cannot read spline world transform.');
                frame=result.matrix;
            }
            edits=planKnotPositions(info.knots,selectedIds,operation,options,info.dimension,frame);
        }
        if(!edits.length)return {ok:true,changed:false,count:0,message:'Knots are already in place.'};
        let initialRead=true;
        await commitKnotEdits(edits,{
            read:uuids=>{
                const revision=initialRead?arcRevision:undefined;
                initialRead=false;
                return revision===undefined?invokeScene('queryKnotBatchState',info.rootUuid,uuids):
                    invokeScene('queryKnotBatchState',info.rootUuid,uuids,revision,options.space);
            },
            writePosition:writeKnotPosition,
            writeRotation:writeKnotRotation,
            snapshot,
        });
        let warning;
        try{await invokeScene('refreshPreview',info.rootUuid);}
        catch(error){warning='Positions saved, but preview refresh failed: '+String(error);}
        return {ok:true,changed:true,count:edits.length,warning,
            message:operation==='surface'?'Snapped '+edits.length+' knot(s) to mesh surface.':
                operation==='snap'?'Snapped '+edits.length+' knot(s) to grid.':
                operation==='align'?'Aligned '+edits.length+' knot(s) along '+options.axis.toUpperCase()+'.':
                operation==='distribute'?'Distributed '+edits.length+' knot(s) along '+options.axis.toUpperCase()+'.':
                operation==='distribute-arc'?'Distributed '+edits.length+' knot(s) on the original '+options.space+' spline arc.':
                'Moved '+edits.length+' knot(s) together.'};
    }finally{knotEditBusy=false;}
}
const methods={
    /** Installs bundled project-owned examples only after explicit menu action. */
    async installExamples(){
        try{
            const result=installSplineExamples({projectPath:Editor.Project?.path});
            let refreshWarning='';
            try{
                // Creator 3.x asset DB rescans the project assets mount.
                // Deliberately not awaited: Editor versions may delay folder refresh.
                if(typeof Editor.Message?.send==='function')
                    Editor.Message.send('asset-db','refresh-asset','db://assets');
                else refreshWarning='Asset DB refresh message unavailable; refresh Assets manually.';
            }catch(e){refreshWarning='Refresh Assets manually: '+String(e?.message||e);}
            const message='Install Examples: '+result.installed+' new, '+
                result.skipped+' existing preserved in '+result.assetUrl+'.'+
                (refreshWarning?' '+refreshWarning:'');
            console.log('[Cocos Splines] '+message);
            return {ok:true,...result,message,refreshWarning};
        }catch(e){return alertError('install-examples',e);}
    },
    /** Create the gallery in the CURRENT open Scene through native Scene
     * messages; the user saves the .scene using Creator. */
    async createExampleGallery(){
        try {
            const result=await createExampleGalleryWorkflow({
                query:()=>invokeScene('queryExampleGallery'),
                scriptReady:kind=>Editor.Message.request('scene','query-component-has-script',kind),
                createNode:name=>makeNode(undefined,name),
                addComponent:(uuid,kind)=>Editor.Message.request('scene','create-component',{
                    uuid,component:kind,
                }),
                snapshot,
                removeNode:uuid=>Editor.Message.request('scene','remove-node',{
                    uuid,snapshot:false,
                }),
                select:uuid=>selectOnly(uuid),
            });
            console.log('[Cocos Splines] '+result.message);
            return result;
        }catch(e){return alertError('create-example-gallery',e);}
    },
    async create2DSpline(){
        try{
            await ensureClasses();
            const active=selected()[0],current=active?await invokeScene('querySpline',active):null;
            const parent=current?.found?current.parentUuid:active;
            const root=await makeNode(parent,'Spline 2D');
            await component(root,'Splines.SplineContainer');
            await property(root,0,'dimension',1,'Enum');
            for(const [i,p] of [[-240,0,0],[-80,95,0],[80,-95,0],[240,0,0]].entries()){
                const knot=await makeNode(root,`Knot ${String(i).padStart(2,'0')}`);
                await component(knot,'Splines.SplineKnot');
                await position(knot,p);
            }
            const path=await makeNode(root,'2D Path');
            await component(path,'Splines.Spline2DPath');
            await snapshot();selectOnly(root);
            await invokeScene('refreshPreview',root);
            return {ok:true,uuid:root,path,message:'2D Spline đã tạo. Đảm bảo đặt dưới Canvas / RenderRoot2D và bật Cocos-Gizmos để hiện đường trong Scene.'};
        }catch(e){return alertError('create-2d-spline',e);}
    },
    async create2DPath(){
        try{
            await ensureClasses();
            const info=await selectedSpline();
            if(!info?.found)throw Error('Chọn SplineContainer trước khi thêm 2D Path.');
            const path=await makeNode(info.rootUuid,'2D Path');
            await component(path,'Splines.Spline2DPath');
            await snapshot();selectOnly(path);
            await invokeScene('refreshPreview',info.rootUuid);
            return {ok:true,uuid:path,message:'2D Path đã tạo; cần Canvas / RenderRoot2D để Graphics hiển thị.'};
        }catch(e){return alertError('create-2d-path',e);}
    },
    async createMeshDeform(){
        try{
            await ensureClasses();
            const info=await selectedSpline();
            if(!info?.found)throw Error('Chọn SplineContainer trước khi thêm Mesh Deform.');
            const id=await makeNode(info.rootUuid,'Spline Mesh Deform');
            await component(id,'Splines.SplineMeshDeform');
            await snapshot();selectOnly(id);
            return {ok:true,uuid:id,message:'Mesh Deform đã tạo. Gán Source Mesh + Material trong Inspector.'};
        }catch(e){return alertError('create-mesh-deform',e);}
    },
    async rebuildMeshDeform(){
        try{
            const id=selected()[0];if(!id)throw Error('Chọn Mesh Deform hoặc Container.');
            return await invokeScene('rebuildComponent',id,'Splines.SplineMeshDeform');
        }catch(e){return alertError('rebuild-mesh-deform',e);}
    },
    async rebuild2DPath(){
        try{
            const id=selected()[0];if(!id)throw Error('Chọn 2D Path hoặc Container.');
            return await invokeScene('rebuildComponent',id,'Splines.Spline2DPath');
        }catch(e){return alertError('rebuild-2d-path',e);}
    },
    async selectTangentHandle(which){
        try{
            if(which!=='in'&&which!=='out')throw Error('Direction must be in or out.');
            const knot=selected()[0];if(!knot)throw Error('Chọn Knot trước.');
            const info=await invokeScene('describeHandles',knot);
            if(!info?.ok||!info.hasHandles)throw Error('Knot chưa có Tangent Handle Nodes.');
            const uuid=which==='in'?info.inUuid:info.outUuid;
            if(!uuid)throw Error('Tangent '+which+' chưa có Node.');
            // Selecting a handle would otherwise hide selected-knot gizmos.
            // Keep tangents on by enabling the knot-local editing mode first.
            await setKnotValue(knot,'editTangentHandles',true,'Boolean');
            await snapshot();selectOnly(uuid);
            return {ok:true,uuid,message:'Đã chọn Tangent '+which+'. Edit Handles được bật; kéo bằng W.'};
        }catch(e){return alertError('select-tangent-handle',e);}
    },
    async createTangentHandles(){
        try{
            const uuid=selected()[0];if(!uuid)throw Error('Chọn Knot trước.');
            const info=await invokeScene('describeHandles',uuid);
            if(!info?.ok)throw Error(info?.error||'Chọn một SplineKnot.');
            if(info.hasHandles)throw Error('Knot này đã có tangent handle. Chọn handle Node trong Hierarchy để kéo.');
            const a=await makeNode(uuid,'Tangent In');
            const b=await makeNode(uuid,'Tangent Out');
            await position(a,[info.inLocal.x,info.inLocal.y,info.inLocal.z]);
            await position(b,[info.outLocal.x,info.outLocal.y,info.outLocal.z]);
            // Switch to Broken to preserve the currently evaluated curve exactly.
            await setKnotValue(uuid,'mode',4,'Enum');
            await setKnotValue(uuid,'tangentsInKnotSpace',true,'Boolean');
            await setKnotValue(uuid,'tangentInHandle',a,'cc.Node');
            await setKnotValue(uuid,'tangentOutHandle',b,'cc.Node');
            // Per-knot editing override; do NOT mutate the container's global
            // gizmo settings (they may be intentionally disabled by the user).
            await setKnotValue(uuid,'editTangentHandles',true,'Boolean');
            await snapshot();selectOnly(b);
            if(info.rootUuid)await invokeScene('refreshPreview',info.rootUuid);
            return {ok:true,uuid:b,message:'Đã tạo tangent handles và bật Edit Handles cho Knot. Kéo bằng W; tắt trong Knot Inspector khi chỉnh xong.'};
        }catch(e){return alertError('create-tangent-handles',e);}
    },

    async createModifiers(){try{
        await ensureClasses();const info=await selectedSpline();if(!info?.found)throw Error('Chọn SplineContainer trước.');
        await component(info.rootUuid,'Splines.SplineModifiers');await snapshot();selectOnly(info.rootUuid);
        return {ok:true,message:'Spline Modifiers added to Container. Configure Keys in Inspector.'};
    }catch(e){return alertError('create-modifiers',e);}},
    async createObjectController(){try{
        await ensureClasses();const info=await selectedSpline();if(!info?.found)throw Error('Chọn SplineContainer trước.');
        const id=await makeNode(info.rootUuid,'Spline Object Controller');
        await component(id,'Splines.SplineObjectController');await snapshot();selectOnly(id);
        return {ok:true,message:'Object Controller created. Assign spline, Prefabs and optional Modifiers.'};
    }catch(e){return alertError('create-object-controller',e);}},
    async createMorph(){try{
        await ensureClasses();const info=await selectedSpline();if(!info?.found)throw Error('Chọn SplineContainer trước.');
        const id=await makeNode(info.parentUuid,'Spline Morph');
        await component(id,'Splines.SplineMorph');await snapshot();selectOnly(id);
        return {ok:true,message:'Morph created. Assign sourceA, sourceB, and separate outputSpline.'};
    }catch(e){return alertError('create-morph',e);}},
    async createObjectBender(){try{
        await ensureClasses();const id=selected()[0];if(!id)throw Error('Chọn model hierarchy root cần bẻ (không phải spline).');
        await component(id,'Splines.SplineObjectBender');await snapshot();selectOnly(id);
        return {ok:true,message:'Object Bender attached to selected root. Assign external spline and enable Preview in Editor.'};
    }catch(e){return alertError('create-object-bender',e);}},
    async createJunctionMesh(){try{
        await ensureClasses();const id=selected()[0];if(!id)throw Error('Chọn SplineJunction node (không phải SplineContainer).');
        // Keep patch as sibling Renderer, with fallback to Junction on parent.
        const name=await makeNode(id,'Junction Mesh Patch');
        await component(name,'Splines.SplineJunctionMesh');await snapshot();selectOnly(name);
        return {ok:true,message:'Junction Patch created. Assign Junction if needed; coplanar XZ junctions only.'};
    }catch(e){return alertError('create-junction-mesh',e);}},
    async rebuildJunctionPatch(){return invokeScene('executeTool',selected()[0],'Splines.SplineJunctionMesh','rebuild');},
    async applyBender(){return invokeScene('executeTool',selected()[0],'Splines.SplineObjectBender','rebuild');},
    async restoreBender(){return invokeScene('executeTool',selected()[0],'Splines.SplineObjectBender','restore');},
    async applyMorph(){return invokeScene('executeTool',selected()[0],'Splines.SplineMorph','apply');},
    async restoreMorph(){return invokeScene('executeTool',selected()[0],'Splines.SplineMorph','restore');},
    async createPositioner(){
        try{await ensureClasses();const info=await selectedSpline();if(!info?.found)throw Error('Chọn SplineContainer trước.');
            const id=await makeNode(info.rootUuid,'Spline Positioner');
            await component(id,'Splines.SplinePositioner');await snapshot();selectOnly(id);
            return {ok:true,uuid:id,message:'Positioner tạo xong. Chỉnh t/distance trong Inspector, bật Preview in Editor khi muốn xem vị trí.'};
        }catch(e){return alertError('create-positioner',e);}
    },
    async createProjector(){
        try{await ensureClasses();const info=await selectedSpline();if(!info?.found)throw Error('Chọn SplineContainer trước.');
            const id=await makeNode(info.rootUuid,'Spline Projector');
            await component(id,'Splines.SplineProjector');await snapshot();selectOnly(id);
            return {ok:true,uuid:id,message:'Projector tạo xong. Gán Source Node và tùy chọn marker, bật Auto Project hoặc Project Now.'};
        }catch(e){return alertError('create-projector',e);}
    },
    async createLengthMonitor(){
        try{await ensureClasses();const info=await selectedSpline();if(!info?.found)throw Error('Chọn SplineContainer trước.');
            const id=await makeNode(info.rootUuid,'Spline Length Monitor');
            await component(id,'Splines.SplineLengthMonitor');await snapshot();selectOnly(id);
            return {ok:true,uuid:id,message:'Length Monitor tạo xong. Chỉnh Threshold, EventHandlers trong Inspector.'};
        }catch(e){return alertError('create-length-monitor',e);}
    },
    async applyPositioner(){try{return await invokeScene('executeTool',selected()[0],'Splines.SplinePositioner','preview');}catch(e){return alertError('apply-positioner',e);}},
    async restorePositioner(){try{return await invokeScene('executeTool',selected()[0],'Splines.SplinePositioner','restore');}catch(e){return alertError('restore-positioner',e);}},
    async projectNow(){try{return await invokeScene('executeTool',selected()[0],'Splines.SplineProjector','project');}catch(e){return alertError('project-now',e);}},
    async measureLength(){try{return await invokeScene('executeTool',selected()[0],'Splines.SplineLengthMonitor','length');}catch(e){return alertError('measure-length',e);}},
    async createRoad(){
        try{
            await ensureClasses();
            const info=await selectedSpline();
            if(!info?.found)throw Error('Chọn SplineContainer hoặc Knot trước khi thêm Road.');
            // Separate MeshRenderer avoids competing with existing SplineExtrude mesh.
            const road=await makeNode(info.rootUuid,'Road');
            await component(road,'Splines.SplineRoad');
            await snapshot();selectOnly(road);
            const updated=await invokeScene('rebuildRoad',road);
            return {ok:true,uuid:road,message:'Đã thêm Road. Chỉnh Width, Shoulder, Curbs, UV và Material trong Inspector.',preview:updated};
        }catch(e){return alertError('create-road',e);}
    },
    async createTrigger(){
        try{
            await ensureClasses();
            const info=await selectedSpline();
            if(!info?.found)throw Error('Chọn SplineContainer trước khi thêm Trigger.');
            const id=await makeNode(info.rootUuid,'Spline Trigger');
            await component(id,'Splines.SplineTrigger');
            await snapshot();selectOnly(id);
            return {ok:true,uuid:id,message:'Trigger đã tạo. Chỉnh Progress / Direction / On Cross trong Inspector.'};
        }catch(e){return alertError('create-trigger',e);}
    },
    /** Read-only geometric conflict warnings from the selected Traffic Controller.
     * Preserves serialized Conflict Pairs/Phases, no snapshot or Scene edit.
     */
    async checkTrafficConflicts(){
        try{
            const uuid=selected()[0];
            if(!uuid)throw Error('Select SplineTrafficController Node in Hierarchy.');
            const result=await invokeScene('queryTrafficConflicts',uuid);
            if(!result?.ok)throw Error(result?.error||'Cannot inspect traffic exits.');
            const pairs=Array.isArray(result.candidates)?result.candidates:[];
            const missing=Array.isArray(result.missingPairs)?result.missingPairs:[];
            const skipped=Array.isArray(result.skipped)?result.skipped:[];
            const unsafe=Array.isArray(result.unsafePhases)?result.unsafePhases:[];
            const preview=missing.slice(0,4).map(x=>
                x.firstExit+'↔'+x.secondExit+' ('+x.distance.toFixed(3)+' world units)').join(', ');
            return {ok:true,...result,message:'Traffic conflict probe: '+
                pairs.length+' possible pairs, '+missing.length+' missing declared conflicts; '+
                unsafe.length+' phases contain possible simultaneous-Green pairs. '+
                skipped.length+' exits skipped. '+
                (preview?'Candidates: '+preview+'. ':'')+
                'Warnings only; check in Scene before editing Conflict Pairs.'};
        }catch(error){return alertError('check-traffic-conflicts',error);}
    },
    /** Read-only continuity diagnostics. Link indices are serialized indices,
     * not the ordinal of nonempty links. No Scene mutation or snapshot.
     */
    async checkJunctionConnections(positionTolerance=.1,angleTolerance=15){
        try{
            const uuid=selected()[0];
            if(!uuid)throw Error('Select a SplineJunction in Hierarchy.');
            const result=await invokeScene('queryJunctionConnections',uuid,positionTolerance,angleTolerance);
            if(!result?.ok)throw Error(result?.error||'Cannot inspect Junction.');
            const worst=result.pairs.slice().sort((a,b)=>b.gap-a.gap)[0];
            const details=worst?' Worst link pair '+worst.from+'→'+worst.to+
                ': gap '+worst.gap.toFixed(4)+
                ', axis angle '+(worst.axisAngleDeg===null?'undefined':worst.axisAngleDeg.toFixed(1)+'°')+'.':'';
            return {ok:true,...result,message:'Junction: '+result.validLinks+' valid links, '+
                result.pairCount+' pairs. '+result.positionFailures+' position gaps > '+
                positionTolerance+', '+result.tangentFailures+' tangent-axis mismatches > '+
                angleTolerance+'°. '+details+' No changes made.'};
        }catch(e){return alertError('check-junction-connections',e);}
    },
    /** Moves only a selected open spline endpoint to another Junction link.
     * No tangent or arbitrary child component is touched. Guards are checked
     * both before and after the silent Node.position write.
     */
    async snapJunctionEndpoint(anchorIndex,targetIndex){
        if(knotEditBusy)return alertError('snap-junction-endpoint',
            Error('Another spline edit is already in progress.'));
        knotEditBusy=true;
        try{
            const uuid=selected()[0];
            if(!uuid)throw Error('Select a SplineJunction.');
            const plan=await invokeScene('queryJunctionSnapPlan',uuid,anchorIndex,targetIndex);
            if(!plan?.ok)throw Error(plan?.error||'Cannot plan endpoint snap.');
            const validPoint=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
            if(plan.junctionUuid!==uuid||!plan.guard||!plan.targetKnotUuid||
                !plan.targetSplineUuid||!validPoint(plan.before)||!validPoint(plan.after)||
                plan.anchorIndex!==anchorIndex||plan.targetIndex!==targetIndex)
                throw Error('Invalid connector snap plan returned from Scene.');
            if(!plan.changed)return {ok:true,changed:false,message:'Target endpoint already aligned. No snapshot.'};
            const check=async()=>{
                const valid=await invokeScene('queryJunctionSnapValid',
                    plan.junctionUuid,plan.guard,plan.targetKnotUuid);
                if(!valid?.ok)throw Error(valid?.error||'Connector Scene changed while editing.');
            };
            await check();
            await commitKnotEdits([{uuid:plan.targetKnotUuid,
                before:plan.before,after:plan.after,positionChanged:true}],{
                read:async ids=>{
                    await check();
                    return invokeScene('queryKnotBatchState',plan.targetSplineUuid,ids);
                },
                writePosition:async (id,p)=>{
                    await check();
                    await writeKnotPosition(id,p);
                },
                writeRotation:writeKnotRotation,snapshot,
            });
            try{await invokeScene('refreshPreview',plan.targetSplineUuid);}
            catch(error){console.warn('[Cocos Splines] Connector snap preview refresh failed:',error);}
            return {ok:true,changed:true,targetKnotUuid:plan.targetKnotUuid,
                message:'Snapped Junction link '+targetIndex+' endpoint to link '+anchorIndex+
                    ' (previous world gap '+plan.gapBefore.toFixed(4)+').'+
                    ' One Scene snapshot; tangent angles unchanged.'};
        }catch(e){return alertError('snap-junction-endpoint',e);}
        finally{knotEditBusy=false;}
    },
    /** Join a shortest endpoint-only chain across two or more Junctions.
     * The destination is an existing SplineContainer Node UUID. Each source
     * spline is traversed end-to-end, once, preserving the authored cubics.
     */
    async joinMultiJunctionRoute(anchorIndex,goalSplineUuid){
        if(knotEditBusy)return alertError('join-multi-junction-route',
            Error('Another spline edit is in progress.'));
        knotEditBusy=true;
        try{
            if(!Number.isInteger(anchorIndex)||anchorIndex<0||anchorIndex>63||
               typeof goalSplineUuid!=='string'||!goalSplineUuid.trim()||
               goalSplineUuid.length>128)
                throw Error('Enter a valid anchor link and destination Spline UUID.');
            const junctionUuid=selected()[0];
            if(!junctionUuid)throw Error('Select an active SplineJunction.');
            await ensureClasses();
            const goal=goalSplineUuid.trim();
            const plan=await invokeScene('queryMultiJunctionJoinPlan',
                junctionUuid,anchorIndex,goal);
            if(!plan?.ok)throw Error(plan?.error||'No valid multi-Junction route.');
            validateMultiJunctionPlan(plan,anchorIndex,goal);
            if(plan.junctionUuid!==junctionUuid)
                throw Error('Multi-Junction planner returned foreign Junction.');
            const check=async()=>{
                const live=await invokeScene('queryMultiJunctionJoinValid',
                    plan.junctionUuid,plan.guard);
                if(!live?.ok)throw Error(live?.error||
                    'Multi-Junction route or Scene changed during Join.');
            };
            return await commitMultiJunctionRoute(plan,{
                check,createNode:makeNode,component,
                nodeProperty:setNodeSerialized,containerProperty:property,
                appearanceWrites,position,setKnot:setKnotValue,snapshot,
                removeNode:uuid=>Editor.Message.request('scene','remove-node',
                    {uuid,snapshot:false}),
                select:selectOnly,
                refresh:uuid=>invokeScene('refreshPreview',uuid),
            });
        }catch(e){return alertError('join-multi-junction-route',e);}
        finally{knotEditBusy=false;}
    },
    /** Preserve Junction fan-out branches as separate independent splines
     * under ONE new scene group, rather than flattening them into a path
     * that would traverse a middle spoke twice.
     */
    async joinJunctionFanout(anchorIndex,targetsText){
        if(knotEditBusy)return alertError('join-junction-fanout',
            Error('Another spline edit is in progress.'));
        knotEditBusy=true;
        try{
            const targets=parseFanoutTargets(targetsText);
            if(!Number.isInteger(anchorIndex)||anchorIndex<0||
               anchorIndex>63||targets.includes(anchorIndex))
                throw Error('Choose an anchor link distinct from all targets.');
            const junctionUuid=selected()[0];
            if(!junctionUuid)throw Error('Select a SplineJunction first.');
            await ensureClasses();
            const plan=await invokeScene('queryJunctionFanoutPlan',
                junctionUuid,anchorIndex,targets);
            if(!plan?.ok)throw Error(plan?.error||'Cannot plan Junction fan-out.');
            validateFanoutPlan(plan,anchorIndex,targets);
            if(plan.junctionUuid!==junctionUuid)
                throw Error('Junction fan-out planner returned a foreign Scene Junction.');
            const check=async()=>{
                const live=await invokeScene('queryJunctionJoinValid',
                    plan.junctionUuid,plan.guard);
                if(!live?.ok)throw Error(live?.error||
                    'Junction source or Scene changed during fan-out.');
            };
            return await commitJunctionFanout(plan,{
                check,createNode:makeNode,component,
                nodeProperty:setNodeSerialized,containerProperty:property,
                appearanceWrites,position,setKnot:setKnotValue,snapshot,
                removeNode:uuid=>Editor.Message.request('scene','remove-node',
                    {uuid,snapshot:false}),
                select:selectOnly,
                refresh:uuid=>invokeScene('refreshPreview',uuid),
            });
        }catch(e){return alertError('join-junction-fanout',e);}
        finally{knotEditBusy=false;}
    },
    /** Make a NEW independent spline from two open Junction endpoint links.
     * Unlike a destructive Unity spline merge, this operation never reparents
     * or edits source knots, Junction connections or Prefab instances.
     */
    async joinJunctionLinks(anchorIndex,targetIndex){
        if(knotEditBusy)return alertError('join-junction-links',
            Error('Another spline edit is in progress.'));
        knotEditBusy=true;
        let created=null,committed=false,plan=null;
        try{
            if(!Number.isInteger(anchorIndex)||!Number.isInteger(targetIndex)||
               anchorIndex<0||targetIndex<0||anchorIndex===targetIndex)
                throw Error('Select two different Junction link indices.');
            const junctionUuid=selected()[0];
            if(!junctionUuid)throw Error('Select a SplineJunction first.');
            await ensureClasses();
            plan=await invokeScene('queryJunctionJoinPlan',junctionUuid,
                anchorIndex,targetIndex);
            if(!plan?.ok)throw Error(plan?.error||'Junction Join planner failed.');
            const finiteVec=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
            const finiteQuat=q=>finiteVec(q)&&Number.isFinite(q.w);
            if(plan.junctionUuid!==junctionUuid||plan.anchorIndex!==anchorIndex||
               plan.targetIndex!==targetIndex||!plan.anchorSplineUuid||
               !plan.targetSplineUuid||plan.anchorSplineUuid===plan.targetSplineUuid||
               typeof plan.guard!=='string'||!plan.guard||
               typeof plan.parentUuid!=='string'||!plan.parentUuid||
               !Number.isInteger(plan.count)||plan.count<3||plan.count>128||
               !Array.isArray(plan.knots)||plan.knots.length!==plan.count||
               plan.closed!==false||plan.reversed!==false||
               ![0,1,2].includes(plan.dimension)||
               !Number.isInteger(plan.samplesPerCurve)||
               plan.samplesPerCurve<4||plan.samplesPerCurve>256||
               !Number.isFinite(plan.gap)||plan.gap<0||plan.gap>1e-5||
               !finiteVec(plan.rootTransform?.position)||
               !finiteVec(plan.rootTransform?.scale)||
               !finiteQuat(plan.rootTransform?.rotation)||
               plan.knots.some(k=>!finiteVec(k?.position)||
                   !finiteVec(k?.tangentIn)||!finiteVec(k?.tangentOut)||
                   k.mode!==4))
                throw Error('Invalid Junction Join plan returned from Scene.');
            const appearance=appearanceWrites(plan.containerAppearance||{});
            const assertSource=async()=>{
                const check=await invokeScene('queryJunctionJoinValid',
                    plan.junctionUuid,plan.guard);
                if(!check?.ok)throw Error(check?.error||
                    'Junction source geometry changed during Join.');
            };
            await assertSource();
            created=await makeNode(plan.parentUuid,
                String(plan.sourceName||'Spline').slice(0,60)+' (Joined)');
            await component(created,'Splines.SplineContainer');
            await setNodeSerialized(created,'position','cc.Vec3',plan.rootTransform.position);
            await setNodeSerialized(created,'rotation','cc.Quat',plan.rootTransform.rotation);
            await setNodeSerialized(created,'scale','cc.Vec3',plan.rootTransform.scale);
            await property(created,0,'closed',false,'Boolean',false);
            await property(created,0,'reversed',false,'Boolean',false);
            await property(created,0,'dimension',plan.dimension,'Enum',false);
            await property(created,0,'samplesPerCurve',plan.samplesPerCurve,'Integer',false);
            for(const setting of appearance)
                await property(created,0,setting.key,setting.value,setting.type,false);
            for(let i=0;i<plan.count;i++){
                if(i%8===0)await assertSource();
                const k=plan.knots[i];
                const node=await makeNode(created,'Knot '+String(i).padStart(3,'0'));
                await component(node,'Splines.SplineKnot');
                await position(node,[k.position.x,k.position.y,k.position.z]);
                await setKnotValue(node,'mode',4,'Enum');
                await setKnotValue(node,'tangentIn',k.tangentIn,'cc.Vec3');
                await setKnotValue(node,'tangentOut',k.tangentOut,'cc.Vec3');
            }
            await assertSource();
            await snapshot();
            committed=true;
            try{selectOnly(created);}catch(e){console.warn('[Cocos Splines] Join selection failed:',e);}
            try{await invokeScene('refreshPreview',created);}
            catch(e){console.warn('[Cocos Splines] Join preview refresh failed:',e);}
            return {ok:true,root:created,count:plan.count,
                gap:plan.gap,angleDeg:plan.angleDeg,continuousC1:plan.continuousC1,
                message:'Created new independent Joined spline ('+plan.count+
                    ' Knots) with one welded seam. Source splines and Junction unchanged. '+
                    'Seam tangent angle: '+(plan.angleDeg===null?'undefined':plan.angleDeg.toFixed(2)+'°')+
                    '. One Scene snapshot; new Knot tangents are Broken.'};
        }catch(error){
            let warning='';
            if(created&&!committed&&plan?.junctionUuid&&plan?.guard){
                try{
                    const check=await invokeScene('queryJunctionJoinValid',
                        plan.junctionUuid,plan.guard);
                    if(check?.ok){
                        const removed=await Editor.Message.request('scene','remove-node',
                            {uuid:created,snapshot:false});
                        if(removed===false||(removed&&removed.ok===false))
                            throw Error('Editor rejected Join cleanup.');
                    }else warning='; source/Scene changed — cleanup skipped';
                }catch(e){warning='; cleanup failed: '+String(e?.message||e);}
            }
            return alertError('join-junction-links',
                Error(String(error?.message||error)+warning));
        }finally{knotEditBusy=false;}
    },
    /** Explicit conversion of a Junction target endpoint to Broken mode,
     * preserving the currently resolved curve with one undo snapshot.
     */
    async convertJunctionTargetToBroken(targetIndex){
        if(knotEditBusy)return alertError('convert-junction-tangent-mode',
            Error('Another spline edit is already in progress.'));
        knotEditBusy=true;
        try{
            const junctionUuid=selected()[0];
            if(!junctionUuid)throw Error('Select an enabled SplineJunction.');
            const plan=await invokeScene('queryJunctionConversionPlan',
                junctionUuid,targetIndex);
            if(!plan?.ok)throw Error(plan?.error||'Cannot plan tangent mode conversion.');
            if(!plan.changed)return {ok:true,changed:false,
                message:'Target Knot is already Broken. No snapshot.'};
            if(plan.junctionUuid!==junctionUuid||plan.targetIndex!==targetIndex||
               !plan.targetKnotUuid||!plan.targetSplineUuid||!plan.guard||
               plan.afterMode!==4||!Array.isArray(plan.writes))
                throw Error('Invalid Junction tangent conversion plan from Scene.');
            const read=()=>invokeScene('queryJunctionConversionState',
                plan.junctionUuid,plan.guard,plan.targetKnotUuid);
            const write=async(w,value)=>{
                const check=await read();
                if(!check?.ok)throw Error(check?.error||'Conversion Scene changed.');
                const response=await Editor.Message.request('scene','set-property',{
                    uuid:w.uuid,path:w.path,dump:{type:w.type,value},record:false,
                });
                if(response===false||(response&&response.ok===false))
                    throw Error('Scene rejected Knot tangent conversion write.');
            };
            const result=await commitJunctionBrokenConversion(plan,{read,write,snapshot});
            if(result.changed){
                try{await invokeScene('refreshPreview',plan.targetSplineUuid);}
                catch(error){console.warn('[Cocos Splines] Knot mode conversion refresh failed:',error);}
            }
            return {ok:true,changed:result.changed,targetKnotUuid:plan.targetKnotUuid,
                message:'Converted target link '+targetIndex+' from mode '+
                    plan.sourceMode+' to Broken, preserving resolved curve tangents. '+
                    'One Scene snapshot. You may now Align G1/C1.'};
        }catch(error){return alertError('convert-junction-tangent-mode',error);}
        finally{knotEditBusy=false;}
    },
    /** Adjust exactly one Broken-mode endpoint tangent to connect two
     * existing world-coincident Junction links. G1 keeps target handle length,
     * C1 matches anchor handle magnitude under their world transforms.
     */
    async alignJunctionTangent(anchorIndex,targetIndex,mode='g1',orientation='same'){
        if(knotEditBusy)return alertError('align-junction-tangent',
            Error('Another spline edit is already in progress.'));
        knotEditBusy=true;
        try{
            const uuid=selected()[0];
            if(!uuid)throw Error('Select an enabled SplineJunction.');
            const plan=await invokeScene('queryJunctionTangentPlan',
                uuid,anchorIndex,targetIndex,mode,orientation);
            if(!plan?.ok)throw Error(plan?.error||'Cannot plan endpoint tangent alignment.');
            const finite=v=>v&&['x','y','z'].every(k=>Number.isFinite(v[k]));
            if(plan.junctionUuid!==uuid||!plan.guard||!plan.targetKnotUuid||
                !plan.targetSplineUuid||!plan.writeUuid||!plan.writePath||
                plan.anchorIndex!==anchorIndex||plan.targetIndex!==targetIndex||
                plan.mode!==mode||plan.orientation!==orientation||
                !finite(plan.before)||!finite(plan.after))
                throw Error('Invalid G1/C1 plan returned by Scene.');
            const read=()=>invokeScene('queryJunctionTangentState',
                plan.junctionUuid,plan.guard,plan.targetKnotUuid,plan.side);
            const write=async value=>{
                const check=await read();
                if(!check?.ok)throw Error(check?.error||'Scene changed during tangent write.');
                const result=await Editor.Message.request('scene','set-property',{
                    uuid:plan.writeUuid,path:plan.writePath,
                    dump:{type:'cc.Vec3',value},record:false,
                });
                if(result===false||(result&&result.ok===false))
                    throw Error('Scene rejected G1/C1 tangent write.');
            };
            const result=await commitJunctionTangent(plan,{read,write,snapshot});
            if(!result.changed)return {ok:true,changed:false,
                message:'Junction tangent is already aligned. No snapshot.'};
            try{await invokeScene('refreshPreview',plan.targetSplineUuid);}
            catch(error){console.warn('[Cocos Splines] Junction tangent refresh failed:',error);}
            return {ok:true,changed:true,targetKnotUuid:plan.targetKnotUuid,
                message:'Aligned link '+targetIndex+' to '+anchorIndex+
                    ' ('+mode.toUpperCase()+', '+orientation+
                    ', world derivative control length '+plan.targetWorldLength.toFixed(4)+
                    '). One Scene snapshot; positions and source spline unchanged.'};
        }catch(e){return alertError('align-junction-tangent',e);}
        finally{knotEditBusy=false;}
    },
    async createJunction(){
        try{
            await ensureClasses();
            const info=await selectedSpline();
            if(!info?.found)throw Error('Chọn một SplineContainer trước khi thêm Junction.');
            // A junction connects independent splines, so it is a sibling, not a Knot.
            const id=await makeNode(info.parentUuid,'Spline Junction');
            await component(id,'Splines.SplineJunction');
            await snapshot();selectOnly(id);
            return {ok:true,uuid:id,message:'Junction được tạo. Gán Connections trong Inspector để nối nhiều spline.'};
        }catch(e){return alertError('create-junction',e);}
    },
    async rebuildRoad(){
        try{
            const id=selected()[0];if(!id)throw Error('Chọn Road hoặc SplineContainer.');
            return await invokeScene('rebuildRoad',id);
        }catch(e){return alertError('rebuild-road',e);}
    },
    async createRoadSpline(){
        try{
            await ensureClasses();
            const active=selected()[0],current=active?await invokeScene('querySpline',active):null;
            const parent=current?.found?current.parentUuid:active;
            const root=await makeNode(parent,'Road Spline');
            await component(root,'Splines.SplineContainer');
            const coords=[[-4,0,0],[-2,0,3],[2,0,3],[4,0,0]];
            for(let i=0;i<coords.length;i++){
                const id=await makeNode(root,`Knot ${String(i).padStart(2,'0')}`);
                await component(id,'Splines.SplineKnot');await position(id,coords[i]);
            }
            const road=await makeNode(root,'Road');
            await component(road,'Splines.SplineRoad');
            await snapshot();selectOnly(root);
            await invokeScene('refreshPreview',root);
            return {ok:true,root,road,message:'Đã tạo Road Spline. Chọn node Road để chỉnh profile trong Inspector.'};
        }catch(e){return alertError('create-road-spline',e);}
    },
    async getSpline(){
        try{const ids=selected();return ids.length?await invokeScene('querySpline',ids[0]):{found:false,message:'Chọn spline trong Hierarchy.'};}
        catch(e){return alertError('query',e);}
    },
    async refreshPreview(){
        try{const s=await selectedSpline();if(!s?.found)throw new Error(s?.message||'Không tìm thấy spline.');
            return await invokeScene('refreshPreview',s.rootUuid);}
        catch(e){return alertError('preview',e);}
    },
    async importJSON(input){
        try{
            const data=decodeJSON(input);await ensureClasses();
            const current=selected()[0];
            const active=current?await invokeScene('querySpline',current):null;
            // Import from Container Inspector creates a sibling, not a nested spline knot.
            const parent=active?.found?active.parentUuid:current;
            const root=await makeNode(parent,'Imported Unity Spline');
            await component(root,'Splines.SplineContainer');
            await component(root,'Splines.SplineExtrude');
            if(data.closed)await property(root,0,'closed',true,'Boolean');
            for(let i=0;i<data.knots.length;i++){
                const k=data.knots[i],id=await makeNode(root,`Knot ${String(i).padStart(3,'0')}`);
                await component(id,'Splines.SplineKnot');
                await position(id,[k.position.x,k.position.y,k.position.z]);
                await setKnotValue(id,'mode',k.mode,'Enum');
                await setKnotValue(id,'tangentIn',k.tangentIn,'cc.Vec3');
                await setKnotValue(id,'tangentOut',k.tangentOut,'cc.Vec3');
                await setKnotValue(id,'tension',k.tension,'Float');
                await setKnotValue(id,'tangentsInKnotSpace',true,'Boolean');
                if(k.eulerDegrees){
                    await Editor.Message.request('scene','set-property',{uuid:id,path:'eulerAngles',dump:{type:'cc.Vec3',value:k.eulerDegrees},record:false});
                }
            }
            await snapshot();selectOnly(root);
            await invokeScene('refreshPreview',root);
            return {ok:true,root,knots:data.knots.length};
        }catch(e){return alertError('import',e);}
    },
    async createSpline(){
        try{
            await ensureClasses();
            const parent=selected()[0];
            const root=await makeNode(parent,'Spline');
            await component(root,'Splines.SplineContainer');
            await component(root,'Splines.SplineExtrude'); // visible editable path
            const coords=[[-3,0,0],[-1,0,2],[1,0,2],[3,0,0]];
            for(let i=0;i<coords.length;i++){
                const id=await makeNode(root,`Knot ${String(i).padStart(2,'0')}`);
                await component(id,'Splines.SplineKnot');await position(id,coords[i]);
            }
            await snapshot();selectOnly(root);await invokeScene('refreshPreview',root);return {ok:true,root};
        }catch(e){return alertError('create',e);}
    },
    /**
     * Resample as a NEW sibling spline. The original, including Prefab
     * instance children, remains unchanged. No destructive delete/reorder
     * is attempted. The entire generated sibling uses one final snapshot.
     */
    async resampleSelectedSpline(mode,target,tolerance,space='local'){
        if(knotEditBusy)return alertError('resample-spline',Error('Another Knot edit is in progress.'));
        knotEditBusy=true;
        let created=null,sourceUuid=null,revision=null;
        try{
            if(!['count','spacing','simplify'].includes(mode))throw Error('Choose Count, Spacing or Simplify.');
            if(space!=='local'&&space!=='world')throw Error('Resample metric must be Local or World.');
            if(!Number.isFinite(target)||!Number.isFinite(tolerance))
                throw Error('Resample target/tolerance must be finite numbers.');
            await ensureClasses();
            const info=await selectedSpline();
            if(!info?.found)throw Error(info?.message||'Select a SplineContainer.');
            const plan=await invokeScene('queryResamplePlan',info.rootUuid,
                {mode,target,tolerance,space});
            if(!plan?.ok)throw Error(plan?.error||'Resample planner failed.');
            sourceUuid=info.rootUuid;revision=plan.revision;
            const finiteVec=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
            const finiteQuat=q=>finiteVec(q)&&Number.isFinite(q.w);
            if(plan.rootUuid!==sourceUuid||typeof revision!=='string'||!revision||
                !Number.isInteger(plan.count)||plan.count<2||plan.count>128||
                !Array.isArray(plan.knots)||plan.knots.length!==plan.count||
                !Number.isFinite(plan.estimatedMaxError)||
                plan.estimatedMaxError>tolerance||
                !finiteVec(plan.rootTransform?.position)||
                !finiteVec(plan.rootTransform?.scale)||
                !finiteQuat(plan.rootTransform?.rotation)||
                plan.knots.some(k=>!finiteVec(k.position)||!finiteVec(k.tangentIn)||
                    !finiteVec(k.tangentOut)||k.mode!==4)||
                 (mode==='simplify'&&(!Array.isArray(plan.retainedKnots)||
                     plan.retainedKnots.length!==plan.count||
                     plan.retainedKnots.some(k=>typeof k?.name!=='string'||
                         k.name.length>72||!validCopyQuat(k.rotation)||
                         !['handleIn','handleOut','tangentsInKnotSpace','editTangentHandles'].every(field=>typeof k[field]==='boolean')||
                         !Number.isFinite(k.tension)||k.tension<0||k.tension>1000))))
                throw Error('Invalid or stale resample result from Scene.');
            const assertOriginal=async()=>{
                const check=await invokeScene('queryResampleValid',sourceUuid,revision);
                if(!check?.ok)throw Error(check?.error||'Original spline changed during resample.');
            };
            // Reject malformed metadata BEFORE any Scene Node is allocated.
            const appearance=appearanceWrites(plan.containerAppearance||{});
            const skipped=mode==='simplify'?plan.omittedData:null;
            if(skipped&&(['extraRootComponents','extraKnotComponents','extraKnotChildren'].some(
                key=>!Number.isInteger(skipped[key])||skipped[key]<0||skipped[key]>100000)))
                throw Error('Invalid source omission report.');
            await assertOriginal();
            created=await makeNode(plan.parentUuid,
                String(plan.sourceName||'Spline').slice(0,72)+(mode==='simplify'?' (Simplified)':' (Resampled)'));
            await component(created,'Splines.SplineContainer');
            await setNodeSerialized(created,'position','cc.Vec3',plan.rootTransform.position);
            await setNodeSerialized(created,'rotation','cc.Quat',plan.rootTransform.rotation);
            await setNodeSerialized(created,'scale','cc.Vec3',plan.rootTransform.scale);
            // Source collect() is in evaluator order (possibly reversed).
            // New Knot hierarchy follows this order with reversed=false.
            await property(created,0,'closed',plan.closed,'Boolean',false);
            await property(created,0,'reversed',false,'Boolean',false);
            await property(created,0,'dimension',plan.dimension,'Enum',false);
            await property(created,0,'samplesPerCurve',plan.samplesPerCurve,'Integer',false);
            for(const setting of appearance)
                await property(created,0,setting.key,setting.value,setting.type,false);
            for(let i=0;i<plan.knots.length;i++){
                if(i%8===0)await assertOriginal();
                const k=plan.knots[i];
                const originalKnot=mode==='simplify'?plan.retainedKnots[i]:null;
                // Build a fresh Knot from immutable geometry. No source
                // component/Node identifiers enter the new sibling.
                const copied=originalKnot?planCopiedKnot(k,originalKnot):null;
                const id=await makeNode(created,originalKnot?.name||'Knot '+String(i).padStart(3,'0'));
                if(originalKnot)await setNodeSerialized(id,'rotation','cc.Quat',originalKnot.rotation);
                await component(id,'Splines.SplineKnot');
                await position(id,[k.position.x,k.position.y,k.position.z]);
                await setKnotValue(id,'mode',4,'Enum');
                await setKnotValue(id,'tangentIn',copied?.tangentIn||k.tangentIn,'cc.Vec3');
                await setKnotValue(id,'tangentOut',copied?.tangentOut||k.tangentOut,'cc.Vec3');
                if(copied){
                    await setKnotValue(id,'tension',copied.tension,'Float');
                    if(copied.tangentsInKnotSpace)
                        await setKnotValue(id,'tangentsInKnotSpace',true,'Boolean');
                    // Recreate only standard tangent handles as independent
                    // child nodes; source Prefab Node references are never used.
                    for(const [which,enabled] of [['In',copied.handleIn],['Out',copied.handleOut]]){
                        if(!enabled)continue;
                        const tangent=which==='In'?copied.tangentIn:copied.tangentOut;
                        const handle=await makeNode(id,'Tangent '+which);
                        await position(handle,[tangent.x,tangent.y,tangent.z]);
                        await setKnotValue(id,'tangent'+which+'Handle',handle,'cc.Node');
                    }
                    if(copied.editTangentHandles)
                        await setKnotValue(id,'editTangentHandles',true,'Boolean');
                }
            }
            await assertOriginal();
            await snapshot();
            selectOnly(created);
            return {ok:true,root:created,count:plan.count,
                estimatedMaxError:plan.estimatedMaxError,
                message:'Created a separate '+(mode==='simplify'?'simplified':'resampled')+' spline with '+plan.count+
                    ' Knots; estimated '+space+' deviation '+
                    plan.estimatedMaxError.toFixed(5)+'. Original preserved.'+
                    (mode==='simplify'?(' Fresh tangent handles. Skipped '+
                        (skipped?.extraRootComponents||0)+' other Container components, '+
                        (skipped?.extraKnotComponents||0)+' retained Knot components and '+
                        (skipped?.extraKnotChildren||0)+' non-handle child nodes.'):'')};
        }catch(error){
            let cleanupWarning='';
            if(created&&sourceUuid&&revision){
                try{
                    // Do not send remove-node to a different Scene after unload.
                    const check=await invokeScene('queryResampleValid',sourceUuid,revision);
                    if(check?.ok){
                        const removed=await Editor.Message.request('scene','remove-node',{
                            uuid:created,snapshot:false,
                        });
                        if(removed===false||(removed&&removed.ok===false))
                            throw Error('Editor rejected generated-spline cleanup.');
                    }else cleanupWarning='; old Scene changed — cleanup skipped';
                }catch(cleanupError){cleanupWarning='; cleanup failed: '+String(cleanupError);}
            }
            return alertError('resample-spline',
                Error(String(error?.message||error)+cleanupWarning));
        }finally{knotEditBusy=false;}
    },
    async addKnot(){
        try{
            await ensureClasses();const info=await selectedSpline();
            if(!info?.found)throw new Error(info?.message||'Không tìm thấy spline.');
            const a=info.knots[info.knots.length-1]?.position||{x:0,y:0,z:0};
            const b=info.knots[info.knots.length-2]?.position||{x:a.x-2,y:a.y,z:a.z};
            const id=await makeNode(info.rootUuid,`Knot ${String(info.knots.length).padStart(2,'0')}`);
            await component(id,'Splines.SplineKnot');
            await position(id,[a.x+(a.x-b.x),a.y+(a.y-b.y),a.z+(a.z-b.z)]);
            await snapshot();selectOnly(info.rootUuid);await invokeScene('refreshPreview',info.rootUuid);return {ok:true,uuid:id};
        }catch(e){return alertError('add',e);}
    },
    async selectContainer(){
        try {const s=await selectedSpline();if(!s?.found)throw Error('Không tìm thấy spline.');
            selectOnly(s.rootUuid);return {ok:true};}
        catch(e){return alertError('select-container',e);}
    },
    async selectKnotId(uuid){
        try {const s=await selectedSpline();
            if(!s?.found||!s.knots.some(k=>k.uuid===uuid))throw Error('Knot không thuộc spline đang chọn.');
            selectOnly(uuid);return {ok:true};}
        catch(e){return alertError('select-knot-id',e);}
    },
    async selectKnotIds(ids){
        try{
            const info=await selectedSpline();
            if(!info?.found)throw Error(info?.message||'Select a spline.');
            const knots=selectedKnotIds(info,ids);
            Editor.Selection.clear('node');
            for(const uuid of knots)Editor.Selection.select('node',uuid);
            return {ok:true,count:knots.length,message:'Selected '+knots.length+' Knot(s) in Scene.'};
        }catch(error){return alertError('select-knot-ids',error);}
    },
    async listSurfaceTargets(){
        try{
            const info=await selectedSpline();
            if(!info?.found)throw Error(info?.message||'Select a spline.');
            const response=await invokeScene('listSurfaceTargets',info.rootUuid);
            if(!response?.ok)throw Error(response?.error||'Could not list scene mesh surfaces.');
            return response;
        }catch(error){return alertError('list-surface-targets',error);}
    },
    async snapSelectedToSurface(ids,targetUuid,height=10,maxDrop=100,
        alignNormal=false,smoothNormal=false,creaseAngle=60,targetKind='mesh'){
        try{return await applyKnotPlacement('surface',ids,{targetUuid,height,maxDrop,
            alignNormal:alignNormal===true,smoothNormal:smoothNormal===true,
            creaseAngle,targetKind});}
        catch(error){return alertError('snap-selected-to-surface',error);}
    },
    async snapSelectedKnots(ids,step,space='local'){
        try{return await applyKnotPlacement('snap',ids,{step,space});}
        catch(error){return alertError('snap-selected-knots',error);}
    },
    async alignSelectedKnots(ids,axis,space='local'){
        try{return await applyKnotPlacement('align',ids,{axis,space});}
        catch(error){return alertError('align-selected-knots',error);}
    },
    async distributeSelectedKnots(ids,axis,space='local'){
        try{return await applyKnotPlacement('distribute',ids,{axis,space});}
        catch(error){return alertError('distribute-selected-knots',error);}
    },
    async distributeSelectedKnotsByArc(ids,space='local'){
        try{return await applyKnotPlacement('distribute-arc',ids,{space});}
        catch(error){return alertError('distribute-selected-knots-by-arc',error);}
    },
    async moveSelectedKnots(ids,delta,space='local'){
        try{return await applyKnotPlacement('move',ids,{delta,space});}
        catch(error){return alertError('move-selected-knots',error);}
    },
    async deleteKnotId(uuid){
        try {const s=await selectedSpline();
            if(!s?.found||!s.knots.some(k=>k.uuid===uuid))throw Error('Knot không thuộc spline đang chọn.');
            if(s.knots.length<=2)throw Error('Spline cần ít nhất 2 knot.');
            await Editor.Message.request('scene','remove-node',{uuid});
            await snapshot();selectOnly(s.rootUuid);
            await invokeScene('refreshPreview',s.rootUuid);return {ok:true};}
        catch(e){return alertError('delete-knot-id',e);}
    },
    async splitAfterKnot(uuid){
        try{
            await ensureClasses();
            const info=await selectedSpline();
            if(!info?.found||!info.knots.some(k=>k.uuid===uuid))throw Error('Knot không thuộc spline đang chọn.');
            const geometry=await invokeScene('describeSplit',uuid);
            if(!geometry?.ok)throw Error(geometry?.error||'Không thể chia đoạn.');
            const {split,rootUuid,firstUuid,lastUuid}=geometry;
            const newId=await makeNode(rootUuid,'Knot (split)');
            await component(newId,'Splines.SplineKnot');
            await position(newId,[split.middle.position.x,split.middle.position.y,split.middle.position.z]);
            const vectors=[
                [firstUuid,'tangentIn',split.before.tangentIn],
                [firstUuid,'tangentOut',split.before.tangentOut],
                [lastUuid,'tangentIn',split.after.tangentIn],
                [lastUuid,'tangentOut',split.after.tangentOut],
                [newId,'tangentIn',split.middle.tangentIn],
                [newId,'tangentOut',split.middle.tangentOut],
            ];
            // Convert AutoSmooth/Continuous/Mirrored to Broken so the split
            // preserves the original cubic instead of recomputing handles.
            for(const target of [firstUuid,lastUuid,newId])await setKnotValue(target,'mode',4,'Enum');
            for(const [target,key,v] of vectors)await setKnotValue(target,key,v,'cc.Vec3');
            const placement=await invokeScene('placeAfter',newId,firstUuid);
            if(!placement?.ok)throw Error(placement?.error||'Không đặt được thứ tự Knot mới.');
            await snapshot();selectOnly(rootUuid);await invokeScene('refreshPreview',rootUuid);
            return {ok:true,uuid:newId,message:'Đã Split đoạn Bezier (giữ nguyên hình dáng).'};
        }catch(e){return alertError('split-after',e);}
    },
    async moveKnotId(uuid,position){
        try{
            const info=await selectedSpline();
            if(!info?.found||!info.knots.some(k=>k.uuid===uuid))throw Error('Knot không thuộc spline đang chọn.');
            if(position!=='up'&&position!=='down')throw Error('Invalid move');
            const result=await invokeScene('moveKnot',uuid,position);
            if(!result?.ok)throw Error(result?.error||'Cannot move knot');
            await snapshot();await invokeScene('refreshPreview',info.rootUuid);
            return {ok:true};
        }catch(e){return alertError('move-knot',e);}
    },
    async reverseDirection(){
        try{
            const info=await selectedSpline();if(!info?.found)throw Error('Chọn Spline Container.');
            await property(info.rootUuid,info.containerIndex,'reversed',!info.reversed,'Boolean');
            await invokeScene('refreshPreview',info.rootUuid);
            return {ok:true,message:!info.reversed?'Đã đảo chiều.':'Đã chuyển lại chiều gốc.'};
        }catch(e){return alertError('reverse-direction',e);}
    },
    async setKnotField(uuid,key,value){
        try {
            const s=await selectedSpline();
            if(!s?.found||!s.knots.some(k=>k.uuid===uuid))throw Error('Knot không thuộc spline đang chọn.');
            const vecKey=['position','tangentIn','tangentOut'].includes(key);
            if(vecKey){
                if(!value||['x','y','z'].some(axis=>typeof value[axis]!=='number'||!Number.isFinite(value[axis])))throw Error('Vector không hợp lệ.');
                value={x:value.x,y:value.y,z:value.z};
            }else if(key==='mode'){
                if(!Number.isInteger(value)||value<0||value>4)throw Error('Tangent mode phải từ 0 đến 4.');
            }else if(key==='tangentsInKnotSpace'||key==='editTangentHandles'){
                if(typeof value!=='boolean')throw Error('Knot editing / tangent space flag phải là boolean.');
                if(key==='editTangentHandles'&&value===true&&
                   !s.knots.find(k=>k.uuid===uuid)?.hasHandles)
                    throw Error('Tạo Tangent Handles trước khi bật Edit Handles.');
            }else if(key==='tension'){
                if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000)throw Error('Tension phải trong [0, 1000].');
            }else throw Error('Không được chỉnh thuộc tính này.');
            if(key==='position'){
                const result=await Editor.Message.request('scene','set-property',{uuid,path:'position',dump:{type:'cc.Vec3',value},record:true});
                if(result===false)throw Error('Không đặt được vị trí knot.');
            }else await setKnotValue(uuid,key,value,vecKey?'cc.Vec3':key==='mode'?'Enum':['tangentsInKnotSpace','editTangentHandles'].includes(key)?'Boolean':'Float',true);
            await invokeScene('refreshPreview',s.rootUuid);
            return {ok:true};
        }catch(e){return alertError('set-knot-field',e);}
    },
    async spawnPrefabs(kind,action){
        try{
            const uuid=selected()[0];if(!uuid)throw Error('Chọn Node chứa component spawn prefab trong Inspector.');
            const result=await invokeScene('spawnPrefabs',uuid,kind,action);
            if(result?.ok&&result.changed)await snapshot();
            return result;
        }catch(e){return alertError('spawn-prefabs',e);}
    },
    async previewAnimate(){
        try {
            const node=selected()[0];if(!node)throw Error('Chọn Node chứa SplineAnimate.');
            const info=await invokeScene('queryAnimate',node);
            if(!info?.found)throw Error('Node không có SplineAnimate.');
            const result=await invokeScene('previewAnimate',node);
            if(result?.ok&&!info.previewInEditor)await property(node,info.componentIndex,'previewInEditor',true,'Boolean');
            return result;
        }catch(e){return alertError('preview-animate',e);}
    },
    async stopPreviewAnimate(){
        try {
            const node=selected()[0];if(!node)throw Error('Chọn Node chứa SplineAnimate.');
            const info=await invokeScene('queryAnimate',node);
            if(!info?.found)throw Error('Node không có SplineAnimate.');
            if(info.previewInEditor)await property(node,info.componentIndex,'previewInEditor',false,'Boolean');
            return await invokeScene('restoreAnimate',node);
        }catch(e){return alertError('stop-preview-animate',e);}
    },
};
exports.methods=methods;exports.load=function(){};exports.unload=function(){};
