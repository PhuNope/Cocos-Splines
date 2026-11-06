import { _decorator, Component, Enum, Vec3, Node } from 'cc';
const { ccclass, property, menu, executeInEditMode } = _decorator;

/** Values equal UnityEngine.Splines.TangentMode. */
export enum TangentMode { AutoSmooth=0, Linear=1, Mirrored=2, Continuous=3, Broken=4 }
Enum(TangentMode);

/** Add to a DIRECT child of SplineContainer. Move this Node with the stock
 * Cocos 3D Move gizmo; local node.position is the Bezier knot position.
 * Rotation provides the knot up vector (local +Y).
 */
@ccclass('Splines.SplineKnot')
@menu('Splines/Spline Knot')
@executeInEditMode(true)
export class SplineKnot extends Component {
    @property({type:Enum(TangentMode), tooltip:'Unity tangent modes: AutoSmooth / Linear / Mirrored / Continuous / Broken'})
    mode:TangentMode=TangentMode.AutoSmooth;
    @property({type:Vec3, tooltip:'Incoming tangent, relative to this knot, in parent local coordinates'})
    tangentIn:Vec3=new Vec3(-1,0,0);
    @property({type:Vec3, tooltip:'Outgoing tangent, relative to this knot, in parent local coordinates'})
    tangentOut:Vec3=new Vec3(1,0,0);
    @property({min:0,step:0.05, tooltip:'AutoSmooth tension; Unity default = 1/3'})
    tension=1/3;
    @property({tooltip:'Unity-compatible knot-local tangents. Off by default to retain the transform behavior of v0.2 scenes.'})
    tangentsInKnotSpace=false;
    /** Optional handle nodes (direct children of this knot). Their local positions override the vector fields. */
    @property({type:Node})
    tangentInHandle:Node|null=null;
    @property({type:Node})
    tangentOutHandle:Node|null=null;
    /** Editor visualization mode for knots using tangent handle nodes.
     * When enabled, the spline and both tangent arms stay visible even if
     * SplineContainer's global gizmo toggles are off. It does not mutate the
     * handle Nodes or alter the actual Bezier curve.
     * When disabled, selecting this knot still draws both tangents.
     */
    @property({tooltip:'Only for knots with tangent handle Nodes: keep curve + tangents visible while editing (even if Container gizmos are off).'})
    editTangentHandles=false;
    public get hasTangentHandles():boolean {
        return !!((this.tangentInHandle&&this.tangentInHandle.isValid)||
                  (this.tangentOutHandle&&this.tangentOutHandle.isValid));
    }
    /** Cocos-Gizmos invokes this in the Editor Scene process, not at runtime. */
    public onDrawGizmos():void {
        if(!this.editTangentHandles||!this.hasTangentHandles)return;
        const spline=(this.node.parent as any)?.getComponent('Splines.SplineContainer') as any;
        if(spline)spline.drawKnotGizmos(this,true);
    }
    public onDrawGizmosSelected():void {
        const spline=(this.node.parent as any)?.getComponent('Splines.SplineContainer') as any;
        if(!spline)return;
        // Selecting a knot ALWAYS shows its tangents, independent of the
        // container's showGizmos / showTangentGizmos properties.
        if(!spline.showGizmosAlways&&!spline.knots.some((k:any)=>k.editTangentHandles&&k.hasTangentHandles))
            spline.drawCurveGizmos(true);
        // Always draw, even if only the selected callback is dispatched.
        spline.drawKnotGizmos(this,true);
    }
}
