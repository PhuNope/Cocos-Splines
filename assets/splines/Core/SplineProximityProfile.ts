/** Opt-in, engine-neutral proximity performance sampler.
 * Call record(elapsedMs, registry.getTelemetry()) only at sites where latency
 * measurement is desired. No hot-path timers, global hooks or allocations are
 * installed merely by importing this module.
 */
import type {ProximityTelemetry} from './SplineProximity';

export interface ProximityProfileLatency {
    minMs:number;meanMs:number;p50Ms:number;p95Ms:number;maxMs:number;
}
export interface ProximityProfileSummary {
    samples:number;
    capacity:number;
    latency:ProximityProfileLatency;
    meanCandidates:number;
    p95Candidates:number;
    maxCandidates:number;
    candidatePruningFraction:number;
    totalSegmentTests:number;
    totalTriangleTests:number;
    totalBvhNodes:number;
    fallbackSamples:number;
    predictionSamples:number;
    totalPredictedCandidates:number;
    maxVisitedCells:number;
}
interface Reading {
    elapsedMs:number;occupants:number;candidates:number;segments:number;
    triangles:number;nodes:number;fallback:boolean;predicted:number;
    predictionSeconds:number;visitedCells:number;
}
const valid=(n:number)=>Number.isFinite(n)&&n>=0;
const percentile=(sorted:readonly number[],quantile:number):number=>
    sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(quantile*sorted.length)-1)]:0;
const average=(values:readonly number[]):number=>
    values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
/** Fixed-memory rolling profiler, independent of the simulation clock.
 * Performance values are observational, NOT portable CI pass/fail budgets. */
export class SplineProximityProfileSession {
    private readonly readings:Reading[]=[];
    private next=0;
    constructor(public readonly capacity=2048){
        if(!Number.isInteger(capacity)||capacity<1||capacity>100000)
            throw Error('Invalid proximity profile capacity.');
    }
    public record(elapsedMs:number,telemetry:Readonly<ProximityTelemetry>):void {
        if(!telemetry||!valid(elapsedMs)||elapsedMs>60_000||
           ![telemetry.occupants,telemetry.lastCandidates,
             telemetry.lastSegmentTests,telemetry.lastTriangleTests,
             telemetry.lastBvhNodes,telemetry.lastPredictedCandidates,
             telemetry.lastPredictionSeconds,telemetry.lastVisitedCells].every(valid))
            throw Error('Invalid proximity profiling sample.');
        const sample:Reading={elapsedMs,occupants:telemetry.occupants,
            candidates:telemetry.lastCandidates,segments:telemetry.lastSegmentTests,
            triangles:telemetry.lastTriangleTests,nodes:telemetry.lastBvhNodes,
            fallback:telemetry.lastFallback,predicted:telemetry.lastPredictedCandidates,
            predictionSeconds:telemetry.lastPredictionSeconds,
            visitedCells:telemetry.lastVisitedCells};
        if(this.readings.length<this.capacity)this.readings.push(sample);
        else this.readings[this.next]=sample;
        this.next=(this.next+1)%this.capacity;
    }
    public reset():void {this.readings.length=0;this.next=0;}
    public summary():ProximityProfileSummary {
        const samples=this.readings;
        const times=samples.map(r=>r.elapsedMs).sort((a,b)=>a-b);
        const candidates=samples.map(r=>r.candidates).sort((a,b)=>a-b);
        const total=(key:'segments'|'triangles'|'nodes'|'predicted'):number=>
            samples.reduce((sum,r)=>sum+r[key],0);
        const eligible=samples.reduce((sum,r)=>sum+Math.max(0,r.occupants-1),0);
        const examined=samples.reduce((sum,r)=>sum+Math.min(r.candidates,
            Math.max(0,r.occupants-1)),0);
        return {samples:samples.length,capacity:this.capacity,
            latency:{minMs:times[0]??0,meanMs:average(times),
                p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),
                maxMs:times[times.length-1]??0},
            meanCandidates:average(candidates),
            p95Candidates:percentile(candidates,.95),
            maxCandidates:candidates[candidates.length-1]??0,
            candidatePruningFraction:eligible?Math.max(0,1-examined/eligible):0,
            totalSegmentTests:total('segments'),totalTriangleTests:total('triangles'),
            totalBvhNodes:total('nodes'),
            fallbackSamples:samples.filter(r=>r.fallback).length,
            predictionSamples:samples.filter(r=>r.predictionSeconds>0).length,
            totalPredictedCandidates:total('predicted'),
            maxVisitedCells:samples.reduce((max,r)=>Math.max(max,r.visitedCells),0)};
    }
}
