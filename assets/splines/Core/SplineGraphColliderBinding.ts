/** Explicit empty MeshCollider binding. Owns only transient meshes it made.
 * No node/component creation, no serialized Editor writes, no physics policy
 * changes. A failed native binding leaves the old owned mesh alive.
 */
import {Mesh,MeshCollider,Node,RigidBody,utils} from 'cc';
import {buildGraphCollisionGeometry,CollisionGeometry} from './SplineGraphCollisionMath';
export class SplineGraphColliderBinding {
    private target:MeshCollider|null=null;
    private mesh:Mesh|null=null;
    public validate(node:Node,target:MeshCollider):void{
        if(!(target instanceof MeshCollider)||target.node!==node||node.isValid===false)
            throw Error('Graph Collider requires a MeshCollider on the renderer Node.');
        if(target.convex!==false||!target.center||
           target.center.x!==0||target.center.y!==0||target.center.z!==0)
            throw Error('Graph Collider requires non-convex mode and zero center.');
        // Conservative static-only policy: no RigidBody on the node or parents.
        let depth=0;
        for(let n:Node|null=node;n;n=n.parent){
            if(++depth>128||n.getComponent(RigidBody))
                throw Error('Graph Collider requires static geometry without a RigidBody on the Node or parents.');
        }
        if(target.mesh!=null&&!(target===this.target&&target.mesh===this.mesh))
            throw Error('Graph Collider target must be empty; existing Mesh is not overwritten.');
    }
    public prepare(node:Node,target:MeshCollider,geometry:ReadonlyArray<Readonly<CollisionGeometry>>):Mesh{
        this.validate(node,target);
        const data=buildGraphCollisionGeometry(geometry);
        return utils.createMesh({positions:data.positions,indices:data.indices});
    }
    /** Caller owns candidate until commit succeeds. On failure, caller destroys
     * candidate only if it is not still referenced by the collider. */
    public commit(node:Node,target:MeshCollider,next:Mesh):void{
        this.validate(node,target);
        const old=this.mesh,previous=this.target,prior=target.mesh;
        try{
            target.mesh=next;
            if(previous&&previous!==target&&previous.node?.isValid!==false&&previous.mesh===old)
                previous.mesh=null;
        }catch(error){
            try{if(target.mesh===next)target.mesh=prior;}catch{}
            throw error;
        }
        this.target=target;this.mesh=next;
        if(old&&old!==next)old.destroy();
    }
    public release():void{
        const target=this.target,mesh=this.mesh;
        if(target&&target.node?.isValid!==false&&target.mesh===mesh)target.mesh=null;
        this.target=null;this.mesh=null;
        mesh?.destroy();
    }
    public get ownedMesh():Mesh|null{return this.mesh;}
    public isBoundTo(target:MeshCollider|null):boolean{
        return !!target&&target===this.target&&target.mesh===this.mesh&&this.mesh!==null;
    }
}
