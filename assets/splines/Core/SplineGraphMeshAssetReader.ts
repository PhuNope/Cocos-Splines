/** Cocos-facing adapter for the typed Graph meshAsset source.
 * Matches SplineMeshDeform's tested 3.8.x attribute reader, but never edits
 * imported Mesh buffers. Serialization lives exclusively on Renderer.sourceMesh.
 */
import {Mesh,gfx} from 'cc';
import {MeshGeometry} from './SplineMeshDeformMath';
import {readPositionTriples,readUVPairs,readNormalTriples,
    resolveAttributeFormatName,findStoredAttributeFormat,VertexFormat} from './SplineMeshRead';

export interface GraphSourceMeshRead {geometry:MeshGeometry;revision:string}
const maxBytes=4*1024*1024;
export function graphMeshDataFingerprint(mesh:Mesh|null):string{
    if(!mesh)return 'none';
    const data=mesh.data;
    const size=data?.byteLength??0;
    if(size>maxBytes)throw Error('Geometry Graph imported Mesh buffer exceeds 4 MiB.');
    // Data is ArrayBuffer on Creator 3.8. Reimport and same-size raw edits
    // invalidate the CPU DAG cache when the content bytes change.
    let hash=2166136261>>>0;
    if(data&&size>0){
        const bytes=new Uint8Array(data);
        for(let i=0;i<bytes.length;i++){
            hash=Math.imul((hash^bytes[i])>>>0,16777619)>>>0;
        }
    }
    return String(mesh.uuid||'unknown')+':'+size+':'+hash.toString(16);
}
/** Secondary revision for native builds that do not expose mesh.data.
 * A manual Rebuild after reimport still invalidates meshSource cache, even
 * when UUID and byteLength are unchanged.
 */
function decodedGeometryHash(mesh:MeshGeometry):string{
    let h=2166136261>>>0;
    const bytes=new ArrayBuffer(4),view=new DataView(bytes);
    for(const values of [mesh.positions,mesh.indices,mesh.uvs||[],mesh.normals||[]]){
        h=Math.imul(h^(values.length>>>0),16777619)>>>0;
        for(const v of values){
            view.setFloat32(0,v,true);
            h=Math.imul((h^view.getUint32(0,true))>>>0,16777619)>>>0;
        }
    }
    return h.toString(16);
}
export function readGraphSourceMeshAsset(mesh:Mesh|null):GraphSourceMeshRead {
    if(!mesh)throw Error('Geometry Graph meshAsset requires Source Mesh on the Renderer.');
    if(mesh.allowDataAccess!==true)
        throw Error('Enable Allow Data Access on the Graph Source Mesh import settings.');
    if(!mesh.struct||mesh.struct.primitives.length!==1)
        throw Error('Geometry Graph Source Mesh must have exactly one submesh.');
    const revision=graphMeshDataFingerprint(mesh);
    const position=mesh.readAttribute(0,gfx.AttributeName.ATTR_POSITION);
    const uv=mesh.readAttribute(0,gfx.AttributeName.ATTR_TEX_COORD);
    const normal=mesh.readAttribute(0,gfx.AttributeName.ATTR_NORMAL);
    const indices=mesh.readIndices(0);
    if(!position||!indices)throw Error('Cannot read imported Graph Mesh position/indices.');
    const formats=gfx.Format as unknown as Readonly<Record<string,number|string>>;
    const format=(name:string,reported:unknown):VertexFormat=>
        resolveAttributeFormatName(reported,formats,
            findStoredAttributeFormat(mesh,0,name)) as VertexFormat;
    const pos=readPositionTriples(position,format(gfx.AttributeName.ATTR_POSITION,
        mesh.readAttributeFormat(0,gfx.AttributeName.ATTR_POSITION)));
    const vertices=pos.length/3;
    if(vertices<3||vertices>4096||indices.length<3||indices.length>24576)
        throw Error('Graph Source Mesh supports 3–4096 vertices and up to 24576 indices.');
    const uvs=uv?readUVPairs(uv,format(gfx.AttributeName.ATTR_TEX_COORD,
        mesh.readAttributeFormat(0,gfx.AttributeName.ATTR_TEX_COORD))):undefined;
    const normalName=resolveAttributeFormatName(
        mesh.readAttributeFormat(0,gfx.AttributeName.ATTR_NORMAL),formats,
        findStoredAttributeFormat(mesh,0,gfx.AttributeName.ATTR_NORMAL));
    const normals=readNormalTriples(normal,normalName);
    const geometry:MeshGeometry={positions:pos,indices:Array.from(indices),
        uvs,normals:normals&&normals.length===pos.length?normals:undefined};
    if(geometry.indices.length%3!==0||
       geometry.indices.some(i=>!Number.isInteger(i)||i<0||i>=vertices)||
       (uvs&&uvs.length!==vertices*2))
        throw Error('Graph Source Mesh indices or UV count are invalid.');
    return {geometry,revision:revision+':'+decodedGeometryHash(geometry)};
}
