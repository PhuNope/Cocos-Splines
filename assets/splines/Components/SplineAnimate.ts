import { _decorator, Component, Enum, EventHandler, Node, Vec3, Quat } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer, SplineDimension } from '../Core/SplineContainer';
import { SplinePositionMode, toNormalizedDistance } from '../Core/SplinePosition';
import { SplineTrigger } from './SplineTrigger';
import { SplineJunction, JunctionExitDirection, JunctionTrafficSignal, type SplineJunctionLink } from './SplineJunction';
import {nextShortestJunctionExit,planSplineRoute,inspectSplineRoute,findUnavailableTrafficExits,
    type SplineRoute,type SplineRouteDiagnosis} from '../Core/SplineNetwork';
import {splineTrafficGate} from '../Core/SplineTrafficGate';
import {splineHeadwayRegistry} from '../Core/SplineHeadway';
import {headwayWorldArc} from '../Core/SplineHeadwayWorldArc';
import { SplineModifiers } from './SplineModifiers';
import { SplineEventCallbacks, type SplineEventCallback } from '../Core/SplineEventCallbacks';
import { clamp01, crosses, easing, inverseEasing, orderCrossings, buildOffsetArcLUT, offsetProgressToDistanceFraction, offsetDistanceFractionToProgress, type OffsetArcLUT, type Direction, type Crossing } from '../Core/SplineTraversal';
const {ccclass,property,menu,executeInEditMode}= _decorator;
export interface SplineBoundaryEvent {
    follower:SplineAnimate;target:Node;spline:SplineContainer;progress:number;direction:Direction;
}
/** Emitted exactly once per programmed destination until followRouteTo/restart/seek
 * re-arms it. Only gameplay playback dispatches this event, never Editor preview.
 */
export interface SplineRouteArrivalEvent extends SplineBoundaryEvent {
    stopped:boolean;
}
export enum AnimateMethod { Time=0, Speed=1 }
export enum LoopMode { Once=0, Loop=1, PingPong=2 }
export enum Easing { Linear=0, EaseInOut=1, EaseIn=2, EaseOut=3, SmootherStep=4 }
export enum SplineUpMode { Spline=0, World=1, TargetLocal=2 }
export enum ForwardAxis { PositiveZ=0, NegativeZ=1, PositiveX=2, NegativeX=3, PositiveY=4, NegativeY=5 }
export enum JunctionMode { Off=0, FirstOther=1, RoundRobin=2, Manual=3, ShortestRoute=4 }
export enum RouteCostSpace { Local=0, World=1 }
Enum(AnimateMethod);Enum(LoopMode);Enum(Easing);Enum(SplineUpMode);Enum(ForwardAxis);Enum(JunctionMode);Enum(RouteCostSpace);Enum(SplinePositionMode);
/**
 * Unity-style spline follower.  All editable settings are native Cocos @property
 * fields, so Inspector changes serialize and respect scene/prefab overrides.
 * Editor preview is opt-in and never runs the gameplay clock.
 */
@ccclass('Splines.SplineAnimate')
@menu('Splines/Spline Animate')
@executeInEditMode(true)
export class SplineAnimate extends Component {
    @property({type:SplineContainer,tooltip:'Drag a node containing SplineContainer here; same-node/parent fallback is also supported.'})
    spline:SplineContainer|null=null;
    @property({type:Node,tooltip:'If unset, this component node is moved.'}) target:Node|null=null;
    @property({type:SplineModifiers,tooltip:'Optional path-local Offset, Speed, Roll keyframe modifiers.'}) modifiers:SplineModifiers|null=null;
    @property({type:Enum(AnimateMethod)}) method:AnimateMethod=AnimateMethod.Time;
    @property({min:0.001,tooltip:'Seconds to complete one traversal when Method = Time.'}) duration=4;
    @property({min:0,tooltip:'Units per second. With Constant Speed with Offset enabled, uses the actual world-space offset trajectory.'}) speed=2;
    @property({type:Enum(LoopMode)}) loopMode:LoopMode=LoopMode.Loop;
    @property({type:Enum(Easing)}) easing:Easing=Easing.Linear;
    @property({tooltip:'Orient target local +Z along the spline tangent.'}) alignToSpline=true;
    @property({type:Enum(SplineUpMode),tooltip:'Spline: knot Up; World: world +Y; TargetLocal: initial local +Y of Target or current +Y of Up Reference.'})
    upMode:SplineUpMode=SplineUpMode.Spline;
    @property({type:Node,tooltip:'Optional independent Up reference used in TargetLocal mode. Its local +Y becomes world Up. Leave blank to use the Target initial local +Y (captured before Animate moves it). Never assign the animated Target itself as Up Reference.'})
    upReference:Node|null=null;
    @property({type:Enum(ForwardAxis),tooltip:'Which local axis of the target should point in the spline travel direction.'})
    forwardAxis:ForwardAxis=ForwardAxis.PositiveZ;
    @property({type:Vec3,tooltip:'Additional Euler rotation (degrees) when alignment is enabled.'})
    rotationOffset:Vec3=new Vec3();
    @property({tooltip:'On XY2D splines, rotate sprite around world Z so local +X follows the path. Replaces 3D alignment.'})
    orient2D=true;
    @property({tooltip:'For XY2D, angular offset to local +X forward, in degrees.'})
    orient2DAngleOffset=0;
    @property({tooltip:'Start gameplay playback automatically.'}) playOnStart=true;
    @property({type:Enum(SplinePositionMode),tooltip:'Choose spawn coordinate. Normalized Distance preserves old startProgress behavior.'})
    startPositionMode:SplinePositionMode=SplinePositionMode.NormalizedDistance;
    @property({range:[0,1,0.01],slide:true,tooltip:'Normalized Distance legacy raw progress, or geometric t when selected.'}) startProgress=0;
    @property({min:0,tooltip:'Start at this absolute spline-local distance when Start Position Mode = Distance.'}) startDistance=0;
    @property({type:Vec3}) worldOffset=new Vec3();
    @property({type:Vec3,tooltip:'Dreamteck-style spline-frame offset: X=right, Y=up, Z=forward (world units). Applied after deformation; World Offset remains world-axis-aligned.'}) splineOffset=new Vec3();
    @property({tooltip:'Compensate for the longer/shorter offset trajectory at bends. Linear easing then means uniform movement in world space, not just along the centerline. Uses a cached arc-length lookup.'}) constantSpeedWithOffset=true;
    @property({min:0,tooltip:'World units traveled on the destination spline to smoothly settle into its local Spline Offset after a Junction switch. 0 = immediate offset switch.'})
    junctionOffsetBlendDistance=1;
    @property({tooltip:'Temporary preview in the Scene Editor; turn off to restore original transform.'}) previewInEditor=false;
    @property({type:Enum(SplinePositionMode),tooltip:'Choose editor preview coordinate: normalized distance, absolute distance or geometric t.'})
    previewPositionMode:SplinePositionMode=SplinePositionMode.NormalizedDistance;
    @property({range:[0,1,0.001],slide:true,tooltip:'Normalized Distance (legacy raw) or geometric t.'}) previewProgress=0;
    @property({min:0,tooltip:'Preview this absolute spline-local distance; no gameplay events.'}) previewDistance=0;

    @property({type:Enum(JunctionMode),tooltip:'Off: no switch; First Other / Round Robin: basic routing; Manual: requestJunctionExit; Shortest Route: choose next exit on the least-distance network route.'})
    junctionMode:JunctionMode=JunctionMode.Off;
    @property({type:SplineContainer,tooltip:'Destination for Shortest Route. Leave unset to keep switching disabled in this mode.'})
    routeDestination:SplineContainer|null=null;
    @property({range:[0,1,0.001],slide:true,tooltip:'Destination normalized ARC distance (not geometric Bezier t).'})
    routeDestinationProgress=1;
    @property({min:0,tooltip:'Optional cost per Junction switch in spline-local units. Favors fewer switches when paths are otherwise equally long.'})
    routeTransferPenalty=0.01;
    @property({min:0,tooltip:'Maximum world gap allowed between link positions when >0. Set 0 to disable gap validation (teleports may occur).'})
    routeMaxWorldGap=0;
    @property({type:Enum(RouteCostSpace),tooltip:'Local (default): use spline-local arc units. World: use sampled world arc length, including non-uniform parent scale; transfer penalty is in the selected unit.'})
    routeCostSpace:RouteCostSpace=RouteCostSpace.Local;
    @property({tooltip:'Opt-in: stop precisely at Route Destination Progress when reached. Off preserves legacy ShortestRoute movement, but On Arrived still fires.'})
    stopOnRouteArrival=false;
    @property({type:[EventHandler],tooltip:'Fires once when Shortest Route reaches the configured SplineContainer + normalized distance, even if auto-stop is off.'})
    onRouteArrived:EventHandler[]=[];
    @property({tooltip:'Opt-in: enforce destination-link Max Followers on Junction switches. A full exit holds this follower at the Junction until another follower releases a slot. Off by default.'})
    enableTrafficCapacity=false;
    @property({tooltip:'Opt-in with Enable Traffic Capacity: Shortest Route tries a different reachable Junction exit when the preferred exit is full. Default waits in FIFO queue.'})
    rerouteAroundTraffic=false;
    @property({range:[0,10,1],slide:true,tooltip:'0..10. Traffic admission priority for opt-in followers: higher priority is served first; same priority remains FIFO. No preemption of occupied slots.'})
    trafficPriority=0;
    @property({tooltip:'Opt-in centerline headway: prevent moving within Headway World Gap of another registered follower on the same spline. No 3D collision, no cross-spline detection.'})
    enableHeadway=false;
    @property({min:0,tooltip:'Minimum separation along the shared spline CENTERLINE in WORLD units. Other opt-in followers, including paused followers, count as obstacles.'})
    headwayWorldGap=2;
    @property({min:0,tooltip:'Optional soft slowdown range in WORLD units above the minimum headway gap. 0 = hard clamp only.'})
    headwayBrakeDistance=4;
    @property({type:[EventHandler],tooltip:'Fires when this follower reaches progress 1 in the forward direction.'})
    onEndReached:EventHandler[]=[];
    @property({type:[EventHandler],tooltip:'Fires when this follower reaches progress 0 in the backward direction.'})
    onBeginningReached:EventHandler[]=[];

    private readonly _endReachedCallbacks=new SplineEventCallbacks<SplineBoundaryEvent>();
    private readonly _beginningReachedCallbacks=new SplineEventCallbacks<SplineBoundaryEvent>();
    private readonly _routeArrivedCallbacks=new SplineEventCallbacks<SplineRouteArrivalEvent>();
    public AddOnEndReachedEvent(cb:SplineEventCallback<SplineBoundaryEvent>,target?:object|null):void{this._endReachedCallbacks.add(cb,target);}
    public RemoveOnEndReachedEvent(cb:SplineEventCallback<SplineBoundaryEvent>,target?:object|null):void{this._endReachedCallbacks.remove(cb,target);}
    public AddOnBeginningReachedEvent(cb:SplineEventCallback<SplineBoundaryEvent>,target?:object|null):void{this._beginningReachedCallbacks.add(cb,target);}
    public RemoveOnBeginningReachedEvent(cb:SplineEventCallback<SplineBoundaryEvent>,target?:object|null){this._beginningReachedCallbacks.remove(cb,target);}
    public AddOnRouteArrivedEvent(cb:SplineEventCallback<SplineRouteArrivalEvent>,target?:object|null):void{this._routeArrivedCallbacks.add(cb,target);}
    public RemoveOnRouteArrivedEvent(cb:SplineEventCallback<SplineRouteArrivalEvent>,target?:object|null):void{this._routeArrivedCallbacks.remove(cb,target);}
    /** Captured before the first playback/editor-preview rotation to prevent the
     * animated Target from feeding its own output rotation back into Up. */
    private _initialTargetWorldUp:Vec3|null=null;
    private _initialUpTarget:Node|null=null;
    private _raw=0;
    private _travelDirection:Direction=1;
    private _activeSpline:SplineContainer|null=null;
    private _requestedExit=-1;
    private _arrivalDelivered:{spline:SplineContainer;progress:number}|null=null;
    private _headwayBlocked=false;
    private _trafficWait:{junction:SplineJunction;entryIndex:number;exitIndex:number;
        link:SplineJunctionLink;source:SplineContainer;progress:number;direction:Direction}|null=null;
    private elapsed=0;
    private playing=false;
    private _previewNode:Node|null=null;
    private _previewPosition:Vec3|null=null;
    private _previewRotation:Quat|null=null;
    private _previewKey='';
    private _offsetArcCache:{spline:SplineContainer;key:string;lut:OffsetArcLUT}|null=null;
    /** Positional correction is held at the entry then fades over the destination curve.
     * It prevents an instantaneous world-space jump when right/up/forward frames differ. */
    private _junctionOffsetBlend:{spline:SplineContainer;entryProgress:number;direction:Direction;distance:number;correction:Vec3}|null=null;
    private _junctionArcCache:{blend:NonNullable<SplineAnimate['_junctionOffsetBlend']>;base:OffsetArcLUT|null;lut:OffsetArcLUT}|null=null;

    public get currentSpline():SplineContainer|null { return this.source(); }
    public get currentProgress():number {return this.progressAtRaw(this._raw,this.source());}
    /** Arc distance of the current follower position, in spline-local units. */
    public get currentDistance():number{return this.currentProgress*(this.source()?.length||0);}
    /** Uniform Bezier parameter of the current visible position (not raw easing time). */
    public get currentT():number{return this.source()?.tAtProgress(this.currentProgress)||0;}
    public get isPlaying():boolean{return this.playing;}
    /** True when the current frame cannot advance because the nearest registered
     * same-spline follower occupies the configured world-arc clearance.
     */
    public get isHeadwayBlocked():boolean{return this._headwayBlocked;}
    public get isWaitingForTraffic():boolean{return this._trafficWait!==null;}
    /** 1-based position in this follower's destination-link FIFO; 0 otherwise. */
    public get trafficQueuePosition():number{
        const wait=this._trafficWait;
        return wait?Math.max(0,splineTrafficGate.queuePosition(
            this,wait.junction,wait.exitIndex)+1):0;
    }
    /** Managed slot held on the last admitted Junction exit, if any. */
    public get trafficReservation():{junction:SplineJunction;exitIndex:number}|null{
        const slot=splineTrafficGate.reservation(this);
        return slot?{junction:slot.junction as SplineJunction,exitIndex:slot.exitIndex}:null;
    }
    /** Whether the current Shortest Route destination has already fired On Arrived. */
    public get routeArrived():boolean{
        const goal=this.routeDestinationProgress;
        return this.junctionMode===JunctionMode.ShortestRoute&&
            this.routeDestination!==null&&this.source()===this.routeDestination&&
            Number.isFinite(goal)&&this._arrivalDelivered?.spline===this.routeDestination&&
            Math.abs(this._arrivalDelivered.progress-clamp01(goal))<=1e-8;
    }

    private coordinateRaw(spline:SplineContainer|null,mode:SplinePositionMode,progress:number,distance:number):number {
        if(!spline)return clamp01(progress);
        // With the compensation disabled, retain the original normalized start
        // progress semantics of existing scenes (legacy raw playback input).
        if(mode===SplinePositionMode.NormalizedDistance&&!this.offsetArc(spline))return clamp01(progress);
        return this.rawAtProgress(toNormalizedDistance(spline,mode,progress,distance),spline);
    }

    /** Samples the SAME world positions used to place the follower. */
    private pathWorldPosition(spline:SplineContainer,progress:number):Vec3 {
        const position=spline.evaluateWorldPosition(progress);
        const modifier=this.modifiers?.sample(progress);
        if(this.splineOffset.x||this.splineOffset.y||this.splineOffset.z||modifier){
            const frame=Quat.multiply(new Quat(),spline.node.worldRotation,spline.evaluateRotation(progress));
            const offset=new Vec3(this.splineOffset.x+(modifier?.offset.x||0),
                this.splineOffset.y+(modifier?.offset.y||0),this.splineOffset.z+(modifier?.offset.z||0));
            Vec3.add(position,position,Vec3.transformQuat(offset,offset,frame));
        }
        Vec3.add(position,position,this.worldOffset);
        return position;
    }
    /** Cached offset arc. World transform and keyframe changes invalidate it. */
    private offsetArc(spline:SplineContainer|null):OffsetArcLUT|null {
        if(!this.constantSpeedWithOffset||!spline||spline.count<2)return null;
        const o=this.splineOffset;
        const hasOffset=!!(o.x||o.y||o.z)||!!this.modifiers?.keys?.some(k=>k.offset.x||k.offset.y||k.offset.z);
        if(!hasOffset)return null;
        const world=spline.node.worldMatrix;
        const key=JSON.stringify([spline.getRevision(),spline.length,
            world?.m00,world?.m01,world?.m02,world?.m04,world?.m05,world?.m06,
            world?.m08,world?.m09,world?.m10,world?.m12,world?.m13,world?.m14,
            o.x,o.y,o.z,this.modifiers?.node?.uuid,this.modifiers?.getRevision()]);
        if(this._offsetArcCache?.spline===spline&&this._offsetArcCache.key===key)return this._offsetArcCache.lut;
        const steps=Math.min(2048,Math.max(256,Math.floor((spline.segmentCount||1)*64)));
        const lut=buildOffsetArcLUT(p=>this.pathWorldPosition(spline,p),steps);
        this._offsetArcCache={spline,key,lut};
        return lut;
    }
    /** World-space distance from the start of the destination along its unblended path. */
    private baseDistanceAt(spline:SplineContainer,progress:number,base:OffsetArcLUT|null):number {
        return base ? offsetProgressToDistanceFraction(base,progress)*base.length : clamp01(progress)*spline.length;
    }
    private blendWeight(spline:SplineContainer,progress:number,base:OffsetArcLUT|null):number {
        const blend=this._junctionOffsetBlend;
        if(!blend||blend.spline!==spline||blend.distance<=0)return 0;
        const entry=this.baseDistanceAt(spline,blend.entryProgress,base);
        const here=this.baseDistanceAt(spline,progress,base);
        const traveled=Math.max(0,blend.direction*(here-entry));
        // SmootherStep makes both the displacement and its first derivative
        // continuous at the start/end of the transition.
        return 1-easing(clamp01(traveled/blend.distance),Easing.SmootherStep);
    }
    private blendedWorldPosition(spline:SplineContainer,progress:number,base?:OffsetArcLUT|null):Vec3 {
        const result=this.pathWorldPosition(spline,progress);
        const blend=this._junctionOffsetBlend;
        if(!blend||blend.spline!==spline)return result;
        const weight=this.blendWeight(spline,progress,base===undefined?this.offsetArc(spline):base);
        if(weight>0){result.x+=blend.correction.x*weight;result.y+=blend.correction.y*weight;result.z+=blend.correction.z*weight;}
        return result;
    }
    /** Keep constant-speed sampling on the *blended* path too, not just its
     * local-frame offset; otherwise the junction transition can accelerate. */
    private activeArc(spline:SplineContainer|null):OffsetArcLUT|null {
        const base=this.offsetArc(spline);
        const blend=this._junctionOffsetBlend;
        if(!spline||!blend||blend.spline!==spline||!this.constantSpeedWithOffset)return base;
        const cached=this._junctionArcCache;
        if(cached&&cached.blend===blend&&cached.base===base)return cached.lut;
        const steps=Math.min(4096,Math.max(512,Math.floor((spline.segmentCount||1)*128)));
        const lut=buildOffsetArcLUT(p=>this.blendedWorldPosition(spline,p,base),steps);
        this._junctionArcCache={blend,base,lut};
        return lut;
    }
    private resetJunctionBlend():void {
        this._junctionOffsetBlend=null;
        this._junctionArcCache=null;
    }
    private progressAtRaw(raw:number,spline:SplineContainer|null):number {
        const fraction=easing(raw,this.easing),lut=this.activeArc(spline);
        return lut?offsetDistanceFractionToProgress(lut,fraction):fraction;
    }
    private rawAtProgress(progress:number,spline:SplineContainer|null):number {
        const lut=this.activeArc(spline);
        const fraction=lut?offsetProgressToDistanceFraction(lut,progress):clamp01(progress);
        return inverseEasing(fraction,this.easing);
    }
    public get travelDirection():Direction {return this._travelDirection;}
    private source():SplineContainer|null {
        return this._activeSpline||this.spline||this.getComponent(SplineContainer)||this.node.parent?.getComponent(SplineContainer)||null;
    }
    private getDuration():number {
        const spline=this.source();
        const distance=spline?(this.activeArc(spline)?.length??spline.length):0;
        return this.method===AnimateMethod.Speed
            ? Math.max(0.001,distance/Math.max(0.001,this.speed))
            : Math.max(0.001,this.duration);
    }
    onEnable():void {
        this.clearTraffic();
        if(this.upMode===SplineUpMode.TargetLocal)this.captureTargetLocalUp();
        if(EDITOR_NOT_IN_PREVIEW){
            if(this.previewInEditor)this.previewAt(this.coordinateRaw(this.source(),this.previewPositionMode,this.previewProgress,this.previewDistance));
            return;
        }
        this._activeSpline=null;this._travelDirection=1;this._requestedExit=-1;this._arrivalDelivered=null;this.resetJunctionBlend();
        this._raw=this.coordinateRaw(this.source(),this.startPositionMode,this.startProgress,this.startDistance);
        this.elapsed=this._raw*this.getDuration();
        this.playing=this.playOnStart;
        this.apply(this._raw);this.syncHeadway();
    }
    onDisable():void { this.clearHeadway();this.clearTraffic(); if(EDITOR_NOT_IN_PREVIEW)this.restorePreview(); }
    onDestroy():void { this.clearHeadway();this.clearTraffic(); if(EDITOR_NOT_IN_PREVIEW)this.restorePreview();this._endReachedCallbacks.clear();this._beginningReachedCallbacks.clear();this._routeArrivedCallbacks.clear(); }
    public play():void {this.playing=true;}
    public pause():void {this.playing=false;}
    public restart():void {
        this.clearTraffic();
        this._activeSpline=null;this._travelDirection=1;this._requestedExit=-1;this._arrivalDelivered=null;this.resetJunctionBlend();
        this._raw=0;this.elapsed=0;this.playing=true;this.apply(this._raw);this.syncHeadway();
    }
    public reverseTravel():void {this._travelDirection=this._travelDirection===1?-1:1;this.cancelTrafficWait();this.syncHeadway();}
    /** Read-only route preview for tools/gameplay. Does not move the follower. */
    public planRouteTo(destination:SplineContainer,progress=1):SplineRoute|null{
        const current=this.source();
        return current?planSplineRoute(current,this.currentProgress,destination,progress,{
            startDirection:this._travelDirection,transferPenalty:this.routeTransferPenalty,
            costSpace:this.routeCostSpace===RouteCostSpace.World?'world':'local',
            ...(this.routeMaxWorldGap>0?{maxWorldGap:this.routeMaxWorldGap}:{})
        }):null;
    }
    /** Safe read-only explanation for reachable, no-route, or invalid topology. */
    public inspectRouteTo(destination:SplineContainer,progress=1):SplineRouteDiagnosis{
        const current=this.source();
        return inspectSplineRoute(current!,this.currentProgress,destination,progress,{
            startDirection:this._travelDirection,transferPenalty:this.routeTransferPenalty,
            costSpace:this.routeCostSpace===RouteCostSpace.World?'world':'local',
            ...(this.routeMaxWorldGap>0?{maxWorldGap:this.routeMaxWorldGap}:{})
        });
    }
    /** Activate runtime shortest-route junction choice without changing existing modes by default. */
    public followRouteTo(destination:SplineContainer,progress=1,stopOnArrival=this.stopOnRouteArrival):void{
        this.cancelTrafficWait();
        this.routeDestination=destination;
        this.routeDestinationProgress=clamp01(progress);
        this.stopOnRouteArrival=stopOnArrival;
        this.junctionMode=JunctionMode.ShortestRoute;
        this._arrivalDelivered=null;
    }
    private pendingRouteArrival(spline:SplineContainer):number|null{
        if(this.junctionMode!==JunctionMode.ShortestRoute||
           this.routeDestination!==spline||!Number.isFinite(this.routeDestinationProgress))return null;
        return this.routeArrived?null:clamp01(this.routeDestinationProgress);
    }
    private notifyRouteArrival(spline:SplineContainer,progress:number,direction:Direction):void{
        // Mark delivered before callbacks, to be safe against re-entrant scripts.
        this._arrivalDelivered={spline,progress};
        const stopped=this.stopOnRouteArrival;
        if(stopped)this.playing=false;
        const payload:SplineRouteArrivalEvent={follower:this,target:this.target||this.node,
            spline,progress,direction,stopped};
        EventHandler.emitEvents(this.onRouteArrived,payload);
        this._routeArrivedCallbacks.emit(payload);
        this.node.emit('spline-route-arrived',payload);
    }
    /** Keep paused followers registered: their target still occupies a position.
     * No registration or headway gameplay event is created in Editor preview.
     */
    private syncHeadway():void{
        if(EDITOR_NOT_IN_PREVIEW)return;
        const spline=this.source();
        if(!this.enableHeadway||!this.enabled||!spline||
           spline.node?.isValid===false||spline.count<2){
            splineHeadwayRegistry.remove(this);
            this._headwayBlocked=false;
            return;
        }
        splineHeadwayRegistry.set(this,spline,clamp01(this.currentProgress),this._travelDirection);
    }
    private clearHeadway():void{
        splineHeadwayRegistry.remove(this);
        this._headwayBlocked=false;
    }
    private headwayStatus(blocked:boolean,spline:SplineContainer,leader:object|null,
        nearestWorldGap:number|null):void{
        if(blocked===this._headwayBlocked)return;
        this._headwayBlocked=blocked;
        this.node.emit(blocked?'spline-headway-blocked':'spline-headway-cleared',{
            follower:this,spline,leader,nearestWorldGap,
            requiredWorldGap:this.headwayWorldGap,
        });
    }
    private cancelTrafficWait():void{
        this._trafficWait=null;
        splineTrafficGate.cancelWait(this);
    }
    private clearTraffic():void{
        this.cancelTrafficWait();
        splineTrafficGate.release(this);
    }
    private admitTraffic(junction:SplineJunction,exit:{index:number;link:SplineJunctionLink}):boolean{
        if(!this.enableTrafficCapacity){
            splineTrafficGate.release(this);
            return true;
        }
        const cap=exit.link.maxFollowers;
        if(!Number.isInteger(cap)||cap<0||cap>4096||
           !Number.isInteger(this.trafficPriority)||this.trafficPriority<0||
           this.trafficPriority>10)return false;
        return splineTrafficGate.move(this,junction,exit.index,cap,
            exit.link.trafficSignal===JunctionTrafficSignal.Green,this.trafficPriority);
    }
    /** A temporary per-query exclusion, not a mutation of Junction graph.
     * Do not queue on the original exit until alternate routing is exhausted.
     */
    private alternateTrafficExit(junction:SplineJunction,entryIndex:number,
        spline:SplineContainer,progress:number,dir:Direction,
        current:{index:number;link:SplineJunctionLink}):
        {index:number;link:SplineJunctionLink}|null{
        if(!this.enableTrafficCapacity||!this.rerouteAroundTraffic||
           this.junctionMode!==JunctionMode.ShortestRoute||!this.routeDestination||
           !Number.isInteger(this.trafficPriority)||this.trafficPriority<0||
           this.trafficPriority>10)return null;
        const cap=current.link.maxFollowers;
        if(!Number.isInteger(cap)||cap<0||cap>4096||
           splineTrafficGate.canEnter(this,junction,current.index,cap,
               current.link.trafficSignal===JunctionTrafficSignal.Green,
               this.trafficPriority))return null;
        const excluded=findUnavailableTrafficExits(this,this.trafficPriority);
        if(!excluded.some(x=>x.junctionId===junction.node.uuid&&x.exitIndex===current.index))
            excluded.push({junctionId:junction.node.uuid,exitIndex:current.index});
        const other=nextShortestJunctionExit(junction,entryIndex,spline,progress,
            dir,this.routeDestination,this.routeDestinationProgress,{
                transferPenalty:this.routeTransferPenalty,
                costSpace:this.routeCostSpace===RouteCostSpace.World?'world':'local',
                ...(this.routeMaxWorldGap>0?{maxWorldGap:this.routeMaxWorldGap}:{}),
                excludedExits:excluded,
            });
        if(other===null||other===current.index)return null;
        const candidate=junction.pick(entryIndex,other);
        if(!candidate?.link.spline||candidate.link.spline.enabled===false||
           candidate.link.spline.node?.isValid===false)return null;
        const otherCap=candidate.link.maxFollowers;
        if(!Number.isInteger(otherCap)||otherCap<0||otherCap>4096||
           !splineTrafficGate.canEnter(this,junction,candidate.index,otherCap,
               candidate.link.trafficSignal===JunctionTrafficSignal.Green,
               this.trafficPriority))return null;
        return candidate;
    }
    /** Only invoked when the destination exit has an acquired slot (or traffic
     * admission was explicitly disabled). No Reach event is emitted here.
     */
    private commitJunctionSwitch(junction:SplineJunction,entryIndex:number,
        destination:{index:number;link:SplineJunctionLink},dir:Direction,
        spline:SplineContainer,atProgress:number):void{
        const entryWorld=this.blendedWorldPosition(spline,atProgress);
        const nextSpline=destination.link.spline!;
        const nextProgress=destination.link.getProgress();
        const nextWorld=this.pathWorldPosition(nextSpline,nextProgress);
        const difference=new Vec3(entryWorld.x-nextWorld.x,entryWorld.y-nextWorld.y,entryWorld.z-nextWorld.z);
        const newDir=destination.link.exitDirection;
        const exitDir:Direction=newDir===JunctionExitDirection.Forward?1:newDir===JunctionExitDirection.Backward?-1:dir;
        this._activeSpline=nextSpline;
        this.resetJunctionBlend();
        const hasSplineOffset=!!(this.splineOffset.x||this.splineOffset.y||this.splineOffset.z)||
            !!this.modifiers?.keys?.some(k=>k.offset.x||k.offset.y||k.offset.z);
        if(hasSplineOffset&&this.junctionOffsetBlendDistance>0&&
            Math.hypot(difference.x,difference.y,difference.z)>1e-6){
            this._junctionOffsetBlend={spline:nextSpline,entryProgress:nextProgress,
                direction:exitDir,distance:this.junctionOffsetBlendDistance,correction:difference};
        }
        this._travelDirection=exitDir;
        this._raw=this.rawAtProgress(nextProgress,nextSpline);
        this.elapsed=this._raw*this.getDuration();
        this.syncHeadway();
        junction.switched(this,entryIndex,destination.index,dir);
    }
    /** Retry a blocked link only while the original entry is still valid.
     * Shortest Route recalculates at retry time, so a changed destination can
     * select another valid exit without needing another marker crossing.
     */
    private retryTrafficWait():boolean{
        const wait=this._trafficWait;
        if(!wait)return false;
        if(!this.enableTrafficCapacity||this.source()!==wait.source||
           !wait.junction.enabled||!SplineJunction.active.has(wait.junction)||
           this._travelDirection!==wait.direction||
           wait.junction.connections[wait.entryIndex]?.spline!==wait.source||
           Math.abs(wait.junction.connections[wait.entryIndex].getProgress()-wait.progress)>1e-6){
            this.cancelTrafficWait();return false;
        }
        let exitIndex=wait.exitIndex;
        if(this.junctionMode===JunctionMode.ShortestRoute){
            if(!this.routeDestination){this.cancelTrafficWait();return false;}
            const resolved=nextShortestJunctionExit(wait.junction,wait.entryIndex,
                wait.source,wait.progress,wait.direction,
                this.routeDestination,this.routeDestinationProgress,{
                    transferPenalty:this.routeTransferPenalty,
                    costSpace:this.routeCostSpace===RouteCostSpace.World?'world':'local',
                    ...(this.routeMaxWorldGap>0?{maxWorldGap:this.routeMaxWorldGap}:{})
                });
            if(resolved===null){this.cancelTrafficWait();return false;}
            exitIndex=resolved;
        }
        const link=wait.junction.connections[exitIndex];
        if(!link?.spline||link.spline.enabled===false||link.spline.node?.isValid===false||
            (this.junctionMode!==JunctionMode.ShortestRoute&&link!==wait.link)){
            this.cancelTrafficWait();return false;
        }
        let destination={index:exitIndex,link};
        const alternate=this.alternateTrafficExit(wait.junction,wait.entryIndex,
            wait.source,wait.progress,wait.direction,destination);
        if(alternate)destination=alternate;
        if(!this.admitTraffic(wait.junction,destination)){
            // A newly chosen exit may replace the old FIFO queue.
            wait.exitIndex=destination.index;
            wait.link=destination.link;
            return true;
        }
        this.cancelTrafficWait();
        if(alternate)this.node.emit('spline-traffic-rerouted',{
            follower:this,junction:wait.junction,entryIndex:wait.entryIndex,
            exitIndex:destination.index,progress:wait.progress,
        });
        this.commitJunctionSwitch(wait.junction,wait.entryIndex,destination,
            wait.direction,wait.source,wait.progress);
        return false;
    }
    /** Select exit link in a Junction.onReach callback. Only honored for that crossing. */
    public requestJunctionExit(index:number):void {
        this._requestedExit=Number.isInteger(index)&&index>=0?index:-1;
    }
    /** Switch to a source manually, without firing triggers or traveling. */
    public setCurrentSpline(spline:SplineContainer,progress=0,direction:Direction=1):void{
        this.clearTraffic();
        this._arrivalDelivered=null;this.resetJunctionBlend();this._activeSpline=spline;this._travelDirection=direction===-1?-1:1;
        this._raw=this.rawAtProgress(progress,spline);
        this.elapsed=this._raw*this.getDuration();this.apply(this._raw);this.syncHeadway();
    }
    /** Switch spline at an absolute distance, not at a normalized progress. */
    public setCurrentSplineAtDistance(spline:SplineContainer,distance:number,direction:Direction=1):void {
        this.setCurrentSpline(spline,toNormalizedDistance(spline,SplinePositionMode.Distance,0,distance),direction);
    }
    /** Seek by absolute arc distance, respecting eased movement and optional events. */
    public seekDistance(distance:number,fireEvents=false):void {
        const spline=this.source();if(!spline)return;
        this.seek(this.rawAtProgress(toNormalizedDistance(spline,SplinePositionMode.Distance,0,distance),spline),fireEvents);
    }
    /** Seek by geometric Bezier t, not normalized arc fraction. */
    public seekAtT(t:number,fireEvents=false):void {
        const spline=this.source();if(!spline)return;
        this.seek(this.rawAtProgress(toNormalizedDistance(spline,SplinePositionMode.SplineT,t,0),spline),fireEvents);
    }
    /** Seek does not dispatch triggers unless explicitly requested. */
    public seek(t:number,fireEvents=false):void {
        this.clearTraffic();
        this._arrivalDelivered=null;
        const previous=this.currentProgress;
        // An explicit seek intentionally cancels any in-progress junction interpolation.
        this.resetJunctionBlend();
        this._raw=clamp01(t);
        this.elapsed=this._raw*this.getDuration();
        const next=this.currentProgress;
        if(fireEvents&& !EDITOR_NOT_IN_PREVIEW){
            const dir:Direction=next>=previous?1:-1;
            const spline=this.source();
            if(spline)this.deliverEvents(spline,previous,next,dir);
        }
        this.apply(this._raw);this.syncHeadway();
    }
    private previewKey(spline:SplineContainer|null):string {
        const m=spline?.node.worldMatrix;
        return JSON.stringify([spline?.getRevision(),m?.m00,m?.m01,m?.m02,m?.m04,m?.m05,m?.m06,
            m?.m08,m?.m09,m?.m10,m?.m12,m?.m13,m?.m14,this.target?.uuid,
            this.previewProgress,this.previewPositionMode,this.previewDistance,this.alignToSpline,this.orient2D,this.orient2DAngleOffset,this.upMode,this.upReference?.uuid,
            this.upReference?.worldRotation,this.forwardAxis,this.rotationOffset,this.worldOffset,this.splineOffset,
            this.constantSpeedWithOffset,this.modifiers?.node?.uuid,this.modifiers?.getRevision()]);
    }
    update(dt:number):void {
        if(EDITOR_NOT_IN_PREVIEW){
            if(!this.previewInEditor){if(this._previewNode)this.restorePreview();return;}
            const s=this.source();
            const key=this.previewKey(s);
            if(this._previewKey!==key)this.previewAt(this.coordinateRaw(s,this.previewPositionMode,this.previewProgress,this.previewDistance));
            return;
        }
        this.syncHeadway();
        const spline=this.source();
        if(!this.playing||!spline||spline.count<2||!Number.isFinite(dt)||dt<=0)return;
        const multiplier=this.modifiers?.sample(this.currentProgress).speed||1;
        this.advance(dt*Math.max(0.01,multiplier));
    }
    /** Preview never dispatches gameplay events and never follows junctions. */
    public previewAt(t:number):boolean {
        const spline=this.source();
        if(!spline||spline.count<2)return false;
        const target=this.target||this.node;
        if(target===spline.node)return false;
        if(EDITOR_NOT_IN_PREVIEW){
            if(this._previewNode&&this._previewNode!==target)this.restorePreview();
            if(!this._previewNode){
                this._previewNode=target;
                this._previewPosition=target.worldPosition.clone();
                this._previewRotation=target.worldRotation.clone();
            }
        }
        this.apply(clamp01(t));
        this._previewKey=this.previewKey(spline);
        return true;
    }
    /** Preview at an absolute distance. Does not fire gameplay events or change saved preview settings. */
    public previewAtDistance(distance:number):boolean {
        const spline=this.source();return !!spline&&this.previewAt(this.rawAtProgress(toNormalizedDistance(spline,SplinePositionMode.Distance,0,distance),spline));
    }
    /** Preview at geometric Bezier t. */
    public previewAtT(t:number):boolean {
        const spline=this.source();return !!spline&&this.previewAt(this.rawAtProgress(toNormalizedDistance(spline,SplinePositionMode.SplineT,t,0),spline));
    }
    public restorePreview():void {
        if(this._previewNode&&this._previewNode.isValid){
            if(this._previewPosition)this._previewNode.setWorldPosition(this._previewPosition);
            if(this._previewRotation)this._previewNode.setWorldRotation(this._previewRotation);
        }
        this._previewNode=null;this._previewPosition=null;this._previewRotation=null;this._previewKey='';
    }
    private ease(t:number):number {return easing(t,this.easing);}

    /** Ordered crossings in the interval [from, to]; trigger first if co-located
     * with junction. The event loop recomputes remaining time after switching.
     */
    private crossings(spline:SplineContainer,from:number,to:number,dir:Direction):Crossing<{
        kind:'trigger'|'junction';trigger?:SplineTrigger;junction?:SplineJunction;entry?:number
    }>[] {
        const hits:Crossing<{kind:'trigger'|'junction';trigger?:SplineTrigger;junction?:SplineJunction;entry?:number}>[]=[];
        for(const marker of SplineTrigger.active){
            if(marker.enabled&&marker.getSpline()===spline&&crosses(from,to,marker.getProgress(),dir))
                hits.push({progress:marker.getProgress(),priority:0,payload:{kind:'trigger',trigger:marker}});
        }
        for(const junction of SplineJunction.active){
            if(!junction.enabled)continue;
            for(const e of junction.entries())if(e.link.spline===spline&&crosses(from,to,e.link.getProgress(),dir))
                hits.push({progress:e.link.getProgress(),priority:1,payload:{kind:'junction',junction,entry:e.index}});
        }
        return orderCrossings(hits,dir);
    }
    /** Called by explicit seek(check events), never initiates a route switch. */
    private deliverEvents(spline:SplineContainer,from:number,to:number,dir:Direction):void {
        for(const hit of this.crossings(spline,from,to,dir)){
            const e=hit.payload;
            if(e.kind==='trigger')e.trigger!.fire(this,dir);
            else if(e.junction&&e.entry!==undefined){e.junction.reaches(this,e.entry,dir);this._requestedExit=-1;}
        }
    }
    private reachedBoundary(dir:Direction):void{
        const spline=this.source();if(!spline)return;
        const payload:SplineBoundaryEvent={follower:this,target:this.target||this.node,spline,progress:dir===1?1:0,direction:dir};
        if(dir===1){EventHandler.emitEvents(this.onEndReached,payload);this._endReachedCallbacks.emit(payload);this.node.emit('spline-end',payload);}
        else {EventHandler.emitEvents(this.onBeginningReached,payload);this._beginningReachedCallbacks.emit(payload);this.node.emit('spline-beginning',payload);}
    }
    /** Time-preserving traversal across multiple markers, loop seams and junctions.
     * Safety budget prevents infinite route cycles with coincident junction positions.
     */
    private advance(dt:number):void {
        let remaining=Math.max(0,dt);
        let iterations=0;
        while(remaining>1e-8&&this.playing&&iterations++<512){
            const spline=this.source();if(!spline||spline.count<2)break;
            if(!this.enableTrafficCapacity&&this.trafficReservation)
                splineTrafficGate.release(this);
            if(this._trafficWait){
                const waiting=this.retryTrafficWait();
                if(waiting){this.apply(this._raw);break;}
                if(this.source()!==spline)continue; // admitted transfer
            }
            // Arrivals at the spawn/seek/switch position must fire once without
            // requiring a movement that crosses the same normalized marker.
            const immediate=this.pendingRouteArrival(spline);
            if(immediate!==null&&Math.abs(this.currentProgress-immediate)<=1e-8){
                this.apply(this._raw);
                this.notifyRouteArrival(spline,immediate,this._travelDirection);
                if(!this.playing)break;
            }
            const duration=this.getDuration();
            const dir=this._travelDirection;
            const boundary=dir===1?1:0;
            const toBoundary=Math.abs(boundary-this._raw);
            if(toBoundary<=1e-8){
                this.reachedBoundary(dir);
                if(this.loopMode===LoopMode.Once){this.playing=false;break;}
                if(this.loopMode===LoopMode.PingPong)this._travelDirection=dir===1?-1:1;
                else {this.resetJunctionBlend();this._raw=dir===1?0:1;}
                continue;
            }
            let step=Math.min(toBoundary,remaining/duration);
            if(step<=1e-10)break;
            let next=clamp01(this._raw+dir*step);
            const from=this.progressAtRaw(this._raw,spline);
            let to=this.progressAtRaw(next,spline);
            let headwayLimited=false;
            if(this.enableHeadway&&Number.isFinite(this.headwayWorldGap)&&
               this.headwayWorldGap>=0&&Number.isFinite(this.headwayBrakeDistance)&&
               this.headwayBrakeDistance>=0){
                const report=splineHeadwayRegistry.limit(this,spline,from,to,dir,
                    headwayWorldArc(spline),!!spline.closed,
                    this.headwayWorldGap,this.headwayBrakeDistance);
                headwayLimited=report.limited;
                this.headwayStatus(report.stopped,spline,report.leader,report.nearestWorldGap);
                if(headwayLimited){
                    next=this.rawAtProgress(report.progress,spline);
                    step=Math.min(step,Math.abs(next-this._raw));
                    to=this.progressAtRaw(next,spline);
                    if(step<=1e-10){this.apply(this._raw);break;}
                }
            }else if(this._headwayBlocked){
                this.headwayStatus(false,spline,null,null);
            }
            const goal=this.pendingRouteArrival(spline);
            let arriving=false;
            if(goal!==null&&crosses(from,to,goal,dir)){
                const atRaw=this.rawAtProgress(goal,spline);
                const arrivalStep=Math.abs(atRaw-this._raw);
                if(arrivalStep<=step+1e-8&&dir*(atRaw-this._raw)>=-1e-8){
                    step=Math.min(step,arrivalStep);
                    next=atRaw;
                    to=goal;
                    arriving=true;
                }
            }
            if(arriving&&step<=1e-10){
                this.apply(this._raw);
                this.notifyRouteArrival(spline,goal!,dir);
                if(!this.playing)break;
                continue;
            }
            let jumped=false;
            for(const hit of this.crossings(spline,from,to,dir)){
                const e=hit.payload;
                if(e.kind==='trigger'){e.trigger!.fire(this,dir);continue;}
                if(!e.junction||e.entry===undefined)continue;
                const junction=e.junction;
                this._requestedExit=-1;
                junction.reaches(this,e.entry,dir);
                // At the configured destination, an On Reach event may fire
                // but must not switch onto another spline before On Arrived.
                if(arriving&&goal!==null&&Math.abs(hit.progress-goal)<=1e-8){
                    this._requestedExit=-1;
                    continue;
                }
                const requested=this._requestedExit;
                this._requestedExit=-1;
                let destination:null|{index:number;link:import('./SplineJunction').SplineJunctionLink}=null;
                // JunctionMode is authoritative. Previously an On Reach callback
                // could call requestJunctionExit() and switch even with Off set.
                // Manual requests are intentionally ignored in every other mode.
                switch(this.junctionMode){
                    case JunctionMode.Manual:
                        if(requested>=0)destination=junction.pick(e.entry,requested);
                        break;
                    case JunctionMode.FirstOther:
                        destination=junction.pick(e.entry,'first');
                        break;
                    case JunctionMode.RoundRobin:
                        destination=junction.pick(e.entry,'roundRobin');
                        break;
                    case JunctionMode.ShortestRoute:
                        if(this.routeDestination){
                            const exit=nextShortestJunctionExit(junction,e.entry,spline,
                                hit.progress,dir,this.routeDestination,this.routeDestinationProgress,{
                                    transferPenalty:this.routeTransferPenalty,
                                    costSpace:this.routeCostSpace===RouteCostSpace.World?'world':'local',
                                    ...(this.routeMaxWorldGap>0?{maxWorldGap:this.routeMaxWorldGap}:{})
                                });
                            if(exit!==null)destination=junction.pick(e.entry,exit);
                        }
                        break;
                    case JunctionMode.Off:
                    default:
                        break; // On Reach still fires, routing never occurs.
                }
                if(!destination?.link.spline)continue;
                const alternate=this.alternateTrafficExit(junction,e.entry,
                    spline,hit.progress,dir,destination);
                if(alternate){
                    destination=alternate;
                    this.node.emit('spline-traffic-rerouted',{
                        follower:this,junction,entryIndex:e.entry,
                        exitIndex:destination.index,progress:hit.progress,
                    });
                }
                const rawAtMarker=this.rawAtProgress(hit.progress,spline);
                const elapsed=Math.min(remaining,Math.max(0,Math.abs(rawAtMarker-this._raw)*duration));
                remaining=Math.max(0,remaining-elapsed);
                if(!this.admitTraffic(junction,destination)){
                    // Hold exactly at the Junction marker; consume this frame's
                    // remaining time, then retry admission in the next frame.
                    this._trafficWait={junction,entryIndex:e.entry,
                        exitIndex:destination.index,link:destination.link,
                        source:spline,progress:hit.progress,direction:dir};
                    this._raw=rawAtMarker;
                    this.elapsed=this._raw*duration;
                    this.syncHeadway();this.apply(this._raw);
                    this.node.emit('spline-traffic-blocked',{
                        follower:this,junction,entryIndex:e.entry,
                        exitIndex:destination.index,progress:hit.progress,
                        capacity:destination.link.maxFollowers,
                        trafficSignal:destination.link.trafficSignal,
                        trafficPriority:this.trafficPriority,
                        queuePosition:this.trafficQueuePosition,
                    });
                    remaining=0;
                }else{
                    this.commitJunctionSwitch(junction,e.entry,destination,dir,spline,hit.progress);
                }
                jumped=true;
                break;
            }
            if(jumped)continue;
            remaining=headwayLimited?0:Math.max(0,remaining-step*duration);
            this._raw=next;this.elapsed=this._raw*this.getDuration();
            this.syncHeadway();
            const reachedEnd=toBoundary-step<=1e-8;
            if(reachedEnd)this.reachedBoundary(dir);
            if(arriving&&goal!==null){
                // Materialize the exact waypoint before calling gameplay hooks.
                this.apply(this._raw);
                this.notifyRouteArrival(spline,goal,dir);
                if(!this.playing)break;
            }
            if(reachedEnd){
                if(this.loopMode===LoopMode.Once){this.playing=false;break;}
                if(this.loopMode===LoopMode.PingPong)this._travelDirection=dir===1?-1:1;
                else {this.resetJunctionBlend();this._raw=dir===1?0:1;}
            }
        }
        this.apply(this._raw);this.syncHeadway();
    }
    private captureTargetLocalUp():void {
        const target=this.target||this.node;
        this._initialUpTarget=target;
        this._initialTargetWorldUp=Vec3.normalize(new Vec3(),
            Vec3.transformQuat(new Vec3(),new Vec3(0,1,0),target.worldRotation));
    }
    /** A stable target initial local up, or the live +Y of an independent Node.
     * An Up Reference pointing at the driven Target is ignored to prevent feedback. */
    private worldUpForAlignment():Vec3 {
        const target=this.target||this.node;
        const reference=this.upReference;
        if(reference&&reference!==target&&reference.isValid){
            return Vec3.normalize(new Vec3(),Vec3.transformQuat(new Vec3(),new Vec3(0,1,0),reference.worldRotation));
        }
        if(!this._initialTargetWorldUp||this._initialUpTarget!==target)this.captureTargetLocalUp();
        return this._initialTargetWorldUp!.clone();
    }
    /** Local correction aligns the selected object-forward axis with +Z. */
    private correction(out:Quat):Quat {
        switch(this.forwardAxis){
            case ForwardAxis.NegativeZ:return Quat.fromEuler(out,0,180,0);
            case ForwardAxis.PositiveX:return Quat.fromEuler(out,0,-90,0);
            case ForwardAxis.NegativeX:return Quat.fromEuler(out,0,90,0);
            case ForwardAxis.PositiveY:return Quat.fromEuler(out,90,0,0);
            case ForwardAxis.NegativeY:return Quat.fromEuler(out,-90,0,0);
            default:return Quat.fromEuler(out,0,0,0);
        }
    }
    private alignRotation(spline:SplineContainer,t:number):Quat {
        const rotation=spline.evaluateRotation(t);
        let worldRot=new Quat();
        Quat.multiply(worldRot,spline.node.worldRotation,rotation);
        if(this.upMode===SplineUpMode.World||this.upMode===SplineUpMode.TargetLocal){
            const tangent=spline.evaluateTangent(t);
            Vec3.transformQuat(tangent,tangent,spline.node.worldRotation);
            Vec3.normalize(tangent,tangent);
            let up=this.upMode===SplineUpMode.TargetLocal?this.worldUpForAlignment():new Vec3(0,1,0);
            const dot=up.x*tangent.x+up.y*tangent.y+up.z*tangent.z;
            // Avoid near-zero cross products for nearly parallel Up/Forward.
            if(Math.abs(dot)>0.999){
                up=spline.evaluateUp(t);
                Vec3.transformQuat(up,up,spline.node.worldRotation);
                Vec3.normalize(up,up);
            }
            const right=Vec3.cross(new Vec3(),up,tangent);
            Vec3.normalize(right,right);
            Vec3.cross(up,tangent,right);
            Vec3.normalize(up,up);
            worldRot=Quat.fromAxes(new Quat(),right,up,tangent);
        }
        if(this.forwardAxis!==ForwardAxis.PositiveZ){
            Quat.multiply(worldRot,worldRot,this.correction(new Quat()));
        }
        const o=this.rotationOffset;
        if(o.x!==0||o.y!==0||o.z!==0){
            Quat.multiply(worldRot,worldRot,Quat.fromEuler(new Quat(),o.x,o.y,o.z));
        }
        return worldRot;
    }
    private apply(progress:number):void {
        const spline=this.source();if(!spline||spline.count<2)return;
        const t=clamp01(progress);
        const p=this.progressAtRaw(t,spline);
        const target=this.target||this.node;
        if(target===spline.node)return;
        const position=this.blendedWorldPosition(spline,p);
        const modifier=this.modifiers?.sample(p);
        target.setWorldPosition(position);
        if(this.alignToSpline){
            if(this.orient2D&&spline.dimension===SplineDimension.XY2D){
                const local=spline.evaluateTangent(p),world=Vec3.transformQuat(new Vec3(),local,spline.node.worldRotation);
                let angle=Math.atan2(world.y,world.x)*180/Math.PI;
                // A sprite normally faces +X; +Y sprite art needs a -90 deg correction.
                if(this.forwardAxis===ForwardAxis.PositiveY)angle-=90;
                else if(this.forwardAxis===ForwardAxis.NegativeY)angle+=90;
                else if(this.forwardAxis===ForwardAxis.NegativeX)angle+=180;
                if(this._travelDirection===-1)angle+=180;
                angle+=this.orient2DAngleOffset+this.rotationOffset.z;
                target.setWorldRotation(Quat.fromEuler(new Quat(),0,0,angle));
            } else {
                const rotation=this.alignRotation(spline,p);
                if(modifier?.roll)Quat.multiply(rotation,rotation,Quat.fromEuler(new Quat(),0,0,modifier.roll));
                if(this._travelDirection===-1)Quat.multiply(rotation,rotation,Quat.fromEuler(new Quat(),0,180,0));
                target.setWorldRotation(rotation);
            }
        }
    }
}
