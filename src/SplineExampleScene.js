'use strict';
/** Read-only scene capability for the Example Gallery Editor action.
 * Does not create/serialize a Scene. The Editor does that via Scene messages.
 */
function queryExampleGalleryScene(scene,classOf){
    if(!scene||typeof scene.uuid!=='string'||!scene.uuid)
        return {ok:false,error:'Open and save a Scene first.'};
    let found=null;
    const stack=[scene];
    while(stack.length){
        const n=stack.pop();
        if(n?.isValid===false)continue;
        if(n!==scene&&Array.isArray(n?.components)&&
           n.components.some(c=>c?.isValid!==false&&
                classOf(c)==='CocosSplinesExampleGalleryV2')){
            found=n;break;
        }
        if(Array.isArray(n?.children))
            for(const c of n.children)stack.push(c);
    }
    return {ok:true,found:!!found,uuid:found?.uuid??null,sceneUuid:scene.uuid};
}
module.exports={queryExampleGalleryScene};
