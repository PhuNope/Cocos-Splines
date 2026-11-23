/** Demand-responsive phase selector; pure deterministic runtime state machine.
 * Demand is queued opt-in followers per phase, not physical cars or sensors.
 * Every conflicting phase switch still traverses Yellow then All-Red.
 */
import type {TrafficCycleProgram,TrafficCycleSample,TrafficCycleStage} from './SplineTrafficCycle';

export interface AdaptiveTrafficOptions {
    minGreenSeconds:number;
    maxGreenSeconds:number;
    maxDemandWaitSeconds:number;
}
const finite=(v:number)=>Number.isFinite(v);
export function validateAdaptiveTraffic(options:AdaptiveTrafficOptions):void{
    if(!options||!finite(options.minGreenSeconds)||options.minGreenSeconds<.05||
       options.minGreenSeconds>3600||
       !finite(options.maxGreenSeconds)||options.maxGreenSeconds<options.minGreenSeconds||
       options.maxGreenSeconds>3600||
       !finite(options.maxDemandWaitSeconds)||options.maxDemandWaitSeconds<.05||
       options.maxDemandWaitSeconds>3600)
        throw Error('Invalid adaptive traffic min/max Green or maximum demand wait.');
}
export class SplineAdaptiveTraffic {
    private stage:TrafficCycleStage='all-red';
    private phase=-1;
    private lastPhase=-1;
    private elapsed=0;
    private readonly waitAges:number[];
    private demands:number[];
    private nextPhase=-1;
    constructor(private readonly program:TrafficCycleProgram,
        private readonly options:AdaptiveTrafficOptions){
        validateAdaptiveTraffic(options);
        if(!program||!program.phases?.length||!finite(program.clearanceSeconds)||
           program.clearanceSeconds<.05)
            throw Error('Invalid adaptive traffic program.');
        this.waitAges=program.phases.map(()=>0);
        this.demands=program.phases.map(()=>0);
    }
    public get waitingAges():readonly number[]{return [...this.waitAges];}
    public get currentDemand():readonly number[]{return [...this.demands];}
    public get sample():TrafficCycleSample{
        const green=this.phase>=0?this.program.phases[this.phase]:null;
        const seconds=this.stage==='all-red'?this.program.clearanceSeconds:
            this.stage==='yellow'?green!.yellowSeconds:
                this.greenLimit();
        return {stage:this.stage,phaseIndex:this.phase,
            greenExits:this.stage==='all-red'?[]:green!.greenExits,
            remainingSeconds:Math.max(0,seconds-this.elapsed)};
    }
    /** All-red and yellow do not admit traffic. Rebuilding a controller creates
     * a new scheduler and never opens a Green before its initial clearance.
     */
    public tick(dt:number,counts:readonly number[]):TrafficCycleSample{
        if(!finite(dt)||dt<0||!Array.isArray(counts)||
           counts.length!==this.program.phases.length||
           counts.some(n=>!Number.isInteger(n)||n<0||n>1000000))
            throw Error('Invalid adaptive traffic demand sample.');
        this.demands=[...counts];
        for(let i=0;i<counts.length;i++)if(counts[i]===0)this.waitAges[i]=0;
        // After a long device suspension avoid simulating unbounded phantom
        // signal cycles; each tick progresses at most 120 seconds.
        let remaining=Math.min(dt,120),iterations=0;
        while(remaining>1e-9&&iterations++<8192){
            const until=this.timeToBoundary();
            if(until<=1e-9){this.transition();continue;}
            const step=Math.min(remaining,until);
            for(let i=0;i<this.waitAges.length;i++){
                if(this.demands[i]>0&&!(this.stage==='green'&&this.phase===i))
                    this.waitAges[i]+=step;
            }
            this.elapsed+=step;
            remaining-=step;
            if(this.timeToBoundary()<=1e-9)this.transition();
        }
        if(iterations>=8192)throw Error('Adaptive traffic cycle transition limit reached.');
        return this.sample;
    }
    private greenLimit():number{
        const current=this.program.phases[this.phase];
        if(!current)return 0;
        const normal=Math.min(this.options.maxGreenSeconds,
            Math.max(this.options.minGreenSeconds,current.greenSeconds));
        if(this.elapsed<this.options.minGreenSeconds-1e-9)
            return this.options.minGreenSeconds;
        const otherHasDemand=this.demands.some((n,i)=>i!==this.phase&&n>0);
        const urgent=this.demands.some((n,i)=>i!==this.phase&&n>0&&
            this.waitAges[i]>=this.options.maxDemandWaitSeconds-1e-9);
        if(urgent||(otherHasDemand&&this.demands[this.phase]===0)||
           (otherHasDemand&&this.elapsed>=normal-1e-9))
            return this.elapsed; // begin mandatory Yellow immediately
        if(!otherHasDemand&&this.demands[this.phase]>0)
            return this.options.maxGreenSeconds; // extend while alone
        return normal; // idle cycling or balanced demand
    }
    private timeToBoundary():number{
        const length=this.stage==='all-red'?this.program.clearanceSeconds:
            this.stage==='yellow'?this.program.phases[this.phase].yellowSeconds:
                this.greenLimit();
        return Math.max(0,length-this.elapsed);
    }
    private transition():void{
        if(this.stage==='green'){
            this.stage='yellow';this.elapsed=0;
            if(this.program.phases[this.phase].yellowSeconds<=1e-9)
                this.transition();
            return;
        }
        if(this.stage==='yellow'){
            this.stage='all-red';this.elapsed=0;return;
        }
        this.phase=this.chooseNextPhase();
        this.lastPhase=this.phase;
        this.waitAges[this.phase]=0;
        this.stage='green';this.elapsed=0;
    }
    private chooseNextPhase():number{
        const n=this.program.phases.length;
        const requested=this.demands.map((count,i)=>({count,i,age:this.waitAges[i]}))
            .filter(e=>e.count>0);
        if(!requested.length)return (this.lastPhase+1)%n;
        const alternatives=requested.filter(x=>x.i!==this.lastPhase);
        const candidates=alternatives.length?alternatives:requested;
        // First honor maximum-wait protection, then queue demand, then
        // longest waiting age, then stable cyclic order after last served.
        candidates.sort((a,b)=>{
            const overdueA=a.age>=this.options.maxDemandWaitSeconds?1:0;
            const overdueB=b.age>=this.options.maxDemandWaitSeconds?1:0;
            if(overdueA!==overdueB)return overdueB-overdueA;
            if(overdueA&&a.age!==b.age)return b.age-a.age;
            if(a.count!==b.count)return b.count-a.count;
            if(a.age!==b.age)return b.age-a.age;
            return ((a.i-this.lastPhase-1+n)%n)-
                   ((b.i-this.lastPhase-1+n)%n);
        });
        return candidates[0].i;
    }
}
