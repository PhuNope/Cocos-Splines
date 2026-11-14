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
/**
 * Only synchronize derived previews AFTER scene.set-property has already
 * committed the typed serialized Path record through Creator's own editor
 * message. This method does not mutate any authored Knot property.
 */
function refreshV2Path(uuid){
    const node=locate(uuid),{js}=require('cc');
    const path=node?.components?.find(c=>js.getClassName(c)==='SplinesV2.SplinePath');
    if(!path)return {ok:false,error:'Select a SplinesV2.SplinePath Node'};
    try{
        path.onRestore();
        return {ok:true,count:path.knots.length,index:path.gizmoKnotIndex};
    }catch(error){
        return {ok:false,error:String(error instanceof Error?error.message:error)};
    }
}
/**
 * Read-only proposal: no edits, no implicit mesh rebuilds. All mutation
 * happens in the extension main process via Creator recordable properties.
 */
function planV2JunctionAutoTrim(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.planAutomaticTrimsV2!=='function')
            throw new Error('Select a Junction Patch component');
        return {ok:true,plan:c.planAutomaticTrimsV2()};
    });
}
/** Called after serialized Road trims have been committed by Editor. */
function refreshV2JunctionAutoTrim(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.planAutomaticTrimsV2!=='function')
            throw new Error('Select a Junction Patch component');
        // Reading a plan also rejects broken links before changing previews.
        const plan=c.planAutomaticTrimsV2();
        for(const link of c.branches)link.road.rebuildPreview();
        c.rebuildPreview();
        return {ok:true,branchCount:plan.branches.length};
    });
}
/** Endpoint planning is always read-only, no serialized Knot mutations. */
function planV2JunctionEndpointSnap(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.planEndpointSnapsV2!=='function')
            throw new Error('Select a Junction Patch component');
        return {ok:true,plan:c.planEndpointSnapsV2()};
    });
}
/** Editor-only discovery of already-near Road endpoints in the Scene. */
function inspectV2RoadNetwork(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.inspectRoadNetworkV2!=='function')
            throw new Error('Select a Junction Patch component');
        return {ok:true,report:c.inspectRoadNetworkV2()};
    });
}
/**
 * Refresh only after recordable Path Knot dump commits. Invalid unfinished
 * Junctions can fail preview without invalidating the saved Knot edits or Bake.
 */
function refreshV2JunctionEndpointSnap(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.planEndpointSnapsV2!=='function')
            throw new Error('Select a Junction Patch component');
        const warnings=[];
        const paths=new Set();
        for(const link of c.branches){
            const path=link.road?.pathSource;
            if(path&&!paths.has(path)){
                paths.add(path);
                try{path.onRestore();}catch(e){warnings.push(String(e));}
            }
            try{link.road?.rebuildPreview();}catch(e){warnings.push(String(e));}
        }
        try{c.rebuildPreview();}catch(e){warnings.push(String(e));}
        return {ok:true,refreshedPaths:paths.size,warnings};
    });
}
exports.methods={rebuildV2Road,restoreV2RoadBaked,prepareV2RoadBake,
    inspectV2RoadBake,refreshV2Path,planV2JunctionAutoTrim,refreshV2JunctionAutoTrim,
    planV2JunctionEndpointSnap,inspectV2RoadNetwork,refreshV2JunctionEndpointSnap};
exports.load=function(){};
exports.unload=function(){};
