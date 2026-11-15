import {type MeshDataV2,type Vec3MeshV2,type Vec2MeshV2} from './MeshData';
import {inspectJunctionAsphaltOverlapV2} from './JunctionAsphaltOverlapV2';
import {type JunctionRoadBranchV2,type JunctionRoadEdgeV2} from './JunctionPatchV2';

/**
 * Engine-independent post-mesh diagnostic for *actual* trimmed Road cut rings.
 * Does not change vertex positions/UVs and never auto-welds split material
 * edges. UV0 equality is modulo WHOLE Repeat tiles, with one coherent
 * per-branch integer translation (not independent per-edge snapping).
 * Projected UV cannot claim Road-matched material seams.
 */
export interface JunctionSeamAuditOptionsV2 {
    readonly uvMode?:'matched'|'projected';
    readonly positionTolerance?:number;
    readonly uvTolerance?:number;
}
export interface JunctionSeamBranchAuditV2 {
    readonly branchIndex:number;
    readonly ringVertices:number;
    readonly matchedGeometry:number;
    readonly matchedUV:number;
    readonly consistentUVTranslation:boolean;
    readonly uvTileShift?:{readonly x:number;readonly y:number};
    readonly maxPositionGap:number;
    readonly maxUVPhaseError:number;
}
export interface JunctionSeamAuditReportV2 {
    readonly ok:boolean;
    readonly uvPhaseChecked:boolean;
    readonly branches:number;
    readonly boundaryVertices:number;
    readonly matchedGeometry:number;
    readonly matchedUV:number;
    readonly maxPositionGap:number;
    readonly maxUVPhaseError:number;
    readonly inconsistentUVBranches:number;
    readonly degenerateTriangles:number;
    /** Diagnostics only: split walls and multi-material edges may be legitimate. */
    readonly nonManifoldEdges:number;
    readonly duplicatedTriangles:number;
    readonly overlappingAsphaltPairs:number;
    readonly maximumAsphaltOverlapArea:number;
    readonly asphaltOverlapChecked:boolean;
    readonly materialSlots:ReadonlyArray<number>;
    readonly details:ReadonlyArray<JunctionSeamBranchAuditV2>;
    readonly notes:ReadonlyArray<string>;
}
const finite=(x:number)=>Number.isFinite(x)&&Number.isFinite(Math.fround(x));
const vec=(mesh:MeshDataV2,index:number):Vec3MeshV2=>({
    x:mesh.positions[3*index],y:mesh.positions[3*index+1],
    z:mesh.positions[3*index+2]
});
const uv=(mesh:MeshDataV2,index:number):Vec2MeshV2=>({
    x:mesh.uv0[2*index],y:mesh.uv0[2*index+1]
});
const gap=(a:Vec3MeshV2,b:Vec3MeshV2)=>
    Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const tile=(actual:Vec2MeshV2,road:Vec2MeshV2)=>{
    const dx=actual.x-road.x,dy=actual.y-road.y;
    const x=Math.round(dx),y=Math.round(dy);
    return {x,y,error:Math.max(Math.abs(dx-x),Math.abs(dy-y))};
};
const key=(p:Vec3MeshV2)=>[p.x,p.y,p.z]
    .map(n=>Math.round(n*1e5)).join(':');
function countTopologyIssues(mesh:MeshDataV2):{
    degenerateTriangles:number;nonManifoldEdges:number;duplicatedTriangles:number
}{
    let degenerateTriangles=0,duplicatedTriangles=0;
    const surfaces=new Set<string>(),edges=new Map<string,number>();
    for(const sub of mesh.submeshes)for(let k=0;k<sub.indices.length;k+=3){
        const ids=[sub.indices[k],sub.indices[k+1],sub.indices[k+2]];
        const p=ids.map(i=>vec(mesh,i));
        const x={x:p[1].x-p[0].x,y:p[1].y-p[0].y,z:p[1].z-p[0].z};
        const y={x:p[2].x-p[0].x,y:p[2].y-p[0].y,z:p[2].z-p[0].z};
        const area2=Math.hypot(x.y*y.z-x.z*y.y,x.z*y.x-x.x*y.z,
            x.x*y.y-x.y*y.x);
        if(!finite(area2)||area2<1e-9)degenerateTriangles++;
        const corners=p.map(key).sort();
        const surface=corners.join('|');
        if(surfaces.has(surface))duplicatedTriangles++;
        surfaces.add(surface);
        const cycle=p.map(key);
        for(let i=0;i<3;i++){
            const a=cycle[i],b=cycle[(i+1)%3];
            const edge=a<b?a+'|'+b:b+'|'+a;
            edges.set(edge,(edges.get(edge)||0)+1);
        }
    }
    let nonManifoldEdges=0;
    for(const count of edges.values())if(count>2)nonManifoldEdges++;
    return {degenerateTriangles,duplicatedTriangles,nonManifoldEdges};
}
export function auditJunctionSeamsV2(
    mesh:MeshDataV2,branches:ReadonlyArray<JunctionRoadBranchV2>,
    options:JunctionSeamAuditOptionsV2={}
):JunctionSeamAuditReportV2 {
    const posTol=options.positionTolerance??.0005;
    const uvTol=options.uvTolerance??.0005;
    const mode=options.uvMode??'matched';
    if(!finite(posTol)||posTol<=0||posTol>.05||
       !finite(uvTol)||uvTol<=0||uvTol>.05||
       (mode!=='matched'&&mode!=='projected'))
        throw new Error('Invalid Junction seam audit tolerances or UV mode');
    if(branches.length!==3&&branches.length!==4)
        throw new Error('Junction seam audit requires 3 or 4 Road branches');
    if(mesh.vertexCount<1||mesh.positions.length!==mesh.vertexCount*3||
       mesh.uv0.length!==mesh.vertexCount*2)
        throw new Error('Junction seam audit received malformed mesh attributes');
    if(mesh.vertexCount>500000||mesh.triangleCount>500000)
        throw new Error('Junction seam audit exceeded conservative mesh budget');
    const uvPhaseChecked=mode==='matched';
    const points=Array.from({length:mesh.vertexCount},(_,i)=>({
        position:vec(mesh,i),uv0:uv(mesh,i)
    }));
    const details:JunctionSeamBranchAuditV2[]=[];
    let matchedGeometry=0,matchedUV=0,maxPositionGap=0,
        maxUVPhaseError=0,inconsistentUVBranches=0,boundaryVertices=0;
    for(const [branchIndex,branch] of branches.entries()){
        const source:ReadonlyArray<JunctionRoadEdgeV2>=branch.profile?.vertices??
            [branch.left,branch.middle,branch.right];
        if(source.length<3||source.length>32)
            throw new Error('Junction seam audit found invalid Road end ring');
        const translations:Array<Set<string>>=[];
        let geo=0,matched=0,branchMaxGap=0,branchMaxUV=0;
        for(const edge of source){
            if(!edge||![edge.position.x,edge.position.y,edge.position.z,
                edge.uv0.x,edge.uv0.y].every(finite))
                throw new Error('Junction seam audit found non-finite Road edge');
            boundaryVertices++;
            let bestGap=Infinity,bestUV=Infinity,foundPosition=false,foundUV=false;
            const shifts=new Set<string>();
            for(const p of points){
                const d=gap(p.position,edge.position);
                if(d<bestGap)bestGap=d;
                if(d>posTol)continue;
                foundPosition=true;
                if(!uvPhaseChecked)continue;
                const phase=tile(p.uv0,edge.uv0);
                bestUV=Math.min(bestUV,phase.error);
                if(phase.error<=uvTol){
                    foundUV=true;shifts.add(phase.x+':'+phase.y);
                }
            }
            branchMaxGap=Math.max(branchMaxGap,bestGap);
            if(foundPosition)geo++;
            if(uvPhaseChecked){
                if(foundUV)matched++;
                if(Number.isFinite(bestUV))branchMaxUV=Math.max(branchMaxUV,bestUV);
                // Missing exact UV is treated as incoherent even if another
                // edge coincidentally uses the same integer shift.
                translations.push(shifts);
            }
        }
        let coherent=true;
        let chosen:{x:number;y:number}|undefined;
        if(uvPhaseChecked){
            let common=new Set(translations[0]);
            for(const shifts of translations.slice(1))
                common=new Set([...common].filter(s=>shifts.has(s)));
            coherent=matched===source.length&&common.size>0;
            if(coherent){
                const selected=[...common].sort()[0];
                const [x,y]=selected.split(':').map(Number);
                chosen={x,y};
            }else inconsistentUVBranches++;
        }
        matchedGeometry+=geo;matchedUV+=matched;
        maxPositionGap=Math.max(maxPositionGap,branchMaxGap);
        maxUVPhaseError=Math.max(maxUVPhaseError,branchMaxUV);
        details.push({branchIndex,ringVertices:source.length,
            matchedGeometry:geo,matchedUV:matched,
            consistentUVTranslation:coherent,
            ...(chosen?{uvTileShift:chosen}:{}),
            maxPositionGap:branchMaxGap,maxUVPhaseError:branchMaxUV});
    }
    const topology=countTopologyIssues(mesh);
    const asphalt=inspectJunctionAsphaltOverlapV2(mesh);
    const notes:string[]=[];
    if(!uvPhaseChecked)
        notes.push('World Projected UV is not Road-matched; seamless Repeat UV cannot be certified');
    if(matchedGeometry!==boundaryVertices)
        notes.push('One or more Road end-ring vertices are not at the same XYZ in the Junction mesh (check Patch Lift and trim)');
    if(uvPhaseChecked&&matchedUV!==boundaryVertices)
        notes.push('Some Road cut-ring UV coordinates differ beyond an integer Repeat tile');
    if(uvPhaseChecked&&inconsistentUVBranches)
        notes.push('A Road end ring lacks a single coherent integer UV translation');
    if(topology.degenerateTriangles)
        notes.push('Mesh contains zero-area or near-degenerate triangles');
    if(topology.duplicatedTriangles)
        notes.push('Mesh contains coincident triangles; inspect possible overlapping surfaces');
    if(topology.nonManifoldEdges)
        notes.push('Mesh contains high-valence physical edges; inspect split material and curb topology');
    if(!asphalt.checked)
        notes.push(asphalt.skippedReason||'Asphalt intersection audit could not certify topology');
    if(asphalt.overlappingPairs)
        notes.push('Junction asphalt triangles overlap in positive surface area; check corner triangulation and Road trim');
    const ok=matchedGeometry===boundaryVertices&&uvPhaseChecked&&
        matchedUV===boundaryVertices&&inconsistentUVBranches===0&&
        topology.degenerateTriangles===0&&asphalt.checked&&asphalt.overlappingPairs===0;
    return {ok,uvPhaseChecked,branches:branches.length,
        boundaryVertices,matchedGeometry,matchedUV,
        maxPositionGap,maxUVPhaseError,inconsistentUVBranches,
        ...topology,overlappingAsphaltPairs:asphalt.overlappingPairs,
        maximumAsphaltOverlapArea:asphalt.maximumOverlapArea,
        asphaltOverlapChecked:asphalt.checked,
        materialSlots:mesh.submeshes.map(g=>g.materialSlot),
        details,notes};
}
