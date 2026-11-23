/** Pure, opt-in same-spline world-arc headway planner.
 * Not a collision system: compares arc distances on the shared spline
 * centerline, with no lane occupancy, vehicle bounds, or crossing geometry.
 */
import {worldArcDistanceAt,type WorldArcSample} from './SplineWorldArcLength';
export type TravelDirection=1|-1;
export interface HeadwayPosition {
    track:object;progress:number;direction:TravelDirection;
}
export interface HeadwayPlan {
    progress:number;limited:boolean;stopped:boolean;
    nearestWorldGap:number|null;availableWorldDistance:number|null;
    leader:object|null;
}
const finite=(n:number)=>Number.isFinite(n);
function fromWorldDistance(arc:readonly WorldArcSample[],distance:number):number{
    const end=arc[arc.length-1].distance;
    if(distance<=0)return 0;
    if(distance>=end)return 1;
    let low=0,high=arc.length-1;
    while(low+1<high){
        const mid=(low+high)>>1;
        if(arc[mid].distance<distance)low=mid;else high=mid;
    }
    const a=arc[low],b=arc[high];
    const length=b.distance-a.distance;
    return length<=1e-12?b.progress:
        a.progress+(b.progress-a.progress)*(distance-a.distance)/length;
}
/** Arc table measures WORLD distance along the spline centerline.
 * The returned position is in LOCAL normalized-arc progress.
 */
export function planHeadway(
    own:object,track:object,from:number,to:number,direction:TravelDirection,
    vehicles:ReadonlyMap<object,HeadwayPosition>,arc:readonly WorldArcSample[],
    closed:boolean,minGap:number,brakeRange=0,
):HeadwayPlan{
    if(!own||!track||!Array.isArray(arc)||arc.length<2||!finite(from)||
       !finite(to)||from<0||from>1||to<0||to>1||
       ![1,-1].includes(direction)||direction*(to-from)<-1e-9||
       typeof closed!=='boolean'||!finite(minGap)||minGap<0||
       !finite(brakeRange)||brakeRange<0)
        throw Error('Invalid spline headway query.');
    const total=arc[arc.length-1].distance;
    if(!finite(total)||total<=1e-9)
        throw Error('Spline headway requires a positive world arc length.');
    const start=worldArcDistanceAt(arc,from),finish=worldArcDistanceAt(arc,to);
    const requested=Math.abs(finish-start);
    let gap=Infinity,leader:object|null=null;
    for(const [id,state] of vehicles){
        if(id===own||state.track!==track||!finite(state.progress)||
           state.progress<0||state.progress>1)continue;
        const where=worldArcDistanceAt(arc,state.progress);
        let candidate=direction===1?where-start:start-where;
        if(closed&&candidate<0)candidate+=total;
        // Equal positions are overlapping; never treat 0 as one full loop.
        if(candidate<-1e-8)continue;
        if(candidate<gap){gap=candidate;leader=id;}
    }
    if(leader===null||requested<=1e-12)
        return {progress:to,limited:false,stopped:false,
            nearestWorldGap:leader===null?null:gap,
            availableWorldDistance:leader===null?null:Math.max(0,gap-minGap),
            leader};
    const clearance=Math.max(0,gap-minGap);
    let allowed=Math.min(requested,clearance);
    if(brakeRange>1e-9&&clearance<brakeRange)
        allowed=Math.min(allowed,requested*Math.max(0,clearance/brakeRange));
    const limited=allowed<requested-1e-8;
    if(!limited)return {progress:to,limited:false,stopped:false,
        nearestWorldGap:gap,availableWorldDistance:clearance,leader};
    const stopped=allowed<=1e-8;
    const targetDistance=start+direction*allowed;
    const progress=stopped?from:fromWorldDistance(arc,targetDistance);
    return {progress:Math.max(0,Math.min(1,progress)),limited:true,stopped,
        nearestWorldGap:gap,availableWorldDistance:clearance,leader};
}
/** Shared state for active, opt-in followers. Old positions stay registered when
 * a follower pauses (it remains an obstacle). Disabled/destroyed followers leave.
 */
export class SplineHeadwayRegistry {
    private readonly positions=new Map<object,HeadwayPosition>();
    public set(owner:object,track:object,progress:number,direction:TravelDirection):void{
        if(!owner||!track||!finite(progress)||progress<0||progress>1||
           (direction!==1&&direction!==-1))
            throw Error('Invalid spline headway position.');
        this.positions.set(owner,{track,progress,direction});
    }
    public remove(owner:object):void{this.positions.delete(owner);}
    public get(owner:object):HeadwayPosition|null{
        const p=this.positions.get(owner);return p?{...p}:null;
    }
    public get size():number{return this.positions.size;}
    public limit(owner:object,track:object,from:number,to:number,
        direction:TravelDirection,arc:readonly WorldArcSample[],
        closed:boolean,minGap:number,brakeRange=0):HeadwayPlan{
        return planHeadway(owner,track,from,to,direction,this.positions,arc,
            closed,minGap,brakeRange);
    }
    public clear():void{this.positions.clear();}
}
export const splineHeadwayRegistry=new SplineHeadwayRegistry();
