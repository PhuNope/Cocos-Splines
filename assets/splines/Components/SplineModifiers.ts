import { _decorator, Component, Vec3, Enum } from 'cc';
import { SplineContainer } from '../Core/SplineContainer';
import { ModifierPoint, ModifierValues, evaluateModifier } from '../Core/SplineModifierMath';
const {ccclass,property,menu}=_decorator;
export enum ModifierInterpolation { Linear=0,SmoothStep=1 }
Enum(ModifierInterpolation);

/** Serialized keyframe on normalized arc length. Defaults to neutral modifiers. */
@ccclass('Splines.SplineModifierKey')
export class SplineModifierKey {
    @property({range:[0,1,0.001],slide:true}) progress=0;
    @property({type:Vec3,tooltip:'Right, Up, Forward offsets in spline frame.'}) offset=new Vec3();
    @property({type:Vec3}) scale=new Vec3(1,1,1);
    @property({min:0.01}) width=1;
    @property({min:0.01}) speed=1;
    @property({tooltip:'Extra roll around spline forward (degrees)'}) roll=0;
}

/** Unity/Dreamteck-style reusable modifiers. Consumers opt in explicitly. */
@ccclass('Splines.SplineModifiers')
@menu('Splines/Spline Modifiers')
export class SplineModifiers extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:Enum(ModifierInterpolation)}) interpolation:ModifierInterpolation=ModifierInterpolation.SmoothStep;
    @property({type:[SplineModifierKey]}) keys:SplineModifierKey[]=[];
    public sample(progress:number):ModifierValues {
        return evaluateModifier(this.keys as ModifierPoint[],progress,this.interpolation===ModifierInterpolation.Linear?'linear':'smooth');
    }
    /** Convert absolute spline-local distance to a modifier sample. */
    public sampleDistance(distance:number):ModifierValues {
        const spline=this.spline||this.node.getComponent(SplineContainer)||this.node.parent?.getComponent(SplineContainer);
        return this.sample(spline&&spline.length>1e-8?distance/spline.length:0);
    }
    public getRevision():string {return JSON.stringify([this.interpolation,this.keys.map(k=>[k.progress,k.offset,k.scale,k.width,k.speed,k.roll])]);}
}
