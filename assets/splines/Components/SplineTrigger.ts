import { _decorator, Component, Enum, EventHandler, Color } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer } from '../Core/SplineContainer';
import { SplinePositionMode, toNormalizedDistance } from '../Core/SplinePosition';
import type { SplineAnimate } from './SplineAnimate';
import type { Direction } from '../Core/SplineTraversal';
import { SplineEventCallbacks, type SplineEventCallback } from '../Core/SplineEventCallbacks';
const {ccclass,property,menu}= _decorator;

export interface SplineTriggerEvent {
    trigger:SplineTrigger; follower:SplineAnimate; target:import('cc').Node;
    spline:SplineContainer|null; progress:number; distance:number; t:number; direction:Direction;
}
export enum TriggerDirection { Both=0, Forward=1, Backward=2 }
Enum(TriggerDirection);Enum(SplinePositionMode);
/** A marker bound to a normalized distance, independent of its marker Node transform.
 * Attach below the SplineContainer or drag a SplineContainer into the `spline` field.
 * Cocos EventHandler callbacks and Node.emit('spline-trigger', payload) are both supported.
 */
@ccclass('Splines.SplineTrigger')
@menu('Splines/Spline Trigger')
export class SplineTrigger extends Component {
    static readonly active=new Set<SplineTrigger>();
    @property({type:SplineContainer,tooltip:'Optional if this node is a child of a SplineContainer.'}) spline:SplineContainer|null=null;
    @property({type:Enum(SplinePositionMode),tooltip:'Normalized Distance (legacy 0..1), Distance (spline local units) or geometric Spline t (0..1).'})
    positionMode:SplinePositionMode=SplinePositionMode.NormalizedDistance;
    @property({range:[0,1,0.001],slide:true,tooltip:'For Normalized Distance / Spline t modes (0..1).'}) progress=0.5;
    @property({min:0,tooltip:'Absolute spline-local distance from start. Used when Position Mode = Distance.'}) distance=0;
    @property({type:Enum(TriggerDirection)}) direction:TriggerDirection=TriggerDirection.Both;
    @property({tooltip:'Fire only once globally until resetTrigger() is called.'}) workOnce=false;
    @property({tooltip:'Fire at most once for each distinct SplineAnimate follower.'}) oncePerFollower=false;
    @property({type:[EventHandler],tooltip:'Cocos event handlers receive one SplineEvent payload object.'}) onCross:EventHandler[]=[];
    private readonly _crossCallbacks=new SplineEventCallbacks<SplineTriggerEvent>();
    public AddOnCrossEvent(cb:SplineEventCallback<SplineTriggerEvent>,target?:object|null):void{this._crossCallbacks.add(cb,target);}
    public RemoveOnCrossEvent(cb:SplineEventCallback<SplineTriggerEvent>,target?:object|null):void{this._crossCallbacks.remove(cb,target);}
    public addOnCrossEvent(cb:SplineEventCallback<SplineTriggerEvent>,target?:object|null):void{this.AddOnCrossEvent(cb,target);}
    public removeOnCrossEvent(cb:SplineEventCallback<SplineTriggerEvent>,target?:object|null):void{this.RemoveOnCrossEvent(cb,target);}
    private _worked=false;
    private _seen=new Set<SplineAnimate>();
    onEnable():void{if(!EDITOR_NOT_IN_PREVIEW)SplineTrigger.active.add(this);}
    onDisable():void{SplineTrigger.active.delete(this);}
    onDestroy():void{SplineTrigger.active.delete(this);this._crossCallbacks.clear();}
    public getSpline():SplineContainer|null{
        if(this.spline)return this.spline;
        let parent=this.node.parent;
        while(parent){const s=parent.getComponent(SplineContainer);if(s)return s;parent=parent.parent;}
        return null;
    }
    /** Always resolves from current arc length, so editing knots repositions distance markers. */
    public getProgress():number{const spline=this.getSpline();return spline?toNormalizedDistance(spline,this.positionMode,this.progress,this.distance):0;}
    public onDrawGizmosSelected():void {
        const spline=this.getSpline();if(!spline||spline.count<2)return;
        const is2D=spline.dimension===1;
        const g=(is2D&&(globalThis as any).Gizmos2D)||(globalThis as any).Gizmos3D;
        if(!g)return;
        const p=spline.evaluateWorldPosition(this.getProgress());
        g.beginColor(this.node,new Color(255,210,50,255));
        if(is2D&&(globalThis as any).Gizmos2D)g.drawCircle(this.node,p,8);
        else g.drawSphere(this.node,p,0.17,false,10,8);
        g.drawLine(this.node,this.node.worldPosition,p);
    }
    public resetTrigger():void{this._worked=false;this._seen.clear();}
    public fire(follower:SplineAnimate,direction:Direction):boolean {
        if(!this.enabled||this.workOnce&&this._worked||this.oncePerFollower&&this._seen.has(follower))return false;
        if(this.direction===TriggerDirection.Forward&&direction!==1||this.direction===TriggerDirection.Backward&&direction!==-1)return false;
        this._worked=true;this._seen.add(follower);
        const spline=this.getSpline(),progress=this.getProgress();
        const payload:SplineTriggerEvent={trigger:this,follower,target:follower.target||follower.node,spline,progress,
            distance:spline?progress*spline.length:0,t:spline?spline.tAtProgress(progress):0,direction};
        EventHandler.emitEvents(this.onCross,payload);
        this._crossCallbacks.emit(payload);
        this.node.emit('spline-trigger',payload);
        follower.node.emit('spline-trigger',payload);
        return true;
    }
}
