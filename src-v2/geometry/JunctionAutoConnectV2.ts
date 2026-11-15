import {type V3} from '../core/SplineCurves';
import {type RoadNetworkCandidateV2} from './SplineRoadNetworkV2';

/**
 * Scene-only, read-only auto-connection planner.
 * Connection detection is deliberately strict: it never silently chooses
 * four of five near arms or joins unrelated elevated Roads.
 */
export interface JunctionConnectCandidateV2 extends RoadNetworkCandidateV2 {
    /** Cocos Component UUID, NOT the Node UUID used by RoadNetwork. */
    readonly componentUuid:string;
}
export interface JunctionAutoConnectOptionsV2 {
    readonly center:V3;
    readonly searchRadius?:number;
    readonly maxHeightDelta?:number;
    readonly minArmAngleDegrees?:number;
}
export interface JunctionAutoConnectArmV2 {
    readonly roadId:string;
    readonly componentUuid:string;
    readonly pathId:string;
    readonly atEnd:boolean;
    readonly distance:number;
    readonly bearingDegrees:number;
    readonly direction:V3;
    readonly endpoint:V3;
}
export interface JunctionAutoConnectPlanV2 {
    readonly center:V3;
    readonly searchRadius:number;
    readonly branches:ReadonlyArray<JunctionAutoConnectArmV2>;
}
const finite=(p:V3)=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
const distance=(a:V3,b:V3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const positive=(n:number,label:string)=>{
    if(!Number.isFinite(n)||n<=0)throw new Error(label+' must be positive');
    return n;
};
const radians=d=>d*Math.PI/180;
const deg=r=>r*180/Math.PI;
export function planJunctionAutoConnectV2(
    roads:ReadonlyArray<JunctionConnectCandidateV2>,
    options:JunctionAutoConnectOptionsV2
):JunctionAutoConnectPlanV2 {
    if(!finite(options.center))throw new Error('Auto Connect requires a valid world center');
    const radius=positive(options.searchRadius??.75,'Auto Connect search radius');
    const maxHeight=positive(options.maxHeightDelta??.1,'Auto Connect max height');
    const minAngle=positive(options.minArmAngleDegrees??10,'Auto Connect min arm angle');
    if(minAngle>=60)throw new Error('Auto Connect min arm angle must be below 60 degrees');
    if(roads.length>256)throw new Error('Auto Connect supports at most 256 candidates');
    const roadIds=new Set<string>(),arms:JunctionAutoConnectArmV2[]=[];
    for(const road of roads){
        if(!road?.roadId||!road.pathId||!road.componentUuid||
           roadIds.has(road.roadId))
            throw new Error('Invalid/duplicate Auto Connect Road id');
        roadIds.add(road.roadId);
        if(!finite(road.start)||!finite(road.end)||
           !finite(road.startInside)||!finite(road.endInside)||
           !Number.isFinite(road.length)||road.length<=0)
            throw new Error('Auto Connect Road has invalid geometry');
        const nearStart=distance(road.start,options.center);
        const nearEnd=distance(road.end,options.center);
        const eligibleStart=nearStart<=radius&&
            Math.abs(road.start.y-options.center.y)<=maxHeight;
        const eligibleEnd=nearEnd<=radius&&
            Math.abs(road.end.y-options.center.y)<=maxHeight;
        if(!eligibleStart&&!eligibleEnd)continue;
        if(eligibleStart&&eligibleEnd)
            throw new Error('Both endpoints of Road '+road.roadId+
                ' are near Junction center; connection is ambiguous');
        const atEnd=eligibleEnd;
        const endpoint=atEnd?road.end:road.start;
        const inside=atEnd?road.endInside:road.startInside;
        const direction={x:inside.x-endpoint.x,y:inside.y-endpoint.y,
            z:inside.z-endpoint.z};
        const planar=Math.hypot(direction.x,direction.z);
        if(planar<1e-6)
            throw new Error('Auto Connect Road '+road.roadId+
                ' has a vertical/degenerate endpoint heading');
        if(distance(inside,options.center)<Math.min(.1,road.length*.05))
            throw new Error('Auto Connect Road '+road.roadId+' has collapsed tangent');
        const bearing=(Math.atan2(direction.z,direction.x)+Math.PI*2)%
            (Math.PI*2);
        arms.push({roadId:road.roadId,pathId:road.pathId,
            componentUuid:road.componentUuid,atEnd,
            distance:atEnd?nearEnd:nearStart,endpoint,
            direction:{x:direction.x/planar,y:0,z:direction.z/planar},
            bearingDegrees:deg(bearing)});
    }
    if(arms.length<3||arms.length>4)
        throw new Error('Auto Connect needs exactly 3 or 4 nearby Road endpoints; found '+arms.length);
    const paths=new Set<string>(),components=new Set<string>();
    for(const arm of arms){
        if(paths.has(arm.pathId))
            throw new Error('Auto Connect requires distinct Path Sources for connected Roads');
        if(components.has(arm.componentUuid))
            throw new Error('Auto Connect duplicate Road component UUID');
        paths.add(arm.pathId);components.add(arm.componentUuid);
    }
    arms.sort((a,b)=>a.bearingDegrees-b.bearingDegrees||
        a.roadId.localeCompare(b.roadId));
    for(let i=0;i<arms.length;i++){
        const a=arms[i],b=arms[(i+1)%arms.length];
        const sweep=(b.bearingDegrees-a.bearingDegrees+360)%360;
        if(sweep<minAngle-1e-5)
            throw new Error('Auto Connect has overlapping Road headings ('+
                sweep.toFixed(2)+' degrees); separate the arms');
    }
    return {center:options.center,searchRadius:radius,branches:arms};
}
