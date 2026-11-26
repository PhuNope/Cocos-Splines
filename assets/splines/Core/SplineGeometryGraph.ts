/**
 * Phase 4.1 — bounded, typed and deterministic procedural geometry DAG.
 * Pure graph compilation/evaluation; Cocos objects remain outside this Core.
 * Reuses the canonical Road tessellator, never mutates a source Mesh/Spline.
 */
import {buildRoadGeometry, RoadCornerMode, RoadFrame, RoadGeometry} from './SplineRoadMath';
import {buildTubeGeometry} from './SplineTubeMath';
import {buildProfileExtrudeGeometry,GraphProfileShape,GraphProfilePoint,GraphProfileUV,parseGraphProfileAsset} from './SplineProfileExtrudeMath';
import {buildGraphMeshDeformGeometry} from './SplineGraphMeshDeformMath';
import {MeshGeometry} from './SplineMeshDeformMath';
import {sampleNoiseLayers,NoiseLayerConfig} from './SplineNoiseMath';
import {buildStableFrames,FrameVec3} from './SplineStableFrames';
import {projectSurfaceCandidates,PopulationSurfaceRaycast} from './SplinePopulationSurfaceMath';

export const GEOMETRY_GRAPH_VERSION=1;
/** Multi-output opt-in; v1 scenes/assets remain unchanged. */
export const GEOMETRY_GRAPH_MULTI_OUTPUT_VERSION=2;
export const DEFAULT_GEOMETRY_GRAPH=JSON.stringify({
    version:1,nodes:[
        {id:'source',type:'spline'},
        {id:'ribbon',type:'ribbon',input:'source',width:4,uvMetersPerRepeat:5},
        {id:'output',type:'output',input:'ribbon'},
    ],output:'output',
},null,2);
export type GeometryNodeType='spline'|'meshAsset'|'offset'|'transform'|'noise'|'reverse'|'clip'|'resample'|'conform'|'width'|'ribbon'|'tube'|'extrude'|'meshDeform'|'output';
export type GeometryPortType='path'|'mesh'|'meshSource';
export interface GeometryWidthKey {progress:number;multiplier:number}
export interface GeometryGraphNode {
    id:string;type:GeometryNodeType;
    input?:string;
    /** Optional typed meshSource input on meshDeform; absent means preset. */
    meshInput?:string;
    /** Slot 0–2 for meshAsset nodes; omitted means original Source Mesh slot 0. */
    slot?:number;
    /** Longitudinal X / Y / Z axis for Mesh Deform; default Z. */
    axis?:number;
    right?:number;up?:number;
    /** Renderer-local translation and XYZ Euler degrees; scale affects path positions, not profile size. */
    translateX?:number;translateY?:number;translateZ?:number;
    rotateX?:number;rotateY?:number;rotateZ?:number;pathScale?:number;
    /** Noise amplitudes are offsets along the upstream right/up/forward basis. */
    noiseRight?:number;noiseUp?:number;noiseForward?:number;
    noiseFrequency?:number;noiseOctaves?:number;noisePersistence?:number;
    noisePhase?:number;noiseSeed?:number;noiseFadeEnds?:number;
    /** Clip interval on the input sampled arc, not geometric Bezier t. */
    clipStart?:number;clipEnd?:number;
    /** Number of equal-input-arc intervals (output has count+1 frames). */
    resampleSegments?:number;
    conformRayHeight?:number;conformRayDepth?:number;conformOffset?:number;
    conformMinNormalY?:number;conformMissing?:number;conformAlign?:number;
    multiplier?:number;
    /** Optional Width scale across normalized physical distance.
     * Unspecified middle = mean of start/end; unspecified end = start.
     * taperMode 0=linear, 1=smoothstep.
     */
    midMultiplier?:number;endMultiplier?:number;taperMode?:number;
    /** Optional strictly ordered physical-distance keys; legacy Start/Mid/End unchanged if absent. */
    widthKeys?:GeometryWidthKey[];
    width?:number;endWidth?:number;uvMetersPerRepeat?:number;
    thickness?:number;capEnds?:boolean;cornerMode?:number;
    radius?:number;radialSegments?:number;
    height?:number;profileShape?:number;profileSlot?:number;
    deformShape?:number;segments?:number;repeats?:number;
    /** 0 Count (legacy), 1 physical length with clipped final tile. */
    repeatLayout?:number;
    /** 0 = imported/preset source axis length, otherwise physical tile length. */
    tileLength?:number;
    /** 0 authored UV0, 1 continuous tile UV, 2 spline-distance UV (legacy). */
    uvMode?:number;
}
export interface GeometryGraph {
    version:number;
    nodes:GeometryGraphNode[];
    output:string;
}
export interface GeometryGraphSplineSource {
    frames:ReadonlyArray<RoadFrame>;closed:boolean;revision:string;
}
export interface GeometryGraphContext extends GeometryGraphSplineSource {
    /** Independent sampled spline slots A/B/C. Legacy context fields represent A
     * when no explicit slot array is supplied. */
    splineSources?:ReadonlyArray<GeometryGraphSplineSource|undefined>;
    /** Frames already expressed in the output MeshRenderer's LOCAL space. */
    frames:ReadonlyArray<RoadFrame>;
    closed:boolean;
    /** Must change when spline/frame geometry or output node World matrix changes. */
    revision:string;
    /** Read-only imported MeshAsset geometry resolved by the renderer. */
    meshSource?:Readonly<MeshGeometry>;
    /** Changes when imported MeshAsset content changes; part of graph cache. */
    meshRevision?:string;
    /** Three native mesh slots. Falls back to legacy slot zero fields. */
    meshSources?:ReadonlyArray<Readonly<MeshGeometry>|undefined>;
    meshRevisions?:ReadonlyArray<string|undefined>;
    /** Explicit authored profile slots A/B/C for Extrude nodes. */
    profileSources?:ReadonlyArray<ReadonlyArray<Readonly<GraphProfilePoint>>|undefined>;
    profileHoles?:ReadonlyArray<ReadonlyArray<ReadonlyArray<Readonly<GraphProfilePoint>>>|undefined>;
    profileOuterContours?:ReadonlyArray<ReadonlyArray<ReadonlyArray<Readonly<GraphProfilePoint>>>|undefined>;
    profileOuterHoles?:ReadonlyArray<ReadonlyArray<ReadonlyArray<ReadonlyArray<Readonly<GraphProfilePoint>>>>|undefined>;
    /** Optional UV0 side-band metadata for the same authored Profile slots. */
    profileUVs?:ReadonlyArray<Readonly<GraphProfileUV>|undefined>;
    profileRevisions?:ReadonlyArray<string|undefined>;
    /** Cocos renderer's local->world 3x3 linear transform, column-major.
     * This is separate from frames, which remain in renderer-local space.
     */
    worldUvLinear?:ReadonlyArray<number>;
    /** Explicit host-provided Physics query snapshot. No engine objects in the DAG. */
    conformSurface?:{revision:string;targetCount:number;origin:FrameVec3;raycast:PopulationSurfaceRaycast};
}
export interface GeometryGraphPlan {
    nodes:GeometryGraphNode[];
    output:string;
    /** V2 only. Omitting version preserves V1 plan signatures. */
    version?:number;
    /** V2 only; IDs are sorted and all are validated, reachable output nodes. */
    outputs?:string[];
}
interface GraphFrame extends RoadFrame {widthFactor:number}
interface GraphPath {kind:'path';frames:GraphFrame[];closed:boolean}
interface GraphMesh {kind:'mesh';geometry:RoadGeometry}
interface GraphMeshSource {kind:'meshSource';geometry:Readonly<MeshGeometry>}
type GraphValue=GraphPath|GraphMesh|GraphMeshSource;
interface CacheEntry {key:string;version:number;value:GraphValue}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const bound=(x:unknown,min:number,max:number,name:string):number=>{
    if(!finite(x)||x<min||x>max)throw Error('Geometry Graph '+name+' must be between '+min+' and '+max+'.');
    return x;
};
function validateWidthKeys(value:unknown):GeometryWidthKey[]{
    if(!Array.isArray(value)||value.length<2||value.length>16)
        throw Error('Geometry Graph Width curve requires 2–16 ordered keys.');
    let previous=-1;
    value.forEach((raw,index)=>{
        if(!raw||typeof raw!=='object'||Array.isArray(raw)||
           Object.keys(raw).some(k=>k!=='progress'&&k!=='multiplier')||
           Object.keys(raw).length!==2)
            throw Error('Geometry Graph Width key must contain only progress and multiplier.');
        const key=raw as GeometryWidthKey;
        bound(key.progress,0,1,'Width key progress');
        bound(key.multiplier,.01,20,'Width key multiplier');
        if((index===0&&key.progress!==0)||
           (index===value.length-1&&key.progress!==1)||
           (index>0&&key.progress-previous<.001-1e-9))
            throw Error('Geometry Graph Width keys require endpoints 0/1 and gaps >= 0.001.');
        previous=key.progress;
    });
    return value as GeometryWidthKey[];
}
const onlyKeys=(object:Record<string,unknown>,keys:ReadonlyArray<string>):void=>{
    if(Object.keys(object).some(k=>!keys.includes(k)))throw Error('Unknown Geometry Graph node property.');
};
const vec=(v:RoadFrame['position']):boolean=>!!v&&
    [v.x,v.y,v.z].every(x=>finite(x)&&Math.abs(x)<=1e7);
const copyVec=(v:RoadFrame['position'])=>({x:v.x,y:v.y,z:v.z});
const deepCopyFrames=(frames:ReadonlyArray<RoadFrame>):GraphFrame[]=>frames.map(f=>({
    position:copyVec(f.position),forward:copyVec(f.forward),right:copyVec(f.right),
    up:copyVec(f.up),distance:f.distance,widthFactor:1,
}));
/** Local affine path transform: scale about renderer origin, then X/Y/Z
 * Euler rotations (in that order), then translation. Rotate frame basis
 * without scaling it so downstream cross-section dimensions stay independent.
 * Distance deltas track transformed sampled world chords, preserving the
 * upstream metric for zero-length chords and exact identity transforms.
 */
function transformPath(source:GraphPath,node:GeometryGraphNode,worldLinear?:ReadonlyArray<number>):GraphPath{
    const scale=node.pathScale??1,tx=node.translateX??0,ty=node.translateY??0,tz=node.translateZ??0;
    const rx=node.rotateX??0,ry=node.rotateY??0,rz=node.rotateZ??0;
    const rotated=rx%360!==0||ry%360!==0||rz%360!==0;
    if(!rotated&&scale===1&&tx===0&&ty===0&&tz===0)return source;
    const radians=Math.PI/180;
    const cx=Math.cos(rx*radians),sx=Math.sin(rx*radians);
    const cy=Math.cos(ry*radians),sy=Math.sin(ry*radians);
    const cz=Math.cos(rz*radians),sz=Math.sin(rz*radians);
    const rotate=(v:RoadFrame['position'])=>{
        if(!rotated)return copyVec(v);
        const y=v.y*cx-v.z*sx,z=v.y*sx+v.z*cx;
        const x=v.x*cy+z*sy,z2=-v.x*sy+z*cy;
        return {x:x*cz-y*sz,y:x*sz+y*cz,z:z2};
    };
    const m=worldLinear;
    if(rotated&&m!==undefined&&
       (!Array.isArray(m)||m.length!==9||!m.every(v=>finite(v)&&Math.abs(v)<=1e7)))
        throw Error('Geometry Graph Transform requires a valid world linear matrix.');
    const chord=(a:RoadFrame['position'],b:RoadFrame['position'])=>{
        const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
        return m?Math.hypot(m[0]*x+m[3]*y+m[6]*z,m[1]*x+m[4]*y+m[7]*z,m[2]*x+m[5]*y+m[8]*z):Math.hypot(x,y,z);
    };
    let distance=source.frames[0].distance*scale;
    const frames:GraphFrame[]=[];
    for(let i=0;i<source.frames.length;i++){
        const f=source.frames[i],p=rotate(f.position);
        const position={x:p.x*scale+tx,y:p.y*scale+ty,z:p.z*scale+tz};
        if(i>0){
            const previous=source.frames[i-1],delta=f.distance-previous.distance;
            let ratio=scale;
            if(rotated){
                const before=chord(previous.position,f.position);
                const after=chord(frames[i-1].position,position);
                if(before>1e-10)ratio=after/before;
                else if(after>1e-10)throw Error('Geometry Graph Transform has a degenerate world metric.');
            }
            distance+=delta*ratio;
        }
        const next={...f,position,forward:rotate(f.forward),right:rotate(f.right),up:rotate(f.up),distance};
        if(![next.position,next.forward,next.right,next.up].every(vec)||!finite(distance)||distance>1e9)
            throw Error('Geometry Graph Transform produced invalid or oversized frames.');
        frames.push(next);
    }
    return {kind:'path',closed:source.closed,frames};
}
/** Rebuild stable physical-world frames after deterministic path displacement.
 * The renderer supplies its local->world basis; converting back preserves
 * profile size under mirrored and nonuniform renderer transforms.
 * Zero amplitude is an exact no-op and leaves the upstream metric intact.
 */
function noisePath(source:GraphPath,node:GeometryGraphNode,linear?:ReadonlyArray<number>):GraphPath{
    const amplitude={x:node.noiseRight??0,y:node.noiseUp??0,z:node.noiseForward??0};
    if(amplitude.x===0&&amplitude.y===0&&amplitude.z===0)return source;
    const basis=displacedPathBasis(linear);
    const {V,add,sub,mul,len,world}=basis;
    const frames=source.frames,last=frames.length-1;
    const start=frames[0].distance,span=frames[last].distance-start;
    if(span<=1e-9||source.closed&&last<3)throw Error('Geometry Graph Noise requires a nonzero sampled path.');
    if(source.closed&&len(world(sub(frames[last].position,frames[0].position)))>1e-4)
        throw Error('Geometry Graph Noise requires coincident closed-loop endpoints.');
    const layer:NoiseLayerConfig={enabled:true,frequency:node.noiseFrequency??4,
        octaves:node.noiseOctaves??2,persistence:node.noisePersistence??.5,
        phase:node.noisePhase??0,seed:0,amplitude,fadeEnds:node.noiseFadeEnds??.1};
    const origin=frames[0].position;
    const positions=frames.map((f,i)=>{
        if(source.closed&&i===last)return V(0,0,0); // replaced with exact first displaced point
        const n=sampleNoiseLayers([layer],(f.distance-start)/span,node.noiseSeed??12345,source.closed);
        const p=add(sub(f.position,origin),add(add(mul(f.right,n.x),mul(f.up,n.y)),mul(f.forward,n.z)));
        return world(p);
    });
    if(source.closed)positions[last]=positions[0];
    return rebuildDisplacedPath(source,positions,origin,basis);
}
function displacedPathBasis(linear?:ReadonlyArray<number>){
    const m=linear??[1,0,0,0,1,0,0,0,1];
    if(!Array.isArray(m)||m.length!==9||!m.every(v=>finite(v)&&Math.abs(v)<=1e7))
        throw Error('Geometry Graph displaced path requires a valid world linear matrix.');
    const V=(x:number,y:number,z:number):FrameVec3=>({x,y,z});
    const add=(a:FrameVec3,b:FrameVec3)=>V(a.x+b.x,a.y+b.y,a.z+b.z);
    const sub=(a:FrameVec3,b:FrameVec3)=>V(a.x-b.x,a.y-b.y,a.z-b.z);
    const mul=(a:FrameVec3,k:number)=>V(a.x*k,a.y*k,a.z*k);
    const dot=(a:FrameVec3,b:FrameVec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
    const cross=(a:FrameVec3,b:FrameVec3)=>V(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
    const len=(a:FrameVec3)=>Math.hypot(a.x,a.y,a.z);
    const unit=(a:FrameVec3)=>{const d=len(a);if(!finite(d)||d<1e-9)throw Error('Geometry Graph displaced path produced a degenerate path segment.');return mul(a,1/d);};
    const a=V(m[0],m[1],m[2]),b=V(m[3],m[4],m[5]),c=V(m[6],m[7],m[8]);
    const bc=cross(b,c),ca=cross(c,a),ab=cross(a,b),det=dot(a,bc);
    if(!finite(det)||Math.abs(det)<1e-12*Math.max(1e-18,len(a)*len(b)*len(c)))
        throw Error('Geometry Graph displaced path requires an invertible world linear matrix.');
    const world=(v:FrameVec3)=>add(add(mul(a,v.x),mul(b,v.y)),mul(c,v.z));
    const local=(v:FrameVec3)=>V(dot(bc,v)/det,dot(ca,v)/det,dot(ab,v)/det);
    return {V,add,sub,mul,len,unit,world,local};
}
function rebuildDisplacedPath(source:GraphPath,positions:FrameVec3[],origin:FrameVec3,
    basis:ReturnType<typeof displacedPathBasis>,upHints?:ReadonlyArray<FrameVec3|undefined>):GraphPath{
    const {add,sub,len,unit,world,local}=basis;
    const frames=source.frames,last=frames.length-1,start=frames[0].distance;
    const segments=positions.slice(1).map((p,i)=>sub(p,positions[i]));
    const directions=segments.map(unit);
    const samples=positions.map((position,i)=>{
        const index=source.closed&&i===last?0:i;
        const before=index>0?directions[index-1]:source.closed?directions[last-1]:directions[0];
        const after=index<last?directions[index]:directions[last-1];
        const blended=add(before,after);
        const tangent=len(blended)>1e-9?unit(blended):after;
        return {t:i/last,position,tangent,up:upHints?.[index]??world(frames[index].up)};
    });
    const stable=buildStableFrames(samples,source.closed);
    let distance=start;
    const output=stable.map((f,i)=>{
        if(i>0)distance+=len(segments[i-1]);
        const basis=source.closed&&i===last?stable[0]:f;
        const next:GraphFrame={...frames[i],position:add(origin,local(f.position)),
            forward:local(basis.tangent),right:local(basis.right),up:local(basis.up),distance};
        if(![next.position,next.forward,next.right,next.up].every(vec)||!finite(distance)||distance>1e9)
            throw Error('Geometry Graph displaced path produced invalid or oversized frames.');
        return next;
    });
    return {kind:'path',closed:source.closed,frames:output};
}
/** Project the path centerline (not every mesh vertex) onto explicit targets.
 * Missing samples either fail atomically or retain their source positions.
 */
function conformPath(source:GraphPath,node:GeometryGraphNode,context:GeometryGraphContext):GraphPath{
    const host=context.conformSurface;
    if(!host||typeof host.revision!=='string'||!host.revision||host.revision.length>8192||
       !vec(host.origin)||typeof host.raycast!=='function')
        throw Error('Geometry Graph Conform requires explicit surface targets and a query revision.');
    const basis=displacedPathBasis(context.worldUvLinear);
    const {add,sub,len,world}=basis;
    const frames=source.frames,last=frames.length-1,start=frames[0].distance;
    const span=frames[last].distance-start;
    if(span<=1e-9||source.closed&&last<3)throw Error('Geometry Graph Conform needs a nonzero sampled path.');
    if(source.closed&&len(world(sub(frames[last].position,frames[0].position)))>1e-4)
        throw Error('Geometry Graph Conform requires coincident closed-loop endpoints.');
    const count=source.closed?last:frames.length;
    const candidates=frames.slice(0,count).map((f,index)=>({
        index,progress:(f.distance-start)/span,position:add(host.origin,world(f.position)),
    }));
    const projected=projectSurfaceCandidates(candidates,{
        rayHeight:node.conformRayHeight??10,rayDepth:node.conformRayDepth??50,
        surfaceOffset:node.conformOffset??0,minNormalY:node.conformMinNormalY??.3,
        skipMissing:false,targetCount:host.targetCount,
    },host.raycast);
    if(projected.length!==count||projected.some((p,i)=>p.index!==i))
        throw Error('Geometry Graph Conform returned incomplete samples.');
    if((node.conformMissing??0)===0&&projected.some(p=>!p.surfaceNormal))
        throw Error('Geometry Graph Conform missed a target surface. Previous mesh retained.');
    if(projected.every(p=>!p.surfaceNormal))return source;
    const positions=projected.map(p=>sub(p.position,host.origin));
    const upHints=projected.map(p=>(node.conformAlign??1)===1?p.surfaceNormal??undefined:undefined);
    if(source.closed){positions.push(positions[0]);upHints.push(upHints[0]);}
    return rebuildDisplacedPath(source,positions,{x:0,y:0,z:0},basis,upHints);

}
/** Reverse travel direction without changing the world-space path or its up
 * hints. Both right and forward must flip together to retain handedness.
 */
function reversePath(source:GraphPath):GraphPath{
    const end=source.frames[source.frames.length-1].distance;
    const neg=(v:FrameVec3):FrameVec3=>({x:-v.x,y:-v.y,z:-v.z});
    return {kind:'path',closed:source.closed,frames:source.frames.slice().reverse().map(f=>({
        ...f,distance:end-f.distance,forward:neg(f.forward),right:neg(f.right),
    }))};
}
/** Interpolate sampled path frames in renderer-local coordinates while
 * preserving the physical length of each interpolated basis vector.
 * This also works under a nonuniform or mirrored renderer world matrix.
 * No exact Bezier reconstruction; an antipodal/degenerate frame fails closed.
 */
function sampledPathMetric(linear?:ReadonlyArray<number>){
    const m=linear??[1,0,0,0,1,0,0,0,1];
    if(!Array.isArray(m)||m.length!==9||!m.every(v=>finite(v)&&Math.abs(v)<=1e7))
        throw Error('Geometry Graph path sampling requires a valid world linear matrix.');
    const world=(v:FrameVec3):FrameVec3=>({
        x:m[0]*v.x+m[3]*v.y+m[6]*v.z,
        y:m[1]*v.x+m[4]*v.y+m[7]*v.z,
        z:m[2]*v.x+m[5]*v.y+m[8]*v.z,
    });
    const length=(v:FrameVec3)=>{const p=world(v);return Math.hypot(p.x,p.y,p.z);};
    const determinant=(a:FrameVec3,b:FrameVec3,c:FrameVec3)=>
        a.x*(b.y*c.z-b.z*c.y)-a.y*(b.x*c.z-b.z*c.x)+a.z*(b.x*c.y-b.y*c.x);
    const axis=(i:number):FrameVec3=>({x:m[i],y:m[i+1],z:m[i+2]});
    const a=axis(0),b=axis(3),c=axis(6);
    if(Math.abs(determinant(a,b,c))<=1e-12*Math.hypot(a.x,a.y,a.z)*Math.hypot(b.x,b.y,b.z)*Math.hypot(c.x,c.y,c.z))
        throw Error('Geometry Graph path sampling requires an invertible world linear matrix.');
    const lerp=(a:FrameVec3,b:FrameVec3,t:number):FrameVec3=>({
        x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,
    });
    const basis=(a:FrameVec3,b:FrameVec3,t:number):FrameVec3=>{
        const v=lerp(a,b,t),l=length(v),target=length(a)*(1-t)+length(b)*t;
        if(!finite(l)||!finite(target)||target<=1e-9||l<target*1e-6)
            throw Error('Geometry Graph path sampling encountered antipodal or degenerate frames.');
        const k=target/l;
        return {x:v.x*k,y:v.y*k,z:v.z*k};
    };
    const sample=(frames:GraphFrame[],distance:number):GraphFrame=>{
        const last=frames.length-1;
        if(distance<=frames[0].distance)return {...frames[0],distance};
        if(distance>=frames[last].distance)return {...frames[last],distance};
        let lo=0,hi=last;
        while(lo+1<hi){const mid=(lo+hi)>>1;if(frames[mid].distance<distance)lo=mid;else hi=mid;}
        const a=frames[lo],b=frames[hi];
        if(distance===b.distance)return {...b,distance};
        const t=(distance-a.distance)/(b.distance-a.distance);
        const f={position:lerp(a.position,b.position,t),forward:basis(a.forward,b.forward,t),
            right:basis(a.right,b.right,t),up:basis(a.up,b.up,t),distance,
            widthFactor:a.widthFactor+(b.widthFactor-a.widthFactor)*t};
        const r=world(f.right),u=world(f.up),d=world(f.forward);
        const volume=Math.hypot(r.x,r.y,r.z)*Math.hypot(u.x,u.y,u.z)*Math.hypot(d.x,d.y,d.z);
        if(![f.position,f.forward,f.right,f.up].every(vec)||!finite(volume)||
           volume<=1e-20||Math.abs(determinant(r,u,d))<volume*1e-6)
            throw Error('Geometry Graph path sampling produced an invalid frame.');
        return f;
    };
    const chord=(a:FrameVec3,b:FrameVec3)=>length({x:b.x-a.x,y:b.y-a.y,z:b.z-a.z});
    return {sample,chord};
}
function clipPath(source:GraphPath,node:GeometryGraphNode,linear?:ReadonlyArray<number>):GraphPath{
    const start=node.clipStart??0,end=node.clipEnd??1;
    if(start===0&&end===1)return source;
    const frames=source.frames,first=frames[0].distance,span=frames[frames.length-1].distance-first;
    if(span<=1e-9)throw Error('Geometry Graph Clip requires a nonzero sampled path.');
    const from=first+span*start,to=first+span*end;
    const {sample}=sampledPathMetric(linear);
    const selected=[sample(frames,from),...frames.filter(f=>f.distance>from&&f.distance<to),sample(frames,to)];
    return {kind:'path',closed:false,frames:selected.map(f=>({...f,distance:f.distance-from}))};
}
function resamplePath(source:GraphPath,node:GeometryGraphNode,linear?:ReadonlyArray<number>):GraphPath{
    const frames=source.frames,count=node.resampleSegments??32;
    const first=frames[0].distance,last=frames[frames.length-1],span=last.distance-first;
    if(span<=1e-9)throw Error('Geometry Graph Resample requires a nonzero sampled path.');
    const {sample,chord}=sampledPathMetric(linear);
    if(source.closed&&chord(frames[0].position,last.position)>1e-4)
        throw Error('Geometry Graph Resample requires coincident closed-loop endpoints.');
    const output:GraphFrame[]=[];
    let distance=0;
    for(let i=0;i<=count;i++){
        const f=sample(frames,i===count?last.distance:first+span*i/count);
        if(source.closed&&i===count){
            const initial=output[0];
            // Copy geometric seam, retain final width key (normally equal).
            f.position=initial.position;f.forward=initial.forward;f.right=initial.right;f.up=initial.up;
        }
        if(i>0){
            const step=chord(output[i-1].position,f.position);
            if(!finite(step)||step<=1e-9)throw Error('Geometry Graph Resample produced coincident consecutive samples.');
            distance+=step;
        }
        if(!finite(distance)||distance>1e9)throw Error('Geometry Graph Resample exceeded the distance budget.');
        output.push({...f,distance});
    }
    return {kind:'path',closed:source.closed,frames:output};
}
const meshCopy=(data:RoadGeometry):RoadGeometry=>({
    positions:data.positions.slice(),normals:data.normals.slice(),
    uvs:data.uvs.slice(),indices:data.indices.slice(),bands:data.bands,
    ringCount:data.ringCount,
});
const nodePort=(type:GeometryNodeType):GeometryPortType=>
    type==='meshAsset'?'meshSource':
    type==='ribbon'||type==='tube'||type==='extrude'||type==='meshDeform'||type==='output'?'mesh':'path';
const needInput=(type:GeometryNodeType):GeometryPortType|null=>
    type==='spline'||type==='meshAsset'?null:type==='output'?'mesh':'path';
/** Fail closed before copying untrusted imported mesh arrays into the runner.
 * 4096 vertices × 16 repeats <= 65536 output vertices.
 */
function validateImportedMesh(mesh:Readonly<MeshGeometry>|undefined):void{
    if(!mesh||!Array.isArray(mesh.positions)||!Array.isArray(mesh.indices))
        throw Error('Graph meshAsset needs a readable imported Mesh on the renderer.');
    const vertices=mesh.positions.length/3;
    if(!Number.isInteger(vertices)||vertices<3||vertices>4096||
       mesh.indices.length<3||mesh.indices.length>24576||mesh.indices.length%3!==0||
       mesh.positions.some(v=>!finite(v)||Math.abs(v)>1e6)||
       mesh.indices.some(v=>!Number.isInteger(v)||v<0||v>=vertices)||
       (mesh.uvs!==undefined&&(!Array.isArray(mesh.uvs)||
         mesh.uvs.length!==vertices*2||mesh.uvs.some(v=>!finite(v))))||
       (mesh.normals!==undefined&&(!Array.isArray(mesh.normals)||
         mesh.normals.length!==mesh.positions.length||
         mesh.normals.some(v=>!finite(v)))))
        throw Error('Graph meshAsset invalid/oversized. Max 4096 vertices, 24576 indices, one readable submesh.');
}

/** Validate structure AND numeric settings before any evaluation or cache write.
 * Reject missing IDs, cross-port connections, cycles and dead nodes.
 */
export function compileGeometryGraph(graph:GeometryGraph):GeometryGraphPlan{
    if(!graph||!Array.isArray(graph.nodes)||graph.nodes.length<3||
       graph.nodes.length>32||![1,2].includes(graph.version)||
       typeof graph.output!=='string')
        throw Error('Geometry Graph requires version 1 or 2, 3–32 nodes and one default output ID.');
    const multi=graph.version===GEOMETRY_GRAPH_MULTI_OUTPUT_VERSION;
    if(Object.keys(graph).some(k=>!['version','nodes','output'].includes(k)))
        throw Error('Unsupported Geometry Graph root property.');
    const table=new Map<string,GeometryGraphNode>();
    let sources=0,outputs=0,meshAssets=0;
    const occupiedMeshSlots=new Set<number>(),occupiedSplineSlots=new Set<number>();
    for(const node of graph.nodes){
        if(!node||typeof node.id!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(node.id)||
           !['spline','meshAsset','offset','transform','noise','reverse','clip','resample','conform','width','ribbon','tube','extrude','meshDeform','output'].includes(node.type)||table.has(node.id))
            throw Error('Invalid/duplicate Geometry Graph node ID or type.');
        const keys=['id','type',...(node.type==='spline'?['slot']:
            node.type==='meshAsset'?['slot']:
            node.type==='offset'?['input','right','up']:
            node.type==='transform'?['input','translateX','translateY','translateZ','rotateX','rotateY','rotateZ','pathScale']:
            node.type==='noise'?['input','noiseRight','noiseUp','noiseForward','noiseFrequency','noiseOctaves','noisePersistence','noisePhase','noiseSeed','noiseFadeEnds']:
            node.type==='clip'?['input','clipStart','clipEnd']:
            node.type==='resample'?['input','resampleSegments']:
            node.type==='conform'?['input','conformRayHeight','conformRayDepth','conformOffset','conformMinNormalY','conformMissing','conformAlign']:
            node.type==='width'?['input','multiplier','midMultiplier','endMultiplier','taperMode','widthKeys']:
            node.type==='ribbon'?['input','width','endWidth','uvMetersPerRepeat','thickness','capEnds','cornerMode']:
            node.type==='tube'?['input','radius','radialSegments','uvMetersPerRepeat','capEnds']:
            node.type==='extrude'?['input','width','height','profileShape','profileSlot','uvMetersPerRepeat','capEnds']:
            node.type==='meshDeform'?['input','meshInput','axis','width','height','deformShape','segments','repeats','repeatLayout','tileLength','uvMode','uvMetersPerRepeat']:
            ['input'])];
        onlyKeys(node as unknown as Record<string,unknown>,keys);
        if(node.type==='spline'){
            sources++;
            const slot=bound(node.slot===undefined?0:node.slot,0,2,'Spline source slot');
            if(!Number.isInteger(slot)||occupiedSplineSlots.has(slot))
                throw Error('Geometry Graph Spline slot must be a unique integer 0–2.');
            occupiedSplineSlots.add(slot);
        }
        if(node.type==='meshAsset'){
            meshAssets++;
            const slot=bound(node.slot??0,0,2,'Mesh Asset slot');
            if(!Number.isInteger(slot)||occupiedMeshSlots.has(slot))
                throw Error('Geometry Graph Mesh Asset slot must be an unused integer 0–2.');
            occupiedMeshSlots.add(slot);
        }
        if(node.type==='output')outputs++;
        if(node.type==='offset'){
            bound(node.right??0,-1000,1000,'offset right');
            bound(node.up??0,-1000,1000,'offset up');
        }
        if(node.type==='transform'){
            for(const k of ['translateX','translateY','translateZ'] as const)
                bound(node[k]??0,-1000,1000,'Transform '+k);
            for(const k of ['rotateX','rotateY','rotateZ'] as const)
                bound(node[k]??0,-360,360,'Transform '+k);
            bound(node.pathScale??1,.01,100,'Transform pathScale');
        }
        if(node.type==='noise'){
            const rules:Array<[keyof GeometryGraphNode,number,number,number,boolean?]>=[
                ['noiseRight',-1000,1000,0],['noiseUp',-1000,1000,0],['noiseForward',-1000,1000,0],
                ['noiseFrequency',1,64,4,true],['noiseOctaves',1,6,2,true],
                ['noisePersistence',0,1,.5],['noisePhase',-1000,1000,0],
                ['noiseSeed',-2147483647,2147483647,12345,true],['noiseFadeEnds',0,.5,.1],
            ];
            for(const [key,min,max,def,integer] of rules){
                const n=bound(node[key]===undefined?def:node[key],min,max,'Noise '+key);
                if(integer&&!Number.isInteger(n))throw Error('Geometry Graph Noise '+key+' must be an integer.');
            }
        }
        if(node.type==='clip'){
            const begin=bound(node.clipStart===undefined?0:node.clipStart,0,1,'Clip start');
            const end=bound(node.clipEnd===undefined?1:node.clipEnd,0,1,'Clip end');
            if(end-begin<.001-1e-12)throw Error('Geometry Graph Clip requires end >= start + 0.001.');
        }
        if(node.type==='resample'){
            const count=bound(node.resampleSegments===undefined?32:node.resampleSegments,3,1024,'Resample segments');
            if(!Number.isInteger(count))throw Error('Geometry Graph Resample segments must be an integer.');
        }
        if(node.type==='conform'){
            const h=bound(node.conformRayHeight===undefined?10:node.conformRayHeight,0,10000,'Conform ray height');
            const d=bound(node.conformRayDepth===undefined?50:node.conformRayDepth,0,10000,'Conform ray depth');
            if(h+d<=1e-6)throw Error('Geometry Graph Conform needs a nonzero ray range.');
            bound(node.conformOffset===undefined?0:node.conformOffset,-1000,1000,'Conform offset');
            bound(node.conformMinNormalY===undefined?.3:node.conformMinNormalY,0,1,'Conform normal Y');
            for(const k of ['conformMissing','conformAlign'] as const){
                const n=bound(node[k]===undefined?(k==='conformAlign'?1:0):node[k],0,1,'Conform '+k);
                if(!Number.isInteger(n))throw Error('Geometry Graph Conform mode must be 0 or 1.');
            }
        }
        if(node.type==='width'){
            if(node.widthKeys!==undefined){
                if(node.multiplier!==undefined||node.midMultiplier!==undefined||
                   node.endMultiplier!==undefined)
                    throw Error('Geometry Graph Width keys cannot mix with legacy multipliers.');
                validateWidthKeys(node.widthKeys);
            }
            bound(node.multiplier??1,.01,20,'width multiplier');
            if(node.midMultiplier!==undefined)
                bound(node.midMultiplier,.01,20,'width mid multiplier');
            if(node.endMultiplier!==undefined)
                bound(node.endMultiplier,.01,20,'width end multiplier');
            if(node.taperMode!==undefined){
                const mode=bound(node.taperMode,0,1,'width taper mode');
                if(!Number.isInteger(mode))
                    throw Error('Geometry Graph width taperMode must be an integer 0 or 1.');
            }
        }
        if(node.type==='ribbon'){
            bound(node.width??4,.05,100,'ribbon width');
            bound(node.endWidth??0,0,100,'ribbon end width');
            bound(node.uvMetersPerRepeat??5,.01,10000,'UV length');
            bound(node.thickness??0,0,20,'ribbon thickness');
            if(node.capEnds!==undefined&&typeof node.capEnds!=='boolean')
                throw Error('Geometry Graph capEnds must be a boolean.');
            if(node.cornerMode!==undefined&&![0,1].includes(node.cornerMode))
                throw Error('Unsupported Geometry Graph ribbon corner mode.');
        }
        if(node.type==='tube'){
            bound(node.radius??1,.025,50,'Tube radius');
            const segments=bound(node.radialSegments??12,3,32,'Tube radial segments');
            if(!Number.isInteger(segments))
                throw Error('Geometry Graph Tube radial segments must be an integer.');
            bound(node.uvMetersPerRepeat??5,.01,10000,'Tube UV length');
            if(node.capEnds!==undefined&&typeof node.capEnds!=='boolean')
                throw Error('Geometry Graph Tube capEnds must be a boolean.');
        }
        if(node.type==='extrude'){
            if(node.profileSlot!==undefined){
                const slot=bound(node.profileSlot,0,2,'Extrude profileSlot');
                if(!Number.isInteger(slot))throw Error('Geometry Graph Extrude profileSlot must be an integer.');
            }
            bound(node.width??1,.05,100,'Extrude width');
            bound(node.height??1,.05,100,'Extrude height');
            const shape=bound(node.profileShape??0,0,2,'Extrude profileShape');
            if(!Number.isInteger(shape))
                throw Error('Geometry Graph Extrude profileShape must be an integer.');
            bound(node.uvMetersPerRepeat??5,.01,10000,'Extrude UV length');
            if(node.capEnds!==undefined&&typeof node.capEnds!=='boolean')
                throw Error('Geometry Graph Extrude capEnds must be a boolean.');
        }
        if(node.type==='meshDeform'){
            const axis=bound(node.axis??2,0,2,'Mesh Deform axis');
            if(!Number.isInteger(axis))throw Error('Geometry Graph Mesh Deform axis must be X, Y, or Z.');
            bound(node.width??1,.05,100,'Mesh Deform width');
            bound(node.height??1,.05,100,'Mesh Deform height');
            const preset=bound(node.deformShape??0,0,1,'Mesh Deform shape');
            const segments=bound(node.segments??12,2,64,'Mesh Deform segments');
            const repeats=bound(node.repeats??1,1,16,'Mesh Deform repeats');
            const layout=bound(node.repeatLayout??0,0,1,'Mesh Deform repeat layout');
            const uv=bound(node.uvMode??2,0,2,'Mesh Deform UV mode');
            if(!Number.isInteger(preset)||!Number.isInteger(segments)||
               !Number.isInteger(repeats)||!Number.isInteger(layout)||
               !Number.isInteger(uv))
                throw Error('Geometry Graph Mesh Deform shape, segments, repeats, repeatLayout and uvMode must be integers.');
            // 0 keeps native source-axis length; positive override is local units.
            const tileLength=bound(node.tileLength??0,0,10000,'Mesh Deform tile length');
            if(tileLength>0&&tileLength<.01)
                throw Error('Geometry Graph tileLength must be 0 or >= 0.01.');
            bound(node.uvMetersPerRepeat??5,.01,10000,'Mesh Deform UV length');
        }
        table.set(node.id,{...node});
    }
    if(sources<1||sources>(multi?3:1)||meshAssets>3||(!multi&&outputs!==1)||
       (multi&&(outputs<2||outputs>4))||table.get(graph.output)?.type!=='output')
        throw Error('Geometry Graph requires one v1 spline/output or 1–3 v2 splines and 2–4 v2 outputs, and a valid default output.');
    for(const node of table.values()){
        const expected=needInput(node.type);
        if(expected===null){
            if(node.input!==undefined||node.meshInput!==undefined)
                throw Error('Graph source node cannot have an input.');
        }else{
            if(typeof node.input!=='string'||!table.has(node.input))
                throw Error('Missing Geometry Graph input for '+node.id+'.');
            const linked=table.get(node.input)!;
            if(nodePort(linked.type)!==expected)
                throw Error('Geometry Graph type mismatch at '+node.id+'.');
        }
        if(node.type==='meshDeform'&&node.meshInput!==undefined){
            if(typeof node.meshInput!=='string'||!table.has(node.meshInput)||
               table.get(node.meshInput)!.type!=='meshAsset')
                throw Error('Geometry Graph meshDeform meshInput requires a meshAsset node.');
        }
    }
    const state=new Map<string,number>(),order:GeometryGraphNode[]=[];
    const visit=(id:string):void=>{
        const flag=state.get(id)||0;
        if(flag===1)throw Error('Geometry Graph cycle detected at '+id+'.');
        if(flag===2)return;
        state.set(id,1);
        const node=table.get(id)!;
        if(node.input)visit(node.input);
        if(node.meshInput)visit(node.meshInput);
        state.set(id,2);order.push(node);
    };
    visit(graph.output);
    const outputIds=Array.from(table.values()).filter(n=>n.type==='output')
        .map(n=>n.id).sort();
    if(multi)for(const id of outputIds)visit(id);
    if(order.length!==table.size)
        throw Error('Geometry Graph contains disconnected nodes. Connect or remove them.');
    return multi?
        {nodes:order,output:graph.output,version:2,outputs:outputIds}:
        {nodes:order,output:graph.output};
}
/** String is stored as a serialized component property: bound size and reject
 * prototype/dynamic fields before processing. No eval or arbitrary callbacks.
 */
export function parseGeometryGraph(text:string):GeometryGraphPlan{
    if(typeof text!=='string'||text.length<2||text.length>16384)
        throw Error('Geometry Graph JSON must be 2–16384 characters.');
    let raw:unknown;
    try{raw=JSON.parse(text);}catch{throw Error('Invalid Geometry Graph JSON syntax.');}
    return compileGeometryGraph(raw as GeometryGraph);
}
function validateFrames(context:GeometryGraphSplineSource):void{
    if(!context||typeof context.revision!=='string'||context.revision.length<1||
       context.revision.length>8192||typeof context.closed!=='boolean'||
       !Array.isArray(context.frames)||context.frames.length<2||
       context.frames.length>1025)
        throw Error('Geometry Graph requires 2–1025 bounded source frames and a revision.');
    let previous=-Infinity;
    for(const f of context.frames){
        if(!f||![f.position,f.forward,f.right,f.up].every(vec)||
           !finite(f.distance)||f.distance<0||f.distance<previous||
           f.distance>1e9)
            throw Error('Geometry Graph source frames contain invalid or unordered geometry.');
        previous=f.distance;
    }
}
function validateMesh(m:RoadGeometry):void{
    const vertices=m.positions.length/3;
    if(!Number.isInteger(vertices)||vertices<4||vertices>65536||
       m.normals.length!==m.positions.length||m.uvs.length!==vertices*2||
       m.indices.length<3||m.indices.length>393216||
       m.indices.length%3!==0||
       ![...m.positions,...m.normals,...m.uvs].every(x=>finite(x)&&Math.abs(x)<=1e8)||
       m.indices.some(i=>!Number.isInteger(i)||i<0||i>=vertices))
        throw Error('Geometry Graph generated invalid or oversized mesh geometry.');
}
export interface GeometryGraphMetrics {computed:number;reused:number;nodes:number}
/** Timings measure synchronous per-node graph evaluation only; they exclude
 * Bezier frame sampling, graph compilation, mesh uploads and gizmo generation.
 * Cached nodes report zero compute time rather than misleading elapsed time.
 */
export interface GeometryNodeTiming {
    id:string;type:GeometryNodeType;cached:boolean;durationMs:number;
}
export interface GeometryGraphProfile {
    totalMs:number;computed:number;reused:number;nodes:GeometryNodeTiming[];
}
const defaultProfileClock=():number=>{
    const p=(globalThis as unknown as {performance?:{now?:()=>number}}).performance;
    return typeof p?.now==='function'?p.now():Date.now();
};
const elapsedMs=(start:number,end:number):number=>{
    if(!finite(start)||!finite(end))return 0;
    return Math.round(Math.min(60000,Math.max(0,end-start))*1000)/1000;
};
/** Atomic per-node cache. If any node fails, previous cache/output remain valid.
 * A downstream node recomputes iff its own settings or an input version changes.
 */
export class GeometryGraphRunner {
    private cache=new Map<string,CacheEntry>();
    private sequence=0;
    private last:GeometryGraphMetrics={computed:0,reused:0,nodes:0};
    private profileEnabled=false;
    private lastProfile:GeometryGraphProfile|null=null;
    constructor(private readonly profileClock:()=>number=defaultProfileClock){}
    get metrics():GeometryGraphMetrics{return {...this.last};}
    /** Null before first profiled success. Clone all arrays to protect cache. */
    get profile():GeometryGraphProfile|null{
        const p=this.lastProfile;
        return p?{...p,nodes:p.nodes.map(n=>({...n}))}:null;
    }
    setProfilingEnabled(enabled:boolean):void{this.profileEnabled=enabled===true;}
    clear():void{this.cache.clear();this.lastProfile=null;}
    evaluate(plan:GeometryGraphPlan,context:GeometryGraphContext,
        selectedOutputId?:string):RoadGeometry{
        // Compile the supplied plan afresh for defensiveness against JS mutation.
        const checked=compileGeometryGraph({
            version:plan.version??1,nodes:plan.nodes,output:plan.output,
        });
        const requested=selectedOutputId===undefined||selectedOutputId===''?
            checked.output:selectedOutputId;
        if(requested!==checked.output&&
           !(checked.outputs?.includes(requested)))
            throw Error('Geometry Graph selected Output Node does not exist: '+String(requested));
        const splineSlots=new Map<number,GeometryGraphSplineSource>();
        if(context.splineSources!==undefined&&(!Array.isArray(context.splineSources)||context.splineSources.length>3))
            throw Error('Geometry Graph accepts at most three spline source slots.');
        for(const node of checked.nodes)if(node.type==='spline'){
            const slot=node.slot??0;
            const source=context.splineSources===undefined?(slot===0?context:undefined):context.splineSources[slot];
            if(!source)throw Error('Geometry Graph missing Spline source slot '+slot+'.');
            validateFrames(source);splineSlots.set(slot,source);
        }
        const next=new Map<string,CacheEntry>();
        let computed=0,reused=0;
        const timings:GeometryNodeTiming[]|null=this.profileEnabled?[]:null;
        let totalMs=0;
        const seqBase=this.sequence;
        try{
            for(const node of checked.nodes){
                const input=node.input?next.get(node.input):undefined;
                const splineSource=node.type==='spline'?splineSlots.get(node.slot??0):undefined;
                const key=JSON.stringify([
                    node,
                    splineSource?.revision??null,
                    splineSource?.closed??null,
                    node.type==='meshAsset'?
                        (context.meshRevisions?.[node.slot??0]??
                         ((node.slot??0)===0?context.meshRevision:null)):null,
                    input?.version??null,
                    node.meshInput?next.get(node.meshInput)?.version??null:null,
                    node.type==='extrude'&&node.profileSlot!==undefined?
                        context.profileRevisions?.[node.profileSlot]??null:null,
                    ['transform','noise','clip','resample','conform'].includes(node.type)?context.worldUvLinear??null:null,
                    node.type==='conform'?[context.conformSurface?.revision??null,context.conformSurface?.origin??null,context.conformSurface?.targetCount??null]:null,
                    // World-space Profile UV also depends on this transform.
                    // It invalidates its Extrude branch even when a pure Core
                    // caller changes matrix without changing frame revision.
                    node.type==='extrude'&&node.profileSlot!==undefined&&
                        context.profileUVs?.[node.profileSlot]?.uWorldSpace===true?
                            context.worldUvLinear??null:null,
                ]);
                const prior=this.cache.get(node.id);
                if(prior?.key===key){
                    next.set(node.id,prior);reused++;
                    if(timings)timings.push({id:node.id,type:node.type,cached:true,durationMs:0});
                    continue;
                }
                const start=timings?this.profileClock():0;
                const source=input?.value;
                let value:GraphValue;
                if(node.type==='spline'){
                    value={kind:'path',frames:deepCopyFrames(splineSource!.frames),closed:splineSource!.closed};
                }else if(node.type==='meshAsset'){
                    const slot=node.slot??0;
                    const revision=context.meshRevisions?.[slot]??
                        (slot===0?context.meshRevision:undefined);
                    if(typeof revision!=='string'||!revision||revision.length>256)
                        throw Error('Graph meshAsset slot '+slot+' requires a bounded mesh revision.');
                    const imported=context.meshSources?.[slot]??
                        (slot===0?context.meshSource:undefined);
                    validateImportedMesh(imported);
                    const data=imported!;
                    value={kind:'meshSource',geometry:{
                        positions:data.positions.slice(),indices:data.indices.slice(),
                        uvs:data.uvs?.slice(),normals:data.normals?.slice(),
                    }};
                }else if(node.type==='offset'){
                    if(source?.kind!=='path')throw Error('Geometry Graph offset input is not a path.');
                    const right=node.right??0,up=node.up??0;
                    value={kind:'path',closed:source.closed,frames:source.frames.map(f=>({
                        ...f,position:{
                            x:f.position.x+f.right.x*right+f.up.x*up,
                            y:f.position.y+f.right.y*right+f.up.y*up,
                            z:f.position.z+f.right.z*right+f.up.z*up,
                        },
                    }))};
                }else if(node.type==='transform'){
                    if(source?.kind!=='path')throw Error('Geometry Graph Transform input is not a path.');
                    value=transformPath(source,node,context.worldUvLinear);
                }else if(node.type==='noise'){
                    if(source?.kind!=='path')throw Error('Geometry Graph Noise input is not a path.');
                    value=noisePath(source,node,context.worldUvLinear);
                }else if(node.type==='reverse'){
                    if(source?.kind!=='path')throw Error('Geometry Graph Reverse input is not a path.');
                    value=reversePath(source);
                }else if(node.type==='clip'){
                    if(source?.kind!=='path')throw Error('Geometry Graph Clip input is not a path.');
                    value=clipPath(source,node,context.worldUvLinear);
                }else if(node.type==='resample'){
                    if(source?.kind!=='path')throw Error('Geometry Graph Resample input is not a path.');
                    value=resamplePath(source,node,context.worldUvLinear);
                }else if(node.type==='conform'){
                    if(source?.kind!=='path')throw Error('Geometry Graph Conform input is not a path.');
                    value=conformPath(source,node,context);
                }else if(node.type==='width'){
                    if(source?.kind!=='path')throw Error('Geometry Graph width input is not a path.');
                    const keys=node.widthKeys;
                    const start=keys?keys[0].multiplier:node.multiplier??1;
                    const end=keys?keys[keys.length-1].multiplier:node.endMultiplier??start;
                    const middle=node.midMultiplier??(start+end)/2;
                    const eased=node.taperMode===1;
                    if(source.closed&&Math.abs(start-end)>1e-8)
                        throw Error('Geometry Graph closed spline Width curve requires equal Start and End multipliers.');
                    const frames=source.frames;
                    const first=frames[0].distance,last=frames[frames.length-1].distance;
                    const span=last-first;
                    if(span<1e-8&&(keys?
                        keys.some(key=>Math.abs(key.multiplier-start)>1e-8):
                        Math.abs(start-middle)>1e-8||Math.abs(middle-end)>1e-8))
                        throw Error('Geometry Graph Width curve needs nonzero spline length.');
                    const smooth=(t:number):number=>eased?t*t*(3-2*t):t;
                    value={kind:'path',closed:source.closed,frames:frames.map(f=>{
                        const t=span>1e-8?
                            Math.min(1,Math.max(0,(f.distance-first)/span)):0;
                        let taper:number;
                        if(keys){
                            let nextIndex=1;
                            while(nextIndex<keys.length-1&&t>keys[nextIndex].progress)
                                nextIndex++;
                            const before=keys[nextIndex-1],after=keys[nextIndex];
                            const local=(t-before.progress)/(after.progress-before.progress);
                            taper=before.multiplier+(after.multiplier-before.multiplier)*
                                smooth(Math.min(1,Math.max(0,local)));
                        }else{
                            const part=t<=.5?smooth(t*2):smooth((t-.5)*2);
                            taper=t<=.5?
                                start+(middle-start)*part:
                                middle+(end-middle)*part;
                        }
                        const widthFactor=f.widthFactor*taper;
                        if(!Number.isFinite(widthFactor)||
                           widthFactor<1e-4||widthFactor>1000)
                            throw Error('Geometry Graph Width curve produced invalid frame scale.');
                        return {...f,widthFactor};
                    })};
                }else if(node.type==='ribbon'){
                    if(source?.kind!=='path')throw Error('Geometry Graph ribbon input is not a path.');
                    const width=node.width??4,thickness=node.thickness??0;
                    const frames=source.frames;
                    const settings={
                        width,endWidth:node.endWidth??0,
                        shoulderWidth:0,shoulderDrop:0,curbWidth:0,curbHeight:0,
                        thickness,capEnds:node.capEnds??false,
                        uvLength:node.uvMetersPerRepeat??5,
                        startProgress:0,endProgress:1,
                        widthAt:(i:number)=>frames[i].widthFactor,
                        cornerMode:(node.cornerMode??0) as RoadCornerMode,
                    };
                    const geometry=buildRoadGeometry(frames,settings,source.closed);
                    validateMesh(geometry);
                    value={kind:'mesh',geometry};
                }else if(node.type==='tube'){
                    if(source?.kind!=='path')throw Error('Geometry Graph Tube input is not a path.');
                    const geometry=buildTubeGeometry(source.frames,{
                        radius:node.radius??1,
                        radialSegments:node.radialSegments??12,
                        uvMetersPerRepeat:node.uvMetersPerRepeat??5,
                        capEnds:node.capEnds??false,
                    },source.closed);
                    validateMesh(geometry);
                    value={kind:'mesh',geometry};
                }else if(node.type==='extrude'){
                    if(source?.kind!=='path')throw Error('Geometry Graph Extrude input is not a path.');
                    let authored:ReadonlyArray<Readonly<GraphProfilePoint>>|undefined;
                    let authoredUV:Readonly<GraphProfileUV>|undefined;
                    let authoredHoles:ReadonlyArray<ReadonlyArray<Readonly<GraphProfilePoint>>>|undefined;
                    let authoredOuterContours:ReadonlyArray<ReadonlyArray<Readonly<GraphProfilePoint>>>|undefined;
                    let authoredOuterHoles:ReadonlyArray<ReadonlyArray<ReadonlyArray<Readonly<GraphProfilePoint>>>>|undefined;
                    if(node.profileSlot!==undefined){
                        const slot=node.profileSlot,revision=context.profileRevisions?.[slot];
                        if(typeof revision!=='string'||!revision||revision.length>32768)
                            throw Error('Graph Profile Asset slot '+slot+' requires a valid revision.');
                        const profile=parseGraphProfileAsset({format:'cocos-splines/profile',
                            version:1,points:context.profileSources?.[slot],
                            ...(context.profileHoles?.[slot]===undefined?{}:{holes:context.profileHoles[slot]}),
                            ...(context.profileOuterContours?.[slot]===undefined?{}:{outerContours:context.profileOuterContours[slot]}),
                            ...(context.profileOuterHoles?.[slot]===undefined?{}:{outerHoles:context.profileOuterHoles[slot]}),
                            ...(context.profileUVs?.[slot]===undefined?{}:{uv:context.profileUVs[slot]})});
                        authored=profile.points;authoredUV=profile.uv;authoredHoles=profile.holes;authoredOuterContours=profile.outerContours;authoredOuterHoles=profile.outerHoles;
                    }
                    const geometry=buildProfileExtrudeGeometry(source.frames,{
                        width:node.width??1,height:node.height??1,
                        profileShape:(node.profileShape??0) as GraphProfileShape,
                        profile:authored,profileUV:authoredUV,profileHoles:authoredHoles,profileOuterContours:authoredOuterContours,profileOuterHoles:authoredOuterHoles,
                        worldUvLinear:context.worldUvLinear,
                        uvMetersPerRepeat:node.uvMetersPerRepeat??5,
                        capEnds:node.capEnds??false,
                    },source.closed);
                    validateMesh(geometry);
                    value={kind:'mesh',geometry};
                }else if(node.type==='meshDeform'){
                    if(source?.kind!=='path')throw Error('Geometry Graph Mesh Deform input is not a path.');
                    const meshSource=node.meshInput?next.get(node.meshInput)?.value:undefined;
                    if(node.meshInput&&meshSource?.kind!=='meshSource')
                        throw Error('Geometry Graph meshInput did not resolve to a Mesh Asset.');
                    const geometry=buildGraphMeshDeformGeometry(source.frames,{
                        width:node.width??1,
                        height:node.height??1,
                        deformShape:node.deformShape??0,
                        axis:node.axis??2,
                        segments:node.segments??12,
                        repeats:node.repeats??1,
                        repeatLayout:node.repeatLayout??0,
                        tileLength:node.tileLength??0,
                        uvMode:node.uvMode??2,
                        uvMetersPerRepeat:node.uvMetersPerRepeat??5,
                    },source.closed,meshSource?.kind==='meshSource'?meshSource.geometry:undefined);
                    validateMesh(geometry);
                    value={kind:'mesh',geometry};
                }else{
                    if(source?.kind!=='mesh')throw Error('Geometry Graph output input is not a mesh.');
                    value=source;
                }
                // The internal values are not exposed to callers; only a clone
                // is returned from the selected output.
                next.set(node.id,{key,version:++this.sequence,value});
                computed++;
                if(timings){
                    const durationMs=elapsedMs(start,this.profileClock());
                    totalMs+=durationMs;
                    timings.push({id:node.id,type:node.type,cached:false,durationMs});
                }
            }
            const result=next.get(requested)?.value;
            if(result?.kind!=='mesh')throw Error('Geometry Graph output was not a mesh.');
            // Commit the cache and profile only after successful cloning.
            // A failed graph evaluation keeps the last successful report.
            const output=meshCopy(result.geometry);
            this.cache=next;
            this.last={computed,reused,nodes:checked.nodes.length};
            if(timings)this.lastProfile={
                totalMs:Math.round(totalMs*1000)/1000,
                computed,reused,nodes:timings,
            };
            return output;
        }catch(error){
            this.sequence=seqBase;throw error;
        }
    }
    /** Compute and clone every declared output in one bounded, atomic pass.
     * Renderer consumers can instead request a single output via evaluate().
     */
    evaluateOutputs(plan:GeometryGraphPlan,context:GeometryGraphContext):
        Record<string,RoadGeometry>{
        const checked=compileGeometryGraph({
            version:plan.version??1,nodes:plan.nodes,output:plan.output,
        });
        this.evaluate(checked,context);
        const meshes:Record<string,RoadGeometry>={};
        for(const id of checked.outputs??[checked.output]){
            const value=this.cache.get(id)?.value;
            if(value?.kind!=='mesh')
                throw Error('Geometry Graph output was not a mesh: '+id);
            meshes[id]=meshCopy(value.geometry);
        }
        return meshes;
    }
}
