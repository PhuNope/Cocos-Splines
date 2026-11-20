/**
 * Editor-only, prefab-aware Node position writer for a multi-Knot gesture.
 *
 * A Gizmo port directly updates Node transforms for zero-latency dragging.
 * Native SelectGizmo history cannot record the editor-only computed group
 * property. On End we forward the actual serialized NODE position fields
 * through official Scene set-property messages (record:false), then take
 * exactly one snapshot. This gives the Scene Editor a chance to maintain
 * prefab-instance property overrides without touching private __prefab data.
 *
 * All command effects are guarded. On partial error, a best-effort reverse
 * property rollback is sent before the transaction's synchronous scene
 * baseline restoration. Native Editor undo/prefab integration still needs
 * acceptance testing in Creator 3.8.8.
 */
export interface LocalPoint {x:number;y:number;z:number;}
export interface GroupPositionNode {
    uuid:string;
    position:LocalPoint;
    parent:unknown;
    isValid?:boolean;
}
export interface GroupPositionEdit {
    node:GroupPositionNode;
    before:LocalPoint;
    after:LocalPoint;
    parent:unknown;
}
export type SceneMessageRequest=(channel:string,method:string,payload?:unknown)=>Promise<unknown>|unknown;
const axes=['x','y','z'] as const;
const finite=(v:LocalPoint)=>!!v&&axes.every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]));
const close=(a:number,b:number)=>Math.abs(a-b)<=1e-6+1e-6*Math.max(Math.abs(a),Math.abs(b));
export const samePoint=(a:LocalPoint,b:LocalPoint):boolean=>
    finite(a)&&finite(b)&&axes.every(k=>close(a[k],b[k]));
function ensureNode(edit:GroupPositionEdit,expected:LocalPoint):boolean {
    const node=edit.node;
    return node?.isValid!==false&&!!node?.uuid&&node?.parent===edit.parent&&
        samePoint(node.position,expected);
}
function successful(value:unknown):boolean {
    return value!==false&&!(value&&typeof value==='object'&&
        (value as {ok?:boolean}).ok===false);
}
async function setPosition(edit:GroupPositionEdit,position:LocalPoint,
    request:SceneMessageRequest):Promise<void> {
    const result=await request('scene','set-property',{
        uuid:edit.node.uuid,path:'position',
        dump:{type:'cc.Vec3',value:{x:position.x,y:position.y,z:position.z}},
        record:false,
    });
    if(!successful(result))
        throw new Error('Scene rejected serialized Knot position: '+edit.node.uuid);
}
export async function commitGroupPositions(
    edits:readonly GroupPositionEdit[],request:SceneMessageRequest,
):Promise<unknown> {
    if(typeof request!=='function'||!Array.isArray(edits)||!edits.length||edits.length>512)
        throw new Error('Invalid Group Move serialized history transaction.');
    const ids=new Set<string>();
    for(const edit of edits){
        if(!edit||!edit.node||!edit.node.uuid||ids.has(edit.node.uuid)||
            !finite(edit.before)||!finite(edit.after)||
            !ensureNode(edit,edit.after))
            throw new Error('Group Move context is stale; refusing to write Prefab overrides.');
        ids.add(edit.node.uuid);
    }
    const changed=edits.filter(e=>!samePoint(e.before,e.after));
    if(!changed.length)return true; // Transaction already skips no-op.
    const touched:GroupPositionEdit[]=[];
    try{
        for(const edit of changed){
            if(!ensureNode(edit,edit.after))
                throw new Error('Knot transform changed during serialized Group Move commit.');
            // An Editor request may mutate before throwing, so include it
            // in rollback before invoking the request.
            touched.push(edit);
            await setPosition(edit,edit.after,request);
            if(!ensureNode(edit,edit.after))
                throw new Error('Scene changed Knot transform during serialized commit.');
        }
        const snapshot=await request('scene','snapshot');
        if(!successful(snapshot))throw new Error('Scene rejected Group Move snapshot.');
        return snapshot;
    }catch(error){
        const failed:string[]=[];
        for(const edit of touched.reverse()){
            // Never overwrite a newer Scene change or a reparented Node.
            if(!ensureNode(edit,edit.after))continue;
            try{await setPosition(edit,edit.before,request);}
            catch(rollbackError){failed.push(edit.node.uuid+': '+String(rollbackError));}
        }
        const description=String((error as Error)?.message||error);
        if(failed.length)
            throw new Error(description+'; serialized rollback failed for '+failed.join(', '));
        throw new Error(description);
    }
}
