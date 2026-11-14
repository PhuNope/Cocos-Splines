import {type V3} from '../core/SplineCurves';

/**
 * Read-only junction connection/trim planner. Inspired by the explicit
 * connection + snap models in SplineArchitect/Curvy, NOT copied Unity code.
 * All positions/headings are WORLD-space; trim budgets use world metres.
 * No Node, serialized Knot, mesh, or terrain is modified by this module.
 */
export interface JunctionRoadCandidateV2 {
    readonly roadId:string;
    readonly start:V3;
    readonly end:V3;
    /** Position just INSIDE the Road from each endpoint, in world space. */
    readonly startInside:V3;
    readonly endInside:V3;
    readonly length:number;
    /** Full Road half-width, including shoulder/curb. */
    readonly halfWidth:number;
    readonly currentStartTrim:number;
    readonly currentEndTrim:number;
}
export interface JunctionAutoTrimOptionsV2 {
    readonly center:V3;
    readonly endpointTolerance?:number;
    readonly centerTolerance?:number;
    readonly heightTolerance?:number;
    readonly minimumTrim?:number;
    readonly cornerMargin?:number;
    readonly maximumTrimFraction?:number;
}
export interface JunctionAutoTrimBranchV2 {
    readonly roadId:string;
    readonly atEnd:boolean;
    readonly endpoint:V3;
    readonly snapDelta:V3;
    readonly centerDistance:number;
    readonly trim:number;
    readonly currentTrim:number;
    readonly angleBeforeDegrees:number;
    readonly angleAfterDegrees:number;
}
export interface JunctionAutoTrimPlanV2 {
    readonly center:V3;
    readonly maximumEndpointGap:number;
    readonly branches:ReadonlyArray<JunctionAutoTrimBranchV2>;
}
const finite=(p:V3):boolean=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
const minus=(a:V3,b:V3):V3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dist=(a:V3,b:V3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const flat=(a:V3,b:V3)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const degrees=(r:number)=>r*180/Math.PI;
const positive=(v:number,name:string,allowZero=false)=>{
    if(!Number.isFinite(v)||(allowZero?v<0:v<=0))
        throw new Error(name+' must be '+(allowZero?'non-negative':'positive'));
    return v;
};
/** Does not silently snap Nodes, alter Knot values or override an authored Bake. */
export function planJunctionAutoTrimV2(
    roads:ReadonlyArray<JunctionRoadCandidateV2>,
    options:JunctionAutoTrimOptionsV2
):JunctionAutoTrimPlanV2 {
    if(roads.length!==3&&roads.length!==4)
        throw new Error('Auto Trim needs exactly 3 or 4 different linked Roads');
    if(!finite(options.center))throw new Error('Invalid Junction world center');
    const endpointTolerance=positive(options.endpointTolerance??.25,'Endpoint tolerance');
    const centerTolerance=positive(options.centerTolerance??Math.max(1,endpointTolerance*4),'Center tolerance');
    const heightTolerance=positive(options.heightTolerance??.1,'Height tolerance');
    const minimumTrim=positive(options.minimumTrim??.5,'Minimum trim',true);
    const cornerMargin=positive(options.cornerMargin??.25,'Corner margin',true);
    const fraction=positive(options.maximumTrimFraction??.45,'Maximum trim fraction');
    if(fraction>=.5)throw new Error('Maximum trim fraction must be below 0.5');
    const seen=new Set<string>();
    const entries=roads.map((road,index)=>{
        if(!road.roadId||seen.has(road.roadId))
            throw new Error('Duplicate/invalid Road at branch '+index);
        seen.add(road.roadId);
        for(const p of [road.start,road.end,road.startInside,road.endInside])
            if(!finite(p))throw new Error('Non-finite Road endpoint or tangent');
        positive(road.length,'Road length');
        positive(road.halfWidth,'Road half-width');
        positive(road.currentStartTrim,'Start trim',true);
        positive(road.currentEndTrim,'End trim',true);
        const dStart=dist(road.start,options.center);
        const dEnd=dist(road.end,options.center);
        const near=Math.min(dStart,dEnd),far=Math.max(dStart,dEnd);
        if(near>centerTolerance)
            throw new Error('Road '+road.roadId+' has no endpoint near Junction center');
        if(far-near<1e-5)
            throw new Error('Road '+road.roadId+' endpoint choice is ambiguous');
        const atEnd=dEnd<dStart;
        const endpoint=atEnd?road.end:road.start;
        const inside=atEnd?road.endInside:road.startInside;
        const heading=minus(inside,endpoint);
        const planar=Math.hypot(heading.x,heading.z);
        if(planar<=1e-6)
            throw new Error('Road '+road.roadId+' has a zero/vertical endpoint direction');
        const angle=Math.atan2(heading.z,heading.x);
        return {road,atEnd,endpoint,angle,heading,centerDistance:near};
    });
    let maximumEndpointGap=0;
    for(let i=0;i<entries.length;i++)
        for(let j=i+1;j<entries.length;j++){
            const a=entries[i].endpoint,b=entries[j].endpoint;
            maximumEndpointGap=Math.max(maximumEndpointGap,dist(a,b));
            if(flat(a,b)>endpointTolerance||
               Math.abs(a.y-b.y)>heightTolerance)
                throw new Error('Junction Road endpoints are not connected within tolerances');
        }
    const ordered=entries.map((entry,index)=>({...entry,index}))
        .sort((a,b)=>a.angle-b.angle);
    const results=new Array<JunctionAutoTrimBranchV2>(roads.length);
    for(let k=0;k<ordered.length;k++){
        const here=ordered[k],before=ordered[(k+ordered.length-1)%ordered.length];
        const after=ordered[(k+1)%ordered.length];
        const sweep=(a:number,b:number)=>{
            const angle=((b-a+Math.PI*2)%(Math.PI*2));
            // A near-parallel pair cannot form a bounded planar corner.
            if(angle<8*Math.PI/180)
                throw new Error('Two Junction Road arms have nearly identical headings');
            return angle;
        };
        const beforeAngle=sweep(before.angle,here.angle);
        const afterAngle=sweep(here.angle,after.angle);
        const needsTrim=(neighbor:typeof here,angle:number)=>{
            // The intersection of lateral edge lines for an acute wedge
            // moves farther from center as the angle narrows.
            if(angle>=Math.PI-1e-6)return minimumTrim;
            const safeHalfWidth=Math.max(here.road.halfWidth,neighbor.road.halfWidth);
            return Math.max(minimumTrim,safeHalfWidth/Math.tan(angle/2)+cornerMargin);
        };
        const trim=Math.max(needsTrim(before,beforeAngle),
            needsTrim(after,afterAngle));
        if(!Number.isFinite(trim)||trim>here.road.length*fraction)
            throw new Error('Road '+here.road.roadId+
                ' is too short for safe Junction trim; lengthen arm, widen its angle or narrow the Road');
        const currentTrim=here.atEnd?here.road.currentEndTrim:here.road.currentStartTrim;
        results[here.index]={
            roadId:here.road.roadId,atEnd:here.atEnd,
            endpoint:here.endpoint,
            snapDelta:minus(options.center,here.endpoint),
            centerDistance:here.centerDistance,
            trim:Math.round(trim*1e4)/1e4,
            currentTrim,
            angleBeforeDegrees:degrees(beforeAngle),
            angleAfterDegrees:degrees(afterAngle)
        };
    }
    return {center:options.center,maximumEndpointGap,branches:results};
}
