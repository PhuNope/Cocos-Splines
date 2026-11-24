'use strict';
/** Editor orchestration: no direct scene serialization, always native Scene
 * messages. A read-only Scene lease prevents crossing into a different scene.
 */
const NAME='Spline Example Gallery';
const CLASS='CocosSplinesExampleGalleryV2';
function validId(value){return typeof value==='string'&&value.length>0;}
function validateQuery(result){
    if(!result||result.ok!==true||!validId(result.sceneUuid)||
       typeof result.found!=='boolean'||
       (result.found&&!validId(result.uuid)))
        throw Error(result?.error||'Open a Scene in Creator before creating examples.');
    return result;
}
async function createExampleGalleryWorkflow({
    query,scriptReady,createNode,addComponent,snapshot,removeNode,select,
}){
    if([query,scriptReady,createNode,addComponent,snapshot,removeNode,select]
        .some(v=>typeof v!=='function'))
        throw Error('Invalid example gallery editor workflow.');
    const initial=validateQuery(await query());
    const selectExisting=async(result)=>{
        await select(result.uuid);
        return {ok:true,created:false,uuid:result.uuid,sceneUuid:result.sceneUuid,
            message:'Example Gallery already exists in this Scene; selected it.'};
    };
    if(initial.found)return selectExisting(initial);
    if(await scriptReady(CLASS)!==true)
        throw Error('CocosSplinesExampleGalleryV2 is not compiled yet. Run Install Examples, let Asset DB compile scripts, then try again.');
    const verify=validateQuery(await query());
    if(verify.sceneUuid!==initial.sceneUuid)
        throw Error('Active Scene changed during example creation.');
    if(verify.found)return selectExisting(verify);
    let created=null,saved=false;
    try {
        created=await createNode(NAME);
        if(!validId(created))throw Error('Editor failed to create Example Gallery node.');
        const beforeComponent=validateQuery(await query());
        if(beforeComponent.sceneUuid!==initial.sceneUuid)
            throw Error('Active Scene changed while creating Example Gallery.');
        const result=await addComponent(created,CLASS);
        if(result===false||(result&&result.ok===false))
            throw Error('Editor rejected Example Gallery component.');
        const added=validateQuery(await query());
        if(added.sceneUuid!==initial.sceneUuid||added.uuid!==created||!added.found)
            throw Error('Editor did not attach the example component to the new node.');
        const resultSnapshot=await snapshot();
        if(resultSnapshot===false||(resultSnapshot&&resultSnapshot.ok===false))
            throw Error('Example Gallery Scene snapshot failed.');
        saved=true;
        try{await select(created);}
        catch(error){return {ok:true,created:true,uuid:created,
            sceneUuid:initial.sceneUuid,
            message:'Gallery created. Select the new node manually and Save Scene. Selection failed: '+String(error)};}
        return {ok:true,created:true,uuid:created,sceneUuid:initial.sceneUuid,
            message:'Example Gallery created. Choose Example in Inspector, Save Scene, then Play.'};
    }catch(error){
        let cleanup='';
        if(created&&!saved){
            try {
                const live=validateQuery(await query());
                if(live.sceneUuid===initial.sceneUuid){
                    const removed=await removeNode(created);
                    if(removed===false||(removed&&removed.ok===false))
                        throw Error('Scene rejected cleanup.');
                }else cleanup='; Scene changed, cleanup skipped';
            }catch(e){cleanup='; example cleanup failed: '+String(e?.message||e);}
        }
        throw Error(String(error?.message||error)+cleanup);
    }
}
module.exports={createExampleGalleryWorkflow,EXAMPLE_GALLERY_NAME:NAME,
    EXAMPLE_GALLERY_CLASS:CLASS};
