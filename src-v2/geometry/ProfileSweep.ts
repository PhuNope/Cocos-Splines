import {buildSplineFramesV2,type SplineFrameV2} from '../core/SplineFrames';
import {type SplineCacheV2} from '../core/SplineCache';
import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';
import {buildRoadCornerSectionsV2,roadCornerPositionV2,appendRoadQuadV2,type RoadCornerOptionsV2} from './RoadCorners';
import {resolveRoadOverlapV2,type RoadOverlapReportV2} from './RoadOverlapClip';

export interface ProfileVertexV2 {readonly x:number;readonly y:number;}
export interface ProfileSweepOptionsV2 extends RoadCornerOptionsV2 {
    readonly points:ReadonlyArray<ProfileVertexV2>;
    /** One material slot per profile edge, including wrap edge if closedProfile. */
    readonly edgeMaterials:ReadonlyArray<number>;
    readonly closedProfile?:boolean;
    readonly smoothNormals?:boolean;
    readonly capEnds?:boolean;
    readonly capMaterialSlot?:number;
    readonly flipFaces?:boolean;
    readonly step?:number;
    readonly uvMetersPerRepeat?:number;
    /** UV0 coordinate that repeats longitudinally; default v. */
    readonly uvLongitudinalAxis?:'u'|'v';
}
export interface RoadProfileOptionsV2 extends RoadCornerOptionsV2 {
    readonly width:number;
    readonly resolvePlanarOverlaps?:boolean;
    readonly onOverlapReport?:(report:RoadOverlapReportV2)=>void;
    readonly shoulderWidth?:number;
    readonly curbWidth?:number;
    readonly curbHeight?:number;
    readonly step?:number;
    readonly uvMetersPerRepeat?:number;
    /** UV0 coordinate that repeats longitudinally; default v. */
    readonly uvLongitudinalAxis?:'u'|'v';
}
export interface TubeOptionsV2 {
    readonly radius:number;
    readonly sides?:number;
    readonly capEnds?:boolean;
    readonly flipFaces?:boolean;
    readonly step?:number;
    readonly uvMetersPerRepeat?:number;
    /** UV0 coordinate that repeats longitudinally; default v. */
    readonly uvLongitudinalAxis?:'u'|'v';
}
const finite=(x:number)=>Number.isFinite(x)&&Number.isFinite(Math.fround(x));
const vec=(p:SplineFrameV2,x:number,y:number):Vec3MeshV2=>({
    x:p.position.x+p.right.x*x+p.up.x*y,
    y:p.position.y+p.right.y*x+p.up.y*y,
    z:p.position.z+p.right.z*x+p.up.z*y
});
const normal=(p:SplineFrameV2,x:number,y:number,flip=false):Vec3MeshV2=>{
    const len=Math.hypot(x,y)||1,sgn=flip?-1:1;
    return {x:sgn*(p.right.x*x+p.up.x*y)/len,
        y:sgn*(p.right.y*x+p.up.y*y)/len,
        z:sgn*(p.right.z*x+p.up.z*y)/len};
};
function validSlot(slot:number):boolean{return Number.isSafeInteger(slot)&&slot>=0&&slot<=0xffffffff;}
/**
 * Shared 3D cross-section sweeper with material bands and UV seam splits.
 * Section x is frame.right and y is frame.up. Open profile edges are ordered
 * left-to-right; clockwise closed profiles create outward-facing tubes.
 * UV2 is deterministic secondary mapping, NOT a non-overlapping lightmap unwrap.
 */
export function buildProfileSweepV2(cache:SplineCacheV2,options:ProfileSweepOptionsV2):MeshDataV2 {
    const pts=options.points,closed=options.closedProfile===true;
    const edgeCount=closed?pts.length:pts.length-1;
    const step=options.step??.5,uvRepeat=options.uvMetersPerRepeat??5;
    if(pts.length<2||(closed&&pts.length<3))throw new Error('Profile requires at least 2 points (3 if closed)');
    if(options.edgeMaterials.length!==edgeCount||!options.edgeMaterials.every(validSlot))
        throw new Error('Profile edgeMaterials must match edge count with valid slots');
    if(!pts.every(p=>finite(p.x)&&finite(p.y)))throw new Error('Invalid profile coordinates');
    if(!finite(step)||step<=0||!finite(uvRepeat)||uvRepeat<=0)throw new Error('Invalid profile sweep sampling');
    const axis=options.uvLongitudinalAxis??'v';
    if(axis!=='u'&&axis!=='v')throw new Error('Profile UV axis must be u or v');
    if(cache.length<=1e-9)throw new Error('Profile sweep needs a nonzero spline length');
    if(options.smoothNormals&&!closed)throw new Error('Smooth profile normals require a closed profile');
    if(options.capEnds&&!closed)throw new Error('Caps require a closed profile');
    if(options.capMaterialSlot!==undefined&&!validSlot(options.capMaterialSlot))
        throw new Error('Invalid cap material slot');
    const edges: number[]=[],lengths=[0];let total=0;
    for(let i=0;i<edgeCount;i++){
        const j=(i+1)%pts.length,dx=pts[j].x-pts[i].x,dy=pts[j].y-pts[i].y;
        const l=Math.hypot(dx,dy);
        if(!finite(l)||l<=1e-10)throw new Error('Degenerate profile edge');
        edges.push(l);total+=l;lengths.push(total);
    }
    if(!finite(total))throw new Error('Profile length overflow');
    let area=0;
    if(closed){
        for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];area+=a.x*b.y-b.x*a.y;}
        if(Math.abs(area)<1e-10)throw new Error('Closed profile has zero signed area');
    }
    if(options.capEnds){
        const sign=Math.sign(area);
        for(let i=0;i<pts.length;i++){
            const a=pts[i],b=pts[(i+1)%pts.length],c=pts[(i+2)%pts.length];
            const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
            if(cross*sign< -1e-9)throw new Error('End caps currently require a convex profile');
        }
    }
    const frames=buildSplineFramesV2(cache,{maxStep:step}).frames;
    // Only Road chooses join-trim. Extrude tubes remain regular cross-sections.
    const roadSections=options.cornerMode==='join-trim'
        ?buildRoadCornerSectionsV2(frames,Math.max(...pts.map(p=>Math.abs(p.x))),options,cache.spline.closed)
        :null;
    const positions:Vec3MeshV2[]=[],normals:Vec3MeshV2[]=[],uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[];
    const groups=new Map<number,number[]>();
    const addGroup=(slot:number,triangles:number[]):void=>{let a=groups.get(slot);if(!a){a=[];groups.set(slot,a);}a.push(...triangles);};
    const flipped=!!options.flipFaces;
    const cornerNormals:ProfileVertexV2[]=[];
    if(options.smoothNormals){
        for(let i=0;i<pts.length;i++){
            const prev=pts[(i-1+pts.length)%pts.length],now=pts[i],next=pts[(i+1)%pts.length];
            const d0=Math.hypot(now.x-prev.x,now.y-prev.y);
            const d1=Math.hypot(next.x-now.x,next.y-now.y);
            const nx=-(now.y-prev.y)/d0-(next.y-now.y)/d1;
            const ny=(now.x-prev.x)/d0+(next.x-now.x)/d1;
            if(Math.hypot(nx,ny)<1e-9)throw new Error('Profile contains opposing edges');
            cornerNormals.push({x:nx,y:ny});
        }
    }
    function push(f:SplineFrameV2,frameIndex:number,pt:ProfileVertexV2,nx:number,ny:number,u:number){
        const id=positions.length;
        positions.push(roadSections?roadCornerPositionV2(f,roadSections[frameIndex],pt.x,pt.y):vec(f,pt.x,pt.y));
        normals.push(normal(f,nx,ny,flipped));
        const across=u/total,along=f.distance/uvRepeat;
        uv0.push(axis==='u'?{x:along,y:across}:{x:across,y:along});
        uv2.push({x:u/total,y:f.distance/cache.length});
        return id;
    }
    for(let edge=0;edge<edgeCount;edge++){
        const a=pts[edge],b=pts[(edge+1)%pts.length],dx=b.x-a.x,dy=b.y-a.y;
        const na=options.smoothNormals?cornerNormals[edge]:{x:-dy,y:dx};
        const nb=options.smoothNormals?cornerNormals[(edge+1)%pts.length]:na;
        const start=positions.length;
        for(let ring=0;ring<frames.length;ring++){
            const f=frames[ring];
            push(f,ring,a,na.x,na.y,lengths[edge]);
            push(f,ring,b,nb.x,nb.y,lengths[edge+1]);
        }
        const tris:number[]=[];
        for(let i=0;i<frames.length-1;i++){
            const k=start+2*i;
            if(roadSections){
                // Choose the correct diagonal when local curvature makes an inner quad concave.
                appendRoadQuadV2(positions,normals,k,k+1,k+2,k+3,tris,flipped);
            }else if(flipped)tris.push(k,k+1,k+2,k+1,k+3,k+2);
            else tris.push(k,k+2,k+1,k+1,k+2,k+3);
        }
        addGroup(options.edgeMaterials[edge],tris);
    }
    if(options.capEnds&&!cache.spline.closed){
        const slot=options.capMaterialSlot??options.edgeMaterials[0],isClockwise=area<0;
        const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
        const minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
        const center={x:pts.reduce((sum,p)=>sum+p.x,0)/pts.length,y:pts.reduce((sum,p)=>sum+p.y,0)/pts.length};
        for(let end=0;end<2;end++){
            const f=frames[end?frames.length-1:0];
            const n=end?f.tangent:{x:-f.tangent.x,y:-f.tangent.y,z:-f.tangent.z};
            const faceNormal=flipped?{x:-n.x,y:-n.y,z:-n.z}:n;
            const position=(p:ProfileVertexV2)=>{
                const id=positions.length;
                positions.push(vec(f,p.x,p.y));normals.push(faceNormal);
                const uv={x:(p.x-minX)/Math.max(1e-9,maxX-minX),y:(p.y-minY)/Math.max(1e-9,maxY-minY)};
                uv0.push(uv);uv2.push(uv);
                return id;
            };
            const origin=position(center),rim=pts.map(position),triangles:number[]=[];
            for(let i=0;i<rim.length;i++){
                const j=(i+1)%rim.length;
                const reverse=(end===1?isClockwise:!isClockwise)!==flipped;
                if(reverse)triangles.push(origin,rim[j],rim[i]);
                else triangles.push(origin,rim[i],rim[j]);
            }
            addGroup(slot,triangles);
        }
    }
    const submeshes=Array.from(groups.entries()).sort((a,b)=>a[0]-b[0]).map(([materialSlot,indices])=>({materialSlot,indices}));
    return buildMeshV2({positions,normals,uv0,uv2,submeshes});
}
/** Material 0 asphalt, 1 shoulders, 2 curbs (shared across left/right). */
export function buildRoadProfileV2(cache:SplineCacheV2,options:RoadProfileOptionsV2):MeshDataV2 {
    const {width}=options,shoulder=options.shoulderWidth??0,curb=options.curbWidth??0,height=options.curbHeight??0;
    if(!finite(width)||width<=0||![shoulder,curb,height].every(x=>finite(x)&&x>=0))
        throw new Error('Invalid road width, shoulder or curb dimensions');
    const half=width/2,pts:ProfileVertexV2[]=[],slots:number[]=[];
    const push=(x:number,y:number,slot?:number)=>{
        if(slot!==undefined)slots.push(slot);
        pts.push({x,y});
    };
    if(curb>0)push(-half-shoulder-curb,height);
    if(curb>0||height>0){
        if(curb>0)push(-half-shoulder,height,2);
        else push(-half-shoulder,height);
        if(height>0)push(-half-shoulder,0,2);
    }
    if(!pts.length)push(-half-shoulder,0);
    if(shoulder>0)push(-half,0,1);
    push(half,0,0);
    if(shoulder>0)push(half+shoulder,0,1);
    if(height>0)push(half+shoulder,height,2);
    if(curb>0)push(half+shoulder+curb,height,2);
    const mesh=buildProfileSweepV2(cache,{points:pts,edgeMaterials:slots,step:options.step,uvMetersPerRepeat:options.uvMetersPerRepeat,
        uvLongitudinalAxis:options.uvLongitudinalAxis,
        cornerMode:options.cornerMode??'join-trim',
        cornerTrimSafety:options.cornerTrimSafety,
        cornerMiterLimit:options.cornerMiterLimit});
    const fullWidth=width+2*shoulder+2*curb;
    if(!(options.resolvePlanarOverlaps??options.cornerMode!=='legacy'))return mesh;
    const result=resolveRoadOverlapV2(mesh,{roadWidth:fullWidth});
    options.onOverlapReport?.(result.report);
    return result.mesh;
}
export function buildTubeV2(cache:SplineCacheV2,options:TubeOptionsV2):MeshDataV2 {
    const sides=options.sides??12;
    if(!finite(options.radius)||options.radius<=0)throw new Error('Tube radius must be positive');
    if(!Number.isInteger(sides)||sides<3||sides>256)throw new Error('Tube sides must be 3..256');
    const pts=Array.from({length:sides},(_,i)=>({
        x:options.radius*Math.cos(-2*Math.PI*i/sides),
        y:options.radius*Math.sin(-2*Math.PI*i/sides)
    }));
    return buildProfileSweepV2(cache,{points:pts,edgeMaterials:Array(sides).fill(0),closedProfile:true,
        smoothNormals:true,capEnds:options.capEnds,flipFaces:options.flipFaces,
        step:options.step,uvMetersPerRepeat:options.uvMetersPerRepeat,
        uvLongitudinalAxis:options.uvLongitudinalAxis});
}
