'use strict';
/**
 * Cocos Creator 3.8 AssetDB bridge. Never invents a .mesh UUID: reads the
 * imported glTF subAssets and only binds when exactly one cc.Mesh is present.
 * No in-memory asset is used for Manual/Baked serialization.
 */
function discoverMeshSubasset(assetInfo){
    if(!assetInfo||assetInfo.invalid) return {ok:false,reason:'Model import has not completed'};
    const nested=assetInfo.subAssets;
    if(!nested||typeof nested!=='object')return {ok:false,reason:'No imported subAssets yet'};
    const records=Array.isArray(nested)?nested:Object.values(nested);
    const meshes=records.filter(x=>x&&x.type==='cc.Mesh'&&typeof x.uuid==='string'&&x.uuid.trim());
    const byId=new Map(meshes.map(x=>[x.uuid,x]));
    if(byId.size!==1)return {ok:false,reason:byId.size?'Model has multiple Mesh subassets: select one manually':'Mesh subasset not ready'};
    const mesh=Array.from(byId.values())[0];
    return {ok:true,uuid:mesh.uuid,url:mesh.url||'',type:mesh.type};
}
function componentDump(nodeInfo,index){
    const c=nodeInfo?.__comps__?.[index];
    if(!c||!['SplinesV2.SplineRoad','SplinesV2.SplineExtrude'].includes(c.type))
        throw new Error('Component changed before bake binding. Reopen Inspector.');
    return c;
}
async function setComponentField(editor,nodeUuid,index,key,value,type){
    const result=await editor.Message.request('scene','set-property',{
        uuid:nodeUuid,path:'__comps__.'+index+'.'+key,
        dump:{type,value},record:true
    });
    if(result===false||result==null)throw new Error('Scene set-property failed: '+key);
}
async function bindImportedMesh(editor,params){
    const {nodeUuid,componentIndex,assetUrl,fingerprint,mode=2}=params;
    if(typeof nodeUuid!=='string'||!nodeUuid||!Number.isInteger(componentIndex)||componentIndex<0)
        throw new Error('Invalid node/component for binding');
    if(typeof assetUrl!=='string'||!assetUrl.startsWith('db://assets/')||!assetUrl.endsWith('.gltf'))
        throw new Error('Only imported project glTF assets may be bound');
    if(typeof fingerprint!=='string'||!/^[0-9a-f]{16}$/.test(fingerprint))
        throw new Error('Invalid bake fingerprint');
    const info=await editor.Message.request('asset-db','query-asset-info',assetUrl);
    const target=discoverMeshSubasset(info);
    if(!target.ok)return {ok:false,pending:true,reason:target.reason,assetUrl};
    const dump=await editor.Message.request('scene','query-node',nodeUuid);
    const comp=componentDump(dump,componentIndex);
    const old=comp.value?.bakedMesh?.value;
    // Never assume the glTF imported mesh actually has an alias to its parent
    // model UUID; only the concrete child asset UUID is acceptable.
    await setComponentField(editor,nodeUuid,componentIndex,'bakedMesh',{uuid:target.uuid},'cc.Mesh');
    try{
        await setComponentField(editor,nodeUuid,componentIndex,'bakedSourceUrl',assetUrl,'String');
        await setComponentField(editor,nodeUuid,componentIndex,'bakedSourceFingerprint',fingerprint,'String');
        if(mode===2)await setComponentField(editor,nodeUuid,componentIndex,'meshMode',2,'Enum');
        await setComponentField(editor,nodeUuid,componentIndex,'pendingBakeUrl','','String');
        await setComponentField(editor,nodeUuid,componentIndex,'pendingBakeFingerprint','','String');
    }catch(error){
        // The scene remains dirty and can be undone; never claim a full bind.
        return {ok:false,pending:false,reason:'Mesh reference applied but metadata update failed: '+String(error),uuid:target.uuid};
    }
    return {ok:true,uuid:target.uuid,url:target.url,assetUrl,replacedUuid:old?.uuid||null};
}
/** Bound retries are for import latency only. No mutation until a valid Mesh is found. */
async function bindWhenImported(editor,params,opts={}){
    const attempts=opts.attempts??8,delayMs=opts.delayMs??250;
    if(!Number.isSafeInteger(attempts)||attempts<1||attempts>40)throw new Error('Invalid import attempts');
    for(let i=0;i<attempts;i++){
        const result=await bindImportedMesh(editor,params);
        if(result.ok||!result.pending)return result;
        if(i+1<attempts)await new Promise(resolve=>setTimeout(resolve,delayMs));
    }
    return {ok:false,pending:true,reason:'AssetDB has not imported a unique Mesh subasset yet'};
}
module.exports={discoverMeshSubasset,bindImportedMesh,bindWhenImported,componentDump};
