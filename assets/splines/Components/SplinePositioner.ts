import { _decorator, Component, Enum, Node, Quat, Vec3, Color } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer } from '../Core/SplineContainer';
import { SplinePositionMode, toNormalizedDistance } from '../Core/SplinePosition';
const {ccclass,property,menu,executeInEditMode}=_decorator;
Enum(SplinePositionMode);
/** Dreamteck-inspired non-animated placement. No follower clock or junction switching.
 * In the editor, transforms only change with explicit previewInEditor enabled.
 */
@ccclass('Splines.SplinePositioner')
@menu('Splines/Spline Positioner')
@executeInEditMode(true)
export class SplinePositioner extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:Node,tooltip:'Node moved along spline; defaults to this component node.'}) target:Node|null=null;
    @property({type:Enum(SplinePositionMode)}) positionMode:SplinePositionMode=SplinePositionMode.NormalizedDistance;
    @property({range:[0,1,0.001],slide:true,tooltip:'Normalized arc fraction, or Bezier t with SplineT mode.'}) progress=0;
    @property({min:0,tooltip:'Absolute spline-local distance; used only in Distance mode.'}) distance=0;
    @property({type:Node,tooltip:'Optional object whose nearest spline position is followed.'}) followTarget:Node|null=null;
    @property({tooltip:'Offset in spline-local arc units from Follow Target projection (not world units).'}) followDistance=0;
    @property({tooltip:'Wrap followDistance at the end of closed splines.'}) wrapClosed=true;
    @property({type:Vec3,tooltip:'Offset in spline frame (X right, Y up, Z forward), in world units.'}) splineOffset=new Vec3();
    @property alignToSpline=true;
    @property({type:Vec3}) rotationOffset=new Vec3();
    @property({tooltip:'Update placement every frame in gameplay. Manual positioner uses applyPosition() instead.'}) followOnUpdate=true;
    @property({tooltip:'Preview placement in Editor. Turning off restores the original target transform.'}) previewInEditor=false;
    private _previewNode:Node|null=null;
    private _savedPosition:Vec3|null=null;
    private _savedRotation:Quat|null=null;
    private _lastKey='';
    public getSpline():SplineContainer|null{return this.spline||this.node.parent?.getComponent(SplineContainer)||this.getComponent(SplineContainer)||null;}
    /** Current normalized ARC progress. followTarget, when assigned, overrides entered position/distance. */
    public getProgress():number {
        const spline=this.getSpline();if(!spline||spline.count<2)return 0;
        if(!this.followTarget||!this.followTarget.isValid)return toNormalizedDistance(spline,this.positionMode,this.progress,this.distance);
        const projected=spline.projectWorld(this.followTarget.worldPosition);
        const length=spline.length;if(length<=1e-8)return 0;
        let d=projected.distance+this.followDistance;
        if(this.wrapClosed&&spline.closed)d=((d%length)+length)%length;
        return Math.max(0,Math.min(1,d/length));
    }
    /** Updates Target transform; in Editor call only with preview enabled or explicitly from code. */
    public applyPosition():boolean {
        const spline=this.getSpline(),target=this.target||this.node;
        if(!spline||spline.count<2||!target.isValid||target===spline.node)return false;
        const progress=this.getProgress();
        const frame=Quat.multiply(new Quat(),spline.node.worldRotation,spline.evaluateRotation(progress));
        const offset=Vec3.transformQuat(new Vec3(),this.splineOffset,frame);
        const point=spline.evaluateWorldPosition(progress);Vec3.add(point,point,offset);
        target.setWorldPosition(point);
        if(this.alignToSpline){
            const delta=Quat.fromEuler(new Quat(),this.rotationOffset.x,this.rotationOffset.y,this.rotationOffset.z);
            target.setWorldRotation(Quat.multiply(new Quat(),frame,delta));
        }
        return true;
    }
    /** Selected-only placement preview using optional Cocos-Gizmos extension. */
    public onDrawGizmosSelected():void {
        const g=(globalThis as any).Gizmos3D;
        const spline=this.getSpline();
        if(!g?.drawSphere||!spline||spline.count<2)return;
        const t=this.getProgress();
        const center=spline.evaluateWorldPosition(t);
        if(g.beginColor)g.beginColor(this.node,new Color(87,235,190,255));
        g.drawSphere(this.node,center,0.13,false,8,6);
    }
    onEnable():void {
        if(EDITOR_NOT_IN_PREVIEW){if(this.previewInEditor)this.preview();return;}
        this.applyPosition();
    }
    update():void {
        if(!EDITOR_NOT_IN_PREVIEW){if(this.followOnUpdate)this.applyPosition();return;}
        if(!this.previewInEditor){this.restore();return;}
        const spline=this.getSpline();
        const key=JSON.stringify([spline?.getRevision(),spline?.node.worldMatrix,this.target?.uuid,
            this.followTarget?.worldPosition,this.positionMode,this.progress,this.distance,this.followDistance,
            this.splineOffset,this.rotationOffset,this.alignToSpline]);
        if(key!==this._lastKey)this.preview();
    }
    public preview():boolean {
        if(!EDITOR_NOT_IN_PREVIEW)return this.applyPosition();
        const target=this.target||this.node;
        if(this._previewNode&&this._previewNode!==target)this.restore();
        if(!this._previewNode){
            this._previewNode=target;
            this._savedPosition=target.worldPosition.clone();
            this._savedRotation=target.worldRotation.clone();
        }
        const ok=this.applyPosition();
        const spline=this.getSpline();
        this._lastKey=JSON.stringify([spline?.getRevision(),spline?.node.worldMatrix,this.target?.uuid,
            this.followTarget?.worldPosition,this.positionMode,this.progress,this.distance,this.followDistance,
            this.splineOffset,this.rotationOffset,this.alignToSpline]);
        if(!ok)this.restore();
        return ok;
    }
    public restore():void {
        if(this._previewNode?.isValid){
            if(this._savedPosition)this._previewNode.setWorldPosition(this._savedPosition);
            if(this._savedRotation)this._previewNode.setWorldRotation(this._savedRotation);
        }
        this._previewNode=null;this._savedPosition=null;this._savedRotation=null;this._lastKey='';
    }
    onDisable():void {if(EDITOR_NOT_IN_PREVIEW)this.restore();}
    onDestroy():void {if(EDITOR_NOT_IN_PREVIEW)this.restore();}
}
