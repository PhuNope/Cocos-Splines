import { _decorator, Component } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import {SplineJunction,JunctionTrafficSignal,type SplineJunctionLink}
    from './SplineJunction';
import {compileTrafficCycle,sampleTrafficCycle,
    type TrafficCycleProgram,type TrafficCycleStage} from '../Core/SplineTrafficCycle';
import {SplineAdaptiveTraffic,validateAdaptiveTraffic}
    from '../Core/SplineAdaptiveTraffic';
import {splineTrafficGate} from '../Core/SplineTrafficGate';
import {probeJunctionTrafficConflicts,type TrafficProbeReport}
    from '../Core/SplineTrafficConflictDiagnostics';
const {ccclass,property,menu}= _decorator;

/** Each phase opens only the listed serialized Junction link indices.
 * All other links are Red. Yellow is a no-entry phase, not permission to
 * transfer. A mandatory all-red clearance follows every phase.
 */
@ccclass('Splines.SplineTrafficPhase')
export class SplineTrafficPhase {
    @property({type:[Number],tooltip:'Serialized Junction Connections indices allowed Green together. Must not include a configured conflict pair.'})
    greenExits:number[]=[];
    @property({min:.05,tooltip:'Seconds in Green for the listed destination exits.'})
    greenSeconds=8;
    @property({min:0,tooltip:'Seconds in Yellow for the listed exits (no new admission). 0 skips Yellow.'})
    yellowSeconds=2;
}
@ccclass('Splines.SplineTrafficConflict')
export class SplineTrafficConflict {
    @property({min:0,step:1,tooltip:'First conflicting Junction Connections index.'})
    firstExit=0;
    @property({min:0,step:1,tooltip:'Second conflicting Junction Connections index.'})
    secondExit=1;
}

/** Optional, gameplay-only signal controller. Existing Junctions remain fully
 * manual if no controller is attached. Only ONE enabled controller may manage
 * a Junction; overlapping controller instances never write its signals.
 */
@ccclass('Splines.SplineTrafficController')
@menu('Splines/Spline Traffic Controller')
export class SplineTrafficController extends Component {
    private static readonly owners=new WeakMap<SplineJunction,SplineTrafficController>();
    @property({type:SplineJunction,tooltip:'Junction to control. Empty = SplineJunction on this Node.'})
    junction:SplineJunction|null=null;
    @property({type:[SplineTrafficPhase],tooltip:'Ordered non-overlapping phases. Each group may open several NON-CONFLICTING exits.'})
    phases:SplineTrafficPhase[]=[];
    @property({type:[SplineTrafficConflict],tooltip:'Explicit forbidden simultaneous-Green pairs. These are NOT inferred from geometry.'})
    conflicts:SplineTrafficConflict[]=[];
    @property({min:.05,tooltip:'All-Red clearance in seconds before phase 0 and after every phase; mandatory for safe changes.'})
    allRedSeconds=1;
    @property({tooltip:'Opt-in demand-responsive phase selection using queued followers at the Junction exits. Off = original deterministic fixed cycle.'})
    adaptiveTraffic=false;
    @property({min:.05,tooltip:'Adaptive only. Minimum Green seconds before another phase can interrupt. Does not shorten mandatory Yellow/All-Red.'})
    minGreenSeconds=2;
    @property({min:.05,tooltip:'Adaptive only. Maximum Green seconds per phase, even when the phase has the only waiting traffic.'})
    maxGreenSeconds=15;
    @property({min:.05,tooltip:'Adaptive only. Waiting demand age that triggers urgent phase selection after the current minimum Green. Approximate fairness policy, not a hard individual vehicle wait guarantee.'})
    maxDemandWaitSeconds=30;
    @property({min:.01,tooltip:'Read-only geometry diagnostic: flag sampled 3D centerlines this close in WORLD units. Not a physical collision guarantee.'})
    conflictProbeTolerance=.75;
    @property({min:1,tooltip:'Read-only geometry diagnostic: sample this many WORLD units downstream from each Junction exit.'})
    conflictProbeLookahead=20;
    @property({min:0,tooltip:'Read-only geometry diagnostic: ignore the common junction origin for this distance (WORLD units).'})
    conflictProbeIgnoreOrigin=1;
    @property({tooltip:'Read-only diagnostics only: use explicitly supplied per-exit World asphalt HALF widths. Off retains centerline-only behavior.'})
    conflictUseRoadWidths=false;
    @property({type:[Number],tooltip:'Half widths in WORLD units by serialized Junction Connections index; provide one nonnegative value per Connection. 0 uses centerline on that exit. This does not change the road Mesh.'})
    conflictRoadHalfWidths:number[]=[];
    @property({min:.01,tooltip:'World height separation for road-width diagnostic. Roads above this vertical gap are not flagged just because asphalt footprints overlap in XZ.'})
    conflictVerticalTolerance=.75;

    private _owned:SplineJunction|null=null;
    private _original=new Map<SplineJunctionLink,JunctionTrafficSignal>();
    private _program:TrafficCycleProgram|null=null;
    private _adaptive:SplineAdaptiveTraffic|null=null;
    private _signature='';
    private _elapsed=0;
    private _paused=false;
    private _state:TrafficCycleStage|'inactive'|'invalid'='inactive';
    private _phaseIndex=-1;
    private _remainingSeconds=0;
    private _error='';
    public get stage():TrafficCycleStage|'inactive'|'invalid'{return this._state;}
    public get phaseIndex():number{return this._phaseIndex;}
    public get remainingSeconds():number{return this._remainingSeconds;}
    public get validationError():string{return this._error;}
    public get isCycling():boolean{return !!this._owned&&!!this._program&&!this._paused;}
    /** Current queue sizes per phase (summed over its distinct Green exits). */
    public get phaseDemand():readonly number[]{
        const junction=this._owned,program=this._program;
        if(!junction||!program)return [];
        return program.phases.map(phase=>phase.greenExits.reduce((count,index)=>
            count+splineTrafficGate.waiting(junction,index),0));
    }
    /** Time in seconds that each phase has had continuous unmet demand since
     * its last Green opportunity. Empty while adaptive mode is disabled.
     */
    public get phaseDemandAges():readonly number[]{
        return this._adaptive?.waitingAges??[];
    }
    /** Explicit, read-only probe. Does not modify conflicts, phases or lights.
     * Can run in Scene Editor without enabling the gameplay signal scheduler.
     */
    public diagnoseConflicts():TrafficProbeReport{
        const junction=this.junction||this.getComponent(SplineJunction);
        if(!junction)throw Error('Assign a SplineJunction to diagnose.');
        return probeJunctionTrafficConflicts(junction,this.phases,this.conflicts,{
            tolerance:this.conflictProbeTolerance,
            lookaheadWorldDistance:this.conflictProbeLookahead,
            ignoreJunctionWorldDistance:this.conflictProbeIgnoreOrigin,
            ...(this.conflictUseRoadWidths?{
                roadHalfWidths:this.conflictRoadHalfWidths,
                verticalTolerance:this.conflictVerticalTolerance,
            }:{}),
        });
    }

    onEnable():void {
        if(EDITOR_NOT_IN_PREVIEW)return;
        this.attach();
    }
    onDisable():void {this.detach();}
    onDestroy():void {this.detach();}

    /** Pause is fail-closed: all managed exits immediately turn Red.
     * Resume restarts with the initial all-red clearance.
     */
    public pauseCycle():void{
        if(!this._owned)return;
        this._paused=true;
        this.applyAllRed();
        this.changeStage('all-red',-1,0);
    }
    public resumeCycle():void{
        if(!this._owned)return;
        this._paused=false;
        this._elapsed=0;
        this.resetAdaptive();
        this.applyCurrent();
    }
    public restartCycle():void{
        if(!this._owned)return;
        this._elapsed=0;
        this._paused=false;
        this.resetAdaptive();
        this.applyCurrent();
    }
    /** Runtime settings may change from scripts without reloading the Scene.
     * Invalid configurations fail closed (all managed exits Red) until fixed.
     */
    update(dt:number):void{
        if(EDITOR_NOT_IN_PREVIEW||this.enabled===false)return;
        const target=this.targetJunction();
        if(target!==this._owned){
            this.detach();
            this.attach();
        }
        if(!this._owned)return;
        const signature=this.configurationSignature();
        if(signature!==this._signature)this.compile(signature);
        if(this._paused){
            this.applyAllRed();
            return;
        }
        if(!this._program){
            this.applyAllRed();
            return;
        }
        if(this._adaptive){
            try{
                this._adaptive.tick(Number.isFinite(dt)&&dt>0?dt:0,this.phaseDemand);
            }catch(error){
                this._error=String(error instanceof Error?error.message:error);
                this._program=null;
                this._adaptive=null;
                this.applyAllRed();
                this.changeStage('invalid',-1,0);
                return;
            }
        }else if(Number.isFinite(dt)&&dt>0){
            this._elapsed+=dt;
            // Bound the clock for arbitrarily long runtime sessions.
            const initial=this._program.initialAllRedSeconds;
            const loop=this._program.loopSeconds;
            if(this._elapsed>initial+loop)
                this._elapsed=initial+(this._elapsed-initial)%loop;
        }
        this.applyCurrent();
    }
    private targetJunction():SplineJunction|null{
        const source=this.junction||this.getComponent(SplineJunction);
        if(!source||source.enabled===false||source.node?.isValid===false)
            return null;
        return source;
    }
    private attach():void{
        if(this.enabled===false||EDITOR_NOT_IN_PREVIEW)return;
        const target=this.targetJunction();
        if(!target)return;
        const owner=SplineTrafficController.owners.get(target);
        if(owner&&owner!==this){
            this._error='Junction is already managed by another Traffic Controller.';
            this._state='invalid';
            return; // Never override the owner, including while disabled.
        }
        SplineTrafficController.owners.set(target,this);
        this._owned=target;
        this._original.clear();
        this.rememberNewLinks();
        this._signature='';
        this._elapsed=0;
        this._paused=false;
        this.compile(this.configurationSignature());
    }
    private detach():void{
        const junction=this._owned;
        if(junction&&SplineTrafficController.owners.get(junction)===this){
            // Restore manual settings using link identity, not stale indices.
            for(const [link,state] of this._original){
                const index=junction.connections.indexOf(link);
                if(index>=0)junction.setTrafficSignal(index,state);
            }
            SplineTrafficController.owners.delete(junction);
        }
        this._owned=null;
        this._program=null;
        this._adaptive=null;
        this._original.clear();
        this._signature='';
        this._elapsed=0;
        this._paused=false;
        this._error='';
        this._state='inactive';
        this._phaseIndex=-1;
        this._remainingSeconds=0;
    }
    private rememberNewLinks():void{
        const junction=this._owned;
        if(!junction)return;
        for(const link of junction.connections){
            if(!link||this._original.has(link))continue;
            this._original.set(link,
                link.trafficSignal===JunctionTrafficSignal.Yellow?
                    JunctionTrafficSignal.Yellow:
                link.trafficSignal===JunctionTrafficSignal.Red?
                    JunctionTrafficSignal.Red:JunctionTrafficSignal.Green);
        }
    }
    private configurationSignature():string{
        const junction=this._owned;
        return JSON.stringify([this.allRedSeconds,
            this.adaptiveTraffic,this.minGreenSeconds,
            this.maxGreenSeconds,this.maxDemandWaitSeconds,
            junction?.connections.length??-1,
            // Link identity changes are handled separately from phase timing.
            this.phases?.map(p=>p?[p.greenExits,p.greenSeconds,p.yellowSeconds]:null),
            this.conflicts?.map(p=>p?[p.firstExit,p.secondExit]:null)]);
    }
    private compile(signature:string):void{
        this._signature=signature;
        this._elapsed=0;
        this._program=null;
        this._adaptive=null;
        this.rememberNewLinks();
        const junction=this._owned;
        if(!junction)return;
        try{
            const spec=compileTrafficCycle(this.phases,this.conflicts,
                junction.connections.length,this.allRedSeconds);
            // Reject missing connection slots rather than silently changing
            // valid indices after Inspector edits.
            for(const phase of spec.phases){
                if(phase.greenExits.some(index=>!junction.connections[index]))
                    throw Error('Traffic phase references a missing Junction link.');
            }
            if(this.adaptiveTraffic)validateAdaptiveTraffic({
                minGreenSeconds:this.minGreenSeconds,
                maxGreenSeconds:this.maxGreenSeconds,
                maxDemandWaitSeconds:this.maxDemandWaitSeconds,
            });
            this._program=spec;
            this.resetAdaptive();
            this._error='';
        }catch(error){
            const message=String(error instanceof Error?error.message:error);
            if(message!==this._error)
                this.node.emit('spline-traffic-cycle-invalid',{
                    controller:this,junction,error:message});
            this._error=message;
            this.applyAllRed();
            this.changeStage('invalid',-1,0);
            return;
        }
        this.applyCurrent(); // Always starts at mandatory all-red.
    }
    private resetAdaptive():void{
        this._adaptive=this.adaptiveTraffic&&this._program?
            new SplineAdaptiveTraffic(this._program,{
                minGreenSeconds:this.minGreenSeconds,
                maxGreenSeconds:this.maxGreenSeconds,
                maxDemandWaitSeconds:this.maxDemandWaitSeconds,
            }):null;
    }
    private applyAllRed():void{
        const junction=this._owned;
        if(!junction)return;
        this.rememberNewLinks();
        for(let i=0;i<junction.connections.length;i++)
            if(junction.connections[i])junction.setTrafficSignal(i,JunctionTrafficSignal.Red);
    }
    private applyCurrent():void{
        const junction=this._owned,program=this._program;
        if(!junction||!program)return;
        this.rememberNewLinks();
        const state=this._adaptive?.sample??sampleTrafficCycle(program,this._elapsed);
        const exits=new Set(state.greenExits);
        // Close all previous Greens before opening any next phase Greens.
        // This prevents transient conflicting Green states even in event hooks.
        for(let i=0;i<junction.connections.length;i++){
            if(!junction.connections[i])continue;
            const desired=exits.has(i)&&state.stage==='green'?
                JunctionTrafficSignal.Green:
                exits.has(i)&&state.stage==='yellow'?
                    JunctionTrafficSignal.Yellow:JunctionTrafficSignal.Red;
            if(desired!==JunctionTrafficSignal.Green)
                junction.setTrafficSignal(i,desired);
        }
        if(state.stage==='green'){
            for(const index of exits)
                junction.setTrafficSignal(index,JunctionTrafficSignal.Green);
        }
        this.changeStage(state.stage,state.phaseIndex,state.remainingSeconds);
    }
    private changeStage(stage:TrafficCycleStage|'invalid',index:number,remaining:number):void{
        const changed=this._state!==stage||this._phaseIndex!==index;
        this._state=stage;
        this._phaseIndex=index;
        this._remainingSeconds=remaining;
        if(changed&&this._owned)
            this.node.emit('spline-traffic-cycle-stage',{
                controller:this,junction:this._owned,stage,phaseIndex:index,
                remainingSeconds:remaining,
            });
    }
}
