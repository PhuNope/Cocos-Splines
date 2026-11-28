/** Data-only population DAG. No engine/Scene dependencies or executable JSON.
 * Input paths are immutable snapshots in WORLD space with cumulative distance.
 * Each stage owns its data; a failed evaluation never publishes partial output.
 */
import type {PlacementDiagnostic,PlacementReason,PopulationGraphStageSummary} from './SplinePlacementDiagnostics';
import {planPopulation,populationGate,validatePopulationPolicy} from './SplinePopulationMath';
import type {PopulationCandidate,PopulationDensityKey,PopulationExclusion,PopulationVector} from './SplinePopulationMath';
import {selectWeightedPrefab,validatePrefabWeights} from './SplinePopulationPlacementMath';
import {distributionDistances,inPopulationProgressRange} from './SplinePopulationDistributionMath';
import {validateSurfaceSettings,projectSurfaceCandidates} from './SplinePopulationSurfaceMath';
import type {PopulationSurfaceRaycast} from './SplinePopulationSurfaceMath';
import {filterPopulationShapeCandidates} from './SplinePopulationPreciseMath';
import type {PopulationObstacleShape} from './SplinePopulationPreciseMath';
import {offsetPopulationPoint,rotatePopulationPoint,scalePopulationPoint,alignPopulationPoint} from './SplinePopulationTransformMath';
export type PopulationGraphPort='path'|'candidates'|'instances';
export type PopulationGraphNodeType='spline'|'count'|'spacing'|'random'|'jitter'|'range'|'density'|'offset'|'rotation'|'scale'|'align'|'surface'|'obstacle'|'prefab'|'output';
export interface PopulationGraphFrame {
    position:PopulationVector;forward:PopulationVector;up:PopulationVector;distance:number;
}
export interface PopulationGraphSource {
    frames:ReadonlyArray<PopulationGraphFrame>;closed:boolean;revision:string;
}
export interface PopulationGraphNode {
    id:string;type:PopulationGraphNodeType;input?:string;slot?:number;
    count?:number;includeEnd?:boolean;density?:number;seed?:number;
    spacing?:number;jitter?:number;startProgress?:number;endProgress?:number;
    densityKeys?:PopulationDensityKey[];exclusions?:PopulationExclusion[];minWorldSpacing?:number;
    weights?:number[];
    offset?:PopulationVector;space?:'frame'|'world';
    minDegrees?:PopulationVector;maxDegrees?:PopulationVector;
    minScale?:number;maxScale?:number;alignment?:'upright'|'surface'|'world';
    rayHeight?:number;rayDepth?:number;surfaceOffset?:number;minNormalY?:number;skipMissing?:boolean;
    clearance?:number;footprintRadius?:number;
}
export interface PopulationGraph {version:1;nodes:PopulationGraphNode[];output:string}
export interface PopulationGraphPlan {readonly nodes:ReadonlyArray<Readonly<PopulationGraphNode>>;readonly output:string}
export interface PopulationGraphContext {
    sources:ReadonlyArray<PopulationGraphSource|undefined>;
    /** Native host will resolve these slots later. No Prefab refs in JSON. */
    prefabSlotCount:number;
    /** Host snapshots: revision must change when targets, transforms or query results change. */
    surface?:{revision:string;targetCount:number;raycast:PopulationSurfaceRaycast};
    obstacles?:{revision:string;shapes:ReadonlyArray<PopulationObstacleShape>};
}
export interface PopulationGraphPoint extends PopulationCandidate {
    distance:number;forward:PopulationVector;up:PopulationVector;
    /** Uniform multiplier of authored prefab scale; omitted means 1. */
    scale?:number;
    surfaceNormal?:PopulationVector|null;
}
export interface PopulationGraphInstance extends PopulationGraphPoint {prefabSlot:number}
export interface PopulationGraphMetrics {computed:number;reused:number;nodes:number}
export interface PopulationGraphResult {
    instances:PopulationGraphInstance[];
    metrics:PopulationGraphMetrics;
    /** Populated only when diagnostics are requested. */
    diagnostics?:PlacementDiagnostic[];
    stages?:PopulationGraphStageSummary[];
}
const LIMIT=2048;
const id=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(x);
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const bound=(x:unknown,min:number,max:number):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const integer=(x:unknown,min:number,max:number):x is number=>bound(x,min,max)&&Number.isInteger(x);
const vec=(x:unknown):x is PopulationVector=>record(x)&&['x','y','z'].every(k=>bound(x[k],-1e7,1e7));
const keys=(x:Record<string,unknown>,allowed:ReadonlyArray<string>)=>Object.keys(x).every(k=>allowed.includes(k));
const copyVec=(p:PopulationVector):PopulationVector=>({x:p.x,y:p.y,z:p.z});
const copyPoint=<T extends PopulationGraphPoint>(p:T):T=>({...p,position:copyVec(p.position),forward:copyVec(p.forward),up:copyVec(p.up),...(p.surfaceNormal?{surfaceNormal:copyVec(p.surfaceNormal)}:{})});
const TYPES:Readonly<Record<PopulationGraphNodeType,{input:PopulationGraphPort|null;output:PopulationGraphPort;params:ReadonlyArray<string>}>>={
    spline:{input:null,output:'path',params:['slot']},
    count:{input:'path',output:'candidates',params:['count','includeEnd']},
    spacing:{input:'path',output:'candidates',params:['spacing','includeEnd']},
    random:{input:'path',output:'candidates',params:['count','seed']},
    jitter:{input:'path',output:'candidates',params:['count','seed','jitter']},
    range:{input:'candidates',output:'candidates',params:['startProgress','endProgress']},
    density:{input:'candidates',output:'candidates',params:['density','seed','densityKeys','exclusions','minWorldSpacing']},
    offset:{input:'candidates',output:'candidates',params:['offset','space']},
    rotation:{input:'candidates',output:'candidates',params:['minDegrees','maxDegrees','seed']},
    scale:{input:'candidates',output:'candidates',params:['minScale','maxScale','seed']},
    align:{input:'candidates',output:'candidates',params:['alignment']},
    surface:{input:'candidates',output:'candidates',params:['rayHeight','rayDepth','surfaceOffset','minNormalY','skipMissing']},
    obstacle:{input:'candidates',output:'candidates',params:['clearance','footprintRadius']},
    prefab:{input:'candidates',output:'instances',params:['weights','seed']},
    output:{input:'instances',output:'instances',params:[]},
};
export function populationGraphPorts(type:PopulationGraphNodeType):{input:PopulationGraphPort|null;output:PopulationGraphPort}{
    const {input,output}=TYPES[type];return {input,output};
}
function policy(n:Readonly<PopulationGraphNode>,closed:boolean){
    return {density:n.density??1,seed:n.seed??0,densityKeys:n.densityKeys??[],
        exclusions:n.exclusions??[],minWorldSpacing:n.minWorldSpacing??0,closed};
}
function surfaceSettings(n:Readonly<PopulationGraphNode>,targetCount:number){
    return {rayHeight:n.rayHeight??5,rayDepth:n.rayDepth??10,surfaceOffset:n.surfaceOffset??0,
        minNormalY:n.minNormalY??0,skipMissing:n.skipMissing??true,targetCount};
}
const vectorParam=(v:unknown,limit:number):v is PopulationVector=>record(v)&&keys(v,['x','y','z'])&&['x','y','z'].every(k=>bound(v[k],-limit,limit));
function freezeNode(n:PopulationGraphNode):Readonly<PopulationGraphNode>{
    const value=JSON.parse(JSON.stringify(n)) as PopulationGraphNode;
    for(const k of ['densityKeys','exclusions','weights'] as const){
        const array=value[k];
        if(array){for(const entry of array)if(typeof entry==='object')Object.freeze(entry);Object.freeze(array);}
    }
    for(const k of ['offset','minDegrees','maxDegrees'] as const)if(value[k])Object.freeze(value[k]);
    return Object.freeze(value);
}
export function compilePopulationGraph(raw:unknown):PopulationGraphPlan{
    if(!record(raw)||!keys(raw,['version','nodes','output'])||raw.version!==1||
       !Array.isArray(raw.nodes)||raw.nodes.length<4||raw.nodes.length>32||!id(raw.output))
        throw Error('Population Graph v1 requires 4–32 nodes and a valid output ID.');
    const table=new Map<string,Readonly<PopulationGraphNode>>();
    let outputs=0;
    for(const item of raw.nodes){
        if(!record(item)||!id(item.id)||typeof item.type!=='string'||!Object.prototype.hasOwnProperty.call(TYPES,item.type)||table.has(item.id))
            throw Error('Population Graph node ID/type invalid or duplicated.');
        const type=item.type as PopulationGraphNodeType,descriptor=TYPES[type];
        if(!keys(item,['id','type',...(descriptor.input?['input']:[]),...descriptor.params])||
           (descriptor.input!==null&&!id(item.input)))
            throw Error('Population Graph node contains unsupported parameters or missing input.');
        if(type==='spline'&&item.slot!==undefined&&!integer(item.slot,0,2))throw Error('Population Graph spline slot must be 0–2.');
        if(type==='count'&&(!integer(item.count,1,LIMIT)||(item.includeEnd!==undefined&&typeof item.includeEnd!=='boolean')))
            throw Error('Population Graph count must be 1–2048 with optional boolean includeEnd.');
        if(type==='spacing'&&(!bound(item.spacing,.001,10000)||(item.includeEnd!==undefined&&typeof item.includeEnd!=='boolean')))
            throw Error('Population Graph spacing must be .001–10000 world units with optional boolean includeEnd.');
        if(type==='random'||type==='jitter'){
            if(!integer(item.count,1,LIMIT)||(item.seed!==undefined&&!integer(item.seed,-2147483647,2147483647)))
                throw Error('Population Graph random/jitter requires count 1–2048 and a valid seed.');
            if(type==='jitter'&&item.jitter!==undefined&&!bound(item.jitter,0,1))throw Error('Population Graph jitter must be in [0,1].');
        }
        if(type==='range'&&(!bound(item.startProgress,0,1)||!bound(item.endProgress,0,1)))
            throw Error('Population Graph range requires start/end progress in [0,1].');
        if(type==='density'){
            if(item.density!==undefined&&!bound(item.density,0,1)||item.seed!==undefined&&!integer(item.seed,-2147483647,2147483647)||
               item.minWorldSpacing!==undefined&&!bound(item.minWorldSpacing,0,10000))
                throw Error('Invalid Population Graph density policy.');
            if(item.densityKeys!==undefined&&(!Array.isArray(item.densityKeys)||item.densityKeys.length>64||
               item.densityKeys.some(k=>!record(k)||!keys(k,['progress','density'])||!bound(k.progress,0,1)||!bound(k.density,0,1))))
                throw Error('Invalid Population Graph density keys.');
            if(item.exclusions!==undefined&&(!Array.isArray(item.exclusions)||item.exclusions.length>64||
               item.exclusions.some(k=>!record(k)||!keys(k,['startProgress','endProgress'])||!bound(k.startProgress,0,1)||!bound(k.endProgress,0,1))))
                throw Error('Invalid Population Graph exclusions.');
            // Winding-dependent rules are checked with the actual source at evaluation.
            const p=policy(item as unknown as PopulationGraphNode,false);
            if(new Set(p.densityKeys.map(k=>k.progress)).size!==p.densityKeys.length)
                throw Error('Population Graph duplicate density progress.');
        }
        if(type==='offset'&&(!vectorParam(item.offset,10000)||(item.space!==undefined&&item.space!=='frame'&&item.space!=='world')))
            throw Error('Population Graph offset requires bounded xyz and frame/world space.');
        if(type==='rotation'){
            const a=item.minDegrees,b=item.maxDegrees;
            if(!vectorParam(a,360)||!vectorParam(b,360)||a.x>b.x||a.y>b.y||a.z>b.z)
                throw Error('Population Graph rotation requires ordered degree ranges within -360–360.');
        }
        if(type==='scale'&&(!bound(item.minScale,.001,100)||!bound(item.maxScale,.001,100)||item.minScale>item.maxScale))
            throw Error('Population Graph scale requires ordered multipliers .001–100.');
        if((type==='rotation'||type==='scale')&&item.seed!==undefined&&!integer(item.seed,-2147483647,2147483647))
            throw Error('Population Graph transform seed invalid.');
        if(type==='align'&&!['upright','surface','world'].includes(item.alignment as string))throw Error('Population Graph alignment invalid.');
        if(type==='surface'){
            for(const k of ['rayHeight','rayDepth','surfaceOffset','minNormalY','skipMissing'] as const)
                if(item[k]===null)throw Error('Population Graph surface parameter cannot be null.');
            validateSurfaceSettings(surfaceSettings(item as unknown as PopulationGraphNode,1));
        }
        if(type==='obstacle'&&((item.clearance!==undefined&&!bound(item.clearance,0,10000))||
           (item.footprintRadius!==undefined&&!bound(item.footprintRadius,0,100))))throw Error('Population Graph obstacle clearance/radius invalid.');
        if(type==='prefab'){
            if(item.seed!==undefined&&!integer(item.seed,-2147483647,2147483647))
                throw Error('Invalid Population Graph prefab seed.');
            if(!Array.isArray(item.weights)||Array.from(item.weights).some(w=>!bound(w,0,10000)))
                throw Error('Population Graph prefab weights required.');
            validatePrefabWeights(item.weights,item.weights.length);
        }
        if(type==='output')outputs++;
        table.set(item.id,freezeNode(item as unknown as PopulationGraphNode));
    }
    if(outputs!==1||table.get(raw.output)?.type!=='output')throw Error('Population Graph requires exactly one Output node.');
    const ordered:Readonly<PopulationGraphNode>[]=[],visiting=new Set<string>(),done=new Set<string>();
    function visit(nodeId:string):void{
        if(done.has(nodeId))return;
        if(visiting.has(nodeId))throw Error('Population Graph cycle detected.');
        const n=table.get(nodeId);
        if(!n)throw Error('Population Graph missing input: '+nodeId);
        visiting.add(nodeId);
        if(n.input!==undefined){
            const parent=table.get(n.input);
            if(!parent)throw Error('Population Graph missing input: '+n.input);
            if(parent.type==='output'||TYPES[parent.type].output!==TYPES[n.type].input)
                throw Error('Population Graph incompatible typed ports: '+parent.type+' -> '+n.type);
            visit(n.input);
        }
        visiting.delete(nodeId);done.add(nodeId);ordered.push(n);
    }
    visit(raw.output);
    if(done.size!==table.size)throw Error('Population Graph disconnected nodes.');
    return Object.freeze({nodes:Object.freeze(ordered),output:raw.output});
}
export function parsePopulationGraph(text:string):PopulationGraphPlan{
    if(typeof text!=='string'||text.length<2||text.length>16384)throw Error('Population Graph JSON exceeds 16 KiB or is empty.');
    return compilePopulationGraph(JSON.parse(text));
}
function validateSource(s:PopulationGraphSource|undefined):asserts s is PopulationGraphSource{
    if(!s||typeof s.closed!=='boolean'||typeof s.revision!=='string'||s.revision.length<1||s.revision.length>8192||
       !Array.isArray(s.frames)||s.frames.length<2||s.frames.length>1025)
        throw Error('Population Graph requires 2–1025 source frames and a revision.');
    let last=-1;
    for(const f of s.frames){
        if(!f||!vec(f.position)||!vec(f.forward)||!vec(f.up)||!bound(f.distance,0,1e9)||f.distance<last||
           Math.hypot(f.forward.x,f.forward.y,f.forward.z)<1e-8||Math.hypot(f.up.x,f.up.y,f.up.z)<1e-8)
            throw Error('Invalid Population Graph source frame.');
        last=f.distance;
    }
    if(s.frames[0].distance!==0||last<=0)throw Error('Population Graph source needs positive distance starting at zero.');
    if(s.closed){
        const a=s.frames[0],b=s.frames[s.frames.length-1];
        if(Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y,a.position.z-b.position.z)>1e-5)
            throw Error('Population Graph closed path requires coincident endpoint positions.');
    }
}
type PathValue={kind:'path';source:PopulationGraphSource};
type CandidateValue={kind:'candidates';closed:boolean;points:PopulationGraphPoint[]};
type InstanceValue={kind:'instances';points:PopulationGraphInstance[]};
type Value=PathValue|CandidateValue|InstanceValue;
interface CacheEntry {key:string;version:number;value:Value;reasons?:Map<number,PlacementReason>}
const mix=(a:PopulationVector,b:PopulationVector,t:number):PopulationVector=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
function basis(a:PopulationGraphFrame,b:PopulationGraphFrame,t:number):{forward:PopulationVector;up:PopulationVector}{
    const unit=(v:PopulationVector):PopulationVector=>{
        const l=Math.hypot(v.x,v.y,v.z);if(l<1e-8)throw Error('Degenerate Population Graph frame basis.');
        return {x:v.x/l,y:v.y/l,z:v.z/l};
    };
    const forward=unit(mix(a.forward,b.forward,t)),u=mix(a.up,b.up,t);
    const dot=u.x*forward.x+u.y*forward.y+u.z*forward.z;
    const up=unit({x:u.x-dot*forward.x,y:u.y-dot*forward.y,z:u.z-dot*forward.z});
    return {forward,up};
}
function distributionPoints(source:PopulationGraphSource,n:Readonly<PopulationGraphNode>):PopulationGraphPoint[]{
    const frames=source.frames,total=frames[frames.length-1].distance;
    // The distribution owns candidate indices. Random points deliberately
    // remain in original index order (not sorted by progress), so filtering
    // and weighted selection retain deterministic identity.
    const samples=distributionDistances(total,source.closed,n);
    return samples.map(({distance,progress},index)=>{
        let lo=0,hi=frames.length-1;
        // First frame at or beyond the sample; handles arbitrary order in
        // O(log frames) and skips zero-distance runs when possible.
        while(lo+1<hi){const mid=(lo+hi)>>>1;if(frames[mid].distance<distance)lo=mid;else hi=mid;}
        const a=frames[lo],b=frames[hi],span=b.distance-a.distance;
        const t=span>0?(distance-a.distance)/span:0;
        return {index,progress,distance,position:mix(a.position,b.position,t),...basis(a,b,t)};
    });
}
/** Cache keys use the source revision contract; the host must change revision
 * whenever source geometry changes. Failed runs preserve the committed cache,
 * metrics, and version counter. No returned array aliases cached data. */
export class PopulationGraphRunner {
    private cache=new Map<string,CacheEntry>();
    private version=0;
    private last:PopulationGraphMetrics={computed:0,reused:0,nodes:0};
    public get metrics():PopulationGraphMetrics{return {...this.last};}
    public clear():void{this.cache.clear();this.version=0;this.last={computed:0,reused:0,nodes:0};}
    public evaluate(plan:PopulationGraphPlan,context:PopulationGraphContext,trace=false):PopulationGraphResult{
        if(!context||!Array.isArray(context.sources)||context.sources.length>3||
           !integer(context.prefabSlotCount,1,128))throw Error('Invalid Population Graph context.');
        const next=new Map<string,CacheEntry>();let computed=0,reused=0,version=this.version;
        for(const n of plan.nodes){
            const parent=n.input===undefined?undefined:next.get(n.input);
            const source=n.type==='spline'?context.sources[n.slot??0]:undefined;
            if(n.type==='spline')validateSource(source);
            if(n.type==='prefab')validatePrefabWeights(n.weights!,context.prefabSlotCount);
            const surface=n.type==='surface'?context.surface:undefined,obstacles=n.type==='obstacle'?context.obstacles:undefined;
            const validRevision=(r:unknown)=>typeof r==='string'&&r.length>0&&r.length<=8192;
            if(n.type==='surface'){
                if(!surface||!validRevision(surface.revision)||typeof surface.raycast!=='function')throw Error('Population Graph requires a surface snapshot and revision.');
                validateSurfaceSettings(surfaceSettings(n,surface.targetCount));
            }
            if(n.type==='obstacle'&&(!obstacles||!validRevision(obstacles.revision)||!Array.isArray(obstacles.shapes)||obstacles.shapes.length>64))
                throw Error('Population Graph requires an obstacle snapshot and revision.');
            const key=JSON.stringify([n,parent?.version??null,source?.revision??null,source?.closed??null,n.type==='prefab'?context.prefabSlotCount:null,
                surface?.revision??null,surface?.targetCount??null,obstacles?.revision??null]);
            const prior=this.cache.get(n.id);
            if(prior?.key===key){next.set(n.id,prior);reused++;continue;}
            const input=parent?.value;let value:Value,reasons:Map<number,PlacementReason>|undefined;
            if(n.type==='spline'){
                value={kind:'path',source:{...source!,frames:source!.frames.map((f:PopulationGraphFrame)=>({...f,position:copyVec(f.position),forward:copyVec(f.forward),up:copyVec(f.up)}))}};
            }else if((n.type==='count'||n.type==='spacing'||n.type==='random'||n.type==='jitter')&&input?.kind==='path'){
                value={kind:'candidates',closed:input.source.closed,points:distributionPoints(input.source,n)};
            }else if(n.type==='range'&&input?.kind==='candidates'){
                // Validate open wrapping even on an empty upstream list.
                inPopulationProgressRange(0,n.startProgress!,n.endProgress!,input.closed);
                value={kind:'candidates',closed:input.closed,points:input.points.filter(p=>inPopulationProgressRange(p.progress,n.startProgress!,n.endProgress!,input.closed))};
            }else if(n.type==='density'&&input?.kind==='candidates'){
                const p=policy(n,input.closed);validatePopulationPolicy(p);
                const rejected=new Map<number,PlacementReason>();
                const kept=new Set(planPopulation(input.points,p,(index,reason)=>rejected.set(index,reason)));
                reasons=rejected;
                value={kind:'candidates',closed:input.closed,points:input.points.filter(x=>kept.has(x.index))};
            }else if(n.type==='offset'&&input?.kind==='candidates'){
                value={...input,points:input.points.map(p=>offsetPopulationPoint(p,n.offset!,n.space??'frame'))};
            }else if(n.type==='rotation'&&input?.kind==='candidates'){
                value={...input,points:input.points.map(p=>rotatePopulationPoint(p,n.minDegrees!,n.maxDegrees!,n.seed??0))};
            }else if(n.type==='scale'&&input?.kind==='candidates'){
                value={...input,points:input.points.map(p=>scalePopulationPoint(p,n.minScale!,n.maxScale!,n.seed??0))};
            }else if(n.type==='align'&&input?.kind==='candidates'){
                value={...input,points:input.points.map(p=>alignPopulationPoint(p,n.alignment!))};
            }else if(n.type==='surface'&&input?.kind==='candidates'){
                const projected=projectSurfaceCandidates(input.points.map(copyPoint),surfaceSettings(n,surface!.targetCount),surface!.raycast);
                const originals=new Map(input.points.map(p=>[p.index,p]));
                value={...input,points:projected.map(p=>({...originals.get(p.index)!,position:copyVec(p.position),surfaceNormal:p.surfaceNormal?copyVec(p.surfaceNormal):null}))};
            }else if(n.type==='obstacle'&&input?.kind==='candidates'){
                const kept=new Set(filterPopulationShapeCandidates(input.points,obstacles!.shapes,n.clearance??0,n.footprintRadius??0).map(p=>p.index));
                value={...input,points:input.points.filter(p=>kept.has(p.index))};
            }else if(n.type==='prefab'&&input?.kind==='candidates'){
                value={kind:'instances',points:input.points.map(p=>({...p,prefabSlot:selectWeightedPrefab(n.weights!,populationGate(n.seed??0,p.index))}))};
            }else if(n.type==='output'&&input?.kind==='instances')value=input;
            else throw Error('Population Graph invalid compiled input.');
            next.set(n.id,{key,value,version:++version,reasons});computed++;
        }
        const result=next.get(plan.output)?.value;
        if(result?.kind!=='instances')throw Error('Population Graph missing instance output.');
        const instances=result.points.map(copyPoint);
        const report=trace?this.trace(plan,next,instances):{};
        this.cache=next;this.version=version;this.last={computed,reused,nodes:plan.nodes.length};
        return {instances,metrics:this.metrics,...report};
    }
    /** Derive trace from the exact cached stage values; never rerun a filter or raycast. */
    private trace(plan:PopulationGraphPlan,entries:Map<string,CacheEntry>,instances:PopulationGraphInstance[]):{diagnostics:PlacementDiagnostic[];stages:PopulationGraphStageSummary[]}{
        const diagnostics=new Map<number,PlacementDiagnostic>(),stages:PopulationGraphStageSummary[]=[];
        for(const n of plan.nodes){
            const entry=entries.get(n.id)!,before=n.input===undefined?undefined:entries.get(n.input)?.value,after=entry.value;
            if(after.kind==='path')continue;
            const incoming=before&&before.kind!=='path'?before.points:[],outgoing=after.points;
            const kept=new Set(outgoing.map(p=>p.index));
            const rejected=incoming.filter(p=>!kept.has(p.index));
            for(const p of rejected){
                const reason:PlacementReason|undefined=n.type==='range'?'exclusion':n.type==='surface'?'surface':n.type==='obstacle'?'collider':entry.reasons?.get(p.index);
                if(!reason||diagnostics.has(p.index))throw Error('Population Graph incomplete rejection attribution.');
                diagnostics.set(p.index,{index:p.index,progress:p.progress,position:copyVec(p.position),radius:0,reason});
            }
            stages.push({id:n.id,type:n.type,input:incoming.length,output:outgoing.length,rejected:rejected.length,
                examples:rejected.slice(0,3).map(p=>p.index)});
        }
        for(const p of instances)diagnostics.set(p.index,{index:p.index,progress:p.progress,position:copyVec(p.position),radius:0,reason:'accepted'});
        return {diagnostics:[...diagnostics.values()].sort((a,b)=>a.index-b.index),stages};
    }
}
export const DEFAULT_POPULATION_GRAPH=JSON.stringify({version:1,output:'output',nodes:[
    {id:'source',type:'spline'},{id:'distribution',type:'count',input:'source',count:10},
    {id:'prefabs',type:'prefab',input:'distribution',weights:[1],seed:0},
    {id:'output',type:'output',input:'prefabs'},
]});
