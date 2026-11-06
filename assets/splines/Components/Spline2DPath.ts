import { _decorator, Component, Graphics, Color, Mat4, Vec3 } from 'cc';
import { SplineContainer } from '../Core/SplineContainer';
const { ccclass, property, menu, executeInEditMode, requireComponent } = _decorator;
/** Editable 2D curve renderer. Place this node under Canvas/RenderRoot2D with UITransform.
 * The actual Graphics component draws in this node's LOCAL XY plane; no mesh/assets created.
 */
@ccclass('Splines.Spline2DPath')
@menu('Splines/Spline 2D Path')
@executeInEditMode(true)
@requireComponent(Graphics)
export class Spline2DPath extends Component {
    @property({ type:SplineContainer, tooltip:'SplineContainer, preferably with Dimension=XY2D.' }) spline:SplineContainer|null=null;
    @property({ min:0.1, tooltip:'Stroke thickness in Canvas units.' }) lineWidth=5;
    @property({ type:Color }) strokeColor:Color=new Color(40,206,255,255);
    @property({ min:2,max:100,step:1 }) stepsPerCurve=24;
    @property({ tooltip:'Redraw automatically when spline, dimensions or color change.' }) rebuildOnChange=true;
    private _revision='';
    private source():SplineContainer|null {
        return this.spline||this.getComponent(SplineContainer)||this.node.parent?.getComponent(SplineContainer)||null;
    }
    onEnable():void {this.rebuild();}
    update():void {if(this.rebuildOnChange && this.signature()!==this._revision)this.rebuild();}
    private signature():string {
        const source=this.source(),m=this.node.worldMatrix,sm=source?.node.worldMatrix;
        const matrix=(x:any)=>x?[x.m00,x.m01,x.m02,x.m04,x.m05,x.m06,x.m08,x.m09,x.m10,x.m12,x.m13,x.m14]:[];
        return JSON.stringify([source?.getRevision(),matrix(m),matrix(sm),this.lineWidth,this.strokeColor,this.stepsPerCurve]);
    }
    public rebuild():void {
        const g=this.getComponent(Graphics); if(!g)return;
        g.clear();
        const source=this.source();
        if(!source||source.count<2){this._revision=this.signature();return;}
        g.lineWidth=Math.max(.1,this.lineWidth);
        g.strokeColor=this.strokeColor;
        const inverse=Mat4.invert(new Mat4(),this.node.worldMatrix);
        const steps=Math.max(2,Math.floor(this.stepsPerCurve))*source.segmentCount;
        for(let i=0;i<=steps;i++){
            const p=source.evaluateWorldPosition(i/steps);
            Vec3.transformMat4(p,p,inverse);
            if(i===0)g.moveTo(p.x,p.y);
            else g.lineTo(p.x,p.y);
        }
        if(source.closed)g.close();
        g.stroke();
        this._revision=this.signature();
    }
    onDisable():void {this.getComponent(Graphics)?.clear();}
}
