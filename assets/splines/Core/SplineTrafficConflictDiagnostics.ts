/** Read-only Cocos adapter for sampled downstream Junction trajectories.
 * Reports possible 3D centerline conflicts; never auto-mutates Conflict Pairs.
 */
import type {SplineJunction} from '../Components/SplineJunction';
import {JunctionExitDirection} from '../Components/SplineJunction';
import {headwayWorldArc} from './SplineHeadwayWorldArc';
import {worldArcDistanceAt,type WorldArcSample} from './SplineWorldArcLength';
import {analyzeTrafficConflictPaths,type ConflictProbePath,
    type ConflictGeometryReport,type ConflictPoint3} from './SplineTrafficConflictGeometry';

export interface TrafficProbeSettings {
    tolerance:number;
    lookaheadWorldDistance:number;
    ignoreJunctionWorldDistance:number;
    /** Optional per-exit WORLD road half-width; empty => centerline-only. */
    roadHalfWidths?:readonly number[];
    /** Vertical threshold independent of asphalt width. */
    verticalTolerance?:number;
}
export interface TrafficProbeReport extends ConflictGeometryReport {
    ok:boolean;
    validExits:number;
    sampledTrajectories:number;
    skipped:{exitIndex:number;reason:string}[];
    ambiguousExits:number[];
    warning:string;
}
const finite=(v:number)=>Number.isFinite(v);
function progressAtWorldArc(arc:readonly WorldArcSample[],distance:number):number{
    if(distance<=0)return 0;
    const end=arc[arc.length-1].distance;
    if(distance>=end)return 1;
    let left=0,right=arc.length-1;
    while(left+1<right){
        const mid=(left+right)>>1;
        if(arc[mid].distance<distance)left=mid;else right=mid;
    }
    const a=arc[left],b=arc[right],delta=b.distance-a.distance;
    return delta<=1e-10?b.progress:
        a.progress+(b.progress-a.progress)*(distance-a.distance)/delta;
}
function pointAtDistance(spline:NonNullable<SplineJunction['connections'][number]['spline']>,
    arc:readonly WorldArcSample[],distance:number,closed:boolean):ConflictPoint3{
    const total=arc[arc.length-1].distance;
    const d=closed?((distance%total)+total)%total:Math.max(0,Math.min(total,distance));
    const p=progressAtWorldArc(arc,d);
    const result=spline.evaluateWorldPosition(p);
    if(!result||![result.x,result.y,result.z].every(Number.isFinite))
        throw Error('Spline world position was nonfinite.');
    return {x:result.x,y:result.y,z:result.z};
}
export function probeJunctionTrafficConflicts(
    junction:SplineJunction,
    phases:readonly {greenExits:readonly number[]}[],
    conflicts:readonly {firstExit:number;secondExit:number}[],
    settings:TrafficProbeSettings={
        tolerance:.75,lookaheadWorldDistance:20,ignoreJunctionWorldDistance:1,
    },
):TrafficProbeReport {
    if(!junction||!Array.isArray(junction.connections)||
       junction.connections.length<2||junction.connections.length>32||
       !finite(settings.tolerance)||settings.tolerance<=0||settings.tolerance>20||
       !finite(settings.lookaheadWorldDistance)||settings.lookaheadWorldDistance<1||
       settings.lookaheadWorldDistance>200||
       !finite(settings.ignoreJunctionWorldDistance)||
       settings.ignoreJunctionWorldDistance<0||
       settings.ignoreJunctionWorldDistance>=settings.lookaheadWorldDistance||
       (settings.roadHalfWidths!==undefined&&(
           !Array.isArray(settings.roadHalfWidths)||
           settings.roadHalfWidths.length!==junction.connections.length||
           settings.roadHalfWidths.some((n:number)=>!finite(n)||n<0||n>100)))||
       (settings.verticalTolerance!==undefined&&(
           !finite(settings.verticalTolerance)||settings.verticalTolerance<=0||
           settings.verticalTolerance>100)))
        throw Error('Invalid traffic conflict diagnostic settings/Junction (2–32 connections).');
    const paths:ConflictProbePath[]=[],skipped:TrafficProbeReport['skipped']=[];
    const ambiguousExits:number[]=[];
    let validExits=0;
    for(let i=0;i<junction.connections.length;i++){
        const link=junction.connections[i],spline=link?.spline;
        if(!spline||spline.enabled===false||spline.node?.isValid===false||spline.count<2){
            skipped.push({exitIndex:i,reason:'Missing/disabled spline.'});continue;
        }
        try{
            const progress=link.getProgress();
            if(!finite(progress)||progress<0||progress>1)
                throw Error('Invalid connection progress.');
            const arc=headwayWorldArc(spline),total=arc[arc.length-1].distance;
            const from=worldArcDistanceAt(arc,progress),closed=!!spline.closed;
            const dirs=link.exitDirection===JunctionExitDirection.Forward?[1]:
                link.exitDirection===JunctionExitDirection.Backward?[-1]:[1,-1];
            const uncertain=dirs.length>1;
            if(uncertain)ambiguousExits.push(i);
            let added=0;
            for(const dir of dirs){
                const available=closed?Math.min(settings.lookaheadWorldDistance,total*.45):
                    dir===1?Math.min(settings.lookaheadWorldDistance,total-from):
                        Math.min(settings.lookaheadWorldDistance,from);
                if(available<=settings.ignoreJunctionWorldDistance+1e-5)continue;
                const points:ConflictPoint3[]=[];
                for(let step=0;step<=16;step++){
                    const walked=settings.ignoreJunctionWorldDistance+
                        (available-settings.ignoreJunctionWorldDistance)*step/16;
                    points.push(pointAtDistance(spline,arc,from+dir*walked,closed));
                }
                paths.push({exitIndex:i,points,uncertainDirection:uncertain,
                    halfWidth:settings.roadHalfWidths?.[i]??0});
                added++;
            }
            if(added)validExits++;
            else skipped.push({exitIndex:i,reason:'No outgoing world arc beyond ignore distance.'});
        }catch(error){
            skipped.push({exitIndex:i,reason:String(error instanceof Error?error.message:error)});
        }
    }
    const report=analyzeTrafficConflictPaths(paths,conflicts,phases,settings.tolerance,
        settings.verticalTolerance??settings.tolerance);
    return {...report,ok:true,validExits,sampledTrajectories:paths.length,
        skipped,ambiguousExits,
        warning:'Approximate sampled World trajectory proximity. Explicit road half-widths are optional; vertical clearance is checked separately. No Mesh/Collider collision is solved; verify every candidate and declare conflicts manually.'};
}
