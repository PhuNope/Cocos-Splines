import {type SplineFrameV2} from '../core/SplineFrames';
import {type RoadCornerSectionV2,roadCornerPositionV2,appendRoadQuadV2} from './RoadCorners';
import {type RoadContinuousResultV2,roadContinuousProfileX_V2} from './RoadContinuous';
import {buildMeshV2,type MeshDataV2,type Vec3MeshV2,type Vec2MeshV2} from './MeshData';

/** Optional, physically separate road-paint geometry. Supply materials in slots 3 and 4. */
export interface RoadMarkingOptionsV2 {
    readonly lineWidth?:number;
    readonly edgeInset?:number;
    readonly heightOffset?:number;
    readonly dashLength?:number;
    readonly dashGap?:number;
    readonly uvMetersPerRepeat?:number;
    readonly uvLongitudinalAxis?:'u'|'v';
    readonly centerMaterialSlot?:number;
    readonly edgeMaterialSlot?:number;
}
export function buildRoadMarkingsV2(
    frames:ReadonlyArray<SplineFrameV2>,
    corners:ReadonlyArray<RoadCornerSectionV2>,
    continuous:RoadContinuousResultV2,
    asphaltHalfWidth:number,
    fullHalfExtent:number,
    options:RoadMarkingOptionsV2={}
):MeshDataV2 {
    const width=options.lineWidth??.12,inset=options.edgeInset??.16,height=options.heightOffset??.015;
    const dash=options.dashLength??3,gap=options.dashGap??4,uvRepeat=options.uvMetersPerRepeat??5;
    const centerSlot=options.centerMaterialSlot??3,edgeSlot=options.edgeMaterialSlot??4;
    const axis=options.uvLongitudinalAxis??'v';
    if(frames.length<2||frames.length!==corners.length||frames.length!==continuous.sections.length)
        throw new Error('Markings require matching Road frame/corner/width counts');
    if(![width,inset,height,dash,gap,uvRepeat,asphaltHalfWidth,fullHalfExtent].every(Number.isFinite)||
       width<=0||inset<0||height<0||dash<=0||gap<0||uvRepeat<=0||asphaltHalfWidth<=0||fullHalfExtent<asphaltHalfWidth||
       width>=2*asphaltHalfWidth||inset+width*.5>=asphaltHalfWidth)
        throw new Error('Invalid Road marking dimensions');
    if(axis!=='u'&&axis!=='v'||![centerSlot,edgeSlot].every(s=>Number.isSafeInteger(s)&&s>=0))
        throw new Error('Invalid Road marking axis/material slot');
    const positions:Vec3MeshV2[]=[],normals:Vec3MeshV2[]=[],uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[];
    const groups=new Map<number,number[]>();
    function ringPoint(i:number,x:number):Vec3MeshV2 {
        const f=frames[i];
        const adjusted=roadContinuousProfileX_V2(x,fullHalfExtent,continuous.sections[i]);
        return roadCornerPositionV2(f,corners[i],adjusted,height);
    }
    function emit(i:number,from:number,to:number,a:number,b:number,slot:number):void {
        if(to-from<=1e-7)return;
        const fa=frames[i],fb=frames[i+1],den=fb.distance-fa.distance;
        if(den<=1e-10)return;
        const point=(x:number,d:number):Vec3MeshV2=>{
            const fraction=(d-fa.distance)/den,p=ringPoint(i,x),q=ringPoint(i+1,x);
            return {x:p.x+(q.x-p.x)*fraction,y:p.y+(q.y-p.y)*fraction,z:p.z+(q.z-p.z)*fraction};
        };
        const start=positions.length;
        for(const [d,x] of [[from,a],[from,b],[to,a],[to,b]] as const){
            positions.push(point(x,d));
            const t=(d-fa.distance)/den;
            const na=fa.up,nb=fb.up;
            const nx=na.x+(nb.x-na.x)*t,ny=na.y+(nb.y-na.y)*t,nz=na.z+(nb.z-na.z)*t;
            const nlen=Math.hypot(nx,ny,nz)||1;
            normals.push({x:nx/nlen,y:ny/nlen,z:nz/nlen});
            const along=d/uvRepeat,across=(x-a)/Math.max(1e-9,b-a);
            uv0.push(axis==='u'?{x:along,y:across}:{x:across,y:along});
            uv2.push({x:across,y:d/Math.max(1e-9,frames[frames.length-1].distance)});
        }
        const triangles=groups.get(slot)??[];
        appendRoadQuadV2(positions,normals,start,start+1,start+2,start+3,triangles);
        groups.set(slot,triangles);
    }
    for(let i=0;i<frames.length-1;i++){
        const d0=frames[i].distance,d1=frames[i+1].distance;
        // Solid yellow edge lines always follow the adapted asphalt edge.
        emit(i,d0,d1,-asphaltHalfWidth+inset-width*.5,-asphaltHalfWidth+inset+width*.5,edgeSlot);
        emit(i,d0,d1,asphaltHalfWidth-inset-width*.5,asphaltHalfWidth-inset+width*.5,edgeSlot);
        // A centre dash can begin or end inside a sample interval. Emit exact
        // boundaries, not sample-grid quantized dashes, so duration stays stable.
        const period=dash+gap;
        let cursor=d0,guard=0;
        while(cursor<d1-1e-8){
            if(++guard>10000)throw new Error('Excessive Road marking dash segments');
            const remainder=((cursor%period)+period)%period;
            const visible=remainder<dash-1e-9;
            const remaining=visible?dash-remainder:period-remainder;
            const end=Math.min(d1,cursor+Math.max(1e-8,remaining));
            if(visible)emit(i,cursor,end,-width*.5,width*.5,centerSlot);
            cursor=end;
        }
    }
    const submeshes=Array.from(groups.entries()).filter(([,indices])=>indices.length>0)
        .sort((a,b)=>a[0]-b[0]).map(([materialSlot,indices])=>({materialSlot,indices}));
    if(!submeshes.length)throw new Error('Road markings generated no valid triangles');
    return buildMeshV2({positions,normals,uv0,uv2,submeshes});
}
/** Append Road marking submeshes to asphalt while preserving authored material slots. */
export function appendRoadMarkingsV2(road:MeshDataV2,markings:MeshDataV2):MeshDataV2 {
    const positions:Vec3MeshV2[]=[],normals:Vec3MeshV2[]=[],uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[];
    for(const mesh of [road,markings])for(let i=0;i<mesh.vertexCount;i++){
        positions.push({x:mesh.positions[3*i],y:mesh.positions[3*i+1],z:mesh.positions[3*i+2]});
        normals.push({x:mesh.normals[3*i],y:mesh.normals[3*i+1],z:mesh.normals[3*i+2]});
        uv0.push({x:mesh.uv0[2*i],y:mesh.uv0[2*i+1]});
        uv2.push({x:mesh.uv2?.[2*i]??0,y:mesh.uv2?.[2*i+1]??0});
    }
    const slots=new Map<number,number[]>();
    for(const [which,mesh] of [road,markings].entries())for(const group of mesh.submeshes){
        const indices=slots.get(group.materialSlot)??[],offset=which?road.vertexCount:0;
        for(const i of group.indices)indices.push(i+offset);
        slots.set(group.materialSlot,indices);
    }
    return buildMeshV2({positions,normals,uv0,uv2,submeshes:Array.from(slots.entries())
        .sort((a,b)=>a[0]-b[0]).map(([materialSlot,indices])=>({materialSlot,indices}))});
}
