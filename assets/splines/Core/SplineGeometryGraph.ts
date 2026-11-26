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
export type GeometryNodeType='spline'|'meshAsset'|'offset'|'width'|'ribbon'|'tube'|'extrude'|'meshDeform'|'output';
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
export interface GeometryGraphContext {
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
    /** Optional UV0 side-band metadata for the same authored Profile slots. */
    profileUVs?:ReadonlyArray<Readonly<GraphProfileUV>|undefined>;
    profileRevisions?:ReadonlyArray<string|undefined>;
    /** Cocos renderer's local->world 3x3 linear transform, column-major.
     * This is separate from frames, which remain in renderer-local space.
     */
    worldUvLinear?:ReadonlyArray<number>;
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
    const occupiedMeshSlots=new Set<number>();
    for(const node of graph.nodes){
        if(!node||typeof node.id!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(node.id)||
           !['spline','meshAsset','offset','width','ribbon','tube','extrude','meshDeform','output'].includes(node.type)||table.has(node.id))
            throw Error('Invalid/duplicate Geometry Graph node ID or type.');
        const keys=['id','type',...(node.type==='spline'?[]:
            node.type==='meshAsset'?['slot']:
            node.type==='offset'?['input','right','up']:
            node.type==='width'?['input','multiplier','midMultiplier','endMultiplier','taperMode','widthKeys']:
            node.type==='ribbon'?['input','width','endWidth','uvMetersPerRepeat','thickness','capEnds','cornerMode']:
            node.type==='tube'?['input','radius','radialSegments','uvMetersPerRepeat','capEnds']:
            node.type==='extrude'?['input','width','height','profileShape','profileSlot','uvMetersPerRepeat','capEnds']:
            node.type==='meshDeform'?['input','meshInput','axis','width','height','deformShape','segments','repeats','repeatLayout','tileLength','uvMode','uvMetersPerRepeat']:
            ['input'])];
        onlyKeys(node as unknown as Record<string,unknown>,keys);
        if(node.type==='spline')sources++;
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
    if(sources!==1||meshAssets>3||(!multi&&outputs!==1)||
       (multi&&(outputs<2||outputs>4))||table.get(graph.output)?.type!=='output')
        throw Error('Geometry Graph requires one spline source, one v1 output or 2–4 v2 outputs, and a valid default output.');
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
function validateFrames(context:GeometryGraphContext):void{
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
        validateFrames(context);
        const next=new Map<string,CacheEntry>();
        let computed=0,reused=0;
        const timings:GeometryNodeTiming[]|null=this.profileEnabled?[]:null;
        let totalMs=0;
        const seqBase=this.sequence;
        try{
            for(const node of checked.nodes){
                const input=node.input?next.get(node.input):undefined;
                const key=JSON.stringify([
                    node,
                    node.type==='spline'?context.revision:null,
                    node.type==='spline'?context.closed:null,
                    node.type==='meshAsset'?
                        (context.meshRevisions?.[node.slot??0]??
                         ((node.slot??0)===0?context.meshRevision:null)):null,
                    input?.version??null,
                    node.meshInput?next.get(node.meshInput)?.version??null:null,
                    node.type==='extrude'&&node.profileSlot!==undefined?
                        context.profileRevisions?.[node.profileSlot]??null:null,
                    // Only world-space Profile UV depends on this transform.
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
                    value={kind:'path',frames:deepCopyFrames(context.frames),closed:context.closed};
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
                    if(node.profileSlot!==undefined){
                        const slot=node.profileSlot,revision=context.profileRevisions?.[slot];
                        if(typeof revision!=='string'||!revision||revision.length>2048)
                            throw Error('Graph Profile Asset slot '+slot+' requires a valid revision.');
                        const profile=parseGraphProfileAsset({format:'cocos-splines/profile',
                            version:1,points:context.profileSources?.[slot],
                            ...(context.profileUVs?.[slot]===undefined?{}:{uv:context.profileUVs[slot]})});
                        authored=profile.points;authoredUV=profile.uv;
                    }
                    const geometry=buildProfileExtrudeGeometry(source.frames,{
                        width:node.width??1,height:node.height??1,
                        profileShape:(node.profileShape??0) as GraphProfileShape,
                        profile:authored,profileUV:authoredUV,
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
