/**
 * Opt-in, deterministic population candidate policy.
 * Operates ONLY on planned World-space centers and normalized spline progress;
 * it never creates/destroys Nodes, reads physics or mutates source geometry.
 */
export interface PopulationVector {x:number;y:number;z:number}
export interface PopulationDensityKey {progress:number;density:number}
export interface PopulationExclusion {startProgress:number;endProgress:number}
export interface PopulationCandidate {index:number;progress:number;position:PopulationVector}
export interface PopulationPolicy {
    density:number;
    densityKeys:ReadonlyArray<PopulationDensityKey>;
    exclusions:ReadonlyArray<PopulationExclusion>;
    minWorldSpacing:number;
    seed:number;
    closed:boolean;
}
const valid=(x:number,lo:number,hi:number):boolean=>
    typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi;
const mod1=(n:number):number=>((n%1)+1)%1;
const mix=(v:number):number=>{
    v=Math.imul(v^(v>>>16),0x7feb352d);
    v=Math.imul(v^(v>>>15),0x846ca68b);
    return (v^(v>>>16))>>>0;
};
export function populationGate(seed:number,index:number):number {
    if(!Number.isSafeInteger(seed)||Math.abs(seed)>2147483647||
       !Number.isSafeInteger(index)||index<0||index>2047)
        throw Error('Invalid population seed or candidate index.');
    return mix((seed|0)^Math.imul(index+13,0x9e3779b9)^0x56d95c17)/4294967296;
}
export function validatePopulationPolicy(policy:PopulationPolicy):void {
    if(!policy||!Number.isSafeInteger(policy.seed)||Math.abs(policy.seed)>2147483647||
       typeof policy.closed!=='boolean'||!valid(policy.density,0,1)||
       !valid(policy.minWorldSpacing,0,10000)||
       !Array.isArray(policy.densityKeys)||policy.densityKeys.length>64||
       !Array.isArray(policy.exclusions)||policy.exclusions.length>64)
        throw Error('Invalid population policy, seed or array limits.');
    const seen=new Set<number>();
    for(const key of policy.densityKeys){
        if(!key||!valid(key.progress,0,1)||!valid(key.density,0,1))
            throw Error('Density keys need finite progress/density in [0,1].');
        const progress=policy.closed?mod1(key.progress):key.progress;
        if(seen.has(progress))throw Error('Density keys must have distinct progress positions.');
        seen.add(progress);
    }
    for(const gap of policy.exclusions){
        if(!gap||!valid(gap.startProgress,0,1)||!valid(gap.endProgress,0,1)||
            (!policy.closed&&gap.startProgress>gap.endProgress))
            throw Error('Invalid exclusion interval; wrapping is allowed only for closed splines.');
    }
}
function densityAtSorted(keys:ReadonlyArray<PopulationDensityKey>,
    progress:number,closed:boolean):number {
    if(keys.length===0)return 1;
    if(keys.length===1)return keys[0].density;
    const p=closed?mod1(progress):progress;
    if(!closed){
        if(p<=keys[0].progress)return keys[0].density;
        if(p>=keys[keys.length-1].progress)return keys[keys.length-1].density;
        for(let i=1;i<keys.length;i++){
            const a=keys[i-1],b=keys[i];
            if(p<=b.progress){
                const w=(p-a.progress)/(b.progress-a.progress);
                return a.density+(b.density-a.density)*w;
            }
        }
    }else{
        // Across a closed loop the first and last keys interpolate through seam.
        for(let i=0;i<keys.length;i++){
            const a=keys[i],b=keys[(i+1)%keys.length];
            const end=i===keys.length-1?b.progress+1:b.progress;
            const x=p<a.progress?p+1:p;
            if(x>=a.progress&&x<=end){
                const w=(x-a.progress)/(end-a.progress);
                return a.density+(b.density-a.density)*w;
            }
        }
    }
    throw Error('Population density interpolation failed.');
}
function excluded(p:number,intervals:ReadonlyArray<PopulationExclusion>,closed:boolean):boolean {
    for(const interval of intervals){
        const a=interval.startProgress,b=interval.endProgress;
        if(a===b)continue; // zero-width interval is a no-op
        if(closed){
            const t=mod1(p),start=mod1(a),end=mod1(b);
            if(a===0&&b===1)return true; // explicitly exclude whole circle
            if(start<end?t>=start&&t<end:t>=start||t<end)return true;
        }else if(p>=a&&(p<b||(b===1&&p===1)))return true;
    }
    return false;
}
function cellKey(x:number,y:number,z:number):string {
    return x+','+y+','+z;
}
/** Keeps original candidate indexes. Rejected candidates never consume/shift RNG. */
export function planPopulation(
    candidates:ReadonlyArray<PopulationCandidate>,policy:PopulationPolicy
):number[] {
    validatePopulationPolicy(policy);
    if(!Array.isArray(candidates)||candidates.length>2048)
        throw Error('Population supports up to 2048 candidates.');
    // Validate every candidate before accepting any; pure call has no side effects.
    let last=-1;
    for(const candidate of candidates){
        if(!candidate||!Number.isInteger(candidate.index)||candidate.index<=last||
           candidate.index>2047||!valid(candidate.progress,0,1)||
           !candidate.position||
           !valid(candidate.position.x,-1e7,1e7)||
           !valid(candidate.position.y,-1e7,1e7)||
           !valid(candidate.position.z,-1e7,1e7))
            throw Error('Population candidates must be finite and ordered by unique index.');
        last=candidate.index;
    }
    const keys=policy.densityKeys.map(k=>({
        progress:policy.closed?mod1(k.progress):k.progress,density:k.density,
    })).sort((a,b)=>a.progress-b.progress);
    const kept:number[]=[];
    const spacing=policy.minWorldSpacing,spacing2=spacing*spacing;
    const grid=new Map<string,PopulationVector[]>();
    for(const candidate of candidates){
        if(excluded(candidate.progress,policy.exclusions,policy.closed))continue;
        const threshold=policy.density*densityAtSorted(keys,candidate.progress,policy.closed);
        if(threshold<=0|| (threshold<1&&populationGate(policy.seed,candidate.index)>=threshold))
            continue;
        const p=candidate.position;
        if(spacing>0){
            const x=Math.floor(p.x/spacing),y=Math.floor(p.y/spacing),z=Math.floor(p.z/spacing);
            let blocked=false;
            for(let dx=-1;dx<=1&&!blocked;dx++)
                for(let dy=-1;dy<=1&&!blocked;dy++)
                    for(let dz=-1;dz<=1&&!blocked;dz++){
                        const neighbors=grid.get(cellKey(x+dx,y+dy,z+dz));
                        if(!neighbors)continue;
                        for(const q of neighbors){
                            const a=p.x-q.x,b=p.y-q.y,c=p.z-q.z;
                            if(a*a+b*b+c*c<spacing2){blocked=true;break;}
                        }
                    }
            if(blocked)continue;
            const key=cellKey(x,y,z);
            if(!grid.has(key))grid.set(key,[]);
            grid.get(key)!.push(p);
        }
        kept.push(candidate.index);
    }
    return kept;
}
