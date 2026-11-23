/** Pure deterministic traffic-cycle scheduling. No engine, clocks or Scene IO.
 * A configured conflict pair can NEVER be green together in one phase.
 * A mandatory all-red clearance separates sequential phase groups.
 */
export interface TrafficPhaseSpec {
    greenExits:readonly number[];
    greenSeconds:number;
    yellowSeconds:number;
}
export interface TrafficConflictPair {firstExit:number;secondExit:number}
export type TrafficCycleStage='all-red'|'green'|'yellow';
export interface TrafficCycleSample {
    stage:TrafficCycleStage;
    phaseIndex:number;
    greenExits:readonly number[];
    remainingSeconds:number;
}
export interface TrafficCycleProgram {
    readonly phases:readonly TrafficPhaseSpec[];
    readonly clearanceSeconds:number;
    readonly initialAllRedSeconds:number;
    readonly loopSeconds:number;
    readonly maxElapsedSeconds:number;
}
const finite=(n:number)=>Number.isFinite(n);
export function compileTrafficCycle(phases:readonly TrafficPhaseSpec[],
    conflicts:readonly TrafficConflictPair[],linkCount:number,
    clearanceSeconds:number):TrafficCycleProgram{
    if(!Number.isInteger(linkCount)||linkCount<2||linkCount>1024||
       !Array.isArray(phases)||phases.length<1||phases.length>32||
       !Array.isArray(conflicts)||conflicts.length>2048||
       !finite(clearanceSeconds)||clearanceSeconds<.05||clearanceSeconds>300)
        throw Error('Invalid traffic cycle or all-red clearance.');
    const pairs=new Set<string>();
    for(const conflict of conflicts){
        const a=conflict?.firstExit,b=conflict?.secondExit;
        if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||
           a>=linkCount||b>=linkCount||a===b)
            throw Error('Invalid traffic conflict pair.');
        pairs.add([Math.min(a,b),Math.max(a,b)].join(':'));
    }
    let loop=0;
    const compiled:TrafficPhaseSpec[]=[];
    for(const phase of phases){
        if(!phase||!Array.isArray(phase.greenExits)||
           phase.greenExits.length<1||phase.greenExits.length>128||
           !finite(phase.greenSeconds)||phase.greenSeconds<.05||
           phase.greenSeconds>3600||
           !finite(phase.yellowSeconds)||phase.yellowSeconds<0||
           phase.yellowSeconds>300)
            throw Error('Invalid traffic phase definition.');
        const members=new Set<number>();
        for(const index of phase.greenExits){
            if(!Number.isInteger(index)||index<0||index>=linkCount||
               members.has(index))throw Error('Invalid/duplicate traffic phase exit index.');
            members.add(index);
        }
        for(const pair of pairs){
            const [a,b]=pair.split(':').map(Number);
            if(members.has(a)&&members.has(b))
                throw Error('Conflicting traffic exits cannot be Green in the same phase.');
        }
        const exits=[...members].sort((a,b)=>a-b);
        compiled.push({greenExits:exits,
            greenSeconds:phase.greenSeconds,yellowSeconds:phase.yellowSeconds});
        loop+=phase.greenSeconds+phase.yellowSeconds+clearanceSeconds;
    }
    if(!finite(loop)||loop<=0||loop>120000)
        throw Error('Traffic cycle duration exceeds safe limit.');
    return {phases:compiled,clearanceSeconds,
        initialAllRedSeconds:clearanceSeconds,
        loopSeconds:loop,maxElapsedSeconds:clearanceSeconds+loop};
}
/** The initial clearance is always all-red, even if there is one phase.
 * For elapsed >= initial clearance, the program cycles in O(phaseCount).
 * Skipped time never opens a skipped Green stage in the Scene.
 */
export function sampleTrafficCycle(program:TrafficCycleProgram,elapsed:number):TrafficCycleSample{
    if(!program||!finite(elapsed)||elapsed<0)
        throw Error('Invalid traffic cycle elapsed time.');
    if(elapsed<program.initialAllRedSeconds)
        return {stage:'all-red',phaseIndex:-1,greenExits:[],
            remainingSeconds:program.initialAllRedSeconds-elapsed};
    let offset=(elapsed-program.initialAllRedSeconds)%program.loopSeconds;
    for(let i=0;i<program.phases.length;i++){
        const phase=program.phases[i];
        if(offset<phase.greenSeconds)
            return {stage:'green',phaseIndex:i,
                greenExits:phase.greenExits,remainingSeconds:phase.greenSeconds-offset};
        offset-=phase.greenSeconds;
        if(offset<phase.yellowSeconds)
            return {stage:'yellow',phaseIndex:i,
                greenExits:phase.greenExits,remainingSeconds:phase.yellowSeconds-offset};
        offset-=phase.yellowSeconds;
        if(offset<program.clearanceSeconds||i===program.phases.length-1)
            return {stage:'all-red',phaseIndex:i,
                greenExits:[],remainingSeconds:Math.max(0,program.clearanceSeconds-offset)};
        offset-=program.clearanceSeconds;
    }
    throw Error('Traffic cycle sampler could not resolve a phase.');
}
