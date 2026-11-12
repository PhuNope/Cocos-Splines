import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2,type Vec4MeshV2} from './MeshData';

/** Injectable Cocos Mesh.readAttribute/readIndices interface for offline testing. */
export interface SourceMeshReadableV2 {
    readonly subMeshCount:number;
    readAttribute(primitive:number,attributeName:string):ArrayLike<number>|null;
    readIndices(primitive:number):ArrayLike<number>|null;
}
export interface SourceMeshNamesV2 {
    position:string;uv0:string;uv2:string;normal:string;tangent:string;
}
export const DEFAULT_SOURCE_MESH_NAMES_V2:SourceMeshNamesV2={
    position:'a_position',uv0:'a_texCoord',uv2:'a_texCoord1',
    normal:'a_normal',tangent:'a_tangent'
};
function channel(mesh:SourceMeshReadableV2,primitive:number,name:string,size:number,
    count?:number):number[]|null{
    const raw=mesh.readAttribute(primitive,name);
    if(raw==null)return null;
    const arr=Array.from(raw,Number);
    if(arr.length%size!==0||(count!==undefined&&arr.length!==count*size)||!arr.every(Number.isFinite))
        throw new Error('Source Mesh invalid '+name+' attribute on primitive '+primitive);
    return arr;
}
/**
 * Read and COPY source mesh channels without mutation. Each primitive's indices
 * are local to that primitive; rebuilding a unified indexed MeshDataV2 must
 * offset indices. Reject missing UV0 instead of synthesizing/stretching it.
 * Missing normals/tangents are reconstructed by buildMeshV2.
 */
export function readSourceMeshV2(mesh:SourceMeshReadableV2,
    names:SourceMeshNamesV2=DEFAULT_SOURCE_MESH_NAMES_V2):MeshDataV2{
    if(!mesh||!Number.isSafeInteger(mesh.subMeshCount)||mesh.subMeshCount<1||mesh.subMeshCount>1024)
        throw new Error('Source Mesh has no readable submeshes');
    const positions:Vec3MeshV2[]=[],uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[],normals:Vec3MeshV2[]=[],tangents:Vec4MeshV2[]=[];
    const submeshes:Array<{materialSlot:number;indices:number[]}>= [];
    let allUV2=true,allNormals=true,allTangents=true,anyUV2=false,anyNormals=false,anyTangents=false;
    for(let primitive=0;primitive<mesh.subMeshCount;primitive++){
        const xyz=channel(mesh,primitive,names.position,3);
        const uv=channel(mesh,primitive,names.uv0,2,xyz?xyz.length/3:undefined);
        if(!xyz||!xyz.length||!uv)throw new Error('Source Mesh primitive '+primitive+
            ' must expose POSITION and TEXCOORD_0; enable readable Mesh data in Cocos importer');
        const count=xyz.length/3;
        const uvSecondary=channel(mesh,primitive,names.uv2,2,count);
        const ns=channel(mesh,primitive,names.normal,3,count);
        const ts=channel(mesh,primitive,names.tangent,4,count);
        const idx=mesh.readIndices(primitive);
        // Unindexed triangle lists are valid; else index ranges are primitive-local.
        const local=idx?Array.from(idx,Number):Array.from({length:count},(_,i)=>i);
        if(local.length%3||!local.length||!local.every(i=>Number.isSafeInteger(i)&&i>=0&&i<count))
            throw new Error('Source Mesh primitive '+primitive+' has invalid triangle indices');
        const offset=positions.length;
        for(let i=0;i<count;i++){
            positions.push({x:xyz[3*i],y:xyz[3*i+1],z:xyz[3*i+2]});
            uv0.push({x:uv[2*i],y:uv[2*i+1]});
            if(uvSecondary)uv2.push({x:uvSecondary[2*i],y:uvSecondary[2*i+1]});
            if(ns)normals.push({x:ns[3*i],y:ns[3*i+1],z:ns[3*i+2]});
            if(ts)tangents.push({x:ts[4*i],y:ts[4*i+1],z:ts[4*i+2],w:ts[4*i+3]});
        }
        anyUV2 ||=!!uvSecondary;allUV2 &&=!!uvSecondary;
        anyNormals ||=!!ns;allNormals &&=!!ns;
        anyTangents ||=!!ts;allTangents &&=!!ts;
        submeshes.push({materialSlot:primitive,indices:local.map(i=>i+offset)});
    }
    // A partial UV2 channel is an authoring mistake. Dropping it silently
    // invalidates lightmap geometry, while filling zeroes can cause overlaps.
    if(anyUV2&&!allUV2)throw new Error('Source Mesh UV2 must exist on every primitive or none');
    return buildMeshV2({positions,uv0,uv2:allUV2?uv2:undefined,
        normals:allNormals&&anyNormals?normals:undefined,
        tangents:allTangents&&anyTangents?tangents:undefined,submeshes});
}
