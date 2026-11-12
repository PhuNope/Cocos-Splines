import {buildSplineFramesV2,type SplineFrameV2} from '../core/SplineFrames';
import {type SplineCacheV2} from '../core/SplineCache';
import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';
import {buildRoadCornerSectionsV2,roadCornerPositionV2,appendRoadQuadV2,type RoadCornerOptionsV2} from './RoadCorners';
import {resolveRoadOverlapV2,type RoadOverlapReportV2} from './RoadOverlapClip';
import {buildRoadContinuousSectionsV2,roadContinuousProfileX_V2,type RoadContinuousOptionsV2,type RoadContinuousReportV2,type RoadContinuousResultV2} from './RoadContinuous';
import {buildRoadMarkingsV2,appendRoadMarkingsV2,type RoadMarkingOptionsV2} from './RoadMarkings';
import {buildRoadFilletCacheV2,type RoadFilletOptionsV2,type RoadFilletReportV2} from './RoadFillet';
import {trimmedRoadFramesV2,type RoadJunctionTrimV2} from './RoadJunctionTrim';

export interface ProfileVertexV2 {readonly x:number;readonly y:number;}
export interface ProfileSweepOptionsV2 extends RoadCornerOptionsV2, RoadContinuousOptionsV2 {
    readonly roadContinuous?:RoadContinuousResultV2;
    /** Exact same frame table used for corner/width fitting. */
    readonly roadFrames?:ReadonlyArray<SplineFrameV2>;
    readonly uvCrossMode?:'legacy'|'physical';
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
export interface RoadProfileOptionsV2 extends RoadCornerOptionsV2, RoadContinuousOptionsV2, RoadFilletOptionsV2, RoadJunctionTrimV2 {
    readonly surfaceMode?:'clip'|'continuous'|'fillet';
    readonly onFilletReport?:(report:RoadFilletReportV2)=>void;
    readonly onContinuousReport?:(report:RoadContinuousReportV2)=>void;
    readonly adaptiveSampling?:boolean;
    readonly maxTurnAngleDegrees?:number;
    readonly maxChordError?:number;
    readonly uvCrossMode?:'legacy'|'physical';
    readonly generateMarkings?:boolean;
    readonly markingOptions?:RoadMarkingOptionsV2;
    readonly width:number;
    readonly resolvePlanarOverlaps?:boolean;
    /** Match UV0 phase on coplanar cut edges (Repeat sampler). */
    readonly stitchCutUV?:boolean;
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
    if(options.uvCrossMode!==undefined&&options.uvCrossMode!=='legacy'&&options.uvCrossMode!=='physical')
        throw new Error('Unknown profile UV cross mode');
    const frames=options.roadFrames??buildSplineFramesV2(cache,{maxStep:step}).frames;
    if(options.roadContinuous&&options.roadContinuous.sections.length!==frames.length)
        throw new Error('Road Continuous frame count mismatch');
    const halfExtent=Math.max(...pts.map(p=>Math.abs(p.x)));
    const centerIndex=pts.findIndex(p=>Math.abs(p.x)<1e-9&&Math.abs(p.y)<1e-9);
    const centreAcross=centerIndex<0?.5:lengths[centerIndex]/total;
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
        const section=options.roadContinuous?.sections[frameIndex];
        const renderX=section?roadContinuousProfileX_V2(pt.x,halfExtent,section):pt.x;
        positions.push(roadSections?roadCornerPositionV2(f,roadSections[frameIndex],renderX,pt.y):vec(f,renderX,pt.y));
        normals.push(normal(f,nx,ny,flipped));
        const acrossOriginal=u/total;
        const sideScale=section?(pt.x<0?section.left:section.right)/halfExtent:1;
        const across=options.uvCrossMode==='physical'&&section
            ?centreAcross+(acrossOriginal-centreAcross)*sideScale:acrossOriginal;
        const along=f.distance/uvRepeat;
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
    const mode=options.surfaceMode??'clip';
    if(mode!=='clip'&&mode!=='continuous'&&mode!=='fillet')throw new Error('Unknown Road surface mode');
    if(mode!=='fillet'&&((options.junctionStartTrim??0)>0||(options.junctionEndTrim??0)>0))
        throw new Error('Junction trim needs ConstantWidth Road mode');
    const totalHalfExtent=half+shoulder+curb;
    const fillet=mode==='fillet'?buildRoadFilletCacheV2(cache,totalHalfExtent,{...options,maxArcStep:options.step??.5}):null;
    if(fillet)options.onFilletReport?.(fillet.report);
    const workingCache=fillet?.cache??cache;
    const fullFrames=buildSplineFramesV2(workingCache,{maxStep:options.step??.5,
        ...(options.adaptiveSampling&&mode!=='fillet'?{
            maxAngleDegrees:options.maxTurnAngleDegrees??6,maxChordError:options.maxChordError??.03
        }:{})});
    const frames=trimmedRoadFramesV2(workingCache,fullFrames,options);
    const cornerSections=buildRoadCornerSectionsV2(frames,totalHalfExtent,
        mode==='fillet'?{cornerMode:'legacy'}:options,workingCache.spline.closed);
    const continuous=mode==='continuous'?buildRoadContinuousSectionsV2(
        frames,totalHalfExtent,{...options,cornerSections,closed:workingCache.spline.closed}):null;
    if(continuous)options.onContinuousReport?.(continuous.report);
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
    // Continuous mode anchors the asphalt's UV0 middle at the centreline.
    if(mode==='continuous'||mode==='fillet')push(0,0,0);
    push(half,0,0);
    if(shoulder>0)push(half+shoulder,0,1);
    if(height>0)push(half+shoulder,height,2);
    if(curb>0)push(half+shoulder+curb,height,2);
    const mesh=buildProfileSweepV2(workingCache,{points:pts,edgeMaterials:slots,step:options.step,uvMetersPerRepeat:options.uvMetersPerRepeat,
        uvLongitudinalAxis:options.uvLongitudinalAxis,
        cornerMode:mode==='fillet'?'legacy':options.cornerMode??'join-trim',
        cornerTrimSafety:options.cornerTrimSafety,
        cornerMiterLimit:options.cornerMiterLimit,roadContinuous:continuous??undefined,
        roadFrames:frames,uvCrossMode:options.uvCrossMode});
    const fullWidth=width+2*shoulder+2*curb;
    if(mode==='continuous'||mode==='fillet'){
        if(!options.generateMarkings)return mesh;
        const fullWidthSections=continuous??{
            sections:frames.map(()=>({left:totalHalfExtent,right:totalHalfExtent})),
            report:{constrainedSections:0,curvatureConstrainedSections:0,effectiveWidthSlope:0,
                slopeSafetyCapped:false,minimumWidthRatio:1,impossibleCrossings:0,hitSafetyLimit:false}
        };
        const markings=buildRoadMarkingsV2(frames,cornerSections,fullWidthSections,half,totalHalfExtent,{...options.markingOptions,
            uvMetersPerRepeat:options.uvMetersPerRepeat,uvLongitudinalAxis:options.uvLongitudinalAxis});
        return appendRoadMarkingsV2(mesh,markings);
    }
    if(options.generateMarkings)throw new Error('Separate Road markings require Continuous or Constant Width mode');
    if(!(options.resolvePlanarOverlaps??options.cornerMode!=='legacy'))return mesh;
    const result=resolveRoadOverlapV2(mesh,{roadWidth:fullWidth,stitchCutUV:options.stitchCutUV});
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
