import { _decorator, Component, Enum, EventHandler, Node, Vec3, Quat } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer, SplineDimension } from '../Core/SplineContainer';
import { SplinePositionMode, toNormalizedDistance } from '../Core/SplinePosition';
import { SplineTrigger } from './SplineTrigger';
import { SplineJunction, JunctionExitDirection } from './SplineJunction';
import { SplineModifiers } from './SplineModifiers';
import { SplineEventCallbacks, type SplineEventCallback } from '../Core/SplineEventCallbacks';
import { clamp01, crosses, easing, inverseEasing, orderCrossings, buildOffsetArcLUT, offsetProgressToDistanceFraction, offsetDistanceFractionToProgress, type OffsetArcLUT, type Direction, type Crossing } from '../Core/SplineTraversal';
const {ccclass,property,menu,executeInEditMode}= _decorator;
export interface SplineBoundaryEvent {
    follower:SplineAnimate;target:Node;spline:SplineContainer;progress:number;direction:Direction;
}
export enum AnimateMethod { Time=0, Speed=1 }
export enum LoopMode { Once=0, Loop=1, PingPong=2 }
export enum Easing { Linear=0, EaseInOut=1, EaseIn=2, EaseOut=3, SmootherStep=4 }
export enum SplineUpMode { Spline=0, World=1 }
export enum ForwardAxis { PositiveZ=0, NegativeZ=1, PositiveX=2, NegativeX=3, PositiveY=4, NegativeY=5 }
export enum JunctionMode { Off=0, FirstOther=1, RoundRobin=2, Manual=3 }
Enum(AnimateMethod);Enum(LoopMode);Enum(Easing);Enum(SplineUpMode);Enum(ForwardAxis);Enum(JunctionMode);Enum(SplinePositionMode);
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
    @property({type:Enum(SplineUpMode),tooltip:'Spline: interpolate knot Up vectors. World: keep vertical alignment relative to world +Y.'})
    upMode:SplineUpMode=SplineUpMode.Spline;
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
    @property({tooltip:'Temporary preview in the Scene Editor; turn off to restore original transform.'}) previewInEditor=false;
    @property({type:Enum(SplinePositionMode),tooltip:'Choose editor preview coordinate: normalized distance, absolute distance or geometric t.'})
    previewPositionMode:SplinePositionMode=SplinePositionMode.NormalizedDistance;
    @property({range:[0,1,0.001],slide:true,tooltip:'Normalized Distance (legacy raw) or geometric t.'}) previewProgress=0;
    @property({min:0,tooltip:'Preview this absolute spline-local distance; no gameplay events.'}) previewDistance=0;

    @property({type:Enum(JunctionMode),tooltip:'Off: never auto-switch (On Reach still fires); First Other: first alternative; Round Robin: rotate outputs; Manual: requestJunctionExit from On Reach.'})
    junctionMode:JunctionMode=JunctionMode.Off;
    @property({type:[EventHandler],tooltip:'Fires when this follower reaches progress 1 in the forward direction.'})
    onEndReached:EventHandler[]=[];
    @property({type:[EventHandler],tooltip:'Fires when this follower reaches progress 0 in the backward direction.'})
    onBeginningReached:EventHandler[]=[];

    private readonly _endReachedCallbacks=new SplineEventCallbacks<SplineBoundaryEvent>();
    private readonly _beginningReachedCallbacks=new SplineEventCallbacks<SplineBoundaryEvent>();
    public AddOnEndReachedEvent(cb:SplineEventCallback<SplineBoundaryEvent>,target?:object|null):void{this._endReachedCallbacks.add(cb,target);}
    public RemoveOnEndReachedEvent(cb:SplineEventCallback<SplineBoundaryEvent>,target?:object|null):void{this._endReachedCallbacks.remove(cb,target);}
    public AddOnBeginningReachedEvent(cb:SplineEventCallback<SplineBoundaryEvent>,target?:object|null):void{this._beginningReachedCallbacks.add(cb,target);}
    public RemoveOnBeginningReachedEvent(cb:SplineEventCallback<SplineBoundaryEvent>,target?:object|null):void{this._beginningReachedCallbacks.remove(cb,target);}
    private _raw=0;
    private _travelDirection:Direction=1;
    private _activeSpline:SplineContainer|null=null;
    private _requestedExit=-1;
    private elapsed=0;
    private playing=false;
    private _previewNode:Node|null=null;
    private _previewPosition:Vec3|null=null;
    private _previewRotation:Quat|null=null;
    private _previewKey='';
    private _offsetArcCache:{spline:SplineContainer;key:string;lut:OffsetArcLUT}|null=null;

    public get currentSpline():SplineContainer|null { return this.source(); }
    public get currentProgress():number {return this.progressAtRaw(this._raw,this.source());}
    /** Arc distance of the current follower position, in spline-local units. */
    public get currentDistance():number{return this.currentProgress*(this.source()?.length||0);}
    /** Uniform Bezier parameter of the current visible position (not raw easing time). */
    public get currentT():number{return this.source()?.tAtProgress(this.currentProgress)||0;}
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
    private progressAtRaw(raw:number,spline:SplineContainer|null):number {
        const fraction=easing(raw,this.easing),lut=this.offsetArc(spline);
        return lut?offsetDistanceFractionToProgress(lut,fraction):fraction;
    }
    private rawAtProgress(progress:number,spline:SplineContainer|null):number {
        const lut=this.offsetArc(spline);
        const fraction=lut?offsetProgressToDistanceFraction(lut,progress):clamp01(progress);
        return inverseEasing(fraction,this.easing);
    }
    public get travelDirection():Direction {return this._travelDirection;}
    private source():SplineContainer|null {
        return this._activeSpline||this.spline||this.getComponent(SplineContainer)||this.node.parent?.getComponent(SplineContainer)||null;
    }
    private getDuration():number {
        const spline=this.source();
        const distance=spline?(this.offsetArc(spline)?.length??spline.length):0;
        return this.method===AnimateMethod.Speed
            ? Math.max(0.001,distance/Math.max(0.001,this.speed))
            : Math.max(0.001,this.duration);
    }
    onEnable():void {
        if(EDITOR_NOT_IN_PREVIEW){
            if(this.previewInEditor)this.previewAt(this.coordinateRaw(this.source(),this.previewPositionMode,this.previewProgress,this.previewDistance));
            return;
        }
        this._activeSpline=null;this._travelDirection=1;this._requestedExit=-1;
        this._raw=this.coordinateRaw(this.source(),this.startPositionMode,this.startProgress,this.startDistance);
        this.elapsed=this._raw*this.getDuration();
        this.playing=this.playOnStart;
        this.apply(this._raw);
    }
    onDisable():void { if(EDITOR_NOT_IN_PREVIEW)this.restorePreview(); }
    onDestroy():void { if(EDITOR_NOT_IN_PREVIEW)this.restorePreview();this._endReachedCallbacks.clear();this._beginningReachedCallbacks.clear(); }
    public play():void {this.playing=true;}
    public pause():void {this.playing=false;}
    public restart():void {
        this._activeSpline=null;this._travelDirection=1;this._requestedExit=-1;
        this._raw=0;this.elapsed=0;this.playing=true;this.apply(this._raw);
    }
    public reverseTravel():void {this._travelDirection=this._travelDirection===1?-1:1;}
    /** Select exit link in a Junction.onReach callback. Only honored for that crossing. */
    public requestJunctionExit(index:number):void {
        this._requestedExit=Number.isInteger(index)&&index>=0?index:-1;
    }
    /** Switch to a source manually, without firing triggers or traveling. */
    public setCurrentSpline(spline:SplineContainer,progress=0,direction:Direction=1):void{
        this._activeSpline=spline;this._travelDirection=direction===-1?-1:1;
        this._raw=this.rawAtProgress(progress,spline);
        this.elapsed=this._raw*this.getDuration();this.apply(this._raw);
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
        const previous=this.currentProgress;
        this._raw=clamp01(t);
        this.elapsed=this._raw*this.getDuration();
        const next=this.currentProgress;
        if(fireEvents&& !EDITOR_NOT_IN_PREVIEW){
            const dir:Direction=next>=previous?1:-1;
            const spline=this.source();
            if(spline)this.deliverEvents(spline,previous,next,dir);
        }
        this.apply(this._raw);
    }
    private previewKey(spline:SplineContainer|null):string {
        const m=spline?.node.worldMatrix;
        return JSON.stringify([spline?.getRevision(),m?.m00,m?.m01,m?.m02,m?.m04,m?.m05,m?.m06,
            m?.m08,m?.m09,m?.m10,m?.m12,m?.m13,m?.m14,this.target?.uuid,
            this.previewProgress,this.previewPositionMode,this.previewDistance,this.alignToSpline,this.orient2D,this.orient2DAngleOffset,this.upMode,this.forwardAxis,this.rotationOffset,this.worldOffset,this.splineOffset,
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
            const duration=this.getDuration();
            const dir=this._travelDirection;
            const boundary=dir===1?1:0;
            const toBoundary=Math.abs(boundary-this._raw);
            if(toBoundary<=1e-8){
                this.reachedBoundary(dir);
                if(this.loopMode===LoopMode.Once){this.playing=false;break;}
                if(this.loopMode===LoopMode.PingPong)this._travelDirection=dir===1?-1:1;
                else this._raw=dir===1?0:1;
                continue;
            }
            const step=Math.min(toBoundary,remaining/duration);
            if(step<=1e-10)break;
            const next=clamp01(this._raw+dir*step),from=this.progressAtRaw(this._raw,spline),to=this.progressAtRaw(next,spline);
            let jumped=false;
            for(const hit of this.crossings(spline,from,to,dir)){
                const e=hit.payload;
                if(e.kind==='trigger'){e.trigger!.fire(this,dir);continue;}
                if(!e.junction||e.entry===undefined)continue;
                const junction=e.junction;
                this._requestedExit=-1;
                junction.reaches(this,e.entry,dir);
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
                    case JunctionMode.Off:
                    default:
                        break; // On Reach still fires, routing never occurs.
                }
                if(!destination?.link.spline)continue;
                const rawAtMarker=this.rawAtProgress(hit.progress,spline);
                const elapsed=Math.min(remaining,Math.max(0,Math.abs(rawAtMarker-this._raw)*duration));
                remaining=Math.max(0,remaining-elapsed);
                this._activeSpline=destination.link.spline;
                this._raw=this.rawAtProgress(destination.link.getProgress(),this._activeSpline);
                const newDir=destination.link.exitDirection;
                this._travelDirection=newDir===JunctionExitDirection.Forward?1:newDir===JunctionExitDirection.Backward?-1:dir;
                this.elapsed=this._raw*this.getDuration();
                junction.switched(this,e.entry,destination.index,dir);
                jumped=true;
                break;
            }
            if(jumped)continue;
            remaining=Math.max(0,remaining-step*duration);
            this._raw=next;this.elapsed=this._raw*this.getDuration();
            if(toBoundary-step<=1e-8){
                this.reachedBoundary(dir);
                if(this.loopMode===LoopMode.Once){this.playing=false;break;}
                if(this.loopMode===LoopMode.PingPong)this._travelDirection=dir===1?-1:1;
                else this._raw=dir===1?0:1;
            }
        }
        this.apply(this._raw);
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
        if(this.upMode===SplineUpMode.World){
            const tangent=spline.evaluateTangent(t);
            Vec3.transformQuat(tangent,tangent,spline.node.worldRotation);
            Vec3.normalize(tangent,tangent);
            let up=new Vec3(0,1,0);
            if(Math.abs(tangent.y)>0.999){
                up=spline.evaluateUp(t);
                Vec3.transformQuat(up,up,spline.node.worldRotation);
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
        const position=this.pathWorldPosition(spline,p);
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
