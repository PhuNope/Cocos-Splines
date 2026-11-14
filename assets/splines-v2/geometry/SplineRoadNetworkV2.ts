import {type V3} from '../core/SplineCurves';
import {type JunctionRoadCandidateV2} from './JunctionAutoTrimV2';

/**
 * Editor-only geometry planner, independent of Cocos and AssetDB.
 * Nothing here mutates a Knot, Node, Road, or Baked Mesh.
 */
export interface RoadNetworkCandidateV2 extends JunctionRoadCandidateV2 {
    readonly pathId:string;
}
export interface JunctionSnapBranchInputV2 extends RoadNetworkCandidateV2 {
    readonly atEnd:boolean;
}
export interface JunctionSnapOptionsV2 {
    readonly center:V3;
    readonly maxDistance?:number;
    readonly maxHeightDelta?:number;
}
export interface JunctionSnapBranchV2 {
    readonly roadId:string;
    readonly pathId:string;
    readonly atEnd:boolean;
    readonly from:V3;
    readonly to:V3;
    readonly delta:V3;
    readonly distance:number;
    readonly changed:boolean;
}
export interface JunctionSnapPlanV2 {
    readonly center:V3;
    readonly maxDistance:number;
    readonly branches:ReadonlyArray<JunctionSnapBranchV2>;
}
export interface RoadNetworkEndpointV2 {
    readonly roadId:string;
    readonly pathId:string;
    readonly atEnd:boolean;
    readonly position:V3;
}
export interface RoadNetworkHubV2 {
    readonly position:V3;
    readonly endpoints:ReadonlyArray<RoadNetworkEndpointV2>;
    readonly maximumGap:number;
}
export interface RoadNetworkReportV2 {
    readonly roadCount:number;
    readonly hubCount:number;
    readonly hubs:ReadonlyArray<RoadNetworkHubV2>;
}
const finite=(p:V3):boolean=>p!==null&&p!==undefined&&
    [p.x,p.y,p.z].every(Number.isFinite);
const distance=(a:V3,b:V3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const vector=(a:V3,b:V3):V3=>({x:b.x-a.x,y:b.y-a.y,z:b.z-a.z});
const positive=(n:number,label:string)=>{
    if(!Number.isFinite(n)||n<=0)throw new Error(label+' must be positive');
    return n;
};
function validateRoad(road:RoadNetworkCandidateV2):void {
    if(!road||!road.roadId||!road.pathId||!finite(road.start)||!finite(road.end)||
       !finite(road.startInside)||!finite(road.endInside))
        throw new Error('Invalid Road endpoint candidate');
    positive(road.length,'Road length');
}
/**
 * Snap only explicitly linked endpoints, to the Junction Node's world
 * position. Distinct Paths are required: a shared authored Path must not
 * receive contradictory endpoint edits from different Road connections.
 * At-End is NEVER silently corrected.
 */
export function planJunctionEndpointSnapV2(
    inputs:ReadonlyArray<JunctionSnapBranchInputV2>,
    options:JunctionSnapOptionsV2
):JunctionSnapPlanV2 {
    if(inputs.length!==3&&inputs.length!==4)
        throw new Error('Endpoint Snap needs 3 or 4 linked Roads');
    if(!finite(options.center))throw new Error('Invalid Junction center');
    const maxDistance=positive(options.maxDistance??.75,'Snap max distance');
    const maxHeightDelta=positive(options.maxHeightDelta??.1,'Snap height tolerance');
    const seenRoads=new Set<string>(),seenPaths=new Set<string>();
    const branches=inputs.map(road=>{
        validateRoad(road);
        if(seenRoads.has(road.roadId))
            throw new Error('Duplicate Junction Road '+road.roadId);
        if(seenPaths.has(road.pathId))
            throw new Error('Endpoint Snap requires one distinct Path per connected Road');
        seenRoads.add(road.roadId);seenPaths.add(road.pathId);
        if(typeof road.atEnd!=='boolean')throw new Error('Missing At End setting');
        const from=road.atEnd?road.end:road.start;
        const other=road.atEnd?road.start:road.end;
        const inside=road.atEnd?road.endInside:road.startInside;
        const gap=distance(from,options.center);
        if(gap>maxDistance+1e-6)
            throw new Error('Road '+road.roadId+' endpoint exceeds Snap max distance');
        if(distance(other,options.center)<=gap+Math.max(.01,maxDistance*.05))
            throw new Error('Road '+road.roadId+' At End selection is ambiguous or reversed');
        if(Math.abs(from.y-options.center.y)>maxHeightDelta+1e-6)
            throw new Error('Road '+road.roadId+' endpoint exceeds Snap height tolerance');
        // Reject snapping an endpoint onto the next interior sample,
        // which could collapse a curved or very short segment.
        if(distance(inside,options.center)<Math.min(.1,road.length*.05))
            throw new Error('Road '+road.roadId+' would collapse its endpoint tangent');
        const delta=vector(from,options.center);
        return {roadId:road.roadId,pathId:road.pathId,atEnd:road.atEnd,
            from,to:options.center,delta,distance:gap,changed:gap>1e-6};
    });
    return {center:options.center,maxDistance,branches};
}
/**
 * Scene-wide read-only proximity graph. A hub is an all-pairs-compatible
 * set of endpoints, never a loose chained union that could stretch beyond
 * tolerance. Sorting makes graph order stable for identical Scene state.
 */
export function buildSplineRoadNetworkV2(
    roads:ReadonlyArray<RoadNetworkCandidateV2>,
    options:{maxDistance?:number;maxHeightDelta?:number}={}
):RoadNetworkReportV2 {
    const maxDistance=positive(options.maxDistance??.25,'Network distance');
    const maxHeightDelta=positive(options.maxHeightDelta??.1,'Network height tolerance');
    if(roads.length>256)throw new Error('Network scan is limited to 256 Roads');
    const ids=new Set<string>(),endpoints:RoadNetworkEndpointV2[]=[];
    for(const road of roads){
        validateRoad(road);
        if(ids.has(road.roadId))throw new Error('Duplicate Road in network scan');
        ids.add(road.roadId);
        endpoints.push({roadId:road.roadId,pathId:road.pathId,
            atEnd:false,position:road.start});
        endpoints.push({roadId:road.roadId,pathId:road.pathId,
            atEnd:true,position:road.end});
    }
    endpoints.sort((a,b)=>a.roadId.localeCompare(b.roadId)||
        Number(a.atEnd)-Number(b.atEnd));
    const compatible=(a:RoadNetworkEndpointV2,b:RoadNetworkEndpointV2)=>
        a.roadId!==b.roadId&&
        Math.abs(a.position.y-b.position.y)<=maxHeightDelta&&
        distance(a.position,b.position)<=maxDistance;
    const visited=new Set<number>();
    const hubs:RoadNetworkHubV2[]=[];
    for(let i=0;i<endpoints.length;i++){
        if(visited.has(i))continue;
        const members=[i];
        for(let j=i+1;j<endpoints.length;j++){
            if(visited.has(j))continue;
            if(members.every(k=>compatible(endpoints[k],endpoints[j])))members.push(j);
        }
        if(members.length<2)continue;
        for(const member of members)visited.add(member);
        const linked=members.map(j=>endpoints[j]);
        let maximumGap=0;
        for(let a=0;a<linked.length;a++)
            for(let b=a+1;b<linked.length;b++)
                maximumGap=Math.max(maximumGap,distance(linked[a].position,linked[b].position));
        const position={
            x:linked.reduce((sum,p)=>sum+p.position.x,0)/linked.length,
            y:linked.reduce((sum,p)=>sum+p.position.y,0)/linked.length,
            z:linked.reduce((sum,p)=>sum+p.position.z,0)/linked.length
        };
        hubs.push({position,endpoints:linked,maximumGap});
    }
    return {roadCount:roads.length,hubCount:hubs.length,hubs};
}
