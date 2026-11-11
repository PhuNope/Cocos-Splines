'use strict';
const NAME='cocos-splines';
const {bindWhenImported}=require('./v2/EditorAssetBind');
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
async function property(root,index,key,value,type){
    const result=await Editor.Message.request('scene','set-property',{
        uuid:root,path:`__comps__.${index}.${key}`,dump:{type,value},record:true});
    if(result===false)throw new Error(`set-property failed for ${key}`);
}
async function snapshot(){await Editor.Message.request('scene','snapshot');}
async function setKnotValue(uuid,key,value,fallbackType,record=false){
    const dump=await Editor.Message.request('scene','query-node',uuid);
    const comps=dump?.__comps__||[];
    const idx=comps.findIndex(c=>c.type==='Splines.SplineKnot'||String(c.type||'').endsWith('SplineKnot')||(c.value?.mode&&c.value?.tangentIn&&c.value?.tangentOut));
    if(idx<0)throw new Error(`Missing SplineKnot on ${uuid}`);
    const prop=comps[idx].value?.[key];
    const result=await Editor.Message.request('scene','set-property',{
        uuid,path:`__comps__.${idx}.${key}`,dump:{type:prop?.type||fallbackType,value},record,
    });
    if(result===false)throw new Error(`Cannot set ${key}`);
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
const methods={

    async rebuildV2Road(){
        try{
            const uuid=selected()[0];if(!uuid)throw Error('Select a v2 Road/Extrude component Node.');
            return await invokeScene('rebuildV2Road',uuid);
        }catch(e){return alertError('v2-rebuild',e);}
    },
    async restoreV2RoadBaked(){
        try{
            const uuid=selected()[0];if(!uuid)throw Error('Select a v2 Road/Extrude component Node.');
            return await invokeScene('restoreV2RoadBaked',uuid);
        }catch(e){return alertError('v2-road-restore',e);}
    },
    async checkV2RoadBake(){
        try{
            const uuid=selected()[0];if(!uuid)throw Error('Select a v2 Road/Extrude component Node.');
            const result=await invokeScene('inspectV2RoadBake',uuid);
            if(!result?.ok)throw Error(result?.error||'Cannot inspect bake');
            const message=result.pendingUrl
                ? 'Bake import pending: '+result.pendingUrl+'. Use Bind imported Mesh once AssetDB has finished.'
                : !result.hasMesh?'No baked Mesh assigned. Use Bake from the Inspector.'
                : result.stale?'Source changed since saved Mesh was baked. Re-bake before publishing.'
                :'Saved Mesh reference exists and fingerprint matches the spline.';
            const warn=result.cornerRisk?.pinchedSections
                ?' Editor geometry note: '+result.cornerRisk.pinchedSections+
                 ' tight-bend sections trimmed; global road intersections require a junction.'
                :'';
            return {...result,message:message+warn};
        }catch(e){return alertError('v2-status',e);}
    },
    async bindV2RoadMesh(){
        try{
            const uuid=selected()[0];if(!uuid)throw Error('Select a v2 Road/Extrude component Node.');
            const status=await invokeScene('inspectV2RoadBake',uuid);
            if(!status?.ok)throw Error(status?.error||'Cannot inspect pending Bake');
            if(!status.pendingUrl||!status.pendingFingerprint)
                return {ok:false,error:'No pending Bake. Click Bake glTF Asset first.'};
            if(status.fingerprint!==status.pendingFingerprint)
                return {ok:false,error:'Spline changed since Bake was exported; click Bake again.'};
            const result=await bindWhenImported(Editor,{
                nodeUuid:uuid,componentIndex:status.componentIndex,
                assetUrl:status.pendingUrl,fingerprint:status.pendingFingerprint
            },{attempts:1});
            if(!result.ok)return {ok:false,error:result.reason||'Mesh import not finished',pending:!!result.pending,
                message:'Asset imported but cannot bind automatically. Check the Assets panel.'};
            const restored=await invokeScene('restoreV2RoadBaked',uuid);
            if(!restored?.ok)throw Error(restored?.error||'Mesh bound but could not show saved Mesh');
            await snapshot();
            return {ok:true,uuid:result.uuid,url:result.assetUrl,
                message:'Imported Mesh '+result.uuid+' has been linked to the Scene; mode set to Baked.'};
        }catch(e){return alertError('v2-bind',e);}
    },
    async bakeV2Road(){
        try{
            const uuid=selected()[0];if(!uuid)throw Error('Select a v2 Road/Extrude component Node.');
            const prepared=await invokeScene('prepareV2RoadBake',uuid);
            if(!prepared?.ok||!prepared.content||!prepared.fingerprint)
                throw Error(prepared?.error||'Could not export v2 geometry');
            const safeId=uuid.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,45);
            const target=`db://assets/SplineV2_${safeId}_${prepared.fingerprint}.gltf`;
            const prior=await Editor.Message.request('asset-db','query-asset-info',target);
            if(!prior?.uuid){
                const created=await Editor.Message.request('asset-db','create-asset',target,prepared.content);
                if(created===false||created==null)throw Error('AssetDB did not confirm glTF creation');
            }
            // Separate pending from committed fingerprints: on import failure,
            // never mark an older Mesh as fresh and never replace its reference.
            await property(uuid,prepared.componentIndex,'pendingBakeUrl',target,'String');
            await property(uuid,prepared.componentIndex,'pendingBakeFingerprint',prepared.fingerprint,'String');
            await snapshot();
            const latest=await invokeScene('inspectV2RoadBake',uuid);
            if(!latest?.ok||latest.fingerprint!==prepared.fingerprint)
                return {ok:false,error:'Spline changed during import. Exported asset kept, but not auto-bound.'};
            const bound=await bindWhenImported(Editor,{
                nodeUuid:uuid,componentIndex:prepared.componentIndex,
                assetUrl:target,fingerprint:prepared.fingerprint
            },{attempts:10,delayMs:200});
            if(!bound.ok)return {ok:true,bound:false,url:target,message:
                'glTF exported successfully, but Mesh is not linked yet: '+(bound.reason||'AssetDB import pending')+
                '. Click Bind Imported Mesh in Inspector when import completes.'};
            const restored=await invokeScene('restoreV2RoadBaked',uuid);
            if(!restored?.ok)throw Error(restored?.error||'Mesh bound but could not show saved Mesh');
            await snapshot();
            return {ok:true,bound:true,url:target,meshUuid:bound.uuid,
                primitiveCount:prepared.primitiveCount,message:
                'Bake finished. Mesh subasset '+bound.uuid+' linked to Scene; Baked mode selected.'};
        }catch(e){return alertError('v2-bake',e);}
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
