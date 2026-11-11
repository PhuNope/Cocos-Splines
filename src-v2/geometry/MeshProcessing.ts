import {
    buildMeshV2,type MeshDataV2,type MeshInputV2,type MeshSubmeshInputV2,
    type Vec2MeshV2,type Vec3MeshV2,type Vec4MeshV2
} from './MeshData';

export interface MeshChunkV2 {
    /** Compact mesh with exactly the referenced vertices; preserves material order. */
    readonly mesh:MeshDataV2;
    /** chunk vertex -> original vertex. Useful for collider UV and debugging. */
    readonly sourceVertexIds:Uint32Array;
    /** chunk submesh -> original submesh. Repeated when a group spans chunks. */
    readonly sourceSubmeshIds:ReadonlyArray<number>;
}
export interface MeshColliderDataV2 {
    /** Triangle-soup XYZ positions, 9 floats per triangle. No physics-engine dependency. */
    readonly positions:Float32Array;
    readonly materialSlots:Uint32Array;
    readonly triangleCount:number;
    readonly skippedDegenerate:number;
}
export interface MeshDiagnosticsV2 {
    readonly degenerateTriangles:number;
    readonly triangleCount:number;
    readonly nonManifoldEdges:number;
    readonly boundaryEdges:number;
}
const vec2=(a:Float32Array,i:number):Vec2MeshV2=>({x:a[i*2],y:a[i*2+1]});
const vec3=(a:Float32Array,i:number):Vec3MeshV2=>({x:a[i*3],y:a[i*3+1],z:a[i*3+2]});
const vec4=(a:Float32Array,i:number):Vec4MeshV2=>({x:a[i*4],y:a[i*4+1],z:a[i*4+2],w:a[i*4+3]});
function area2(p:Float32Array,a:number,b:number,c:number):number {
    const ax=p[b*3]-p[a*3],ay=p[b*3+1]-p[a*3+1],az=p[b*3+2]-p[a*3+2];
    const bx=p[c*3]-p[a*3],by=p[c*3+1]-p[a*3+1],bz=p[c*3+2]-p[a*3+2];
    return Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx);
}
/** Computes topology diagnostics with no logger; authoring UI decides what to warn about. */
export function inspectMeshV2(mesh:MeshDataV2,zeroAreaEpsilon=1e-10):MeshDiagnosticsV2 {
    if(!Number.isFinite(zeroAreaEpsilon)||zeroAreaEpsilon<0)throw new Error('Invalid area threshold');
    const edges=new Map<string,number>();let degenerateTriangles=0;
    for(const sub of mesh.submeshes)for(let j=0;j<sub.indices.length;j+=3){
        const a=sub.indices[j],b=sub.indices[j+1],c=sub.indices[j+2];
        if(a===b||b===c||c===a||area2(mesh.positions,a,b,c)<=zeroAreaEpsilon)degenerateTriangles++;
        for(const [u,w] of [[a,b],[b,c],[c,a]]){
            if(u===w)continue;
            const key=Math.min(u,w)+':'+Math.max(u,w);
            edges.set(key,(edges.get(key)??0)+1);
        }
    }
    let boundaryEdges=0,nonManifoldEdges=0;
    for(const count of edges.values()){if(count===1)boundaryEdges++;else if(count>2)nonManifoldEdges++;}
    return {triangleCount:mesh.triangleCount,degenerateTriangles,boundaryEdges,nonManifoldEdges};
}
/** Cook a triangle soup for a future MeshCollider adapter. Zero-area faces are excluded. */
export function buildMeshColliderDataV2(mesh:MeshDataV2,epsilon=1e-10):MeshColliderDataV2 {
    if(!Number.isFinite(epsilon)||epsilon<0)throw new Error('Invalid collider threshold');
    const positions:number[]=[],materialSlots:number[]=[];let skippedDegenerate=0;
    for(const sub of mesh.submeshes)for(let j=0;j<sub.indices.length;j+=3){
        const a=sub.indices[j],b=sub.indices[j+1],c=sub.indices[j+2];
        if(a===b||b===c||c===a||area2(mesh.positions,a,b,c)<=epsilon){skippedDegenerate++;continue;}
        for(const id of [a,b,c])positions.push(mesh.positions[id*3],mesh.positions[id*3+1],mesh.positions[id*3+2]);
        materialSlots.push(sub.materialSlot);
    }
    return {positions:new Float32Array(positions),materialSlots:new Uint32Array(materialSlots),
        triangleCount:materialSlots.length,skippedDegenerate};
}
/**
 * Split along triangle boundaries and remap vertex indices. Maintains per-vertex
 * UV0/UV2, authored normals, tangent handedness, material slots and triangle order.
 * All results fit 16-bit index buffers. Duplicate vertices across chunk borders.
 */
export function splitMeshV2(mesh:MeshDataV2,maxVertices=65535):ReadonlyArray<MeshChunkV2> {
    if(!Number.isSafeInteger(maxVertices)||maxVertices<3||maxVertices>65535)
        throw new Error('maxVertices must be an integer between 3 and 65535');
    const chunks:MeshChunkV2[]=[];
    let sourceIds:number[]=[],idMap=new Map<number,number>();
    let groups:{sourceSubmeshId:number;materialSlot:number;indices:number[]}[]=[];
    function flush():void {
        if(!groups.length)return;
        const positions=sourceIds.map(i=>vec3(mesh.positions,i));
        const uv0=sourceIds.map(i=>vec2(mesh.uv0,i));
        const uv2=mesh.uv2?sourceIds.map(i=>vec2(mesh.uv2!,i)):undefined;
        const normals=sourceIds.map(i=>vec3(mesh.normals,i));
        const tangents=sourceIds.map(i=>vec4(mesh.tangents,i));
        const submeshes:MeshSubmeshInputV2[]=groups.map(g=>({materialSlot:g.materialSlot,indices:g.indices}));
        const input:MeshInputV2={positions,uv0,uv2,normals,tangents,submeshes};
        const out=buildMeshV2(input);
        chunks.push({mesh:out,sourceVertexIds:new Uint32Array(sourceIds),sourceSubmeshIds:groups.map(g=>g.sourceSubmeshId)});
        sourceIds=[];idMap=new Map<number,number>();groups=[];
    }
    for(let subId=0;subId<mesh.submeshes.length;subId++){
        const source=mesh.submeshes[subId];
        for(let i=0;i<source.indices.length;i+=3){
            const triangle=[source.indices[i],source.indices[i+1],source.indices[i+2]];
            const newUnique=new Set(triangle.filter(id=>!idMap.has(id)));
            if(idMap.size+newUnique.size>maxVertices)flush();
            if(!groups.length||groups[groups.length-1].sourceSubmeshId!==subId)
                groups.push({sourceSubmeshId:subId,materialSlot:source.materialSlot,indices:[]});
            const group=groups[groups.length-1];
            for(const sourceId of triangle){
                let id=idMap.get(sourceId);
                if(id===undefined){id=sourceIds.length;idMap.set(sourceId,id);sourceIds.push(sourceId);}
                group.indices.push(id);
            }
        }
    }
    flush();
    return chunks;
}
