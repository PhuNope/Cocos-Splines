import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';

export interface JunctionRoadEdgeV2 {readonly position:Vec3MeshV2;readonly uv0:Vec2MeshV2;}
export interface JunctionRoadBranchV2 {
    /** Original untrimmed spline endpoint: endpoints must be co-located. */
    readonly endpoint:Vec3MeshV2;
    /** Exact asphalt edge vertices/UV0 from the Road's trimmed end ring. */
    readonly left:JunctionRoadEdgeV2;
    readonly right:JunctionRoadEdgeV2;
}
export interface JunctionPatchOptionsV2 {
    /** Matched mode samples the same repeat texture as each Road's edge. */
    readonly uvMode?:'matched'|'projected';
    readonly uvMetersPerRepeat?:number;
    readonly uvBlendStart?:number;
    readonly endpointTolerance?:number;
    readonly flatTolerance?:number;
    readonly surfaceLift?:number;
    readonly materialSlot?:number;
}
export interface JunctionPatchReportV2 {
    readonly branches:number;
    readonly matchedUV:boolean;
    readonly polygonVertices:number;
    readonly triangles:number;
    readonly minimumWedgeDegrees:number;
}
const sub=(a:Vec3MeshV2,b:Vec3MeshV2)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const length=(a:Vec3MeshV2)=>Math.hypot(a.x,a.y,a.z);
const det=(a:Vec3MeshV2,b:Vec3MeshV2,c:Vec3MeshV2)=>
    (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const finite=(a:number)=>Number.isFinite(a)&&Number.isFinite(Math.fround(a));
/**
 * First flat Junction v2: fill the exact open border of THREE or FOUR Roads
 * already trimmed at their junction endpoint. No overlapping patch on top of
 * intact Road triangles. This surface is a local XZ star polygon, not global
 * road-network CSG or lane-marking topology. All source edge vertices and UV
 * samples remain exact modulo INTEGER repeat periods at the patch perimeter.
 */
export function buildJunctionPatchV2(
    branches:ReadonlyArray<JunctionRoadBranchV2>,options:JunctionPatchOptionsV2={}
):{mesh:MeshDataV2;report:JunctionPatchReportV2}{
    const n=branches.length;
    if(n!==3&&n!==4)throw new Error('Junction V2 needs 3 or 4 Road branches');
    const mode=options.uvMode??'matched';
    const uvRepeat=options.uvMetersPerRepeat??5,blend=options.uvBlendStart??.55;
    const tolerance=options.endpointTolerance??.25,flat=options.flatTolerance??.1;
    const lift=options.surfaceLift??0,slot=options.materialSlot??0;
    if(mode!=='matched'&&mode!=='projected'||!finite(uvRepeat)||uvRepeat<=0||
       !finite(blend)||blend<.05||blend>.95||!finite(tolerance)||tolerance<=0||
       !finite(flat)||flat<=0||!finite(lift)||Math.abs(lift)>.2||
       !Number.isSafeInteger(slot)||slot<0)throw new Error('Invalid Junction V2 settings');
    const validate=(p:Vec3MeshV2)=>[p.x,p.y,p.z].every(finite);
    for(const branch of branches){
        if(!validate(branch.endpoint))throw new Error('Junction V2 invalid endpoint');
        for(const v of [branch.left,branch.right])
            if(!validate(v.position)||![v.uv0.x,v.uv0.y].every(finite))
                throw new Error('Junction V2 invalid Road edge/UV');
    }
    const center:Vec3MeshV2={
        x:branches.reduce((v,b)=>v+b.endpoint.x,0)/n,
        y:branches.reduce((v,b)=>v+b.endpoint.y,0)/n,
        z:branches.reduce((v,b)=>v+b.endpoint.z,0)/n
    };
    for(const b of branches){
        if(length(sub(b.endpoint,center))>tolerance)
            throw new Error('Junction V2 endpoint positions are not co-located; snap all Road endpoints');
        for(const edge of [b.left,b.right])
            if(Math.abs(edge.position.y-center.y)>flat)
                throw new Error('Junction V2 is flat only; banked/sloped roads need a dedicated junction');
        if(Math.hypot(b.left.position.x-b.right.position.x,b.left.position.z-b.right.position.z)<.01)
            throw new Error('Junction V2 Road boundary has zero width');
        const mid={x:(b.left.position.x+b.right.position.x)*.5,
            y:center.y,z:(b.left.position.z+b.right.position.z)*.5};
        const offset=length(sub(mid,center));
        const width=length(sub(b.left.position,b.right.position));
        if(offset<width*.6)
            throw new Error('Junction V2 Road trim is too short for its width; increase Junction Start/End Trim');
    }
    // One INTEGER UV offset per branch: matches the existing material under a
    // Repeat sampler but never wraps left/right independently.
    const first=branches[0],reference={
        x:(first.left.uv0.x+first.right.uv0.x)*.5,
        y:(first.left.uv0.y+first.right.uv0.y)*.5
    };
    const points:Array<{position:Vec3MeshV2;uv0:Vec2MeshV2;angle:number}>=[];
    for(const b of branches){
        const uvMid={x:(b.left.uv0.x+b.right.uv0.x)*.5,y:(b.left.uv0.y+b.right.uv0.y)*.5};
        const shift=mode==='matched'?{
            x:Math.round(reference.x-uvMid.x),y:Math.round(reference.y-uvMid.y)
        }:{x:0,y:0};
        for(const e of [b.left,b.right]){
            const p=e.position;
            points.push({position:p,
                uv0:mode==='matched'?{x:e.uv0.x+shift.x,y:e.uv0.y+shift.y}
                    :{x:(p.x-center.x)/uvRepeat+.5,y:(p.z-center.z)/uvRepeat+.5},
                angle:Math.atan2(p.z-center.z,p.x-center.x)});
        }
    }
    points.sort((a,b)=>a.angle-b.angle);
    const m=points.length;
    let minWedge=Infinity;
    for(let i=0;i<m;i++){
        const a=points[i],b=points[(i+1)%m];
        const delta=(b.angle-a.angle+Math.PI*2)%(Math.PI*2);
        const gap=length(sub(a.position,b.position));
        if(delta<1e-5||delta>=Math.PI-1e-5||gap<.002||Math.abs(det(center,a.position,b.position))<1e-5)
            throw new Error('Junction V2 Road branches overlap or polygon is not star-shaped; increase trim/separate directions');
        minWedge=Math.min(minWedge,delta);
    }
    const origin={x:0,y:0};for(const p of points){origin.x+=p.uv0.x/m;origin.y+=p.uv0.y/m;}
    const positions:Vec3MeshV2[]=[{x:center.x,y:center.y+lift,z:center.z}];
    const normals:Vec3MeshV2[]=[{x:0,y:1,z:0}];
    const uv0:Vec2MeshV2[]=[origin],uv2:Vec2MeshV2[]=[{x:.5,y:.5}];
    const push=(p:Vec3MeshV2,uv:Vec2MeshV2)=>{
        positions.push({x:p.x,y:p.y+lift,z:p.z});normals.push({x:0,y:1,z:0});
        uv0.push(uv);
        uv2.push({x:.5+(p.x-center.x)/(uvRepeat*2*n),y:.5+(p.z-center.z)/(uvRepeat*2*n)});
    };
    for(const p of points)push(p.position,p.uv0);
    for(const p of points){
        const position={
            x:center.x+(p.position.x-center.x)*blend,
            y:center.y+(p.position.y-center.y)*blend,
            z:center.z+(p.position.z-center.z)*blend
        };
        push(position,{
            x:origin.x+(p.uv0.x-origin.x)*blend,
            y:origin.y+(p.uv0.y-origin.y)*blend
        });
    }
    const indices:number[]=[];
    for(let i=0;i<m;i++){
        const j=(i+1)%m;
        const outerI=1+i,outerJ=1+j,innerI=1+m+i,innerJ=1+m+j;
        // In XZ a CCW perimeter has -Y normals. Reverse for +Y.
        indices.push(outerI,innerI,innerJ,outerI,innerJ,outerJ);
        indices.push(0,innerJ,innerI);
    }
    const mesh=buildMeshV2({positions,normals,uv0,uv2,submeshes:[{materialSlot:slot,indices}]});
    return {mesh,report:{branches:n,matchedUV:mode==='matched',polygonVertices:m,
        triangles:mesh.triangleCount,minimumWedgeDegrees:minWedge*180/Math.PI}};
}
