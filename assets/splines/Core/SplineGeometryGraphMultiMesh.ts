/** Phase 4.3g2 — one Cocos Mesh with one material primitive per graph output.
 * Cocos Creator v3.8.8 Mesh.reset({struct,data}) is used instead of
 * utils.createMesh(), which always creates just one primitive.
 *
 * No asset mutation, scene node creation, or material allocation occurs here.
 * The caller owns the returned transient Mesh and commits it atomically.
 */
import {Mesh,Vec3,gfx} from 'cc';
import {RoadGeometry} from './SplineRoadMath';
import {geometryInputLinks} from './SplineGeometryGraph';
import type {GeometryGraphPlan,GeometryGraphNode} from './SplineGeometryGraph';

export interface GraphMultiMeshChunk {
    outputId:string;
    geometry:Readonly<RoadGeometry>;
}
export interface GraphMaterialGroup {outputId:string;slot:number;}
export interface GraphMultiMeshResult {
    materialGroups:GraphMaterialGroup[];
    mesh:Mesh;
    outputIds:string[];
    vertexCount:number;
    indexCount:number;
}
const MAX_VERTICES=65536;
const MAX_INDICES=393216;
const MAX_BYTES=8*1024*1024;
const VERTEX_STRIDE=32; // position XYZ, normal XYZ, UV
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const align4=(n:number)=>(n+3)&~3;
const safeId=(id:unknown):id is string=>
    typeof id==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(id);

/** Validate renderer-local output slot mapping without mutating the shared DAG.
 * Empty order preserves the original lexicographically sorted material slots.
 */
export function resolveGraphOutputOrder(ids:ReadonlyArray<string>,order:string):string[]{
    if(!Array.isArray(ids)||ids.length<2||ids.length>4||
       ids.some(id=>!safeId(id))||new Set(ids).size!==ids.length)
        throw Error('Output Order requires 2–4 unique Output Node IDs.');
    const sorted=ids.slice().sort();
    if(order==='')return sorted;
    if(typeof order!=='string'||order.length>200)
        throw Error('Output Order must be a comma-separated list of Output Node IDs.');
    const ordered=order.split(',').map(id=>id.trim());
    if(ordered.length!==sorted.length||new Set(ordered).size!==sorted.length||
       ordered.some(id=>!sorted.includes(id)))
        throw Error('Output Order must list every Output Node ID exactly once.');
    return ordered;
}

/** Trace imported meshAsset dependencies without evaluating the graph.
 * Procedural outputs have no imported material (null). All IDs are from a
 * compiled, typechecked plan; an ambiguous dependency fails closed.
 */
export function graphOutputMeshSourceSlots(
    plan:GeometryGraphPlan,orderedIds:ReadonlyArray<string>,
):Array<number|null>{
    const map=new Map<string,GeometryGraphNode>(plan.nodes.map(node=>[node.id,node]));
    return orderedIds.map(id=>{
        if(map.get(id)?.type!=='output')
            throw Error('Imported Material binding requires a valid Output Node.');
        const visited=new Set<string>(),slots=new Set<number>();
        let merged=false;
        const visit=(nodeId:string):void=>{
            if(visited.has(nodeId))return;
            visited.add(nodeId);
            const node=map.get(nodeId);
            if(!node)throw Error('Imported Material graph dependency is missing.');
            if(node.type==='meshAsset')slots.add(node.slot??0);
            if(node.type==='mergeMesh')merged=true;
            for(const link of geometryInputLinks(node))visit(link.sourceId);
        };
        visit(id);
        // One merged primitive has no unambiguous inherited material.
        // Respect explicit/manual output material; never choose an input asset.
        if(merged)return null;
        if(slots.size>1)throw Error(
            'Imported Material cannot infer a source from multiple Mesh Assets on one output.');
        return slots.size===1?[...slots][0]:null;
    });
}

/** Validate every branch before allocating even a temporary Mesh.
 * Prevents huge multi-branch outputs from bypassing per-node geometry caps.
 */
export function checkGraphMultiMesh(chunks:ReadonlyArray<GraphMultiMeshChunk>):{
    vertexCount:number;indexCount:number;
}{
    if(!Array.isArray(chunks)||chunks.length<1||chunks.length>4||
       (chunks.length===1&&chunks[0]?.geometry?.triangleMaterialSlots===undefined))
        throw Error('Multi-output Mesh requires 2–4 output branches or one material-mapped output.');
    let vertexCount=0,indexCount=0,primitiveCount=0;
    const ids=new Set<string>();
    for(const chunk of chunks){
        if(!chunk||!safeId(chunk.outputId)||ids.has(chunk.outputId))
            throw Error('Multi-output Mesh requires unique valid Output Node IDs.');
        ids.add(chunk.outputId);
        const g=chunk.geometry;
        if(!g||!Array.isArray(g.positions)||!Array.isArray(g.indices)||
           !Array.isArray(g.normals)||!Array.isArray(g.uvs))
            throw Error('Multi-output Mesh geometry is missing typed arrays.');
        const count=g.positions.length/3;
        if(!Number.isInteger(count)||count<3||count>MAX_VERTICES||
           g.normals.length!==g.positions.length||
           g.uvs.length!==count*2||
           g.indices.length<3||g.indices.length%3!==0||
           g.positions.some((n:number)=>!finite(n)||Math.abs(n)>1e7)||
           g.normals.some((n:number)=>!finite(n))||
           g.uvs.some((n:number)=>!finite(n))||
           g.indices.some((n:number)=>!Number.isInteger(n)||n<0||n>=count))
            throw Error('Multi-output Mesh branch contains invalid geometry.');
        const slots=g.triangleMaterialSlots;
        if(slots!==undefined&&(!Array.isArray(slots)||slots.length!==g.indices.length/3||
            Array.from(slots).some(s=>!Number.isInteger(s)||s<0||s>3)))
            throw Error('Multi-output Mesh invalid triangle material slots.');
        primitiveCount+=slots===undefined?1:new Set(slots).size;
        if(primitiveCount>4)throw Error('Multi-output Mesh exceeds four material primitives.');
        vertexCount+=count;
        indexCount+=g.indices.length;
        if(vertexCount>MAX_VERTICES||indexCount>MAX_INDICES)
            throw Error('Multi-output Mesh combined geometry exceeds 65536 vertices / 393216 indices.');
    }
    if(vertexCount*VERTEX_STRIDE+indexCount*2+primitiveCount*4>MAX_BYTES)
        throw Error('Multi-output Mesh combined buffers exceed 8 MiB.');
    return {vertexCount,indexCount};
}

/** This helper can be headless-tested by injecting a minimal Mesh constructor.
 * Production always calls it with the Cocos Mesh class.
 */
export function createGraphMultiOutputMesh(
    chunks:ReadonlyArray<GraphMultiMeshChunk>,MeshCtor:typeof Mesh=Mesh,
):GraphMultiMeshResult{
    const counts=checkGraphMultiMesh(chunks);
    const vertexBundles:Mesh.IVertexBundle[]=[];
    const primitives:Mesh.ISubMesh[]=[];
    const segments:{vertexOffset:number;groups:{indexOffset:number;indices:ReadonlyArray<number>}[]}[]=[];
    const materialGroups:GraphMaterialGroup[]=[];
    let offset=0;
    const attrs=[
        new gfx.Attribute(gfx.AttributeName.ATTR_POSITION,gfx.Format.RGB32F),
        new gfx.Attribute(gfx.AttributeName.ATTR_NORMAL,gfx.Format.RGB32F),
        new gfx.Attribute(gfx.AttributeName.ATTR_TEX_COORD,gfx.Format.RG32F),
    ];
    for(const {geometry:g,outputId} of chunks){
        offset=align4(offset);
        const vertexOffset=offset,count=g.positions.length/3;
        const vertexLength=count*VERTEX_STRIDE;
        vertexBundles.push({
            attributes:attrs.map(a=>new gfx.Attribute(a.name,a.format)),
            view:{offset:vertexOffset,length:vertexLength,
                count,stride:VERTEX_STRIDE},
        });
        offset+=vertexLength;
        const bySlot=new Map<number,number[]>();
        if(g.triangleMaterialSlots===undefined)bySlot.set(0,g.indices);
        else for(let t=0;t<g.triangleMaterialSlots.length;t++){
            const slot=g.triangleMaterialSlots[t];
            let list=bySlot.get(slot);if(!list){list=[];bySlot.set(slot,list);}
            list.push(g.indices[t*3],g.indices[t*3+1],g.indices[t*3+2]);
        }
        const groups:{indexOffset:number;indices:ReadonlyArray<number>}[]=[];
        for(const slot of [...bySlot.keys()].sort((a,b)=>a-b)){
            const list=bySlot.get(slot)!;
            offset=align4(offset);
            const indexOffset=offset,indexLength=list.length*2;
            primitives.push({
                vertexBundelIndices:[vertexBundles.length-1],
                primitiveMode:gfx.PrimitiveMode.TRIANGLE_LIST,
                indexView:{offset:indexOffset,length:indexLength,count:list.length,stride:2},
            });
            groups.push({indexOffset,indices:list});
            materialGroups.push({outputId,slot});offset+=indexLength;
        }
        segments.push({vertexOffset,groups});
    }
    if(offset>MAX_BYTES)throw Error('Multi-output Mesh combined buffers exceed 8 MiB.');
    const bytes=new Uint8Array(offset);
    const view=new DataView(bytes.buffer);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let chunkIndex=0;chunkIndex<chunks.length;chunkIndex++){
        const g=chunks[chunkIndex].geometry;
        const count=g.positions.length/3;
        const {vertexOffset,groups}=segments[chunkIndex];
        for(let i=0;i<count;i++){
            const at=vertexOffset+i*VERTEX_STRIDE;
            for(let k=0;k<3;k++){
                const position=g.positions[i*3+k];
                min[k]=Math.min(min[k],position);
                max[k]=Math.max(max[k],position);
                view.setFloat32(at+k*4,position,true);
                view.setFloat32(at+12+k*4,g.normals[i*3+k],true);
            }
            view.setFloat32(at+24,g.uvs[i*2],true);
            view.setFloat32(at+28,g.uvs[i*2+1],true);
        }
        for(const group of groups)for(let i=0;i<group.indices.length;i++)
            view.setUint16(group.indexOffset+i*2,group.indices[i],true);
    }
    const struct:Mesh.IStruct={
        vertexBundles,primitives,
        minPosition:new Vec3(min[0],min[1],min[2]),
        maxPosition:new Vec3(max[0],max[1],max[2]),
    };
    const mesh=new MeshCtor();
    try{mesh.reset({struct,data:bytes});}
    catch(error){mesh.destroy();throw error;}
    return {mesh,materialGroups,outputIds:chunks.map(c=>c.outputId),
        vertexCount:counts.vertexCount,indexCount:counts.indexCount};
}

/** Single wireframe spanning every output. Does not merge material primitives. */
export function graphMultiMeshGizmoGeometry(
    chunks:ReadonlyArray<GraphMultiMeshChunk>,
):{positions:number[];indices:number[]}{
    checkGraphMultiMesh(chunks);
    const positions:number[]=[],indices:number[]=[];
    for(const {geometry:g} of chunks){
        const base=positions.length/3;
        for(const v of g.positions)positions.push(v);
        for(const idx of g.indices)indices.push(idx+base);
    }
    return {positions,indices};
}
