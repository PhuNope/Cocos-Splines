/** Pure bounded train consist route math. Distances are sampled WORLD arc
 * units. A single head coordinate determines every car; no per-car clock.
 */
import type {WorldArcSample} from './SplineWorldArcLength';
export interface TrainRouteLegInput {arc:readonly WorldArcSample[];backwards:boolean}
export interface TrainRouteLegMetric extends TrainRouteLegInput {start:number;end:number;length:number}
export interface TrainRouteMetric {legs:ReadonlyArray<TrainRouteLegMetric>;length:number;loop:boolean}
export interface TrainCarLocation {legIndex:number;progress:number;routeDistance:number}
export const MAX_TRAIN_CARS=128,MAX_TRAIN_LEGS=64;
export function compileTrainRoute(legs:ReadonlyArray<TrainRouteLegInput>,loop:boolean):TrainRouteMetric{
    if(!Array.isArray(legs)||legs.length<1||legs.length>MAX_TRAIN_LEGS||typeof loop!=='boolean')
        throw Error('Train route requires 1–64 legs.');
    let length=0;
    const prepared:TrainRouteLegMetric[]=[];
    for(const leg of legs as ReadonlyArray<TrainRouteLegInput>){
        if(!leg||typeof leg.backwards!=='boolean'||!Array.isArray(leg.arc)||leg.arc.length<2||leg.arc.length>4097)
            throw Error('Invalid train route arc.');
        let previous=-1,progress=-1;
        for(const s of leg.arc){
            if(!s||!Number.isFinite(s.distance)||s.distance<0||s.distance<previous||
               !Number.isFinite(s.progress)||s.progress<0||s.progress>1||s.progress<=progress)
                throw Error('Invalid train route arc samples.');
            previous=s.distance;progress=s.progress;
        }
        if(leg.arc[0].distance!==0||leg.arc[0].progress!==0||progress!==1||previous<=1e-8||length+previous>1e9)
            throw Error('Invalid train route length/endpoints.');
        // Input arc is immutable under the shared world arc cache contract.
        prepared.push({...leg,start:length,end:length+previous,length:previous});
        length+=previous;
    }
    return {legs:prepared,length,loop};
}
export function trainProgressAtDistance(arc:readonly WorldArcSample[],d:number):number{
    if(!Number.isFinite(d)||!arc.length)throw Error('Invalid train distance.');
    if(d<=0)return 0;
    if(d>=arc[arc.length-1].distance)return 1;
    let lo=0,hi=arc.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>>1;if(arc[mid].distance<d)lo=mid;else hi=mid;}
    const a=arc[lo],b=arc[hi],span=b.distance-a.distance;
    return span>0?a.progress+(b.progress-a.progress)*(d-a.distance)/span:a.progress;
}
export function trainTailOffset(carCount:number,spacing:number):number{
    if(!Number.isInteger(carCount)||carCount<1||carCount>MAX_TRAIN_CARS||!Number.isFinite(spacing)||spacing<.01||spacing>10000)
        throw Error('Train requires 1–128 cars and spacing .01–10000.');
    return (carCount-1)*spacing;
}
export function normalizeTrainHead(route:TrainRouteMetric,head:number,carCount:number,spacing:number):number{
    const tail=trainTailOffset(carCount,spacing);
    if(!Number.isFinite(head)||Math.abs(head)>1e12)throw Error('Invalid train head distance.');
    // A loop must have room for one more center spacing across its seam.
    if(route.loop?carCount*spacing>route.length:tail>route.length)
        throw Error('Train does not fit on route.');
    return route.loop?((head%route.length)+route.length)%route.length:Math.max(tail,Math.min(route.length,head));
}
export function locateTrainCars(route:TrainRouteMetric,head:number,carCount:number,spacing:number):TrainCarLocation[]{
    const h=normalizeTrainHead(route,head,carCount,spacing);
    return Array.from({length:carCount},(_,i)=>{
        let d=h-i*spacing;
        if(route.loop)d=((d%route.length)+route.length)%route.length;
        // Exact internal boundary belongs to the next leg (travel direction).
        let lo=0,hi=route.legs.length-1;
        while(lo<hi){const mid=(lo+hi)>>>1;if(d>=route.legs[mid].end)lo=mid+1;else hi=mid;}
        const leg=route.legs[lo],local=Math.max(0,Math.min(leg.length,d-leg.start));
        const progress=trainProgressAtDistance(leg.arc,leg.backwards?leg.length-local:local);
        return {legIndex:lo,progress,routeDistance:d};
    });
}
export function advanceTrainHead(route:TrainRouteMetric,head:number,speed:number,dt:number,carCount:number,spacing:number):{distance:number;arrived:boolean}{
    if(!Number.isFinite(speed)||speed<0||speed>10000||!Number.isFinite(dt)||dt<0||dt>1e6)
        throw Error('Invalid train speed or timestep.');
    const start=normalizeTrainHead(route,head,carCount,spacing);
    const distance=normalizeTrainHead(route,start+speed*dt,carCount,spacing);
    return {distance,arrived:!route.loop&&distance>=route.length};
}
