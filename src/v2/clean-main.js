'use strict';
/**
 * Clean Spline v2 Editor main entrypoint.
 * Only the v2 Path/Road/Extrude/Mesh Deform/Junction workflow is exposed.
 * No legacy containers, panel state, UUID migration or old menu methods.
 */
const NAME='cocos-splines';
const {bindWhenImported,stagePendingBake}=require('./EditorAssetBind');
const {planPathEditDump}=require('./PathV2Dump');
const {planPathGroupNudgeDump}=require('./PathGroupNudgeDump');
const {planEndpointSnapDump}=require('./PathEndpointSnapDump');
const {planJunctionAutoConnectDump}=require('./JunctionAutoConnectDump');
const {planJunctionTangentDump}=require('./JunctionTangentDump');
const selected=()=>Editor.Selection.getSelected('node')||[];
async function scene(method,uuid,...args){
    return Editor.Message.request('scene','execute-scene-script',{
        name:NAME,method,args:[uuid,...args]
    });
}
function currentNode(){
    const uuid=selected()[0];
    if(!uuid)throw new Error('Select a Spline V2 Road / Extrude / Deform / Junction Node.');
    return uuid;
}
async function snapshot(){await Editor.Message.request('scene','snapshot');}
function fail(action,error){
    const message=String(error instanceof Error?error.message:error);
    console.error('[Cocos Splines v2] '+action+': '+message);
    return {ok:false,error:message};
}
async function rebuildV2Road(){
    try{return await scene('rebuildV2Road',currentNode());}
    catch(e){return fail('rebuild',e);}
}
async function restoreV2RoadBaked(){
    try{return await scene('restoreV2RoadBaked',currentNode());}
    catch(e){return fail('restore',e);}
}
async function checkV2RoadBake(){
    try{
        const value=await scene('inspectV2RoadBake',currentNode());
        if(!value?.ok)throw new Error(value?.error||'Bake status unavailable');
        return value;
    }catch(e){return fail('check bake',e);}
}
async function bindV2RoadMesh(){
    try{
        const uuid=currentNode();
        const status=await scene('inspectV2RoadBake',uuid);
        if(!status?.ok||!status.pendingUrl||!status.pendingFingerprint)
            return {ok:false,error:status?.error||'No pending glTF bake to bind'};
        if(status.fingerprint!==status.pendingFingerprint)
            return {ok:false,error:'Path changed since Bake; export again'};
        const result=await bindWhenImported(Editor,{
            nodeUuid:uuid,componentIndex:status.componentIndex,
            assetUrl:status.pendingUrl,fingerprint:status.pendingFingerprint,
            materialSlots:status.pendingMaterialSlots||'',
            verifyCurrent:()=>scene('inspectV2RoadBake',uuid)
        },{attempts:1});
        if(!result.ok)return {ok:false,pending:!!result.pending,
            rolledBack:result.rolledBack===true,
            recoveryRequired:result.recoveryRequired===true,
            error:result.reason||'AssetDB import is not ready'};
        const restored=await scene('restoreV2RoadBaked',uuid);
        if(!restored?.ok)throw new Error(restored?.error||'Cannot restore Baked Mesh');
        await snapshot();
        return {ok:true,uuid:result.uuid,url:result.assetUrl};
    }catch(e){return fail('bind imported mesh',e);}
}
async function bakeV2Road(){
    try{
        const uuid=currentNode();
        const output=await scene('prepareV2RoadBake',uuid);
        if(!output?.ok||!output.content||!output.fingerprint||
            !Number.isInteger(output.componentIndex)||
            !Array.isArray(output.primitiveMaterialSlots)||
            output.primitiveMaterialSlots.length!==output.primitiveCount||
            !output.primitiveMaterialSlots.every(x=>Number.isSafeInteger(x)&&
                x>=0&&x<=0xffffffff))
            throw new Error(output?.error||'Cannot build V2 geometry');
        const safeId=uuid.replace(/[^\w-]/g,'').slice(0,45);
        const assetUrl='db://assets/SplineV2_'+safeId+'_'+output.fingerprint+'.gltf';
        const prior=await Editor.Message.request('asset-db','query-asset-info',assetUrl);
        if(!prior?.uuid){
            const created=await Editor.Message.request('asset-db','create-asset',
                assetUrl,output.content);
            if(!created)throw new Error('AssetDB glTF creation failed');
        }
        // Pending URL/fingerprint/primitive slots are a serialized tuple.
        // Recover the previous tuple if any of Creator's three native
        // set-property calls fails; never commit partial pending metadata.
        const slots=JSON.stringify(output.primitiveMaterialSlots);
        const staged=await stagePendingBake(Editor,{
            nodeUuid:uuid,componentIndex:output.componentIndex,
            assetUrl,fingerprint:output.fingerprint,materialSlots:slots,
            verifyCurrent:()=>scene('inspectV2RoadBake',uuid)
        });
        if(!staged.ok)return {ok:false,bound:false,url:assetUrl,
            rolledBack:staged.rolledBack===true,
            recoveryRequired:staged.recoveryRequired===true,
            error:staged.reason||'Cannot stage pending Bake metadata'};
        await snapshot();
        const latest=await scene('inspectV2RoadBake',uuid);
        if(!latest?.ok||latest.fingerprint!==output.fingerprint||
           latest.pendingUrl!==assetUrl||
           latest.pendingFingerprint!==output.fingerprint||
           latest.pendingMaterialSlots!==slots)
            return {ok:false,bound:false,
                error:'Spline or pending Bake changed after staging; rebake',
                url:assetUrl};
        const bound=await bindWhenImported(Editor,{
            nodeUuid:uuid,componentIndex:output.componentIndex,
            assetUrl,fingerprint:output.fingerprint,
            materialSlots:JSON.stringify(output.primitiveMaterialSlots),
            verifyCurrent:()=>scene('inspectV2RoadBake',uuid)
        },{attempts:10,delayMs:200});
        if(!bound.ok){
            if(!bound.pending)return {ok:false,bound:false,url:assetUrl,
                rolledBack:bound.rolledBack===true,
                recoveryRequired:bound.recoveryRequired===true,
                error:bound.reason||'Bake source changed during import'};
            return {ok:true,bound:false,url:assetUrl,
                message:'Exported glTF. Click Bind Imported Mesh after AssetDB import.'};
        }
        const shown=await scene('restoreV2RoadBaked',uuid);
        if(!shown?.ok)throw new Error(shown?.error||'Cannot display imported Mesh');
        await snapshot();
        return {ok:true,bound:true,url:assetUrl,meshUuid:bound.uuid,
            primitiveCount:output.primitiveCount};
    }catch(e){return fail('bake',e);}
}
async function editV2Path(operation,index){
    try{
        const uuid=currentNode();
        // Creator owns serialization, prefab overrides and Undo history.
        // Never mutate the live CCClass array through execute-scene-script
        // and then take a snapshot: the pre-edit value may already be lost.
        const root=await Editor.Message.request('scene','query-node',uuid);
        const plan=planPathEditDump(root,operation,index);
        if(plan.noOp)return {ok:true,index:plan.index,count:plan.count,noOp:true};
        const accepted=await Editor.Message.request('scene','set-property',{
            uuid,
            path:'__comps__.'+plan.componentIndex+'.'+plan.field,
            dump:plan.dump,
            record:plan.record
        });
        if(accepted===false)
            throw new Error('Creator rejected the Path property edit');
        // Topology edits must also move the Scene active-index selector.
        // This intentionally does not create a second Undo step.
        if(plan.field==='knots'){
            const selected=plan.index;
            const value=await Editor.Message.request('scene','set-property',{
                uuid,
                path:'__comps__.'+plan.componentIndex+'.gizmoKnotIndex',
                dump:plan.selectionDump,record:false
            });
            if(value===false)
                throw new Error('Knot data changed but active Knot selection failed');
        }
        // Only topology changes invalidate geometry. An active-Knot
        // selection changes the Scene handles but must NOT rebuild meshes.
        if(plan.field==='knots'){
            const refreshed=await scene('refreshV2Path',uuid);
            if(!refreshed?.ok)
                throw new Error(refreshed?.error||'Path preview refresh failed');
        }
        return {ok:true,index:plan.index,count:plan.count};
    }catch(e){return fail('edit path',e);}
}
/** Direct Inspector Group selection: no extra serialized Knot fields.
 * HUD and Inspector both mutate the same transient selection Set. */
async function editV2PathGroup(operation,index){
    try{
        const result=await scene('editV2PathGroup',currentNode(),operation,index);
        if(!result?.ok)throw new Error(result?.error||'Group selection unavailable');
        return result;
    }catch(e){return fail('edit Group selection',e);}
}
/** Group Nudge: one native Creator history transaction for all selected Knots. */
async function nudgeV2PathGroup(axis){
    try{
        const uuid=currentNode();
        const proposed=await scene('planV2PathGroupNudge',uuid,axis);
        if(!proposed?.ok)throw new Error(proposed?.error||'Group Nudge rejected');
        const node=await Editor.Message.request('scene','query-node',uuid);
        const commit=planPathGroupNudgeDump(node,proposed.plan);
        if(commit.noOp)return {ok:true,noOp:true,count:commit.count};
        const saved=await Editor.Message.request('scene','set-property',{
            uuid,path:'__comps__.'+commit.componentIndex+'.knots',
            dump:commit.dump,record:true
        });
        if(saved===false)throw new Error('Creator rejected Group Nudge Knot edit');
        const refresh=await scene('refreshV2PathGroup',uuid,commit.indices);
        if(!refresh?.ok)
            throw new Error(refresh?.error||'Group Nudge was recorded but preview failed');
        return {ok:true,count:commit.count,axis,groupCount:refresh.groupCount};
    }catch(e){return fail('group nudge',e);}
}
async function planV2JunctionAutoTrim(){
    try{
        const result=await scene('planV2JunctionAutoTrim',currentNode());
        if(!result?.ok)throw new Error(result?.error||'Junction trim plan rejected');
        console.info('[Cocos Splines V2] Read-only Junction Auto Trim proposal:',result.plan);
        return result;
    }catch(e){return fail('plan Junction trims',e);}
}
/**
 * No implicit snapping or Knot edits. Recheck the complete topology before
 * committing any property, so most invalid requests cannot partially apply.
 * Cocos records each changed Road property in native history.
 */
async function applyV2JunctionAutoTrim(){
    try{
        const junctionUuid=currentNode();
        const proposal=await scene('planV2JunctionAutoTrim',junctionUuid);
        if(!proposal?.ok)throw new Error(proposal?.error||'Junction trim plan rejected');
        const branches=proposal.plan?.branches;
        if(!Array.isArray(branches)||(branches.length!==3&&branches.length!==4))
            throw new Error('Invalid Junction trim plan');
        const changes=branches.filter(b=>Math.abs(b.trim-b.currentTrim)>1e-5);
        // Confirm all addresses/values before the first serialized write.
        for(const branch of changes){
            if(typeof branch.nodeUuid!=='string'||!branch.nodeUuid||
               !Number.isInteger(branch.componentIndex)||branch.componentIndex<0||
               !Number.isFinite(branch.trim)||branch.trim<=0)
                throw new Error('Invalid Road component or planned trim');
        }
        for(const branch of changes){
            const prop=branch.atEnd?'junctionEndTrim':'junctionStartTrim';
            const accepted=await Editor.Message.request('scene','set-property',{
                uuid:branch.nodeUuid,
                path:'__comps__.'+branch.componentIndex+'.'+prop,
                dump:{type:'Float',value:branch.trim},
                record:true
            });
            if(accepted===false)throw new Error('Creator rejected '+prop+' on Road '+branch.roadId);
        }
        if(changes.length){
            const refreshed=await scene('refreshV2JunctionAutoTrim',junctionUuid);
            if(!refreshed?.ok)throw new Error(refreshed?.error||'Road trims saved but preview refresh failed');
        }
        return {ok:true,changed:changes.length,plan:proposal.plan};
    }catch(e){return fail('apply Junction trims',e);}
}
async function planV2JunctionEndpointSnap(){
    try{
        const result=await scene('planV2JunctionEndpointSnap',currentNode());
        if(!result?.ok)throw new Error(result?.error||'Junction Endpoint Snap plan rejected');
        return result;
    }catch(e){return fail('check Endpoint Snap',e);}
}
async function inspectV2RoadNetwork(){
    try{
        const result=await scene('inspectV2RoadNetwork',currentNode());
        if(!result?.ok)throw new Error(result?.error||'Road Network scan failed');
        return result;
    }catch(e){return fail('inspect Road Network',e);}
}
/**
 * Two-phase serialized Knot edit. Verify EVERY Path dump before the FIRST
 * record:true write; preserve tangents, Roll, custom record metadata.
 * Each distinct Path is a native undoable edit (not a global transaction).
 */
async function applyV2JunctionEndpointSnap(){
    let changed=0,junctionUuid;
    try{
        junctionUuid=currentNode();
        const result=await scene('planV2JunctionEndpointSnap',junctionUuid);
        if(!result?.ok)throw new Error(result?.error||'Junction Endpoint Snap plan rejected');
        const links=result.plan?.branches;
        if(!Array.isArray(links)||(links.length!==3&&links.length!==4))
            throw new Error('Invalid Endpoint Snap proposal');
        const checked=[];
        const seen=new Set();
        for(const branch of links){
            if(typeof branch.pathUuid!=='string'||!branch.pathUuid||
               seen.has(branch.pathUuid))
                throw new Error('Endpoint Snap requires a unique Path for each Road');
            seen.add(branch.pathUuid);
            const dump=await Editor.Message.request('scene','query-node',branch.pathUuid);
            const commit=planEndpointSnapDump(dump,branch);
            checked.push(commit);
        }
        for(const commit of checked){
            if(commit.noOp)continue;
            const accepted=await Editor.Message.request('scene','set-property',{
                uuid:commit.pathUuid,
                path:'__comps__.'+commit.componentIndex+'.knots',
                dump:commit.dump,record:commit.record
            });
            if(accepted===false)
                throw new Error('Creator rejected a Path Knot edit ('+commit.pathUuid+')');
            changed++;
        }
        if(changed){
            const refreshed=await scene('refreshV2JunctionEndpointSnap',junctionUuid);
            if(!refreshed?.ok)
                throw new Error(refreshed?.error||'Knot edits saved but Preview could not refresh');
            return {ok:true,changed,plan:result.plan,warnings:refreshed.warnings||[]};
        }
        return {ok:true,changed:0,plan:result.plan,warnings:[]};
    }catch(e){
        const detail=String(e instanceof Error?e.message:e);
        // Native Creator history retains any successful earlier Path writes;
        // never silently claim an all-or-nothing transaction.
        return fail('apply Endpoint Snap',new Error(
            detail+(changed?' ('+changed+' Path edits were recorded; Undo each or inspect Scene)':'')));
    }
}
async function planV2JunctionAutoConnect(){
    try{
        const result=await scene('planV2JunctionAutoConnect',currentNode());
        if(!result?.ok)
            throw new Error(result?.error||'Junction Auto Connect scan rejected');
        return result;
    }catch(e){return fail('check Auto Connect',e);}
}
/**
 * Creator's recorded typed IProperty Branches dump is authoritative.
 * No direct scene-process CCClass array writes or implicit Knot movement.
 */
async function applyV2JunctionAutoConnect(){
    let changed=false;
    try{
        const uuid=currentNode();
        const result=await scene('planV2JunctionAutoConnect',uuid);
        if(!result?.ok)
            throw new Error(result?.error||'Junction Auto Connect scan rejected');
        const dump=await Editor.Message.request('scene','query-node',uuid);
        const plan=planJunctionAutoConnectDump(dump,result.plan);
        if(plan.noOp)return {ok:true,changed:false,branches:plan.count,plan:result.plan};
        const accepted=await Editor.Message.request('scene','set-property',{
            uuid,path:'__comps__.'+plan.componentIndex+'.branches',
            dump:plan.dump,record:true
        });
        if(accepted===false)throw new Error('Creator rejected Junction Branches edit');
        changed=true;
        const refresh=await scene('refreshV2JunctionAutoConnect',uuid);
        if(!refresh?.ok)
            throw new Error(refresh?.error||'Junction links saved but preview could not refresh');
        return {ok:true,changed:true,branches:plan.count,plan:result.plan,
            warnings:refresh.warnings||[]};
    }catch(e){
        const detail=String(e instanceof Error?e.message:e);
        return fail('apply Auto Connect',new Error(detail+
            (changed?' (Junction links were recorded; Undo or inspect Scene)':'')));
    }
}
async function planV2JunctionTangents(){
    try{
        const result=await scene('planV2JunctionTangents',currentNode());
        if(!result?.ok)throw new Error(result?.error||'Junction tangent check rejected');
        return result;
    }catch(e){return fail('check Junction Tangents',e);}
}
/**
 * Preflight every Path before the first write. Each changed Path receives a
 * native Creator history item (not a grouped/atomic multi-Path transaction).
 * Never edit live Knot CCClass data in the Scene process.
 */
async function applyV2JunctionTangents(){
    let changed=0,junctionUuid;
    try{
        junctionUuid=currentNode();
        const result=await scene('planV2JunctionTangents',junctionUuid);
        if(!result?.ok)
            throw new Error(result?.error||'Junction tangent plan rejected');
        const branches=result.plan?.branches;
        if(!Array.isArray(branches)||
           (branches.length!==3&&branches.length!==4))
            throw new Error('Invalid Junction tangent branch count');
        const paths=new Set(),commits=[];
        for(const branch of branches){
            if(typeof branch.pathUuid!=='string'||!branch.pathUuid||
               paths.has(branch.pathUuid))
                throw new Error('Junction Tangents requires unique linked Path Nodes');
            paths.add(branch.pathUuid);
            const node=await Editor.Message.request('scene','query-node',branch.pathUuid);
            commits.push(planJunctionTangentDump(node,branch));
        }
        for(const commit of commits){
            if(commit.noOp)continue;
            const accepted=await Editor.Message.request('scene','set-property',{
                uuid:commit.pathUuid,
                path:'__comps__.'+commit.componentIndex+'.knots',
                dump:commit.dump,record:true
            });
            if(accepted===false)
                throw new Error('Creator rejected Path tangent edit: '+commit.pathUuid);
            changed++;
        }
        if(changed){
            const refresh=await scene('refreshV2JunctionEndpointSnap',junctionUuid);
            if(!refresh?.ok)
                throw new Error(refresh?.error||'Tangent edits saved but preview refresh failed');
            return {ok:true,changed,plan:result.plan,warnings:refresh.warnings||[]};
        }
        return {ok:true,changed:0,plan:result.plan,warnings:[]};
    }catch(e){
        const detail=String(e instanceof Error?e.message:e);
        return fail('apply Junction Tangents',new Error(detail+
            (changed?' ('+changed+' Path edits were recorded; Undo each or inspect Scene)':'')));
    }
}
async function inspectV2JunctionSeams(){
    try{
        const result=await scene('inspectV2JunctionSeams',currentNode());
        if(!result?.ok)
            throw new Error(result?.error||'Junction seam audit unavailable');
        return result;
    }catch(e){return fail('inspect Junction seams',e);}
}
exports.methods={rebuildV2Road,restoreV2RoadBaked,checkV2RoadBake,
    bindV2RoadMesh,bakeV2Road,editV2Path,editV2PathGroup,nudgeV2PathGroup,
    planV2JunctionAutoTrim,applyV2JunctionAutoTrim,
    planV2JunctionEndpointSnap,applyV2JunctionEndpointSnap,inspectV2RoadNetwork,
    planV2JunctionAutoConnect,applyV2JunctionAutoConnect,
    planV2JunctionTangents,applyV2JunctionTangents,inspectV2JunctionSeams};
exports.load=function(){};
exports.unload=function(){};
