/**
 * Phase 4.1 — bounded, typed and deterministic procedural geometry DAG.
 * Pure graph compilation/evaluation; Cocos objects remain outside this Core.
 * Reuses the canonical Road tessellator, never mutates a source Mesh/Spline.
 */
import {buildRoadGeometry, RoadCornerMode, RoadFrame, RoadGeometry} from './SplineRoadMath';
import {buildTubeGeometry} from './SplineTubeMath';
import {buildProfileExtrudeGeometry,GraphProfileShape} from './SplineProfileExtrudeMath';
import {buildGraphMeshDeformGeometry} from './SplineGraphMeshDeformMath';

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
export type GeometryNodeType='spline'|'offset'|'width'|'ribbon'|'tube'|'extrude'|'meshDeform'|'output';
export type GeometryPortType='path'|'mesh';
export interface GeometryGraphNode {
    id:string;type:GeometryNodeType;
    input?:string;
    right?:number;up?:number;
    multiplier?:number;
    width?:number;endWidth?:number;uvMetersPerRepeat?:number;
    thickness?:number;capEnds?:boolean;cornerMode?:number;
    radius?:number;radialSegments?:number;
    height?:number;profileShape?:number;
    deformShape?:number;segments?:number;repeats?:number;
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
type GraphValue=GraphPath|GraphMesh;
interface CacheEntry {key:string;version:number;value:GraphValue}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const bound=(x:unknown,min:number,max:number,name:string):number=>{
    if(!finite(x)||x<min||x>max)throw Error('Geometry Graph '+name+' must be between '+min+' and '+max+'.');
    return x;
};
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
    type==='ribbon'||type==='tube'||type==='extrude'||type==='meshDeform'||type==='output'?'mesh':'path';
const needInput=(type:GeometryNodeType):GeometryPortType|null=>
    type==='spline'?null:type==='output'?'mesh':'path';
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
    let sources=0,outputs=0;
    for(const node of graph.nodes){
        if(!node||typeof node.id!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(node.id)||
           !['spline','offset','width','ribbon','tube','extrude','meshDeform','output'].includes(node.type)||table.has(node.id))
            throw Error('Invalid/duplicate Geometry Graph node ID or type.');
        const keys=['id','type',...(node.type==='spline'?[]:
            node.type==='offset'?['input','right','up']:
            node.type==='width'?['input','multiplier']:
            node.type==='ribbon'?['input','width','endWidth','uvMetersPerRepeat','thickness','capEnds','cornerMode']:
            node.type==='tube'?['input','radius','radialSegments','uvMetersPerRepeat','capEnds']:
            node.type==='extrude'?['input','width','height','profileShape','uvMetersPerRepeat','capEnds']:
            node.type==='meshDeform'?['input','width','height','deformShape','segments','repeats','uvMetersPerRepeat']:
            ['input'])];
        onlyKeys(node as unknown as Record<string,unknown>,keys);
        if(node.type==='spline')sources++;
        if(node.type==='output')outputs++;
        if(node.type==='offset'){
            bound(node.right??0,-1000,1000,'offset right');
            bound(node.up??0,-1000,1000,'offset up');
        }
        if(node.type==='width')bound(node.multiplier??1,.01,20,'width multiplier');
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
            bound(node.width??1,.05,100,'Mesh Deform width');
            bound(node.height??1,.05,100,'Mesh Deform height');
            const preset=bound(node.deformShape??0,0,1,'Mesh Deform shape');
            const segments=bound(node.segments??12,2,64,'Mesh Deform segments');
            const repeats=bound(node.repeats??1,1,16,'Mesh Deform repeats');
            if(!Number.isInteger(preset)||!Number.isInteger(segments)||!Number.isInteger(repeats))
                throw Error('Geometry Graph Mesh Deform preset, segments and repeats must be integers.');
            bound(node.uvMetersPerRepeat??5,.01,10000,'Mesh Deform UV length');
        }
        table.set(node.id,{...node});
    }
    if(sources!==1||(!multi&&outputs!==1)||
       (multi&&(outputs<2||outputs>4))||table.get(graph.output)?.type!=='output')
        throw Error('Geometry Graph requires one spline source, one v1 output or 2–4 v2 outputs, and a valid default output.');
    for(const node of table.values()){
        const expected=needInput(node.type);
        if(expected===null){
            if(node.input!==undefined)throw Error('Spline source cannot have an input.');
        }else{
            if(typeof node.input!=='string'||!table.has(node.input))
                throw Error('Missing Geometry Graph input for '+node.id+'.');
            const linked=table.get(node.input)!;
            if(nodePort(linked.type)!==expected)
                throw Error('Geometry Graph type mismatch at '+node.id+'.');
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
/** Atomic per-node cache. If any node fails, previous cache/output remain valid.
 * A downstream node recomputes iff its own settings or an input version changes.
 */
export class GeometryGraphRunner {
    private cache=new Map<string,CacheEntry>();
    private sequence=0;
    private last:GeometryGraphMetrics={computed:0,reused:0,nodes:0};
    get metrics():GeometryGraphMetrics{return {...this.last};}
    clear():void{this.cache.clear();}
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
        const seqBase=this.sequence;
        try{
            for(const node of checked.nodes){
                const input=node.input?next.get(node.input):undefined;
                const key=JSON.stringify([
                    node,
                    node.type==='spline'?context.revision:null,
                    node.type==='spline'?context.closed:null,
                    input?.version??null,
                ]);
                const prior=this.cache.get(node.id);
                if(prior?.key===key){
                    next.set(node.id,prior);reused++;continue;
                }
                const source=input?.value;
                let value:GraphValue;
                if(node.type==='spline'){
                    value={kind:'path',frames:deepCopyFrames(context.frames),closed:context.closed};
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
                    value={kind:'path',closed:source.closed,frames:source.frames.map(f=>({
                        ...f,widthFactor:f.widthFactor*(node.multiplier??1),
                    }))};
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
                    const geometry=buildProfileExtrudeGeometry(source.frames,{
                        width:node.width??1,height:node.height??1,
                        profileShape:(node.profileShape??0) as GraphProfileShape,
                        uvMetersPerRepeat:node.uvMetersPerRepeat??5,
                        capEnds:node.capEnds??false,
                    },source.closed);
                    validateMesh(geometry);
                    value={kind:'mesh',geometry};
                }else if(node.type==='meshDeform'){
                    if(source?.kind!=='path')throw Error('Geometry Graph Mesh Deform input is not a path.');
                    const geometry=buildGraphMeshDeformGeometry(source.frames,{
                        width:node.width??1,
                        height:node.height??1,
                        deformShape:node.deformShape??0,
                        segments:node.segments??12,
                        repeats:node.repeats??1,
                        uvMetersPerRepeat:node.uvMetersPerRepeat??5,
                    },source.closed);
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
            }
            const result=next.get(requested)?.value;
            if(result?.kind!=='mesh')throw Error('Geometry Graph output was not a mesh.');
            this.cache=next;
            this.last={computed,reused,nodes:checked.nodes.length};
            return meshCopy(result.geometry);
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
