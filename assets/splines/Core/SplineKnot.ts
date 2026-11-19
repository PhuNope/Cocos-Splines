import { _decorator, Component, Enum, Vec3, Node, Quat } from 'cc';
import { registerGizmos } from 'db://cocos-gizmos/RegisterGizmos';
import { SplineKnotGizmos } from '../Editor/SplineKnotGizmos';
const { ccclass, property, menu, executeInEditMode } = _decorator;

/** Values equal UnityEngine.Splines.TangentMode. */
export enum TangentMode { AutoSmooth=0, Linear=1, Mirrored=2, Continuous=3, Broken=4 }
Enum(TangentMode);

/** Add to a DIRECT child of SplineContainer. Move this Node with the stock
 * Cocos 3D Move gizmo; local node.position is the Bezier knot position.
 * Rotation provides the knot up vector (local +Y).
 */
@ccclass('Splines.SplineKnot')
@registerGizmos(SplineKnotGizmos)
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
    /** Read and write editor-only world orientation without duplicate serialized state. */
    get editorWorldEuler():Vec3 {return Quat.toEuler(new Vec3(),this.node.worldRotation);}
    set editorWorldEuler(euler:Vec3) {
        if(euler && [euler.x,euler.y,euler.z].every(Number.isFinite))
            this.node.setWorldRotation(Quat.fromEuler(new Quat(),euler.x,euler.y,euler.z));
    }
    private editorSpline():any {
        return (this.node.parent as any)?.getComponent('Splines.SplineContainer')||null;
    }
    private readTangent(which:'in'|'out'):Vec3 {
        const handle=which==='in'?this.tangentInHandle:this.tangentOutHandle;
        if(handle?.isValid)return handle.position.clone();
        const spline=this.editorSpline();
        if(spline){
            const ordered=this.node.parent!.children.map(n=>n.getComponent(SplineKnot))
                .filter((x):x is SplineKnot=>!!x&&x.enabled);
            const index=ordered.indexOf(this),resolved=spline.getNaturalResolvedKnots?.()[index];
            if(resolved){
                const value=which==='in'?resolved.tangentIn:resolved.tangentOut;
                return Vec3.transformQuat(new Vec3(),new Vec3(value.x,value.y,value.z),
                    Quat.invert(new Quat(),this.node.rotation));
            }
        }
        const value=(which==='in'?this.tangentIn:this.tangentOut).clone();
        return this.tangentsInKnotSpace?value:
            Vec3.transformQuat(value,value,Quat.invert(new Quat(),this.node.rotation));
    }
    private storeTangent(which:'in'|'out',local:Vec3):void {
        const handle=which==='in'?this.tangentInHandle:this.tangentOutHandle;
        if(handle?.isValid){handle.setPosition(local);return;}
        const value=local.clone();
        if(!this.tangentsInKnotSpace)Vec3.transformQuat(value,value,this.node.rotation);
        if(which==='in')this.tangentIn=value;else this.tangentOut=value;
    }
    private writeTangent(which:'in'|'out',local:Vec3):void {
        if(!local||![local.x,local.y,local.z].every(Number.isFinite))return;
        if(this.mode!==TangentMode.Broken){
            const beforeIn=this.readTangent('in'),beforeOut=this.readTangent('out');
            this.mode=TangentMode.Broken;
            this.storeTangent('in',beforeIn);
            this.storeTangent('out',beforeOut);
        }
        this.storeTangent(which,local);
        this.editorSpline()?.refresh?.();
    }
    get editorTangentIn():Vec3 {return this.readTangent('in');}
    set editorTangentIn(v:Vec3) {this.writeTangent('in',v);}
    get editorTangentOut():Vec3 {return this.readTangent('out');}
    set editorTangentOut(v:Vec3) {this.writeTangent('out',v);}

}
