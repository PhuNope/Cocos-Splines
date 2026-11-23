/** Runtime adapter: compile enabled SplineJunction Components into the pure
 * direction-aware graph. No Node mutation, no global scene searches.
 */
import { SplineContainer } from './SplineContainer';
import { SplineJunction } from '../Components/SplineJunction';
import { findNetworkRoute, type NetworkJunction, type NetworkRoute,
    type NetworkRouteOptions, type NetworkSpline, type NetworkLink,
    type NetworkDirection } from './SplineNetworkGraph';
export interface SplineRoute extends NetworkRoute {
    readonly splines:ReadonlyMap<string,SplineContainer>;
    readonly junctions:ReadonlyMap<string,SplineJunction>;
}
export interface SplineRouteOptions extends NetworkRouteOptions {
    /** Override the active Junction registry for preview, tooling or tests. */
    junctions?:readonly SplineJunction[];
}
function splineId(spline:SplineContainer):string {
    const node=spline?.node;
    return node?.isValid===false?'':(node?.uuid||'');
}
/**
 * Cost uses each spline's LOCAL arc length. For physically continuous roads,
 * specify maxWorldGap (e.g. 0.1) to disallow teleporting links.
 * Route is a snapshot; recompute if spline geometry, links or target changes.
 */
export function planSplineRoute(startSpline:SplineContainer,startProgress:number,
    targetSpline:SplineContainer,targetProgress:number,
    options:SplineRouteOptions={}):SplineRoute|null{
    const registry=options.junctions||[...SplineJunction.active];
    const splineMap=new Map<string,SplineContainer>();
    const junctionMap=new Map<string,SplineJunction>();
    const add=(spline:SplineContainer|null):void=>{
        if(!spline||spline.enabled===false||spline.count<2||
            !Number.isFinite(spline.length)||spline.length<=1e-9)return;
        const id=splineId(spline);if(!id) return;
        if(splineMap.has(id)&&splineMap.get(id)!==spline)
            throw Error('Duplicate spline Node UUID in Network.');
        splineMap.set(id,spline);
    };
    add(startSpline);add(targetSpline);
    const junctions:NetworkJunction[]=[];
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
        junctions.push({id,links});junctionMap.set(id,junction);
    }
    const startId=splineId(startSpline),endId=splineId(targetSpline);
    if(!splineMap.has(startId)||!splineMap.has(endId))return null;
    const splines:NetworkSpline[]=[...splineMap.entries()].map(([id,s])=>
        ({id,length:s.length,closed:s.closed}));
    const route=findNetworkRoute(splines,junctions,{splineId:startId,progress:startProgress},
        {splineId:endId,progress:targetProgress},options);
    return route?{...route,splines:splineMap,junctions:junctionMap}:null;
}
/** Resolve a single crossing to an existing Junction's serialized exit index.
 * Returns null when the shortest legal path should continue forward or the
 * target is unreachable. Caller must still perform its normal event switch.
 */
export function nextShortestJunctionExit(junction:SplineJunction,entryIndex:number,
    spline:SplineContainer,entryProgress:number,direction:NetworkDirection,
    destination:SplineContainer,destinationProgress:number,
    options:SplineRouteOptions={}):number|null {
    try {
        const result=planSplineRoute(spline,entryProgress,destination,destinationProgress,
            {...options,startDirection:direction});
        if(!result)return null;
        for(const step of result.steps){
            if(step.kind==='travel'&&step.distance<=1e-8)continue;
            if(step.kind==='switch'&&result.junctions.get(step.junctionId)===junction&&
               step.entryIndex===entryIndex&&
               step.fromSplineId===splineId(spline))return step.exitIndex;
            break;
        }
        return null;
    }catch(_){
        // Invalid or temporarily edited network should never crash a follower.
        // The normal non-switching Junction event path continues instead.
        return null;
    }
}
