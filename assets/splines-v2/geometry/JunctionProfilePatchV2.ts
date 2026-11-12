import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';
import {type JunctionRoadBranchV2,type JunctionRoadEdgeV2,type JunctionPatchOptionsV2,type JunctionPatchReportV2}
    from './JunctionPatchV2';

type MarkedPoint={
    readonly position:Vec3MeshV2;
    readonly uv0:Vec2MeshV2;
    readonly branchId:number;
    readonly ordinal:number;
    readonly angle:number;
};
const finite=(x:number)=>Number.isFinite(x)&&Number.isFinite(Math.fround(x));
const length=(a:Vec3MeshV2,b:Vec3MeshV2)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const plus=(a:Vec3MeshV2,b:Vec3MeshV2,t:number):Vec3MeshV2=>({
    x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t
});
const cross=(a:Vec3MeshV2,b:Vec3MeshV2,c:Vec3MeshV2):Vec3MeshV2=>{
    const u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
    const v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
    return {x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};
};
const normalize=(n:Vec3MeshV2):Vec3MeshV2=>{
    const m=Math.hypot(n.x,n.y,n.z);
    if(m<1e-9)throw new Error('Junction V2 degenerate profile triangle');
    return {x:n.x/m,y:n.y/m,z:n.z/m};
};
const modAngle=(x:number)=>((x+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
/**
 * Mixed asphalt / shoulder / curb transition for a FLAT junction.
 *
 * Every authored profile edge participates as a separate material fan sector.
 * Curb walls are represented by vertically non-coplanar triangle surfaces;
 * top/wall profile segments taper toward the flat junction center.
 *
 * This is not a city-sidewalk Boolean union. It intentionally rejects
 * interleaved branches, malformed profiles and tall/steep curbs.
 */
export function buildJunctionProfilePatchV2(
    branches:ReadonlyArray<JunctionRoadBranchV2>,
    options:JunctionPatchOptionsV2,
    center:Vec3MeshV2
):{mesh:MeshDataV2;report:JunctionPatchReportV2}{
    const maxHeight=options.maxCurbHeight??.6;
    const blend=options.uvBlendStart??.55;
    const repeat=options.uvMetersPerRepeat??5;
    const lift=options.surfaceLift??0;
    const baseSlot=options.materialSlot??0;
    if(!finite(maxHeight)||maxHeight<=0||maxHeight>2)
        throw new Error('Junction V2 invalid maximum curb height');
    // Plain asphalt can mix with profiled branches. The branch profile is
    // always ordered left-to-right; duplicate XZ lip vertices are preserved.
    const profiles=branches.map((b,i)=>{
        const input=b.profile??{vertices:[b.left,b.middle,b.right],edgeMaterials:[0,0]};
        const vertices=input.vertices,edges=input.edgeMaterials;
        if(vertices.length<3||vertices.length>32||edges.length!==vertices.length-1||
            !edges.every(s=>Number.isSafeInteger(s)&&s>=0&&s<=2))
            throw new Error('Junction V2 invalid Road profile layout at branch '+i);
        for(const vertex of vertices){
            const p=vertex.position,u=vertex.uv0;
            if(![p.x,p.y,p.z,u.x,u.y].every(finite))
                throw new Error('Junction V2 Road profile has invalid position/UV at branch '+i);
            if(p.y<center.y-.02||p.y>center.y+maxHeight+1e-5)
                throw new Error('Junction V2 curb height exceeds permitted flat junction transition');
        }
        for(const edge of [b.left,b.middle,b.right])
            if(!vertices.some(v=>length(v.position,edge.position)<1e-5&&
                Math.abs(v.uv0.x-edge.uv0.x)<1e-5&&Math.abs(v.uv0.y-edge.uv0.y)<1e-5))
                throw new Error('Junction V2 profile does not contain exact asphalt boundary/UV');
        if(length(vertices[0].position,vertices[vertices.length-1].position)<.01)
            throw new Error('Junction V2 profile has zero width');
        const fullWidth=length(vertices[0].position,vertices[vertices.length-1].position);
        if(length(center,b.middle.position)<fullWidth*.57)
            throw new Error('Junction V2 profile needs more Junction Trim to fit Shoulder/Curb bands');
        return {vertices,edges};
    });
    const reference={x:branches[0].middle.uv0.x,y:branches[0].middle.uv0.y};
    const points:MarkedPoint[]=[];
    const direction:number[]=[];
    for(const [branchId,p] of profiles.entries()){
        const first=p.vertices[0].position,last=p.vertices[p.vertices.length-1].position;
        const f={x:first.x-center.x,y:0,z:first.z-center.z};
        const l={x:last.x-center.x,y:0,z:last.z-center.z};
        direction.push(f.x*l.z-f.z*l.x>=0?1:-1);
        const mid=branches[branchId].middle.uv0;
        const shift=(options.uvMode??'matched')==='matched'
            ?{x:Math.round(reference.x-mid.x),y:Math.round(reference.y-mid.y)}
            :{x:0,y:0};
        for(const [ordinal,e] of p.vertices.entries()){
            const position=e.position;
            const uv0=(options.uvMode??'matched')==='matched'?
                {x:e.uv0.x+shift.x,y:e.uv0.y+shift.y}:
                {x:(position.x-center.x)/repeat+.5,y:(position.z-center.z)/repeat+.5};
            points.push({position,uv0,branchId,ordinal,
                angle:Math.atan2(position.z-center.z,position.x-center.x)});
        }
    }
    points.sort((a,b)=>Math.abs(a.angle-b.angle)<1e-9
        ?a.branchId===b.branchId
            ?direction[a.branchId]*(a.ordinal-b.ordinal)
            :a.branchId-b.branchId
        :a.angle-b.angle);
    const count=points.length;
    let minWedge=Infinity;
    const slots:number[]=[];
    for(let i=0;i<count;i++){
        const a=points[i],b=points[(i+1)%count],delta=modAngle(b.angle-a.angle);
        const gap=length(a.position,b.position);
        const wall=Math.abs(delta)<1e-8&&a.branchId===b.branchId&&
            Math.abs(a.position.y-b.position.y)>1e-5;
        if(gap<1e-5||(!wall&&(delta<1e-6||delta>=Math.PI-1e-5))||
            (wall&&Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)>1e-5))
            throw new Error('Junction V2 overlapping/degenerate shoulder-curb perimeter');
        if(delta>1e-6)minWedge=Math.min(minWedge,delta);
        if(a.branchId===b.branchId){
            if(Math.abs(a.ordinal-b.ordinal)!==1)
                throw new Error('Junction V2 profile points are interleaved; increase trim');
            slots.push(profiles[a.branchId].edges[Math.min(a.ordinal,b.ordinal)]);
        }else{
            // Between adjacent Road arms, extend the corresponding exterior
            // surface toward the center. Curb top joins use slot 2, shoulder
            // corner fill uses slot 1, unmatched profiles fall back to asphalt.
            const left=profiles[a.branchId],right=profiles[b.branchId];
            const eA=a.ordinal===0?left.edges[0]:a.ordinal===left.vertices.length-1?left.edges[left.edges.length-1]:-1;
            const eB=b.ordinal===0?right.edges[0]:b.ordinal===right.vertices.length-1?right.edges[right.edges.length-1]:-1;
            if(eA<0||eB<0)throw new Error('Junction V2 profile branches overlap in polar order');
            slots.push(eA===eB?eA:0);
        }
    }
    const origin={x:0,y:0};
    for(const p of points){origin.x+=p.uv0.x/count;origin.y+=p.uv0.y/count;}
    const positions:Vec3MeshV2[]=[],normals:Vec3MeshV2[]=[],uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[];
    const groups=new Map<number,number[]>();
    const append=(a:Vec3MeshV2,b:Vec3MeshV2,c:Vec3MeshV2,
        ua:Vec2MeshV2,ub:Vec2MeshV2,uc:Vec2MeshV2,slot:number)=>{
        const verts=[a,b,c],uvs=[ua,ub,uc];
        let n=cross(a,b,c);
        if(n.y< -1e-7){verts.reverse();uvs.reverse();n=cross(verts[0],verts[1],verts[2]);}
        const face=normalize(n),index=positions.length;
        for(let i=0;i<3;i++){
            const p=verts[i];
            positions.push({x:p.x,y:p.y+lift,z:p.z});
            normals.push(face);uv0.push(uvs[i]);
            uv2.push({x:.5+(p.x-center.x)/(repeat*2*branches.length),
                y:.5+(p.z-center.z)/(repeat*2*branches.length)});
        }
        let indices=groups.get(slot);if(!indices){indices=[];groups.set(slot,indices);}
        indices.push(index,index+1,index+2);
    };
    const uvInner=(p:Vec2MeshV2):Vec2MeshV2=>({
        x:origin.x+(p.x-origin.x)*blend,y:origin.y+(p.y-origin.y)*blend
    });
    for(let i=0;i<count;i++){
        const j=(i+1)%count,a=points[i],b=points[j],slot=slots[i]===0?baseSlot:slots[i];
        const ia=plus(center,a.position,blend),ib=plus(center,b.position,blend);
        append(a.position,ia,ib,a.uv0,uvInner(a.uv0),uvInner(b.uv0),slot);
        append(a.position,ib,b.position,a.uv0,uvInner(b.uv0),b.uv0,slot);
        append(center,ib,ia,origin,uvInner(b.uv0),uvInner(a.uv0),slot);
    }
    const submeshes=Array.from(groups.entries()).sort((a,b)=>a[0]-b[0])
        .map(([materialSlot,indices])=>({materialSlot,indices}));
    const mesh=buildMeshV2({positions,normals,uv0,uv2,submeshes});
    return {mesh,report:{branches:branches.length,
        matchedUV:(options.uvMode??'matched')==='matched',
        polygonVertices:count,triangles:mesh.triangleCount,
        minimumWedgeDegrees:minWedge*180/Math.PI,
        profileBands:{asphalt:(groups.get(baseSlot)?.length??0)/3,
            shoulder:(groups.get(1)?.length??0)/3,
            curb:(groups.get(2)?.length??0)/3}}};
}
