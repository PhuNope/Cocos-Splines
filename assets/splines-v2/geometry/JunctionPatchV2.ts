import {buildJunctionProfilePatchV2} from './JunctionProfilePatchV2';
import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';

export interface JunctionRoadEdgeV2 {readonly position:Vec3MeshV2;readonly uv0:Vec2MeshV2;}
export interface JunctionBranchProfileV2 {
    /** Ordered left-to-right as authored by roadProfileLayoutV2. */
    readonly vertices:ReadonlyArray<JunctionRoadEdgeV2>;
    /** Material for each adjacent pair. 0 asphalt, 1 shoulder, 2 curb. */
    readonly edgeMaterials:ReadonlyArray<number>;
}
export interface JunctionRoadBranchV2 {
    /** Original untrimmed spline endpoint: endpoints must be co-located. */
    readonly endpoint:Vec3MeshV2;
    /** Exact asphalt edge vertices/UV0 from the Road's trimmed end ring. */
    readonly left:JunctionRoadEdgeV2;
    /** Same middle vertex as the trimmed Road's three-point cross-section. */
    readonly middle:JunctionRoadEdgeV2;
    readonly right:JunctionRoadEdgeV2;
    /** Optional exact entire end-ring when the Road has Shoulder/Curb. */
    readonly profile?:JunctionBranchProfileV2;
    /** Optional exact Road sidewalk U station (metres / UV repeat) at this trimmed ring. */
    readonly sidewalkStation?:number;
}
/** Road indices are the original Inspector Branches indices, order-independent. */
export interface JunctionCurbRampPairV2 {readonly fromBranch:number;readonly toBranch:number;}
export interface JunctionPatchOptionsV2 {
    /** Matched mode samples the same repeat texture as each Road's edge. */
    readonly uvMode?:'matched'|'projected';
    readonly uvMetersPerRepeat?:number;
    readonly uvBlendStart?:number;
    readonly endpointTolerance?:number;
    readonly flatTolerance?:number;
    /** Opt-in bounded gradients between the snapped center and trimmed Road rings; banked cross-sections remain unsupported. */
    readonly gradeMode?:'flat'|'gentle';
    /** Maximum absolute rise / horizontal distance to a trimmed Road center ring (gentle mode). */
    readonly maxGrade?:number;
    readonly surfaceLift?:number;
    readonly materialSlot?:number;
    /** Maximum curb lip height above junction asphalt; flat-plan only. */
    readonly maxCurbHeight?:number;
    /** Legacy radial curb tapers to center. Rounded connects continuous curb top/wall around each exterior corner. */
    readonly curbCornerMode?:'radial'|'rounded';
    /** Arc tessellation per exterior corner, 4..48 (rounded only). */
    readonly curbCornerSegments?:number;
    /** Cubic inward tangent pull for corner radii, 0.1..0.7 (rounded only). */
    readonly curbCornerPull?:number;
    /** Optional lowered curb at chosen adjacent Road corners, only in rounded flat mode. */
    readonly curbRampPairs?:ReadonlyArray<JunctionCurbRampPairV2>;
    /** Residual curb lip at the middle of each lowered corner (nonzero: 0.005..0.08). */
    readonly curbRampMinLip?:number;
    /** Maximum vertical slope of the top along either longitudinal corner rail. */
    readonly curbRampMaxSlope?:number;
    /** Exterior local sidewalk apron width in metres; zero disables it (default). Rounded Curb only. */
    readonly sidewalkApronWidth?:number;
    /** Height of the planar terrain boundary relative to Junction center (not terrain sampling). */
    readonly sidewalkTerrainHeightOffset?:number;
    /** Reject apron crossfall steeper than the configured rise/run. */
    readonly sidewalkMaxCrossSlope?:number;
    /** Opt-in sample mode. Defaults to existing flat manual local height. */
    readonly sidewalkTerrainMode?:'flat'|'sample';
    /** Return Junction-LOCAL Y at an apron OUTER-edge Junction-local XZ; null = outside terrain. */
    readonly sidewalkTerrainSampler?:(x:number,z:number)=>number|null;
    /** Longitudinal rise/run at adjacent sampled outer-edge stations, default .35. */
    readonly sidewalkMaxEdgeSlope?:number;
    /** Join apron outer endpoints to Road sidewalk edges + Repeat-UV U phase (opt-in). */
    readonly sidewalkRoadJoin?:boolean;
}
export interface JunctionPatchReportV2 {
    readonly branches:number;
    readonly matchedUV:boolean;
    readonly polygonVertices:number;
    readonly triangles:number;
    readonly minimumWedgeDegrees:number;
    readonly profileBands?:Readonly<{asphalt:number;shoulder:number;curb:number}>;
    /** Only present for opt-in continuous sidewalk curb mode. */
    readonly roundedCurbCorners?:number;
    readonly curbWallTriangles?:number;
    readonly loweredCurbCorners?:number;
    /** Number of local corner apron sections, not full city sidewalk CSG. */
    readonly sidewalkApronCorners?:number;
    readonly sidewalkApronTriangles?:number;
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
 * The center vertex from each Road ring is preserved to avoid T-junction cracks.
 */
export function buildJunctionPatchV2(
    branches:ReadonlyArray<JunctionRoadBranchV2>,options:JunctionPatchOptionsV2={}
):{mesh:MeshDataV2;report:JunctionPatchReportV2}{
    const n=branches.length;
    if(options.curbRampPairs?.length && options.curbCornerMode!=='rounded')
        throw new Error('Junction V2 curb ramps require Rounded Continuous Curb mode');
    if((options.sidewalkApronWidth??0)!==0&&options.curbCornerMode!=='rounded')
        throw new Error('Junction V2 sidewalk apron requires Rounded Continuous Curb mode');
    if(options.sidewalkRoadJoin&&((options.sidewalkApronWidth??0)<=0||
       options.curbCornerMode!=='rounded'))
        throw new Error('Junction V2 Road Sidewalk join requires enabled Rounded Continuous Apron');
    if(n!==3&&n!==4)throw new Error('Junction V2 needs 3 or 4 Road branches');
    const mode=options.uvMode??'matched';
    const uvRepeat=options.uvMetersPerRepeat??5,blend=options.uvBlendStart??.55;
    const tolerance=options.endpointTolerance??.25,flat=options.flatTolerance??.1;
    const gradeMode=options.gradeMode??'flat',maxGrade=options.maxGrade??.15;
    const lift=options.surfaceLift??0,slot=options.materialSlot??0;
    if(mode!=='matched'&&mode!=='projected'||!finite(uvRepeat)||uvRepeat<=0||
       !finite(blend)||blend<.05||blend>.95||!finite(tolerance)||tolerance<=0||
       !finite(flat)||flat<=0||
       (gradeMode!=='flat'&&gradeMode!=='gentle')||!finite(maxGrade)||maxGrade<=0||maxGrade>.35||
       (options.curbCornerMode!==undefined&&options.curbCornerMode!=='radial'&&options.curbCornerMode!=='rounded')||
       !finite(lift)||Math.abs(lift)>.2||
       !Number.isSafeInteger(slot)||slot<0)throw new Error('Invalid Junction V2 settings');
    const validate=(p:Vec3MeshV2)=>[p.x,p.y,p.z].every(finite);
    for(const branch of branches){
        if(!validate(branch.endpoint))throw new Error('Junction V2 invalid endpoint');
        for(const v of [branch.left,branch.middle,branch.right])
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
        if(gradeMode==='flat'){
            for(const edge of [b.left,b.middle,b.right])
                if(Math.abs(edge.position.y-center.y)>flat)
                    throw new Error('Junction V2 is flat only; select Gentle Grade for shallow sloped roads');
        }else{
            // A grade is longitudinal only. Across-road banks, height steps and
            // arbitrary 3D twisting are not safe for the polar XZ fan topology.
            const crossfall=Math.min(flat,.03);
            if(Math.abs(b.left.position.y-b.middle.position.y)>crossfall||
               Math.abs(b.right.position.y-b.middle.position.y)>crossfall)
                throw new Error('Junction V2 gentle grade does not support banked Road rings');
            const run=Math.hypot(b.middle.position.x-center.x,b.middle.position.z-center.z);
            if(run<1e-4||Math.abs(b.middle.position.y-center.y)>maxGrade*run+1e-6)
                throw new Error('Junction V2 Road grade exceeds Max Grade');
        }
        if(Math.hypot(b.left.position.x-b.right.position.x,b.left.position.z-b.right.position.z)<.01)
            throw new Error('Junction V2 Road boundary has zero width');
        const mid={x:(b.left.position.x+b.right.position.x)*.5,
            y:b.middle.position.y,z:(b.left.position.z+b.right.position.z)*.5};
        if(length(sub(mid,b.middle.position))>.02)
            throw new Error('Junction V2 center row must match the Road middle vertex');
        const offset=length(sub(mid,center));
        const width=length(sub(b.left.position,b.right.position));
        if(offset<width*.6)
            throw new Error('Junction V2 Road trim is too short for its width; increase Junction Start/End Trim');
    }
    if(branches.some(b=>b.profile))return buildJunctionProfilePatchV2(branches,options,center);
    // One INTEGER UV offset per branch: matches the existing material under a
    // Repeat sampler but never wraps left/right independently.
    const first=branches[0],reference={
        x:(first.left.uv0.x+first.right.uv0.x)*.5,
        y:(first.left.uv0.y+first.right.uv0.y)*.5
    };
    const points:Array<{position:Vec3MeshV2;uv0:Vec2MeshV2;angle:number;branchId:number}>=[];
    for(const [branchId,b] of branches.entries()){
        const uvMid={x:(b.left.uv0.x+b.right.uv0.x)*.5,y:(b.left.uv0.y+b.right.uv0.y)*.5};
        const shift=mode==='matched'?{
            x:Math.round(reference.x-uvMid.x),y:Math.round(reference.y-uvMid.y)
        }:{x:0,y:0};
        for(const e of [b.left,b.middle,b.right]){
            const p=e.position;
            points.push({position:p,
                uv0:mode==='matched'?{x:e.uv0.x+shift.x,y:e.uv0.y+shift.y}
                    :{x:(p.x-center.x)/uvRepeat+.5,y:(p.z-center.z)/uvRepeat+.5},
                angle:Math.atan2(p.z-center.z,p.x-center.x),branchId});
        }
    }
    points.sort((a,b)=>a.angle-b.angle);
    const m=points.length;
    // The three points of each Road boundary must be consecutive on the
    // angular perimeter; interleaving spokes indicate overlapping Road arms.
    for(let branchId=0;branchId<n;branchId++){
        const ids=points.map((p,i)=>p.branchId===branchId?i:-1).filter(i=>i>=0);
        if(ids.length!==3||!ids.some(start=>[0,1,2].every(delta=>ids.includes((start+delta)%m))))
            throw new Error('Junction V2 Road arms overlap in angle; separate their directions or increase trim');
    }
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
    if(gradeMode==='gentle'){
        // Build area-weighted normals using a mutable accumulator; MeshData
        // vectors are intentionally readonly and must not be mutated.
        const summed=positions.map(()=>({x:0,y:0,z:0}));
        for(let i=0;i<indices.length;i+=3){
            const ia=indices[i],ib=indices[i+1],ic=indices[i+2];
            const a=positions[ia],b=positions[ib],c=positions[ic];
            const ab=sub(b,a),ac=sub(c,a);
            const face={x:ab.y*ac.z-ab.z*ac.y,y:ab.z*ac.x-ab.x*ac.z,z:ab.x*ac.y-ab.y*ac.x};
            if(face.y<=1e-9)throw new Error('Junction V2 gentle grade produced a folded surface');
            for(const index of [ia,ib,ic]){
                summed[index].x+=face.x;summed[index].y+=face.y;summed[index].z+=face.z;
            }
        }
        for(let i=0;i<summed.length;i++){
            const n=summed[i],m=length(n);
            if(m<1e-9)throw new Error('Junction V2 degenerate gentle grade normal');
            normals[i]={x:n.x/m,y:n.y/m,z:n.z/m};
        }
    }
    const mesh=buildMeshV2({positions,normals,uv0,uv2,submeshes:[{materialSlot:slot,indices}]});
    return {mesh,report:{branches:n,matchedUV:mode==='matched',polygonVertices:m,
        triangles:mesh.triangleCount,minimumWedgeDegrees:minWedge*180/Math.PI}};
}
