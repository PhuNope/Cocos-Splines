'use strict';
/**
 * Clean Spline v2 Editor main entrypoint.
 * Only the v2 Path/Road/Extrude/Mesh Deform/Junction workflow is exposed.
 * No legacy containers, panel state, UUID migration or old menu methods.
 */
const NAME='cocos-splines';
const {bindWhenImported}=require('./EditorAssetBind');
const selected=()=>Editor.Selection.getSelected('node')||[];
async function scene(method,uuid){
    return Editor.Message.request('scene','execute-scene-script',{
        name:NAME,method,args:[uuid]
    });
}
function currentNode(){
    const uuid=selected()[0];
    if(!uuid)throw new Error('Select a Spline V2 Road / Extrude / Deform / Junction Node.');
    return uuid;
}
async function property(uuid,index,name,value){
    const result=await Editor.Message.request('scene','set-property',{
        uuid,path:'__comps__.'+index+'.'+name,
        dump:{type:'String',value},record:true
    });
    if(result===false)throw new Error('Failed to set '+name+' on Spline V2 component');
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
            assetUrl:status.pendingUrl,fingerprint:status.pendingFingerprint
        },{attempts:1});
        if(!result.ok)return {ok:false,pending:!!result.pending,
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
            !Number.isInteger(output.componentIndex))
            throw new Error(output?.error||'Cannot build V2 geometry');
        const safeId=uuid.replace(/[^\w-]/g,'').slice(0,45);
        const assetUrl='db://assets/SplineV2_'+safeId+'_'+output.fingerprint+'.gltf';
        const prior=await Editor.Message.request('asset-db','query-asset-info',assetUrl);
        if(!prior?.uuid){
            const created=await Editor.Message.request('asset-db','create-asset',
                assetUrl,output.content);
            if(!created)throw new Error('AssetDB glTF creation failed');
        }
        // No stale fingerprint is committed until Mesh subasset binds.
        await property(uuid,output.componentIndex,'pendingBakeUrl',assetUrl);
        await property(uuid,output.componentIndex,'pendingBakeFingerprint',output.fingerprint);
        await snapshot();
        const latest=await scene('inspectV2RoadBake',uuid);
        if(!latest?.ok||latest.fingerprint!==output.fingerprint)
            return {ok:false,error:'Spline changed during glTF creation; rebake',url:assetUrl};
        const bound=await bindWhenImported(Editor,{
            nodeUuid:uuid,componentIndex:output.componentIndex,
            assetUrl,fingerprint:output.fingerprint
        },{attempts:10,delayMs:200});
        if(!bound.ok)return {ok:true,bound:false,url:assetUrl,
            message:'Exported glTF. Click Bind Imported Mesh after AssetDB import.'};
        const shown=await scene('restoreV2RoadBaked',uuid);
        if(!shown?.ok)throw new Error(shown?.error||'Cannot display imported Mesh');
        await snapshot();
        return {ok:true,bound:true,url:assetUrl,meshUuid:bound.uuid,
            primitiveCount:output.primitiveCount};
    }catch(e){return fail('bake',e);}
}
exports.methods={rebuildV2Road,restoreV2RoadBaked,checkV2RoadBake,
    bindV2RoadMesh,bakeV2Road};
exports.load=function(){};
exports.unload=function(){};
