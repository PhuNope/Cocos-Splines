import {type MeshDataV2} from './MeshData';
import {splitMeshV2,type MeshChunkV2} from './MeshProcessing';

/** No implicit rebuild occurs merely because a plan is constructed. */
export type MeshOutputModeV2='dynamic'|'manual'|'baked';
export interface MeshBuildPlanOptionsV2 {
    readonly mode:MeshOutputModeV2;
    readonly maxVertices?:number;
    /** User-supplied generator configuration signature for stale checks. */
    readonly sourceRevision?:string;
}
export interface MeshPrimitivePayloadV2 {
    /** One triangle list, one material. A later Cocos adapter handles UV2 binding. */
    readonly materialSlot:number;
    readonly positions:Float32Array;
    readonly normals:Float32Array;
    readonly tangents:Float32Array;
    readonly uv0:Float32Array;
    readonly uv2?:Float32Array;
    readonly indices:Uint16Array;
    readonly sourceSubmeshId:number;
    readonly chunkIndex:number;
}
export interface MeshBuildPlanV2 {
    readonly mode:MeshOutputModeV2;
    readonly rebuildOnPlay:boolean;
    readonly requiresPersistentAsset:boolean;
    readonly fingerprint:string;
    readonly chunks:ReadonlyArray<MeshChunkV2>;
    readonly parts:ReadonlyArray<MeshPrimitivePayloadV2>;
}
/** Stable FNV-1a 64 over float32 payload + submesh topology, not a security hash. */
export function fingerprintMeshV2(mesh:MeshDataV2,sourceRevision=''):string {
    let hash=0xcbf29ce484222325n;
    const mask=0xffffffffffffffffn,prime=0x100000001b3n;
    const byte=(b:number):void=>{hash=((hash^BigInt(b&255))*prime)&mask;};
    const u32=(value:number):void=>{for(let i=0;i<4;i++)byte((value>>>(i*8))&255);};
    const string=(value:string):void=>{
        // UTF-8 equivalent encoding for supplementary characters, independent of Node APIs.
        for(const c of value){
            const n=c.codePointAt(0)!;
            if(n<0x80)byte(n);
            else if(n<0x800){byte(0xc0|(n>>6));byte(0x80|(n&63));}
            else if(n<0x10000){byte(0xe0|(n>>12));byte(0x80|((n>>6)&63));byte(0x80|(n&63));}
            else {byte(0xf0|(n>>18));byte(0x80|((n>>12)&63));byte(0x80|((n>>6)&63));byte(0x80|(n&63));}
        }
    };
    const floats=(a:Float32Array|undefined):void=>{
        if(!a){u32(0xffffffff);return;}
        u32(a.length);
        const view=new DataView(new ArrayBuffer(4));
        for(let i=0;i<a.length;i++){view.setFloat32(0,a[i],true);u32(view.getUint32(0,true));}
    };
    string('spline-mesh-v2');string(sourceRevision);byte(0);
    floats(mesh.positions);floats(mesh.normals);floats(mesh.tangents);
    floats(mesh.uv0);floats(mesh.uv2);
    u32(mesh.submeshes.length);
    for(const sub of mesh.submeshes){
        u32(sub.materialSlot);u32(sub.indices.length);
        for(const id of sub.indices)u32(id);
    }
    return hash.toString(16).padStart(16,'0');
}
/**
 * Create a data-only plan for the Editor/runtime adapter.
 * Baked/manual plans must be backed by an actual persisted mesh asset before use.
 * Each part is a separate single-material primitive, with no silent loss of UV2.
 */
export function createMeshBuildPlanV2(mesh:MeshDataV2,options:MeshBuildPlanOptionsV2):MeshBuildPlanV2 {
    if(options.mode!=='dynamic'&&options.mode!=='manual'&&options.mode!=='baked')
        throw new Error('Unknown mesh output mode');
    if(options.sourceRevision!==undefined&&typeof options.sourceRevision!=='string')
        throw new Error('sourceRevision must be a string');
    const chunks=splitMeshV2(mesh,options.maxVertices);
    const parts:MeshPrimitivePayloadV2[]=[];
    for(let chunkIndex=0;chunkIndex<chunks.length;chunkIndex++){
        const chunk=chunks[chunkIndex];
        for(let submeshIndex=0;submeshIndex<chunk.mesh.submeshes.length;submeshIndex++){
            const sub=chunk.mesh.submeshes[submeshIndex];
            if(!(sub.indices instanceof Uint16Array))throw new Error('Chunk exceeds 16-bit index limit');
            parts.push({materialSlot:sub.materialSlot,positions:chunk.mesh.positions,
                normals:chunk.mesh.normals,tangents:chunk.mesh.tangents,uv0:chunk.mesh.uv0,
                uv2:chunk.mesh.uv2,indices:sub.indices,
                chunkIndex,sourceSubmeshId:chunk.sourceSubmeshIds[submeshIndex]});
        }
    }
    return {mode:options.mode,rebuildOnPlay:options.mode==='dynamic',
        requiresPersistentAsset:options.mode!=='dynamic',
        fingerprint:fingerprintMeshV2(mesh,options.sourceRevision),chunks,parts};
}
