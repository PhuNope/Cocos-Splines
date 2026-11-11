/**
 * Engine-independent mesh contract for Cocos Splines v2.
 * One submesh is one triangle list and one material slot. Authored split
 * vertices remain split, so UV seams and hard normals are never welded.
 */
export interface Vec2MeshV2 {readonly x:number;readonly y:number;}
export interface Vec3MeshV2 {readonly x:number;readonly y:number;readonly z:number;}
export interface Vec4MeshV2 {readonly x:number;readonly y:number;readonly z:number;readonly w:number;}
export interface MeshSubmeshInputV2 {readonly materialSlot:number;readonly indices:ReadonlyArray<number>;}
export interface MeshInputV2 {
    readonly positions:ReadonlyArray<Vec3MeshV2>;
    readonly uv0?:ReadonlyArray<Vec2MeshV2>;
    readonly uv2?:ReadonlyArray<Vec2MeshV2>;
    readonly normals?:ReadonlyArray<Vec3MeshV2>;
    readonly tangents?:ReadonlyArray<Vec4MeshV2>;
    readonly submeshes:ReadonlyArray<MeshSubmeshInputV2>;
}
export interface MeshSubmeshV2 {
    readonly materialSlot:number;
    readonly indices:Uint16Array|Uint32Array;
}
export interface MeshDataV2 {
    /** Float32 interleaved by attribute, never across attributes. */
    readonly positions:Float32Array;
    readonly normals:Float32Array;
    readonly tangents:Float32Array;
    readonly uv0:Float32Array;
    readonly uv2?:Float32Array;
    readonly submeshes:ReadonlyArray<MeshSubmeshV2>;
    readonly vertexCount:number;
    readonly triangleCount:number;
    readonly min:Vec3MeshV2;
    readonly max:Vec3MeshV2;
}
export interface MeshBuildOptionsV2 {
    readonly recomputeNormals?:boolean;
    readonly recomputeTangents?:boolean;
}
type V3=Vec3MeshV2;
const v=(x:number,y:number,z:number):V3=>({x,y,z});
const minus=(a:V3,b:V3):V3=>v(a.x-b.x,a.y-b.y,a.z-b.z);
const times=(a:V3,k:number):V3=>v(a.x*k,a.y*k,a.z*k);
const cross=(a:V3,b:V3):V3=>v(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const dot=(a:V3,b:V3):number=>a.x*b.x+a.y*b.y+a.z*b.z;
const norm=(a:V3,fallback:V3):V3=>{
    const len=Math.hypot(a.x,a.y,a.z);
    return len>1e-20&&Number.isFinite(len)?times(a,1/len):fallback;
};
const vecAt=(values:Float32Array,i:number):V3=>v(values[3*i],values[3*i+1],values[3*i+2]);
const finite=(...numbers:number[])=>numbers.every(Number.isFinite);
function tangentFallback(n:V3):V3 {
    const a=Math.abs(n.y)<.9?v(0,1,0):v(1,0,0);
    return norm(cross(a,n),v(1,0,0));
}
/** Reject invalid geometry before it reaches GPU allocation or AssetDB. */
export function validateMeshInputV2(data:MeshInputV2):void {
    const count=data.positions.length;
    if(!count)throw new Error('Mesh requires vertices');
    if(!data.submeshes.length)throw new Error('Mesh requires at least one submesh');
    for(const point of data.positions)if(!point||!finite(point.x,point.y,point.z))
        throw new Error('Non-finite mesh position');
    for(const [key,channel,size] of [
        ['uv0',data.uv0,2],['uv2',data.uv2,2],['normals',data.normals,3],['tangents',data.tangents,4]
    ] as const){
        if(channel===undefined)continue;
        if(channel.length!==count)throw new Error(key+' count must match vertex count');
        for(const item of channel){
            if(!item||!Object.values(item).every(Number.isFinite)||Object.keys(item).length!==size)
                throw new Error('Non-finite or malformed '+key);
        }
    }
    for(const sub of data.submeshes){
        if(!Number.isSafeInteger(sub.materialSlot)||sub.materialSlot<0)
            throw new Error('Invalid material slot');
        if(sub.indices.length===0||sub.indices.length%3!==0)
            throw new Error('Triangle indices must be nonempty and divisible by three');
        for(const i of sub.indices)
            if(!Number.isSafeInteger(i)||i<0||i>=count)throw new Error('Out-of-range mesh index');
    }
}
/**
 * Computes area-weighted normals and UV0 tangents across ALL material groups.
 * Tangent.w stores bitangent handedness. Degenerate faces/UVs use a finite
 * deterministic fallback; duplicated authored vertices define hard seams.
 */
export function buildMeshV2(input:MeshInputV2,options:MeshBuildOptionsV2={}):MeshDataV2 {
    validateMeshInputV2(input);
    const count=input.positions.length;
    const positions=new Float32Array(count*3);
    const uv0=new Float32Array(count*2);
    const uv2=input.uv2?new Float32Array(count*2):undefined;
    const normals=new Float32Array(count*3);
    const tangents=new Float32Array(count*4);
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(let i=0;i<count;i++){
        const p=input.positions[i];
        positions.set([p.x,p.y,p.z],i*3);
        minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);minZ=Math.min(minZ,p.z);
        maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);maxZ=Math.max(maxZ,p.z);
        if(input.uv0){const uv=input.uv0[i];uv0.set([uv.x,uv.y],i*2);}
        if(uv2){const uv=input.uv2![i];uv2.set([uv.x,uv.y],i*2);}
    }
    const calculateNormals=!input.normals||options.recomputeNormals===true;
    if(!calculateNormals){
        for(let i=0;i<count;i++){
            const n=norm(input.normals![i],v(0,1,0));
            normals.set([n.x,n.y,n.z],i*3);
        }
    }else{
        for(const sub of input.submeshes)for(let j=0;j<sub.indices.length;j+=3){
            const a=sub.indices[j],b=sub.indices[j+1],c=sub.indices[j+2];
            const n=cross(minus(vecAt(positions,b),vecAt(positions,a)),minus(vecAt(positions,c),vecAt(positions,a)));
            if(!finite(n.x,n.y,n.z))throw new Error('Mesh normal overflow');
            for(const id of [a,b,c]){normals[3*id]+=n.x;normals[3*id+1]+=n.y;normals[3*id+2]+=n.z;}
        }
        for(let i=0;i<count;i++){
            const n=norm(vecAt(normals,i),v(0,1,0));
            normals.set([n.x,n.y,n.z],i*3);
        }
    }
    const calculateTangents=!input.tangents||options.recomputeTangents===true;
    if(calculateTangents){
        const tan1=new Float64Array(count*3),tan2=new Float64Array(count*3);
        if(input.uv0)for(const sub of input.submeshes)for(let j=0;j<sub.indices.length;j+=3){
            const [a,b,c]=[sub.indices[j],sub.indices[j+1],sub.indices[j+2]];
            const e1=minus(vecAt(positions,b),vecAt(positions,a)),e2=minus(vecAt(positions,c),vecAt(positions,a));
            if(dot(cross(e1,e2),cross(e1,e2))<1e-24)continue;
            const s1=uv0[b*2]-uv0[a*2],s2=uv0[c*2]-uv0[a*2];
            const t1=uv0[b*2+1]-uv0[a*2+1],t2=uv0[c*2+1]-uv0[a*2+1];
            const den=s1*t2-s2*t1;
            if(!Number.isFinite(den)||Math.abs(den)<1e-12)continue;
            const r=1/den,tan=times(minus(times(e1,t2),times(e2,t1)),r),bit=times(minus(times(e2,s1),times(e1,s2)),r);
            for(const id of [a,b,c]){
                for(let dim=0;dim<3;dim++){
                    const key=dim===0?'x':dim===1?'y':'z';
                    tan1[id*3+dim]+=tan[key];tan2[id*3+dim]+=bit[key];
                }
            }
        }
        for(let i=0;i<count;i++){
            const n=vecAt(normals,i),raw=v(tan1[3*i],tan1[3*i+1],tan1[3*i+2]);
            const t=norm(minus(raw,times(n,dot(raw,n))),tangentFallback(n));
            const bit=v(tan2[3*i],tan2[3*i+1],tan2[3*i+2]);
            tangents.set([t.x,t.y,t.z,dot(cross(n,t),bit)<0?-1:1],i*4);
        }
    }else for(let i=0;i<count;i++){
        const authored=input.tangents![i],n=vecAt(normals,i);
        const t=norm(minus(authored,times(n,dot(authored,n))),tangentFallback(n));
        tangents.set([t.x,t.y,t.z,authored.w<0?-1:1],i*4);
    }
    for(const [name,arr] of [['normals',normals],['tangents',tangents]] as const)
        for(const item of arr)if(!Number.isFinite(item))throw new Error(name+' overflow');
    const use32=count>65535;
    const submeshes=input.submeshes.map(s=>({
        materialSlot:s.materialSlot,
        indices:use32?new Uint32Array(s.indices):new Uint16Array(s.indices)
    }));
    const triangleCount=input.submeshes.reduce((sum,s)=>sum+s.indices.length/3,0);
    return {positions,normals,tangents,uv0,uv2,submeshes,vertexCount:count,triangleCount,
        min:v(minX,minY,minZ),max:v(maxX,maxY,maxZ)};
}
