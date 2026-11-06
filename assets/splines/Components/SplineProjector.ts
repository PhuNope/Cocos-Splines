import { _decorator, Component, Node, Vec3, Quat, EventHandler, Color } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer } from '../Core/SplineContainer';
import { SplineEventCallbacks, type SplineEventCallback } from '../Core/SplineEventCallbacks';
const {ccclass,property,menu,executeInEditMode}=_decorator;
export interface SplineProjectionEvent {
    projector:SplineProjector;
    spline:SplineContainer;
    source:Node;
    worldPosition:Vec3;
    t:number;
    progress:number;
    distance:number;
    separation:number;
}
/** Closest-point projector inspired by Dreamteck SplineProjector.
 * Works with transformed, 2D and non-uniformly scaled curves; does not edit knots.
 */
@ccclass('Splines.SplineProjector')
@menu('Splines/Spline Projector')
@executeInEditMode(true)
export class SplineProjector extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:Node,tooltip:'World position to project; default = this component node.'}) sourceNode:Node|null=null;
    @property({type:Node,tooltip:'Optional separate marker to snap to the nearest spline point.'}) projectedNode:Node|null=null;
    @property({min:16,max:1024,step:1,tooltip:'Coarse samples in WORLD space; refined near candidates. Increase for long looping curves.'}) samples=128;
    @property({tooltip:'Continuously measure nearest point each frame. Call projectNow() manually otherwise.'}) autoProject=true;
    @property({tooltip:'Place Projected Node at closest point (or component node if Projected Node is empty). Source Node is not moved unless same as target.'}) snapToSpline=false;
    @property({tooltip:'Align the projected target along the nearest tangent.'}) alignToSpline=false;
    @property({type:Vec3,tooltip:'Offset relative to spline frame X(right) Y(up) Z(forward).'}) splineOffset=new Vec3();
    @property({min:0,tooltip:'When > 0, On Enter/On Exit fires as source enters/leaves this world-space radius.'}) enterExitRadius=0;
    @property({tooltip:'Fire On Project and node.emit(\'spline-project\') for each gameplay evaluation. Off by default.'}) notifyOnProject=false;
    @property({type:[EventHandler]}) onProject:EventHandler[]=[];
    @property({type:[EventHandler]}) onEnter:EventHandler[]=[];
    @property({type:[EventHandler]}) onExit:EventHandler[]=[];
    @property({tooltip:'Opt-in Editor preview; restores target position/rotation when disabled.'}) previewInEditor=false;
    private readonly _projectCallbacks=new SplineEventCallbacks<SplineProjectionEvent>();
    private readonly _enterCallbacks=new SplineEventCallbacks<SplineProjectionEvent>();
    private readonly _exitCallbacks=new SplineEventCallbacks<SplineProjectionEvent>();
    public AddOnProjectEvent(cb:SplineEventCallback<SplineProjectionEvent>,target?:object|null):void{this._projectCallbacks.add(cb,target);}
    public RemoveOnProjectEvent(cb:SplineEventCallback<SplineProjectionEvent>,target?:object|null):void{this._projectCallbacks.remove(cb,target);}
    public AddOnEnterEvent(cb:SplineEventCallback<SplineProjectionEvent>,target?:object|null):void{this._enterCallbacks.add(cb,target);}
    public RemoveOnEnterEvent(cb:SplineEventCallback<SplineProjectionEvent>,target?:object|null):void{this._enterCallbacks.remove(cb,target);}
    public AddOnExitEvent(cb:SplineEventCallback<SplineProjectionEvent>,target?:object|null):void{this._exitCallbacks.add(cb,target);}
    public RemoveOnExitEvent(cb:SplineEventCallback<SplineProjectionEvent>,target?:object|null):void{this._exitCallbacks.remove(cb,target);}
    private _last:SplineProjectionEvent|null=null;
    private _inside=false;
    private _initialized=false;
    private _savedNode:Node|null=null;
    private _savedPosition:Vec3|null=null;
    private _savedRotation:Quat|null=null;
    public get lastProjection():SplineProjectionEvent|null{return this._last;}
    public getSpline():SplineContainer|null{return this.spline||this.node.parent?.getComponent(SplineContainer)||this.getComponent(SplineContainer)||null;}
    private marker():Node{return this.projectedNode||this.node;}
    public projectNow():SplineProjectionEvent|null{
        const spline=this.getSpline(),source=this.sourceNode||this.node;
        if(!spline||spline.count<2||!source.isValid)return null;
        const result=spline.projectWorld(source.worldPosition,this.samples);
        const payload:SplineProjectionEvent={projector:this,spline,source,
            worldPosition:result.worldPosition,t:result.t,progress:result.progress,distance:result.distance,
            separation:Math.sqrt(Math.max(0,result.squaredDistance))};
        this._last=payload;
        if(this.snapToSpline && (!EDITOR_NOT_IN_PREVIEW || this.previewInEditor)){
            const target=this.marker();
            if(target.isValid&&target!==spline.node){
                if(EDITOR_NOT_IN_PREVIEW){
                    if(this._savedNode&&this._savedNode!==target)this.restore();
                    if(!this._savedNode){this._savedNode=target;this._savedPosition=target.worldPosition.clone();this._savedRotation=target.worldRotation.clone();}
                }
                const q=Quat.multiply(new Quat(),spline.node.worldRotation,spline.evaluateRotation(result.progress));
                const p=payload.worldPosition.clone();
                Vec3.add(p,p,Vec3.transformQuat(new Vec3(),this.splineOffset,q));
                target.setWorldPosition(p);
                if(this.alignToSpline)target.setWorldRotation(q);
            }
        }
        if(!EDITOR_NOT_IN_PREVIEW){
            if(this.enterExitRadius>0){
                const inside=payload.separation<=this.enterExitRadius;
                if(this._initialized&&inside!==this._inside){
                    const ev=inside?this.onEnter:this.onExit;
                    EventHandler.emitEvents(ev,payload);
                    (inside?this._enterCallbacks:this._exitCallbacks).emit(payload);
                    this.node.emit(inside?'spline-project-enter':'spline-project-exit',payload);
                }
                this._inside=inside;this._initialized=true;
            }else this._initialized=false;
            if(this.notifyOnProject){EventHandler.emitEvents(this.onProject,payload);this._projectCallbacks.emit(payload);this.node.emit('spline-project',payload);}
        }
        return payload;
    }
    /** Cocos-Gizmos optional selected-only preview, no mutation or gameplay callbacks. */
    public onDrawGizmosSelected():void {
        const g=(globalThis as any).Gizmos3D;
        const spline=this.getSpline(),source=this.sourceNode||this.node;
        if(!g?.drawLine||!g?.drawSphere||!spline||spline.count<2||!source.isValid)return;
        const hit=spline.projectWorld(source.worldPosition,this.samples);
        if(g.beginColor)g.beginColor(this.node,new Color(255,180,65,255));
        g.drawLine(this.node,source.worldPosition,hit.worldPosition);
        g.drawSphere(this.node,hit.worldPosition,0.14,false,8,6);
    }
    onEnable():void{this._initialized=false;if(EDITOR_NOT_IN_PREVIEW){if(this.previewInEditor)this.projectNow();}else this.projectNow();}
    update():void{
        if(EDITOR_NOT_IN_PREVIEW){if(this.previewInEditor)this.projectNow();else this.restore();}
        else if(this.autoProject)this.projectNow();
    }
    public restore():void{
        if(this._savedNode?.isValid){
            if(this._savedPosition)this._savedNode.setWorldPosition(this._savedPosition);
            if(this._savedRotation)this._savedNode.setWorldRotation(this._savedRotation);
        }
        this._savedNode=null;this._savedPosition=null;this._savedRotation=null;
    }
    onDisable():void{if(EDITOR_NOT_IN_PREVIEW)this.restore();this._initialized=false;}
    onDestroy():void{if(EDITOR_NOT_IN_PREVIEW)this.restore();this._projectCallbacks.clear();this._enterCallbacks.clear();this._exitCallbacks.clear();}
}
