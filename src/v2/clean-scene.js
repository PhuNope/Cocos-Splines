'use strict';
/**
 * Clean v2-only Scene process entrypoint. No legacy SplineContainer lookup
 * and no asset-db operations inside the Scene process.
 */
function locate(uuid){
    if(typeof uuid!=='string'||!uuid)return null;
    const {director}=require('cc'),root=director.getScene();
    if(!root)return null;
    const visit=node=>{
        if(node.uuid===uuid)return node;
        for(const child of node.children||[]){
            const result=visit(child);if(result)return result;
        }
        return null;
    };
    return visit(root);
}
const classes=new Set(['SplinesV2.SplineRoad','SplinesV2.SplineExtrude',
    'SplinesV2.SplineMeshDeform','SplinesV2.JunctionPatch']);
function component(uuid){
    const node=locate(uuid),{js}=require('cc');
    const target=node?.components?.find(c=>classes.has(js.getClassName(c)));
    return {node,target};
}
function run(uuid,callback){
    const {node,target}=component(uuid);
    if(!node||!target)return {ok:false,error:'Select a valid SplinesV2 mesh generator component'};
    try{return callback(node,target);}
    catch(error){return {ok:false,error:String(error instanceof Error?error.message:error)};}
}
function rebuildV2Road(uuid){
    return run(uuid,(_node,c)=>{
        c.rebuildPreview();
        return {ok:true,shortKnotFallback:c.getShortKnotFallback?.()||null,
            message:'Rebuilt temporary V2 mesh; Baked asset unchanged'};
    });
}
function restoreV2RoadBaked(uuid){
    return run(uuid,(_node,c)=>{
        c.restoreBakedPreview();
        return {ok:true,message:'Displaying the saved Baked Mesh'};
    });
}
function prepareV2RoadBake(uuid){
    return run(uuid,(node,c)=>{
        const out=c.prepareBake();
        return {ok:true,...out,componentIndex:node.components.indexOf(c)};
    });
}
function inspectV2RoadBake(uuid){
    return run(uuid,(node,c)=>{
        const status=c.inspectBake();
        return {ok:true,...status,componentIndex:node.components.indexOf(c),
            shortKnotFallback:c.getShortKnotFallback?.()||null,
            pendingUrl:c.pendingBakeUrl||'',
            pendingFingerprint:c.pendingBakeFingerprint||'',
            cornerRisk:c.inspectCornerRisk?.()||null,
            junctionReport:c.inspectJunction?.()||null};
    });
}
exports.methods={rebuildV2Road,restoreV2RoadBaked,prepareV2RoadBake,
    inspectV2RoadBake};
exports.load=function(){};
exports.unload=function(){};
