/** Pure deterministic arc-distance distribution. Population Graph validates
 * node schemas before calling; these helpers also validate their public input.
 * All candidates remain in original index order, including random samples.
 */
import {populationGate} from './SplinePopulationMath';
export interface PopulationDistributionSettings {
    type:string;count?:number;includeEnd?:boolean;spacing?:number;seed?:number;jitter?:number;
}
export interface PopulationDistributionSample {distance:number;progress:number}
const LIMIT=2048;
const finite=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
/** Domain separation from density/prefab RNG streams, even with equal seed.
 * The original gate excludes INT32_MIN; map that single XOR result safely. */
function gate(seed:number,index:number,salt:number):number{
    const mixed=(seed^salt)|0;
    return populationGate(mixed===-2147483648?2147483647:mixed,index);
}
export function distributionDistances(total:number,closed:boolean,n:Readonly<PopulationDistributionSettings>):PopulationDistributionSample[]{
    if(!finite(total,Number.MIN_VALUE,1e9)||typeof closed!=='boolean'||!n)
        throw Error('Invalid Population Graph distribution path length.');
    const sample=(progress:number):PopulationDistributionSample=>({progress,distance:progress*total});
    if(n.type==='spacing'){
        if(!finite(n.spacing,.001,10000)||(n.includeEnd!==undefined&&typeof n.includeEnd!=='boolean'))
            throw Error('Invalid Population Graph spacing.');
        // Multiplication by integer index avoids accumulating spacing error.
        // Exclude an exact endpoint except when explicitly requested on open
        // paths. No duplicate closed seam and no epsilon-expanded last step.
        const spacing=n.spacing,ratio=total/spacing;
        if(ratio>LIMIT)throw Error('Population Graph spacing exceeds 2048 candidates.');
        const result:PopulationDistributionSample[]=[];
        for(let i=0;i<LIMIT;i++){
            const distance=i*spacing;
            if(distance>=total)break;
            result.push({distance,progress:distance/total});
        }
        if(!closed&&n.includeEnd===true){
            if(result.length>=LIMIT)throw Error('Population Graph spacing exceeds 2048 candidates.');
            result.push(sample(1));
        }
        return result;
    }
    if(!finite(n.count,1,LIMIT)||!Number.isInteger(n.count))throw Error('Invalid Population Graph distribution count.');
    const count=n.count;
    if(n.type==='count'){
        if(n.includeEnd!==undefined&&typeof n.includeEnd!=='boolean')throw Error('Invalid Population Graph includeEnd.');
        const divisor=count===1?1:closed||n.includeEnd===false?count:count-1;
        return Array.from({length:count},(_,i)=>sample(i/divisor));
    }
    if(n.type!=='random'&&n.type!=='jitter')throw Error('Unknown Population Graph distribution type.');
    const seed=n.seed??0;
    if(!Number.isInteger(seed)||!finite(seed,-2147483647,2147483647))throw Error('Invalid Population Graph distribution seed.');
    if(n.type==='random')return Array.from({length:count},(_,i)=>sample(gate(seed,i,0x217a6b31)));
    const jitter=n.jitter??1;
    if(!finite(jitter,0,1))throw Error('Invalid Population Graph jitter.');
    // One sample inside each equal arc-length stratum. jitter=0 is centered;
    // jitter=1 fills the whole bin without crossing or duplicating endpoints.
    return Array.from({length:count},(_,i)=>sample((i+.5+(gate(seed,i,0x4b31a2d7)-.5)*jitter)/count));
}
/** Range masks existing candidates (no resampling or renumbering). Half-open
 * [start,end), except open endpoint 1 is inclusive. Wrapped ranges only on
 * closed sources; equal endpoints are empty, [0,1] is the entire path. */
export function inPopulationProgressRange(progress:number,start:number,end:number,closed:boolean):boolean{
    if(!finite(progress,0,1)||!finite(start,0,1)||!finite(end,0,1)||typeof closed!=='boolean'||(!closed&&start>end))
        throw Error('Invalid Population Graph range; wrapping requires a closed path.');
    if(start===end)return false;
    if(closed&&start>end)return progress>=start||progress<end;
    return progress>=start&&(progress<end||(!closed&&end===1&&progress===1));
}
