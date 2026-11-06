import { _decorator, Component, EventHandler } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer } from '../Core/SplineContainer';
import { SplineEventCallbacks, type SplineEventCallback } from '../Core/SplineEventCallbacks';
const {ccclass,property,menu,executeInEditMode}=_decorator;
export interface SplineLengthEvent {monitor:SplineLengthMonitor;spline:SplineContainer;previous:number;current:number;delta:number;threshold:number}
/** Dreamteck LengthCalculator-inspired threshold monitor; in spline-local length units. */
@ccclass('Splines.SplineLengthMonitor')
@menu('Splines/Spline Length Monitor')
@executeInEditMode(true)
export class SplineLengthMonitor extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({min:0,tooltip:'Local-space spline length that raises On Cross Above / Below.'}) threshold=10;
    @property({min:0.000001,tooltip:'Ignore smaller length changes.'}) tolerance=0.001;
    @property({tooltip:'Check length during gameplay; safe to call checkNow() manually.'}) autoCheck=true;
    @property({type:[EventHandler]}) onChanged:EventHandler[]=[];
    @property({type:[EventHandler]}) onGrowing:EventHandler[]=[];
    @property({type:[EventHandler]}) onShrinking:EventHandler[]=[];
    @property({type:[EventHandler]}) onCrossAbove:EventHandler[]=[];
    @property({type:[EventHandler]}) onCrossBelow:EventHandler[]=[];
    private readonly _changedCallbacks=new SplineEventCallbacks<SplineLengthEvent>();
    private readonly _growingCallbacks=new SplineEventCallbacks<SplineLengthEvent>();
    private readonly _shrinkingCallbacks=new SplineEventCallbacks<SplineLengthEvent>();
    private readonly _crossAboveCallbacks=new SplineEventCallbacks<SplineLengthEvent>();
    private readonly _crossBelowCallbacks=new SplineEventCallbacks<SplineLengthEvent>();
    public AddOnChangedEvent(cb:SplineEventCallback<SplineLengthEvent>,target?:object|null):void{this._changedCallbacks.add(cb,target);}
    public RemoveOnChangedEvent(cb:SplineEventCallback<SplineLengthEvent>,target?:object|null):void{this._changedCallbacks.remove(cb,target);}
    public AddOnGrowingEvent(cb:SplineEventCallback<SplineLengthEvent>,target?:object|null):void{this._growingCallbacks.add(cb,target);}
    public RemoveOnGrowingEvent(cb:SplineEventCallback<SplineLengthEvent>,target?:object|null):void{this._growingCallbacks.remove(cb,target);}
    public AddOnShrinkingEvent(cb:SplineEventCallback<SplineLengthEvent>,target?:object|null):void{this._shrinkingCallbacks.add(cb,target);}
    public RemoveOnShrinkingEvent(cb:SplineEventCallback<SplineLengthEvent>,target?:object|null):void{this._shrinkingCallbacks.remove(cb,target);}
    public AddOnCrossAboveEvent(cb:SplineEventCallback<SplineLengthEvent>,target?:object|null):void{this._crossAboveCallbacks.add(cb,target);}
    public RemoveOnCrossAboveEvent(cb:SplineEventCallback<SplineLengthEvent>,target?:object|null):void{this._crossAboveCallbacks.remove(cb,target);}
    public AddOnCrossBelowEvent(cb:SplineEventCallback<SplineLengthEvent>,target?:object|null):void{this._crossBelowCallbacks.add(cb,target);}
    public RemoveOnCrossBelowEvent(cb:SplineEventCallback<SplineLengthEvent>,target?:object|null):void{this._crossBelowCallbacks.remove(cb,target);}
    private _previous:number|null=null;
    public get currentLength():number{return this.getSpline()?.length??0;}
    public getSpline():SplineContainer|null{return this.spline||this.node.parent?.getComponent(SplineContainer)||this.getComponent(SplineContainer)||null;}
    onEnable():void{this.reset();}
    onDestroy():void{this._changedCallbacks.clear();this._growingCallbacks.clear();this._shrinkingCallbacks.clear();this._crossAboveCallbacks.clear();this._crossBelowCallbacks.clear();}
    public reset():void{this._previous=this.getSpline()?.length??null;}
    /** Returns delta; no gameplay callbacks in Scene Editor. */
    public checkNow():number{
        const spline=this.getSpline();if(!spline)return 0;
        const length=spline.length;
        if(this._previous===null){this._previous=length;return 0;}
        const previous=this._previous,delta=length-previous;
        if(Math.abs(delta)<Math.max(1e-8,this.tolerance))return 0;
        this._previous=length;
        if(EDITOR_NOT_IN_PREVIEW)return delta;
        const payload:SplineLengthEvent={monitor:this,spline,previous,current:length,delta,threshold:this.threshold};
        EventHandler.emitEvents(this.onChanged,payload);this._changedCallbacks.emit(payload);this.node.emit('spline-length-change',payload);
        if(delta>0){EventHandler.emitEvents(this.onGrowing,payload);this._growingCallbacks.emit(payload);this.node.emit('spline-length-grow',payload);}
        else {EventHandler.emitEvents(this.onShrinking,payload);this._shrinkingCallbacks.emit(payload);this.node.emit('spline-length-shrink',payload);}
        if(previous<this.threshold&&length>=this.threshold){
            EventHandler.emitEvents(this.onCrossAbove,payload);this._crossAboveCallbacks.emit(payload);this.node.emit('spline-length-above',payload);
        }else if(previous>this.threshold&&length<=this.threshold){
            EventHandler.emitEvents(this.onCrossBelow,payload);this._crossBelowCallbacks.emit(payload);this.node.emit('spline-length-below',payload);
        }
        return delta;
    }
    update():void{if(this.autoCheck)this.checkNow();}
}
