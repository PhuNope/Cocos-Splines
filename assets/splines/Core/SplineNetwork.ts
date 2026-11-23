/** Runtime adapter for cached, deterministic shortest routes over Junction links.
 * Cache only snapshots of the currently enabled SplineContainers/Junctions.
 * Cached graph and route results are invalidated automatically by runtime
 * revisions, transforms, serialized connections and active registry membership.
 * No Scene search, Node mutation or editor-global dependencies.
 */
import { SplineContainer } from './SplineContainer';
import { SplineJunction } from '../Components/SplineJunction';
import { findNetworkRoute, type NetworkJunction, type NetworkRoute,
    type NetworkRouteOptions, type NetworkSpline, type NetworkLink,
    type NetworkDirection } from './SplineNetworkGraph';
import { SplineNetworkMemo, type NetworkCacheStats } from './SplineNetworkCache';
import { buildWorldArcLength } from './SplineWorldArcLength';
import {splineTrafficGate} from './SplineTrafficGate';

export interface SplineRoute extends NetworkRoute {
    readonly splines:ReadonlyMap<string,SplineContainer>;
    readonly junctions:ReadonlyMap<string,SplineJunction>;
}
export interface SplineRouteOptions extends NetworkRouteOptions {
    /** Override active Junction registry for previews, tooling or tests. */
    junctions?:readonly SplineJunction[];
}
interface NetworkSnapshot {
    splines:Map<string,SplineContainer>;
    junctions:Map<string,SplineJunction>;
    graphSplines:NetworkSpline[];
    graphJunctions:NetworkJunction[];
}
const memo=new SplineNetworkMemo<NetworkSnapshot>(4,64);
const tokens=new WeakMap<object,number>();
let nextToken=0;
function token(value:object):number{
    let id=tokens.get(value);
    if(id===undefined){id=++nextToken;tokens.set(value,id);}
    return id;
}
function splineId(spline:SplineContainer):string{
    const node=spline?.node;
    return node?.isValid===false?'':(node?.uuid||'');
}
const MATRIX_FIELDS=['m00','m01','m02','m04','m05','m06',
    'm08','m09','m10','m12','m13','m14'] as const;
function transformSignature(node:SplineContainer['node']):unknown[]{
    const m=node?.worldMatrix;
    return m?MATRIX_FIELDS.map(key=>m[key]??null):[];
}
/** Return null when the source lacks an explicit geometry revision; this makes
 * custom/mock adapters fail safely by bypassing cache instead of retaining
 * stale world positions after in-place geometry edits.
 */
function snapshotSignature(start:SplineContainer,goal:SplineContainer,
    registry:readonly SplineJunction[]):string|null{
    const splines=new Set<SplineContainer>();
    if(start)splines.add(start);
    if(goal)splines.add(goal);
    const enabled=registry.filter(j=>!!j&&j.enabled&&j.node?.isValid!==false);
    for(const j of enabled){
        for(const link of j.connections||[]){
            const spline=link?.spline;
            if(spline&&spline.node?.isValid!==false)splines.add(spline);
        }
    }
    const splinesData=[];
    for(const spline of splines){
        if(typeof spline.getRevision!=='function'||!spline.node?.worldMatrix)
            return null;
        const node=spline.node;
        splinesData.push([token(spline),splineId(spline),token(node),
            node.isValid!==false,spline.enabled!==false,spline.count,spline.length,
            spline.closed,spline.reversed,spline.dimension,
            spline.getRevision(),transformSignature(node)]);
    }
    splinesData.sort((a,b)=>Number(a[0])-Number(b[0]));
    const linksData=enabled.map(j=>[token(j),j.node.uuid,token(j.node),
        j.enabled,j.connections?.map((l,index)=>l?[
            index,l.spline?token(l.spline):null,l.positionMode,
            l.progress,l.distance,l.exitDirection,
        ]:null)]);
    linksData.sort((a,b)=>Number(a[0])-Number(b[0]));
    return JSON.stringify([splinesData,linksData]);
}
function compileNetwork(startSpline:SplineContainer,targetSpline:SplineContainer,
    registry:readonly SplineJunction[],costSpace:'local'|'world'):NetworkSnapshot{
    const splineMap=new Map<string,SplineContainer>();
    const junctionMap=new Map<string,SplineJunction>();
    const add=(spline:SplineContainer|null):void=>{
        if(!spline||spline.enabled===false||spline.count<2||
            !Number.isFinite(spline.length)||spline.length<=1e-9)return;
        const id=splineId(spline);if(!id)return;
        if(splineMap.has(id)&&splineMap.get(id)!==spline)
            throw Error('Duplicate spline Node UUID in Network.');
        splineMap.set(id,spline);
    };
    add(startSpline);add(targetSpline);
    const graphJunctions:NetworkJunction[]=[];
    for(const junction of registry){
        if(!junction||!junction.enabled||junction.node?.isValid===false)continue;
        const id=junction.node?.uuid;if(!id)continue;
        if(junctionMap.has(id)&&junctionMap.get(id)!==junction)
            throw Error('Duplicate junction UUID in Network.');
        const links:NetworkLink[]=[];
        for(const entry of junction.entries()){
            const spline=entry.link.spline;if(!spline)continue;
            add(spline);
            const sid=splineId(spline);
            if(!splineMap.has(sid))continue;
            const progress=entry.link.getProgress();
            if(!Number.isFinite(progress)||progress<0||progress>1)continue;
            const position=spline.evaluateWorldPosition(progress);
            links.push({splineId:sid,progress,linkIndex:entry.index,
                exitDirection:entry.link.exitDirection,
                world:{x:position.x,y:position.y,z:position.z}});
        }
        if(links.length<2)continue;
        graphJunctions.push({id,links});junctionMap.set(id,junction);
    }
    const graphSplines:NetworkSpline[]=[...splineMap.entries()].map(([id,s])=>{
        if(costSpace!=='world')return {id,length:s.length,closed:s.closed};
        const segments=Number.isFinite(s.segmentCount)?s.segmentCount:
            Math.max(1,s.count-(s.closed?0:1));
        const arc=buildWorldArcLength(p=>s.evaluateWorldPosition(p),
            segments,Number.isFinite(s.samplesPerCurve)?s.samplesPerCurve:32);
        return {id,length:s.length,closed:s.closed,worldArc:arc};
    });
    return {splines:splineMap,junctions:junctionMap,graphSplines,graphJunctions};
}
function computeRoute(snapshot:NetworkSnapshot,
    startId:string,startProgress:number,endId:string,endProgress:number,
    options:SplineRouteOptions):NetworkRoute|null{
    if(!snapshot.splines.has(startId)||!snapshot.splines.has(endId))return null;
    return findNetworkRoute(snapshot.graphSplines,snapshot.graphJunctions,
        {splineId:startId,progress:startProgress},
        {splineId:endId,progress:endProgress},options);
}
/** Explicit reset for bulk scene replacement/editor manipulations. Normal spline
 * and Junction changes are detected automatically by snapshotSignature().
 */
export function invalidateSplineNetworkCache():void{memo.clear();}
export function getSplineNetworkCacheStats():NetworkCacheStats{return memo.stats;}

/** Local distance is the default; costSpace=world integrates sampled world
 * positions and respects scale/rotation. Transform signature invalidates both.
 */
export function planSplineRoute(startSpline:SplineContainer,startProgress:number,
    targetSpline:SplineContainer,targetProgress:number,
    options:SplineRouteOptions={}):SplineRoute|null{
    const registry=options.junctions??[...SplineJunction.active];
    const startId=splineId(startSpline),endId=splineId(targetSpline);
    const costSpace=options.costSpace??'local';
    if(costSpace!=='local'&&costSpace!=='world')
        throw Error('Invalid Network route cost space.');
    const rawSignature=snapshotSignature(startSpline,targetSpline,registry);
    // World/local snapshots are separate: world requires sampling, local does not.
    const signature=rawSignature===null?null:costSpace+':'+rawSignature;
    // Never memoize invalid inputs: delegate exact validation to graph planner.
    const queryKey=JSON.stringify([startId,startProgress,endId,targetProgress,
        options.startDirection??null,options.transferPenalty??0,
        options.maxWorldGap??null,costSpace]);
    const graph=signature===null?compileNetwork(startSpline,targetSpline,registry,costSpace):
        memo.snapshot(signature,()=>compileNetwork(startSpline,targetSpline,registry,costSpace));
    const route=signature===null?
        computeRoute(graph,startId,startProgress,endId,targetProgress,options):
        memo.route(signature,queryKey,()=>
            computeRoute(graph,startId,startProgress,endId,targetProgress,options));
    return route?{...route,
        splines:new Map(graph.splines),junctions:new Map(graph.junctions)}:null;
}
/** Read-only diagnostics for route planning; never throws for invalid networks.
 * A saturated exit does not make the graph unreachable because traffic may
 * clear later; admission is decided atomically at the actual Junction crossing.
 */
export interface SplineRouteDiagnosis {
    status:'reachable'|'unreachable'|'invalid';
    message:string;
    route:SplineRoute|null;
    junctionCount:number;
    linkCount:number;
    saturatedExits:number;
}
export function inspectSplineRoute(startSpline:SplineContainer,startProgress:number,
    targetSpline:SplineContainer,targetProgress:number,
    options:SplineRouteOptions={}):SplineRouteDiagnosis{
    let junctionCount=0,linkCount=0,saturatedExits=0;
    try{
        const junctions=options.junctions??[...SplineJunction.active];
        const active=junctions.filter(j=>j&&j.enabled&&j.node?.isValid!==false);
        junctionCount=active.length;
        for(const junction of active){
            const entries=junction.entries();
            linkCount+=entries.length;
            for(const entry of entries){
                const limit=entry.link.maxFollowers;
                if(Number.isInteger(limit)&&limit>0&&
                   splineTrafficGate.count(junction,entry.index)>=limit)saturatedExits++;
            }
        }
        const route=planSplineRoute(startSpline,startProgress,targetSpline,targetProgress,options);
        return {status:route?'reachable':'unreachable',
            message:route?'Route available.':
                'No direction-compatible path exists with current Junction links and filters.',
            route,junctionCount,linkCount,saturatedExits};
    }catch(error){
        return {status:'invalid',message:String(error instanceof Error?error.message:error),
            route:null,junctionCount,linkCount,saturatedExits};
    }
}

/** Current managed admission count on a serialized Junction link index. */
export function getSplineTrafficOccupancy(junction:SplineJunction,exitIndex:number):number{
    return splineTrafficGate.count(junction,exitIndex);
}

/** Existing serialized exit index, not filtered link position. Fail closed while
 * a Scene is being edited or the dynamic network is temporarily invalid.
 */
export function nextShortestJunctionExit(junction:SplineJunction,entryIndex:number,
    spline:SplineContainer,entryProgress:number,direction:NetworkDirection,
    destination:SplineContainer,destinationProgress:number,
    options:SplineRouteOptions={}):number|null{
    try{
        const result=planSplineRoute(spline,entryProgress,destination,destinationProgress,
            {...options,startDirection:direction});
        if(!result)return null;
        for(const step of result.steps){
            if(step.kind==='travel'&&step.distance<=1e-8)continue;
            if(step.kind==='switch'&&result.junctions.get(step.junctionId)===junction&&
                step.entryIndex===entryIndex&&step.fromSplineId===splineId(spline))
                return step.exitIndex;
            break;
        }
        return null;
    }catch(_){
        return null;
    }
}
