import { SplineEventCallbacks, type SplineEventCallback } from '../Core/SplineEventCallbacks';
import { _decorator, Component, Enum, EventHandler, Color } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer } from '../Core/SplineContainer';
import { SplinePositionMode, toNormalizedDistance } from '../Core/SplinePosition';
import type { SplineAnimate } from './SplineAnimate';
import type { Direction } from '../Core/SplineTraversal';
const {ccclass,property,menu}= _decorator;

export enum JunctionExitDirection { Preserve=0, Forward=1, Backward=2 }
Enum(JunctionExitDirection);Enum(SplinePositionMode);

/** One logical connection into or out of a junction. These do NOT move the knots;
 * align knot positions manually when a physically continuous fork is required.
 */
@ccclass('Splines.SplineJunctionLink')
export class SplineJunctionLink {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:Enum(SplinePositionMode),tooltip:'Normalized Distance (legacy), Distance in spline-local units or geometric spline t.'})
    positionMode:SplinePositionMode=SplinePositionMode.NormalizedDistance;
    @property({range:[0,1,0.001],slide:true,tooltip:'0..1 coordinate for Normalized Distance or Spline t mode.'}) progress=0;
    @property({min:0,tooltip:'Absolute distance from beginning; applies only in Distance mode.'}) distance=0;
    public getProgress():number{return this.spline?toNormalizedDistance(this.spline,this.positionMode,this.progress,this.distance):0;}
    @property({type:Enum(JunctionExitDirection),tooltip:'Applied when this link is chosen as destination. Preserve: keep incoming travel direction; Forward: increase destination progress (0 toward 1); Backward: decrease destination progress (1 toward 0). It does not choose a branch.'}) exitDirection:JunctionExitDirection=JunctionExitDirection.Preserve;
}

export interface JunctionEvent {
    junction:SplineJunction;follower:SplineAnimate;target:import('cc').Node;
    entryIndex:number;exitIndex:number;spline:SplineContainer;progress:number;direction:Direction;
    distance:number;t:number;
    nextSpline?:SplineContainer;nextProgress?:number;nextDistance?:number;nextT?:number;
}
/** Connect multiple splines through distance-parameterized links.
 * Route choice is on the follower (Off / First Other / Round Robin / Manual).
 * No global editor panel: edit `connections` in this component's Inspector.
 */
@ccclass('Splines.SplineJunction')
@menu('Splines/Spline Junction')
export class SplineJunction extends Component {
    static readonly active=new Set<SplineJunction>();
    @property({type:[SplineJunctionLink],tooltip:'At least two links. Each link supports normalized arc Progress, Distance units or Spline t.'})
    connections:SplineJunctionLink[]=[];
    @property({type:[EventHandler],tooltip:'Called when a follower arrives. Handler may call follower.requestJunctionExit(index).'})
    onReach:EventHandler[]=[];
    @property({type:[EventHandler],tooltip:'Called only after switching to another spline.'})
    onSwitch:EventHandler[]=[];
    private readonly _reachCallbacks=new SplineEventCallbacks<JunctionEvent>();
    private readonly _switchCallbacks=new SplineEventCallbacks<JunctionEvent>();
    private _lastExit=-1;
    /** Subscribe/unsubscribe to Reach without modifying serialized Inspector events. */
    public AddOnReachEvent(cb:SplineEventCallback<JunctionEvent>,target?:object|null):void{this._reachCallbacks.add(cb,target);}
    public RemoveOnReachEvent(cb:SplineEventCallback<JunctionEvent>,target?:object|null):void{this._reachCallbacks.remove(cb,target);}
    public addOnReachEvent(cb:SplineEventCallback<JunctionEvent>,target?:object|null):void{this.AddOnReachEvent(cb,target);}
    public removeOnReachEvent(cb:SplineEventCallback<JunctionEvent>,target?:object|null):void{this.RemoveOnReachEvent(cb,target);}
    /** Subscribe/unsubscribe to Switch without modifying serialized Inspector events. */
    public AddOnSwitchEvent(cb:SplineEventCallback<JunctionEvent>,target?:object|null):void{this._switchCallbacks.add(cb,target);}
    public RemoveOnSwitchEvent(cb:SplineEventCallback<JunctionEvent>,target?:object|null):void{this._switchCallbacks.remove(cb,target);}
    public addOnSwitchEvent(cb:SplineEventCallback<JunctionEvent>,target?:object|null):void{this.AddOnSwitchEvent(cb,target);}
    public removeOnSwitchEvent(cb:SplineEventCallback<JunctionEvent>,target?:object|null):void{this.RemoveOnSwitchEvent(cb,target);}
    onEnable():void{if(!EDITOR_NOT_IN_PREVIEW)SplineJunction.active.add(this);}
    onDisable():void{SplineJunction.active.delete(this);}
    onDestroy():void{SplineJunction.active.delete(this);this._reachCallbacks.clear();this._switchCallbacks.clear();}
    public onDrawGizmosSelected():void{
        const g3=(globalThis as any).Gizmos3D;
        const g2=(globalThis as any).Gizmos2D;
        for(const entry of this.entries()){
            const spline=entry.link.spline;
            if(!spline)continue;
            const use2D=spline.dimension===1&&!!g2;
            const g=use2D?g2:g3;if(!g)continue;
            const p=spline.evaluateWorldPosition(entry.link.getProgress());
            g.beginColor(this.node,new Color(250,80,204,255));
            if(use2D)g.drawCircle(this.node,p,8);
            else g.drawSphere(this.node,p,0.16,false,8,6);
            g.drawLine(this.node,this.node.worldPosition,p);
        }
    }
    /** Valid links for runtime; entries retain their serialized index. */
    public entries():Array<{index:number;link:SplineJunctionLink}> {
        return this.connections.map((link,index)=>({index,link})).filter(x=>!!x.link?.spline&&x.link.spline.count>1);
    }
    public reaches(follower:SplineAnimate,entryIndex:number,direction:Direction):void{
        const link=this.connections[entryIndex];if(!link?.spline)return;
        const payload:JunctionEvent={junction:this,follower,target:follower.target||follower.node,entryIndex,exitIndex:-1,
            spline:link.spline,progress:link.getProgress(),distance:link.getProgress()*link.spline.length,
            t:link.spline.tAtProgress(link.getProgress()),direction};
        EventHandler.emitEvents(this.onReach,payload);
        this._reachCallbacks.emit(payload);
        this.node.emit('spline-junction',payload);
        follower.node.emit('spline-junction',payload);
    }
    /** choice = 'first' | 'roundRobin' | index (manual); excludes entry index. */
    public pick(entryIndex:number,choice:'first'|'roundRobin'|number):{index:number;link:SplineJunctionLink}|null{
        const choices=this.entries().filter(e=>e.index!==entryIndex);
        if(!choices.length)return null;
        if(typeof choice==='number')return choices.find(e=>e.index===choice)||null;
        if(choice==='first')return choices[0];
        const at=choices.findIndex(x=>x.index>this._lastExit);
        const result=choices[at<0?0:at];this._lastExit=result.index;
        return result;
    }
    public switched(follower:SplineAnimate,entryIndex:number,exitIndex:number,direction:Direction):void{
        const from=this.connections[entryIndex],to=this.connections[exitIndex];
        if(!from?.spline||!to?.spline)return;
        const payload:JunctionEvent={junction:this,follower,target:follower.target||follower.node,
            entryIndex,exitIndex,spline:from.spline,progress:from.getProgress(),distance:from.getProgress()*from.spline.length,
            t:from.spline.tAtProgress(from.getProgress()),direction,
            nextSpline:to.spline,nextProgress:to.getProgress(),
            nextDistance:to.getProgress()*to.spline.length,nextT:to.spline.tAtProgress(to.getProgress())};
        EventHandler.emitEvents(this.onSwitch,payload);
        this._switchCallbacks.emit(payload);
        this.node.emit('spline-junction-switch',payload);
        follower.node.emit('spline-junction-switch',payload);
    }
}
