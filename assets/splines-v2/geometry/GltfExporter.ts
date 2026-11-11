import {createMeshBuildPlanV2,type MeshBuildPlanV2} from './MeshBuildPlan';
import {type MeshDataV2} from './MeshData';

type AccessorDataV2={bufferView:number;componentType:number;count:number;type:string;min?:number[];max?:number[]};
type GltfPrimitiveV2={attributes:Record<string,number>;indices:number;material:number;mode:number};
function encodeBase64(bytes:Uint8Array):string {
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result='';
    for(let i=0;i<bytes.length;i+=3){
        const a=bytes[i],b=i+1<bytes.length?bytes[i+1]:0,c=i+2<bytes.length?bytes[i+2]:0;
        result+=alphabet[a>>2]+alphabet[((a&3)<<4)|(b>>4)]
            +(i+1<bytes.length?alphabet[((b&15)<<2)|(c>>6)]:'=')
            +(i+2<bytes.length?alphabet[c&63]:'=');
    }
    return result;
}
/**
 * Self-contained glTF 2.0 source asset (JSON + base64 embedded buffer).
 * Cocos Creator imports .gltf files and produces a .mesh subasset.
 * One glTF primitive per material draw part, retaining UV2 as TEXCOORD_1.
 */
export function exportMeshGltfV2(mesh:MeshDataV2,sourceRevision=''):{
    readonly json:string;readonly fingerprint:string;readonly primitiveCount:number;
} {
    const plan=createMeshBuildPlanV2(mesh,{mode:'baked',sourceRevision});
    const data:number[]=[];
    const views:Array<{buffer:number;byteOffset:number;byteLength:number;target:number}>=[];
    const accessors:AccessorDataV2[]=[];
    const primitiveList:GltfPrimitiveV2[]=[];
    const materialMap=new Map<number,number>();
    function append(values:Float32Array|Uint16Array,target:number):number {
        while(data.length%4)data.push(0);
        const offset=data.length,stride=values instanceof Uint16Array?2:4;
        const bytes=new Uint8Array(values.length*stride),dv=new DataView(bytes.buffer);
        for(let i=0;i<values.length;i++){
            if(stride===2)dv.setUint16(i*2,values[i],true);
            else dv.setFloat32(i*4,values[i],true);
        }
        for(const b of bytes)data.push(b);
        const id=views.length;
        views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target});
        return id;
    }
    function accessor(values:Float32Array|Uint16Array,size:number,type:string,target:number,minmax=false):number {
        const id=accessors.length,view=append(values,target);
        const entry:AccessorDataV2={bufferView:view,componentType:values instanceof Uint16Array?5123:5126,
            count:values.length/size,type};
        if(minmax){
            entry.min=Array.from({length:size},()=>Infinity);
            entry.max=Array.from({length:size},()=>-Infinity);
            for(let i=0;i<values.length;i+=size){
                for(let j=0;j<size;j++){
                    entry.min[j]=Math.min(entry.min[j],values[i+j]);
                    entry.max[j]=Math.max(entry.max[j],values[i+j]);
                }
            }
        }
        accessors.push(entry);
        return id;
    }
    // Share attribute buffers across submeshes from the same chunk.
    const buffers=new Map<number,Record<string,number>>();
    for(const part of plan.parts){
        let attrs=buffers.get(part.chunkIndex);
        if(!attrs){
            attrs={
                POSITION:accessor(part.positions,3,'VEC3',34962,true),
                NORMAL:accessor(part.normals,3,'VEC3',34962),
                TANGENT:accessor(part.tangents,4,'VEC4',34962),
                TEXCOORD_0:accessor(part.uv0,2,'VEC2',34962)
            };
            if(part.uv2)attrs.TEXCOORD_1=accessor(part.uv2,2,'VEC2',34962);
            buffers.set(part.chunkIndex,attrs);
        }
        let material=materialMap.get(part.materialSlot);
        if(material===undefined){material=materialMap.size;materialMap.set(part.materialSlot,material);}
        primitiveList.push({
            attributes:attrs,indices:accessor(part.indices,1,'SCALAR',34963),material,mode:4
        });
    }
    while(data.length%4)data.push(0);
    const materials=Array.from(materialMap.entries()).map(([slot])=>({
        name:'SplineV2 Slot '+slot,doubleSided:true,
        pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:1}
    }));
    const gltf={
        asset:{version:'2.0',generator:'Cocos Splines v2 Mesh Pipeline'},
        scene:0,scenes:[{nodes:[0]}],
        nodes:[{name:'SplineV2 Mesh',mesh:0}],
        meshes:[{name:'SplineV2 Mesh',primitives:primitiveList}],
        materials,buffers:[{byteLength:data.length,uri:'data:application/octet-stream;base64,'+encodeBase64(new Uint8Array(data))}],
        bufferViews:views,accessors,
        extras:{cocosSplinesV2:{fingerprint:plan.fingerprint,sourceRevision,materialSlots:Array.from(materialMap.keys())}}
    };
    return {json:JSON.stringify(gltf),fingerprint:plan.fingerprint,primitiveCount:primitiveList.length};
}
