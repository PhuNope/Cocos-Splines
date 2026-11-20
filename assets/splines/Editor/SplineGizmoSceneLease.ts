/**
 * An immutable Scene/hierarchy identity captured BEFORE a Gizmo gesture.
 *
 * Cocos Creator Editor IPC is asynchronous; an old set-property/query-node
 * response can arrive after the Scene or nested Prefab editing root was
 * unloaded and a different Scene opened. Snapshot requests must never be
 * sent from that stale transaction.
 *
 * No private Cocos APIs or scene event subscriptions. A Scene change
 * normally destroys old Nodes and/or changes their ancestor identity.
 * The lease validates each original ancestor by identity, parent link and
 * isValid; UUID equality alone is insufficient across Scene reloads.
 */
export interface SceneLeaseNode {
    readonly parent:SceneLeaseNode|null;
    readonly isValid?:boolean;
}
export interface SceneLease {
    isCurrent():boolean;
}
const MAX_DEPTH=256;
export function captureSceneLease(root:SceneLeaseNode):SceneLease {
    if(!root || typeof root!=='object')
        throw Error('Cannot capture a Scene lease without a SplineContainer Node.');
    const chain:SceneLeaseNode[]=[];
    const seen=new Set<SceneLeaseNode>();
    let node:SceneLeaseNode|null=root;
    while(node){
        if(typeof node!=='object'||node.isValid===false||
           seen.has(node)||chain.length>=MAX_DEPTH)
            throw Error('Invalid or cyclic SplineContainer Scene hierarchy.');
        seen.add(node);
        chain.push(node);
        node=node.parent;
    }
    return Object.freeze({
        isCurrent():boolean {
            for(let i=0;i<chain.length;i++){
                const current=chain[i];
                if(current.isValid===false||
                   current.parent!==(chain[i+1]||null))
                    return false;
            }
            return true;
        },
    });
}
