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
    if(!c||!['Spline.Road','Spline.Extrude','Spline.MeshDeform','Spline.Junction'].includes(c.type))
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
function validateMaterialSlots(raw){
    if(raw==='')return ''; // Existing test builds / manually bound legacy Mesh.
    if(typeof raw!=='string')throw new Error('Invalid Baked material slot map');
    let slots;
    try{slots=JSON.parse(raw);}catch{throw new Error('Invalid Baked material slot map');}
    if(!Array.isArray(slots)||!slots.length||
       !slots.every(x=>Number.isSafeInteger(x)&&x>=0&&x<=0xffffffff))
        throw new Error('Invalid Baked material slot map');
    return JSON.stringify(slots);
}
/** Validate the serialized pending bake once import has completed, before
 * any scene.set-property mutation. A later Bake can supersede a retry. */
function pendingBakeMatches(comp,assetUrl,fingerprint,slotMap){
    const field=name=>comp.value?.[name]?.value??'';
    return field('pendingBakeUrl')===assetUrl&&
        field('pendingBakeFingerprint')===fingerprint&&
        field('pendingBakeMaterialSlots')===slotMap;
}
async function bindImportedMesh(editor,params){
    const {nodeUuid,componentIndex,assetUrl,fingerprint,mode=2,
        materialSlots='',verifyCurrent}=params;
    if(typeof nodeUuid!=='string'||!nodeUuid||!Number.isInteger(componentIndex)||componentIndex<0)
        throw new Error('Invalid node/component for binding');
    if(typeof assetUrl!=='string'||!assetUrl.startsWith('db://assets/')||!assetUrl.endsWith('.gltf'))
        throw new Error('Only imported project glTF assets may be bound');
    if(typeof fingerprint!=='string'||!/^[0-9a-f]{16}$/.test(fingerprint))
        throw new Error('Invalid bake fingerprint');
    const slotMap=validateMaterialSlots(materialSlots);
    const info=await editor.Message.request('asset-db','query-asset-info',assetUrl);
    const target=discoverMeshSubasset(info);
    if(!target.ok)return {ok:false,pending:true,reason:target.reason,assetUrl};
    // This is intentionally *after* AssetDB is ready: the source may
    // change over several asynchronous importer retry attempts.
    // Production main passes a fresh read-only Scene fingerprint audit.
    if(verifyCurrent!==undefined){
        if(typeof verifyCurrent!=='function')
            throw new Error('Invalid Bake source verifier');
        const current=await verifyCurrent();
        if(!current?.ok||current.componentIndex!==componentIndex||
           current.fingerprint!==fingerprint||
           current.pendingUrl!==assetUrl||
           current.pendingFingerprint!==fingerprint||
           (current.pendingMaterialSlots??'')!==slotMap)
            return {ok:false,pending:false,
                reason:'Spline or pending Bake changed during import; export again'};
    }
    const dump=await editor.Message.request('scene','query-node',nodeUuid);
    const comp=componentDump(dump,componentIndex);
    if(!pendingBakeMatches(comp,assetUrl,fingerprint,slotMap))
        return {ok:false,pending:false,
            reason:'A newer Bake replaced the pending import; refusing stale Mesh binding'};
    // A glTF import can succeed while an individual native set-property
    // fails. Capture all serialized fields BEFORE any write so the prior
    // Baked reference, metadata, mode and pending import can be restored.
    // Refuse to write if Creator cannot supply a complete original dump.
    const planned=[
        ['bakedSourceUrl',assetUrl,'String'],
        ['bakedSourceFingerprint',fingerprint,'String'],
        ['bakedMaterialSlots',slotMap,'String'],
        ['bakedMesh',{uuid:target.uuid},'cc.Mesh'],
        ...(mode===2?[['meshMode',2,'Enum']]:[]),
        ['pendingBakeUrl','','String'],
        ['pendingBakeFingerprint','','String'],
        ['pendingBakeMaterialSlots','','String']
    ];
    const copy=value=>JSON.parse(JSON.stringify(value));
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const original=new Map();
    for(const [key,,type] of planned){
        const field=comp.value?.[key];
        if(!field||!Object.prototype.hasOwnProperty.call(field,'value')||
           field.value===undefined)
            return {ok:false,pending:false,
                reason:'Cannot safely snapshot '+key+' before Bake binding; reopen the Scene'};
        original.set(key,{type,value:copy(field.value)});
    }
    const old=original.get('bakedMesh').value;
    // Stage metadata first. Swap the Mesh only after its mapping is ready;
    // clear pending import fields last. On failure, undo attempted writes.
    // Creator set-property calls are NOT an atomic history transaction.
    const attempted=[];
    try{
        for(const [key,value,type] of planned){
            attempted.push({key,value,type}); // A failed call may already mutate.
            await setComponentField(editor,nodeUuid,componentIndex,key,value,type);
        }
    }catch(error){
        const issues=[];
        let current;
        try{
            current=componentDump(
                await editor.Message.request('scene','query-node',nodeUuid),componentIndex);
        }catch(readError){issues.push('Cannot inspect changed Scene: '+String(readError));}
        if(current){
            // Never overwrite a value changed by another Editor action.
            // Only revert a field that still equals our attempted value.
            for(const {key,value} of attempted.reverse()){
                const was=original.get(key);
                const live=current.value?.[key]?.value;
                if(same(live,was.value))continue;
                if(!same(live,value)){
                    issues.push('Concurrent change at '+key);continue;
                }
                try{
                    await setComponentField(editor,nodeUuid,componentIndex,
                        key,copy(was.value),was.type);
                }catch(restoreError){
                    issues.push('Restore failed at '+key+': '+String(restoreError));
                }
            }
            // Verify the whole original binding, including pending state.
            try{
                const after=componentDump(
                    await editor.Message.request('scene','query-node',nodeUuid),componentIndex);
                for(const [key,was] of original)
                    if(!same(after.value?.[key]?.value,was.value))
                        issues.push('Unrestored '+key);
            }catch(verifyError){
                issues.push('Cannot verify restored Scene: '+String(verifyError));
            }
        }
        const rolledBack=issues.length===0;
        return {ok:false,pending:false,rolledBack,recoveryRequired:!rolledBack,
            reason:'Bake bind property write failed: '+String(error)+
                (rolledBack?'; previous Baked binding restored':
                 '; automatic restore incomplete — inspect Scene/Undo manually: '+
                    issues.join('; ')),
            uuid:old?.uuid||null};
    }
    return {ok:true,uuid:target.uuid,url:target.url,assetUrl,replacedUuid:old?.uuid||null};
}
/**
 * Stage an exported glTF as pending metadata without touching the existing
 * imported Baked Mesh. Three native set-property calls are NOT atomic; if
 * one fails (even after mutation), restore the earlier serialized tuple.
 * Reject stale geometry both before and after the staged writes.
 */
async function stagePendingBake(editor,params){
    const {nodeUuid,componentIndex,assetUrl,fingerprint,materialSlots,verifyCurrent}=params;
    if(typeof nodeUuid!=='string'||!nodeUuid||
       !Number.isSafeInteger(componentIndex)||componentIndex<0)
        throw new Error('Invalid node/component for pending Bake');
    if(typeof assetUrl!=='string'||!assetUrl.startsWith('db://assets/')||
       !assetUrl.endsWith('.gltf'))
        throw new Error('Only project glTF assets can be staged');
    if(typeof fingerprint!=='string'||!/^[0-9a-f]{16}$/.test(fingerprint))
        throw new Error('Invalid pending Bake fingerprint');
    const slots=validateMaterialSlots(materialSlots);
    if(!slots)throw new Error('Pending Bake requires its primitive material slots');
    if(typeof verifyCurrent!=='function')
        throw new Error('Pending Bake requires a source fingerprint verifier');
    const fresh=async()=>{
        const state=await verifyCurrent();
        return state?.ok===true&&state.componentIndex===componentIndex&&
            state.fingerprint===fingerprint;
    };
    if(!await fresh())return {ok:false,rolledBack:true,recoveryRequired:false,
        reason:'Spline changed during glTF export; pending Bake was not staged'};
    const names=['pendingBakeUrl','pendingBakeFingerprint','pendingBakeMaterialSlots'];
    const values=[assetUrl,fingerprint,slots];
    const dump=componentDump(
        await editor.Message.request('scene','query-node',nodeUuid),componentIndex);
    const original=new Map();
    for(const key of names){
        const field=dump.value?.[key];
        if(!field||!Object.prototype.hasOwnProperty.call(field,'value')||
           typeof field.value!=='string')
            return {ok:false,rolledBack:true,recoveryRequired:false,
                reason:'Cannot snapshot '+key+' before staging pending Bake'};
        original.set(key,field.value);
    }
    const attempted=[];
    try{
        for(let i=0;i<names.length;i++){
            attempted.push({key:names[i],value:values[i]});
            await setComponentField(editor,nodeUuid,componentIndex,
                names[i],values[i],'String');
        }
        if(!await fresh())throw new Error('Spline changed during pending Bake staging');
        const confirmed=componentDump(
            await editor.Message.request('scene','query-node',nodeUuid),componentIndex);
        for(let i=0;i<names.length;i++)
            if(confirmed.value?.[names[i]]?.value!==values[i])
                throw new Error('Pending Bake was superseded during staging');
        return {ok:true,assetUrl,fingerprint,materialSlots:slots};
    }catch(error){
        const issues=[];
        for(const {key,value} of attempted.reverse()){
            let live;
            try{
                const current=componentDump(
                    await editor.Message.request('scene','query-node',nodeUuid),componentIndex);
                live=current.value?.[key]?.value;
            }catch(readError){
                issues.push('Cannot inspect '+key+': '+String(readError));continue;
            }
            if(live===original.get(key))continue;
            if(live!==value){
                issues.push('Concurrent change at '+key);continue;
            }
            try{
                await setComponentField(editor,nodeUuid,componentIndex,
                    key,original.get(key),'String');
            }catch(restoreError){
                issues.push('Restore failed at '+key+': '+String(restoreError));
            }
        }
        try{
            const restored=componentDump(
                await editor.Message.request('scene','query-node',nodeUuid),componentIndex);
            for(const [key,value] of original)
                if(restored.value?.[key]?.value!==value)
                    issues.push('Unrestored '+key);
        }catch(verifyError){
            issues.push('Cannot verify pending Bake rollback: '+String(verifyError));
        }
        const rolledBack=issues.length===0;
        return {ok:false,rolledBack,recoveryRequired:!rolledBack,
            reason:'Pending Bake metadata staging failed: '+String(error)+
                (rolledBack?'; previous pending Bake restored':
                    '; recovery required: '+issues.join('; '))};
    }
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
module.exports={discoverMeshSubasset,bindImportedMesh,bindWhenImported,stagePendingBake,componentDump};
