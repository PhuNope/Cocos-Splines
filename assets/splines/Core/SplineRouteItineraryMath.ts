import type {NetworkDirection,NetworkRoute} from './SplineNetworkGraph';
/** Pure, bounded sequential itinerary preview. Each leg uses the actual
 * direction of the chosen preceding route (empty path preserves direction).
 * This is a greedy preview, not a global multi-waypoint optimization. */
export interface ItineraryAnchor<T>{spline:T;progress:number}
export interface ItineraryWaypoint<T> extends ItineraryAnchor<T>{dwellSeconds:number}
export interface ItineraryDiagnosis{status:'reachable'|'unreachable'|'invalid';message:string;route:NetworkRoute|null}
export interface ItineraryLeg<T>{
    waypointIndex:number;repeatReturn:boolean;from:ItineraryAnchor<T>|null;to:ItineraryAnchor<T>;
    startDirection:NetworkDirection|null;arrivalDirection:NetworkDirection|null;
    status:'reachable'|'unreachable'|'invalid'|'unchecked';message:string;route:NetworkRoute|null;
}
export interface ItineraryPreview<T>{
    status:'reachable'|'unreachable'|'invalid';message:string;costSpace:'local'|'world';
    distance:number;cost:number;switchCount:number;dwellSeconds:number;legs:ItineraryLeg<T>[];
}
export function previewSplineItinerary<T>(
    start:ItineraryAnchor<T>,direction:NetworkDirection,waypoints:ReadonlyArray<ItineraryWaypoint<T>>,
    startIndex:number,repeat:boolean,costSpace:'local'|'world',
    inspect:(from:ItineraryAnchor<T>,direction:NetworkDirection,to:ItineraryAnchor<T>)=>ItineraryDiagnosis
):ItineraryPreview<T>{
    const validAnchor=(a:ItineraryAnchor<T>)=>!!a&&!!a.spline&&Number.isFinite(a.progress)&&a.progress>=0&&a.progress<=1;
    if(!validAnchor(start)||![1,-1].includes(direction)||!Array.isArray(waypoints)||waypoints.length<1||waypoints.length>128||
       !Number.isInteger(startIndex)||startIndex<0||startIndex>=waypoints.length||typeof repeat!=='boolean'||
       !['local','world'].includes(costSpace)||Array.from(waypoints).some(w=>!validAnchor(w)||!Number.isFinite(w.dwellSeconds)||w.dwellSeconds<0||w.dwellSeconds>3600))
        throw Error('Invalid itinerary preview inputs.');
    const indexes=waypoints.map((_,i)=>i).slice(startIndex);if(repeat)indexes.push(0);
    const report:ItineraryPreview<T>={status:'reachable',message:'All preview legs reachable.',costSpace,distance:0,cost:0,switchCount:0,dwellSeconds:0,legs:[]};
    let from={...start},dir=direction;
    for(let i=0;i<indexes.length;i++){
        const index=indexes[i],w=waypoints[index],to={spline:w.spline,progress:w.progress},repeatReturn=repeat&&i===indexes.length-1;
        if(report.status!=='reachable'){
            report.legs.push({waypointIndex:index,repeatReturn,from:null,to,startDirection:null,arrivalDirection:null,status:'unchecked',message:'Previous leg failed.',route:null});continue;
        }
        let d:ItineraryDiagnosis;
        try{d=inspect({...from},dir,{...to});}catch(error){d={status:'invalid',message:String(error),route:null};}
        const route=d.route;
        if(d.status==='reachable'&&(!route||!Array.isArray(route.steps)||![route.distance,route.cost,route.switchCount].every(n=>Number.isFinite(n)&&n>=0)))
            d={status:'invalid',message:'Invalid planner result.',route:null};
        const end=d.status==='reachable'?(d.route!.steps[d.route!.steps.length-1]?.direction??dir):null;
        if(end!==null&&end!==1&&end!==-1)throw Error('Invalid itinerary arrival direction.');
        const copy=d.status==='reachable'?{...d.route!,steps:d.route!.steps.map(s=>({...s}))}:null;
        report.legs.push({waypointIndex:index,repeatReturn,from:{...from},to,startDirection:dir,arrivalDirection:end,status:d.status,message:d.message,route:copy});
        if(!copy||end===null){report.status=d.status==='unreachable'?'unreachable':'invalid';report.message=d.message;continue;}
        report.distance+=copy.distance;report.cost+=copy.cost;report.switchCount+=copy.switchCount;
        // Return segment only tests closure; do not count its dwell twice.
        if(!repeatReturn)report.dwellSeconds+=w.dwellSeconds;
        from={...to};dir=end;
    }
    return report;
}
