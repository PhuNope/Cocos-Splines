import {worldArcDistanceAt,type WorldArcSample} from './SplineWorldArcLength';
export enum GroupFormationMode {NormalizedRange=0,WorldRange=1,FixedWorldSpacing=2}
export interface GroupFormationPoint {index:number;progress:number;worldDistance:number}
export interface GroupFormationPlan {points:GroupFormationPoint[];worldLength:number;rangeLength:number;closed:boolean;fullLoop:boolean;minWorldGap:number|null}
const wrap=(x:number,l:number)=>x>=l?x-l:x;
function inverse(arc:readonly WorldArcSample[],distance:number):number{
    if(distance<=0)return 0;
    if(distance>=arc[arc.length-1].distance)return 1;
    let lo=0,hi=arc.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>>1;if(arc[mid].distance<distance)lo=mid;else hi=mid;}
    const a=arc[lo],b=arc[hi];
    return b.distance>a.distance?a.progress+(b.progress-a.progress)*(distance-a.distance)/(b.distance-a.distance):a.progress;
}
function metric(arc:readonly WorldArcSample[]):number{
    if(!Array.isArray(arc)||arc.length<2||arc.length>4097||arc[0]?.distance!==0||arc[0]?.progress!==0||arc[arc.length-1]?.progress!==1)
        throw Error('Invalid group world arc endpoints.');
    let prev=-1,p=-1;
    for(const a of arc){
        if(!a||!Number.isFinite(a.progress)||a.progress<=p||a.progress>1||!Number.isFinite(a.distance)||a.distance<prev||a.distance<0)
            throw Error('Invalid group world arc samples.');
        prev=a.distance;p=a.progress;
    }
    if(prev<=1e-8||prev>1e9)throw Error('Invalid group world arc length.');
    return prev;
}
export function groupWorldGaps(arc:readonly WorldArcSample[],progresses:ReadonlyArray<number>,closed:boolean):{worldLength:number;minWorldGap:number|null;maxWorldGap:number|null;gaps:number[]}{
    const length=metric(arc);
    if(!Array.isArray(progresses)||progresses.length<1||progresses.length>128||typeof closed!=='boolean'||
       Array.from(progresses).some(p=>!Number.isFinite(p)||p<0||p>1))throw Error('Invalid group progress list.');
    const distances=progresses.map(p=>{const d=worldArcDistanceAt(arc,p);return closed&&d===length?0:d;}).sort((a,b)=>a-b);
    const gaps=distances.slice(1).map((d,i)=>d-distances[i]);
    if(closed&&distances.length>1)gaps.push(length-distances[distances.length-1]+distances[0]);
    return {worldLength:length,minWorldGap:gaps.length?Math.min(...gaps):null,maxWorldGap:gaps.length?Math.max(...gaps):null,gaps};
}
/** Forward normalized range; a closed wrapped range crosses seam once.
 * Equal endpoints are a point, not a full loop; use 0..1 for full loop.
 * Backwards reverses member ordering and the caller sets travel direction. */
export function planGroupFormation(arc:readonly WorldArcSample[],closed:boolean,count:number,mode:GroupFormationMode,
    start:number,end:number,spacing:number,backwards=false):GroupFormationPlan{
    const length=metric(arc);
    if(typeof closed!=='boolean'||typeof backwards!=='boolean'||!Number.isInteger(count)||count<1||count>128||
       ![0,1,2].includes(mode)||![start,end].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||
       !Number.isFinite(spacing)||spacing<.001||spacing>10000||(!closed&&end<start))
        throw Error('Invalid group formation settings.');
    const fullLoop=closed&&start===0&&end===1;
    const span=end-start+(closed&&end<start?1:0);
    const startWorld=worldArcDistanceAt(arc,start),endWorld=worldArcDistanceAt(arc,end);
    const rangeLength=endWorld-startWorld+(closed&&end<start?length:0);
    if(count>1&&(span<=0||rangeLength<=1e-8))throw Error('Group formation range has no usable length.');
    if(mode===GroupFormationMode.FixedWorldSpacing&&((count-1)*spacing>rangeLength||
       (fullLoop&&count>1&&count*spacing>length)))throw Error('Group formation does not fit requested spacing.');
    const divisions=fullLoop?count:Math.max(1,count-1);
    const values=Array.from({length:count},(_,i)=>{
        let progress:number,worldDistance:number;
        if(mode===GroupFormationMode.NormalizedRange){
            const raw=start+span*i/divisions;
            progress=closed?wrap(raw,1):Math.min(1,raw);
            worldDistance=worldArcDistanceAt(arc,progress);
        }else{
            const raw=startWorld+(mode===GroupFormationMode.FixedWorldSpacing?i*spacing:rangeLength*i/divisions);
            worldDistance=closed?wrap(raw,length):Math.min(length,raw);
            progress=inverse(arc,worldDistance);
        }
        return {progress,worldDistance};
    });
    if(backwards)values.reverse();
    const points=values.map((p,index)=>({...p,index}));
    const gaps=groupWorldGaps(arc,points.map(p=>p.progress),closed);
    if(gaps.minWorldGap!==null&&gaps.minWorldGap<=1e-8)throw Error('Group formation contains overlapping centers.');
    return {points,worldLength:length,rangeLength,closed,fullLoop,minWorldGap:gaps.minWorldGap};
}
