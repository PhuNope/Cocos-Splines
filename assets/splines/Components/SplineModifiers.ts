import { _decorator, Component, Vec3, Enum } from 'cc';
import { registerGizmos } from 'db://cocos-gizmos/RegisterGizmos';
import { SplineModifierGizmos } from '../Editor/SplineModifierGizmos';
import { SplineContainer } from '../Core/SplineContainer';
import { ModifierPoint, ModifierValues, evaluateModifier } from '../Core/SplineModifierMath';
const {ccclass,property,menu,executeInEditMode}=_decorator;
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
@registerGizmos(SplineModifierGizmos)
@menu('Splines/Spline Modifiers')
@executeInEditMode(true)
export class SplineModifiers extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:Enum(ModifierInterpolation)}) interpolation:ModifierInterpolation=ModifierInterpolation.SmoothStep;
    @property({type:[SplineModifierKey]}) keys:SplineModifierKey[]=[];
    @property({tooltip:'Show selected-only key markers and modifier guides in Scene. Requires Cocos-Gizmos.'}) showGizmos=true;
    @property({min:8,max:96,step:1,tooltip:'Preview samples along normalized arc distance. Capped to avoid slowing the Editor.'}) gizmoSamples=32;
    @property({tooltip:'Draw cyan spline path AFTER applying Offset modifiers.'}) showOffsetGizmos=true;
    @property({tooltip:'Draw green width-multiplier guides (not the actual road mesh).'} ) showWidthGizmos=true;
    @property({min:0.1,max:100,tooltip:'Reference base width for gizmo guides only. Road Width is configured on SplineRoad.'}) gizmoBaseWidth=2;
    @property({tooltip:'Show key markers. Blue means Speed < 1; yellow = 1; orange means Speed > 1.'}) showKeyGizmos=true;
    @property({tooltip:'At each key, draw local X/Y/Z axes with Scale and Roll applied. Editor-only visualization.'}) showFrameGizmos=false;
    /** Selectable path used for modifier visualization; no spline knots are modified. */
    public getSpline():SplineContainer|null {
        return this.spline||this.node.getComponent(SplineContainer)||this.node.parent?.getComponent(SplineContainer)||null;
    }

    

    public sample(progress:number):ModifierValues {
        return evaluateModifier(this.keys as ModifierPoint[],progress,this.interpolation===ModifierInterpolation.Linear?'linear':'smooth');
    }
    /** Convert absolute spline-local distance to a modifier sample. */
    public sampleDistance(distance:number):ModifierValues {
        const spline=this.getSpline();
        return this.sample(spline&&spline.length>1e-8?distance/spline.length:0);
    }
    public getRevision():string {return JSON.stringify([this.interpolation,this.keys.map(k=>[k.progress,k.offset,k.scale,k.width,k.speed,k.roll])]);}
}
