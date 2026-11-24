/**
 * Pure, read-only diagnostic attribution for the exact population pipeline.
 * Every stage is a stable, ordered subset of its input. Positions on a rejected
 * marker are those at the latest completed stage (surface output if present).
 */
import type {PopulationCandidate,PopulationRejectReason,PopulationVector} from './SplinePopulationMath';
export type PlacementReason='accepted'|'surface'|'collider'|'peer'|PopulationRejectReason;
export interface PlacementDiagnostic {
    index:number;
    progress:number;
    position:PopulationVector;
    radius:number;
    reason:PlacementReason;
}
export interface PlacementDiagnosticStages {
    planned:ReadonlyArray<PopulationCandidate>;
    projected:ReadonlyArray<PopulationCandidate>;
    obstacle:ReadonlyArray<PopulationCandidate>;
    peers:ReadonlyArray<PopulationCandidate>;
    accepted:ReadonlyArray<number>;
    finalRejections:ReadonlyArray<{index:number;reason:PopulationRejectReason}>;
    radii?:ReadonlyMap<number,number>;
    defaultRadius:number;
}
const finite=(v:number)=>typeof v==='number'&&Number.isFinite(v);
const point=(p:PopulationVector)=>!!p&&[p.x,p.y,p.z].every(x=>finite(x)&&Math.abs(x)<=1e7);
/** Validate ordered subset relationships; malformed snapshots must not paint
 * misleading reasons in the Editor. Never change the input objects or arrays.
 */
export function attributePlacementDiagnostics(stages:PlacementDiagnosticStages):PlacementDiagnostic[]{
    if(!stages||!finite(stages.defaultRadius)||stages.defaultRadius<0||stages.defaultRadius>100)
        throw Error('Invalid Placement diagnostic radius.');
    const arrays=[stages.planned,stages.projected,stages.obstacle,stages.peers];
    if(arrays.some(list=>!Array.isArray(list)||list.length>2048)||
       !Array.isArray(stages.accepted)||stages.accepted.length>2048||
       !Array.isArray(stages.finalRejections)||stages.finalRejections.length>2048)
        throw Error('Invalid Placement diagnostic candidate bounds.');
    let previous=new Map<number,PopulationCandidate>();
    for(let k=0;k<arrays.length;k++){
        const current=new Map<number,PopulationCandidate>();
        let last=-1;
        for(const c of arrays[k]){
            if(!c||!Number.isInteger(c.index)||c.index<=last||c.index>2047||
                !finite(c.progress)||c.progress<0||c.progress>1||!point(c.position)||
                (k>0&&!previous.has(c.index)))
                throw Error('Invalid ordered diagnostic candidate stage.');
            current.set(c.index,c);last=c.index;
        }
        previous=current;
    }
    const peerKeys=new Set(stages.peers.map(c=>c.index));
    const accepted=new Set<number>();
    for(const i of stages.accepted){
        if(!Number.isInteger(i)||!peerKeys.has(i)||accepted.has(i))
            throw Error('Invalid accepted placement candidate.');
        accepted.add(i);
    }
    const finalReasons=new Map<number,PopulationRejectReason>();
    for(const item of stages.finalRejections){
        if(!item||!peerKeys.has(item.index)||accepted.has(item.index)||
            finalReasons.has(item.index)||
            !['exclusion','density','spacing'].includes(item.reason))
            throw Error('Invalid final rejection classification.');
        finalReasons.set(item.index,item.reason);
    }
    if(accepted.size+finalReasons.size!==peerKeys.size)
        throw Error('Final placement attribution is incomplete.');
    const projected=new Map(stages.projected.map(c=>[c.index,c]));
    const obstacle=new Set(stages.obstacle.map(c=>c.index));
    const peers=new Set(stages.peers.map(c=>c.index));
    const results:PlacementDiagnostic[]=[];
    for(const candidate of stages.planned){
        const proj=projected.get(candidate.index);
        const radius=stages.radii?.get(candidate.index)??stages.defaultRadius;
        if(!finite(radius)||radius<0||radius>100)
            throw Error('Invalid diagnostic candidate radius.');
        const reason:PlacementReason=!proj?'surface':
            !obstacle.has(candidate.index)?'collider':
            !peers.has(candidate.index)?'peer':
            accepted.has(candidate.index)?'accepted':
            finalReasons.get(candidate.index)!;
        if(!reason)throw Error('Unknown placement rejection.');
        const position=proj?.position??candidate.position;
        results.push({index:candidate.index,progress:candidate.progress,
            position:{x:position.x,y:position.y,z:position.z},radius,reason});
    }
    return results;
}
/** Preview has at most N markers with representation across reason classes.
 * Never drops a complete reason class when N >= the number of present classes.
 */
export function samplePlacementMarkers(items:ReadonlyArray<PlacementDiagnostic>,limit:number):
    PlacementDiagnostic[] {
    if(!Array.isArray(items)||items.length>2048||
       !Number.isInteger(limit)||limit<1||limit>256)
        throw Error('Invalid Placement marker sample limit.');
    if(items.length<=limit)return items.slice();
    const chosen=new Set<number>();
    for(const p of items){
        if(chosen.size>=limit)break;
        if(!items.some((q,i)=>chosen.has(i)&&q.reason===p.reason))
            chosen.add(items.indexOf(p));
    }
    const remaining=limit-chosen.size,step=items.length/Math.max(1,remaining);
    for(let i=0;i<remaining;i++)chosen.add(Math.min(items.length-1,Math.floor((i+.5)*step)));
    for(let i=0;i<items.length&&chosen.size<limit;i++)chosen.add(i);
    return [...chosen].sort((a,b)=>a-b).slice(0,limit).map(i=>items[i]);
}
