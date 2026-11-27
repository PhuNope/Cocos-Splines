/** Runtime-only chunk ownership; nodes are never serialized in Edit Mode.
 * A prepare/activate/commit transaction keeps old chunks alive until renderer
 * and collider assignments have succeeded. Exact stream comparison avoids
 * hash collisions; stable output/leaf IDs avoid cross-output cache aliasing.
 */
import {Node,Mesh,MeshRenderer,Material} from 'cc';
import type {RoadGeometry} from './SplineRoadMath';
import {createGraphMultiOutputMesh,GraphMaterialGroup,GraphMultiMeshChunk} from './SplineGeometryGraphMultiMesh';
import {partitionGraphGeometry,MAX_CHUNKS} from './SplineGraphChunkMath';
interface Entry {
    key:string;node:Node;renderer:MeshRenderer;mesh:Mesh;
    geometry:RoadGeometry;groups:number[];materials:Material[];
}
export interface GraphChunkTransaction {
    activate():void;commit():void;rollback():void;
}
const equal=(a:ReadonlyArray<number>|undefined,b:ReadonlyArray<number>|undefined):boolean=>
    a===b||!!a&&!!b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const sameGeometry=(a:RoadGeometry,b:RoadGeometry):boolean=>
    equal(a.positions,b.positions)&&equal(a.normals,b.normals)&&equal(a.uvs,b.uvs)&&
    equal(a.indices,b.indices)&&equal(a.triangleMaterialSlots,b.triangleMaterialSlots);
export class SplineGraphChunkBinding {
    private entries:Entry[]=[];
    public get count():number{return this.entries.length;}
    public get meshes():Mesh[]{return this.entries.map(e=>e.mesh);}
    private dispose(e:Entry):void{
        // Only destroy our own node/mesh, never imported assets or user nodes.
        try{if(e.node.isValid!==false){e.node.active=false;e.node.removeFromParent();e.node.destroy();}}
        finally{e.mesh.destroy();}
    }
    public release():void{
        const old=this.entries;this.entries=[];
        for(const e of old)this.dispose(e);
    }
    public syncVisibility(root:MeshRenderer):void{
        for(const e of this.entries)if(e.node.isValid!==false){
            e.node.layer=root.node.layer;e.node.active=root.enabled!==false;
        }
    }
    public syncMaterials(materials:ReadonlyArray<Material>):void{
        const changes:{e:Entry;i:number;old:Material;next:Material}[]=[];
        for(const e of this.entries)for(let i=0;i<e.groups.length;i++){
            const next=materials[e.groups[i]];
            if(!next)throw Error('Runtime chunk material group missing.');
            if(e.materials[i]!==next)changes.push({e,i,old:e.materials[i],next});
        }
        let done=0;
        try{
            for(const c of changes){done++;c.e.renderer.setSharedMaterial(c.next,c.i);}
        }catch(error){
            for(let i=done-1;i>=0;i--){const c=changes[i];try{c.e.renderer.setSharedMaterial(c.old,c.i);}catch{}}
            throw error;
        }
        for(const c of changes)c.e.materials[c.i]=c.next;
    }
    public prepare(root:MeshRenderer,outputs:ReadonlyArray<GraphMultiMeshChunk>,
        groups:ReadonlyArray<GraphMaterialGroup>,materials:ReadonlyArray<Material>,budget:number):GraphChunkTransaction{
        const old=this.entries,byKey=new Map(old.map(e=>[e.key,e]));
        const next:Entry[]=[],created:Entry[]=[];
        let bytes=0;
        try{
            for(const output of outputs){
                const leaves=partitionGraphGeometry(output.geometry,budget,MAX_CHUNKS-next.length);
                for(let i=0;i<leaves.length;i++){
                    const geometry=leaves[i],key=output.outputId+':'+i;
                    bytes+=geometry.positions.length/3*32+geometry.indices.length*2+16;
                    if(bytes>16*1024*1024)throw Error('Runtime chunks exceed 16 MiB buffer budget.');
                    // One mapped output is accepted by the existing Mesh packer.
                    // Implicit default group 0 is represented explicitly here.
                    if(geometry.triangleMaterialSlots===undefined)
                        geometry.triangleMaterialSlots=new Array(geometry.indices.length/3).fill(0);
                    const slots=[...new Set(geometry.triangleMaterialSlots)].sort((a,b)=>a-b);
                    const physical=slots.map(slot=>groups.findIndex(g=>g.outputId===output.outputId&&g.slot===slot));
                    const resolved=physical.map(p=>materials[p]);
                    if(resolved.some(m=>!m))throw Error('Runtime chunk material group missing.');
                    const previous=byKey.get(key);
                    if(previous&&previous.node.isValid!==false&&previous.node.parent===root.node&&
                       previous.renderer.mesh===previous.mesh&&sameGeometry(previous.geometry,geometry)&&
                       equal(previous.groups,physical)&&resolved.every((m,i)=>m===previous.materials[i])){
                        next.push(previous);continue;
                    }
                    const packed=createGraphMultiOutputMesh([{outputId:output.outputId,geometry}]);
                    let node:Node|null=null;
                    try{
                        node=new Node('Spline Chunk '+output.outputId+' '+i);node.active=false;
                        node.layer=root.node.layer;
                        const renderer=node.addComponent(MeshRenderer);
                        renderer.mesh=packed.mesh;
                        resolved.forEach((m,index)=>renderer.setSharedMaterial(m,index));
                        node.setParent(root.node);
                        const entry={key,node,renderer,mesh:packed.mesh,geometry,groups:physical,materials:resolved};
                        created.push(entry);next.push(entry);
                    }catch(error){
                        try{if(node){node.removeFromParent();node.destroy();}}finally{packed.mesh.destroy();}
                        throw error;
                    }
                }
            }
        }catch(error){for(const e of created)this.dispose(e);throw error;}
        let finished=false;
        return {
            activate:()=>{if(finished)throw Error('Chunk transaction closed.');for(const e of created)e.node.active=root.enabled!==false;},
            commit:()=>{
                if(finished)return;finished=true;this.entries=next;
                const keep=new Set(next);for(const e of old)if(!keep.has(e))this.dispose(e);
                this.syncVisibility(root);
            },
            rollback:()=>{if(finished)return;finished=true;for(const e of created)this.dispose(e);},
        };
    }
}
