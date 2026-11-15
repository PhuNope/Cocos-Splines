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
const classes=new Set(['Spline.Road','Spline.Extrude',
    'Spline.MeshDeform','Spline.Junction']);
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
        const cornerRisk=c.inspectCornerRisk?.()||null;
        return {ok:true,...status,componentIndex:node.components.indexOf(c),
            shortKnotFallback:c.getShortKnotFallback?.()||null,
            pendingUrl:c.pendingBakeUrl||'',
            pendingFingerprint:c.pendingBakeFingerprint||'',
            cornerRisk,closedLoopUV:cornerRisk?.closedLoopUV??null,
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
    const path=node?.components?.find(c=>js.getClassName(c)==='Spline.Path');
    if(!path)return {ok:false,error:'Select a Spline.Path Node'};
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
        if(typeof c.planAutomaticTrims!=='function')
            throw new Error('Select a Junction Patch component');
        return {ok:true,plan:c.planAutomaticTrims()};
    });
}
/** Called after serialized Road trims have been committed by Editor. */
function refreshV2JunctionAutoTrim(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.planAutomaticTrims!=='function')
            throw new Error('Select a Junction Patch component');
        // Reading a plan also rejects broken links before changing previews.
        const plan=c.planAutomaticTrims();
        for(const link of c.branches)link.road.rebuildPreview();
        c.rebuildPreview();
        return {ok:true,branchCount:plan.branches.length};
    });
}
/** Endpoint planning is always read-only, no serialized Knot mutations. */
function planV2JunctionEndpointSnap(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.planEndpointSnaps!=='function')
            throw new Error('Select a Junction Patch component');
        return {ok:true,plan:c.planEndpointSnaps()};
    });
}
/** Editor-only discovery of already-near Road endpoints in the Scene. */
function inspectV2RoadNetwork(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.inspectRoadNetwork!=='function')
            throw new Error('Select a Junction Patch component');
        return {ok:true,report:c.inspectRoadNetwork()};
    });
}
/**
 * Refresh only after recordable Path Knot dump commits. Invalid unfinished
 * Junctions can fail preview without invalidating the saved Knot edits or Bake.
 */
function refreshV2JunctionEndpointSnap(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.planEndpointSnaps!=='function')
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
/** Read-only Junction auto-link proposal; never mutate the live Branches array. */
function planV2JunctionAutoConnect(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.planAutoConnect!=='function')
            throw new Error('Select a Junction Patch component');
        return {ok:true,plan:c.planAutoConnect()};
    });
}
/** Called only after Creator's recorded Branches property commit. */
function refreshV2JunctionAutoConnect(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.planAutoConnect!=='function')
            throw new Error('Select a Junction Patch component');
        const warnings=[];
        try{c.rebuildPreview();}catch(error){
            // The new Road links can lack trim distances; keep the last valid
            // transient preview and never invalidate the saved Baked Mesh.
            warnings.push(String(error instanceof Error?error.message:error));
        }
        return {ok:true,branchCount:c.branches.length,warnings};
    });
}
/** Read-only, all linked Paths must be open Bezier. */
function planV2JunctionTangents(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.planTangentAlignment!=='function')
            throw new Error('Select a Junction Patch component');
        return {ok:true,plan:c.planTangentAlignment()};
    });
}
/** Diagnostic-only CPU geometry audit; no MeshRenderer / AssetDB writes. */
function inspectV2JunctionSeams(uuid){
    return run(uuid,(_node,c)=>{
        if(typeof c.inspectJunctionSeams!=='function')
            throw new Error('Select a Junction Patch component');
        return {ok:true,report:c.inspectJunctionSeams()};
    });
}
/** Read-only plan; use Creator main to record the entire Knot array. */
function planV2PathGroupNudge(uuid,axis){
    const node=locate(uuid),{js}=require('cc');
    const path=node?.components?.find(c=>js.getClassName(c)==='Spline.Path');
    if(!path||typeof path.planGroupNudge!=='function')
        return {ok:false,error:'Select a Spline.Path component with a HUD group'};
    try{return {ok:true,plan:path.planGroupNudge(axis)};}
    catch(e){return {ok:false,error:String(e instanceof Error?e.message:e)};}
}
/** Rebind transient selection after Creator's typed property commit. */
function refreshV2PathGroup(uuid,indices){
    const previous=refreshV2Path(uuid);
    if(!previous?.ok)return previous;
    const node=locate(uuid),{js}=require('cc');
    const path=node?.components?.find(c=>js.getClassName(c)==='Spline.Path');
    if(!path||typeof path.restoreGroupSelection!=='function')
        return {ok:false,error:'Spline.Path Group selection unavailable after commit'};
    path.restoreGroupSelection(indices);
    return {...previous,groupCount:path.selectedGroupIndices().length};
}
exports.methods={rebuildV2Road,restoreV2RoadBaked,prepareV2RoadBake,
    inspectV2RoadBake,refreshV2Path,planV2PathGroupNudge,refreshV2PathGroup,
    planV2JunctionAutoTrim,refreshV2JunctionAutoTrim,
    planV2JunctionEndpointSnap,inspectV2RoadNetwork,refreshV2JunctionEndpointSnap,
    planV2JunctionAutoConnect,refreshV2JunctionAutoConnect,planV2JunctionTangents,
    inspectV2JunctionSeams};
exports.load=function(){};
exports.unload=function(){};
