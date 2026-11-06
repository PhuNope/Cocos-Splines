import { _decorator, Component, Vec3, Quat, Color, Enum } from 'cc';
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
    /** Editor gizmos: visualize evaluated modifiers; never mutate positions, meshes or materials. */
    public onDrawGizmosSelected():void {
        const g=(globalThis as any).Gizmos3D;
        if(!this.showGizmos||!g?.beginColor||!g?.drawLine||!this.node.isValid)return;
        const spline=this.getSpline();
        if(!spline||!spline.node.isValid||spline.count<2)return;
        const owner=this.node;
        const cyan=new Color(55,206,250,255),green=new Color(85,224,130,255);
        const purple=new Color(202,131,255,255),white=new Color(230,230,230,255);
        const frameAt=(p:number)=>{
            const t=Math.max(0,Math.min(1,Number.isFinite(p)?p:0));
            const value=this.sample(t);
            const frame=Quat.multiply(new Quat(),spline.node.worldRotation,spline.evaluateRotation(t));
            const pos=spline.evaluateWorldPosition(t);
            const offset=Vec3.transformQuat(new Vec3(),new Vec3(value.offset.x,value.offset.y,value.offset.z),frame);
            Vec3.add(pos,pos,offset);
            return {pos,frame,value};
        };
        const ray=(p:Vec3,axis:Vec3,frame:Quat,amount:number)=>{
            const direction=Vec3.transformQuat(new Vec3(),axis,frame);
            const point=Vec3.multiplyScalar(new Vec3(),direction,amount);
            return Vec3.add(point,point,p);
        };
        const total=Math.min(96,Math.max(8,Math.floor(this.gizmoSamples)||32));
        const width=Math.max(0.1,Math.min(100,this.gizmoBaseWidth));
        let previous:{pos:Vec3;left:Vec3;right:Vec3}|null=null;
        for(let i=0;i<=total;i++){
            const {pos,frame,value}=frameAt(i/total);
            const half=width*value.width*.5;
            const left=ray(pos,new Vec3(1,0,0),frame,-half);
            const right=ray(pos,new Vec3(1,0,0),frame,half);
            if(previous){
                if(this.showOffsetGizmos){g.beginColor(owner,cyan);g.drawLine(owner,previous.pos,pos);}
                if(this.showWidthGizmos){g.beginColor(owner,green);g.drawLine(owner,previous.left,left);g.drawLine(owner,previous.right,right);}
            }
            if(this.showWidthGizmos&&i%4===0){g.beginColor(owner,green);g.drawLine(owner,left,right);}
            previous={pos,left,right};
        }
        if(!this.showKeyGizmos&&!this.showFrameGizmos)return;
        // Bound markers even for scenes containing thousands of keyframes.
        const maxKeys=64, keyCount=this.keys.length;
        for(let i=0;i<Math.min(maxKeys,keyCount);i++){
            const key=this.keys[Math.min(keyCount-1,Math.floor((i+.5)*keyCount/Math.min(maxKeys,keyCount)))];
            const {pos,frame,value}=frameAt(key.progress);
            if(this.showKeyGizmos){
                const color=value.speed<.995?new Color(70,140,255,255):value.speed>1.005?
                    new Color(255,154,55,255):new Color(255,225,88,255);
                g.beginColor(owner,color);
                if(g.drawSphere)g.drawSphere(owner,pos,.12,false,8,6);
                else {g.drawLine(owner,ray(pos,new Vec3(1,0,0),frame,-.12),ray(pos,new Vec3(1,0,0),frame,.12));}
            }
            if(this.showFrameGizmos){
                const rolled=Quat.multiply(new Quat(),frame,Quat.fromEuler(new Quat(),0,0,value.roll));
                const axisLength=.4;
                g.beginColor(owner,green);
                g.drawLine(owner,pos,ray(pos,new Vec3(1,0,0),rolled,axisLength*value.scale.x));
                g.beginColor(owner,purple);
                g.drawLine(owner,pos,ray(pos,new Vec3(0,1,0),rolled,axisLength*value.scale.y));
                g.beginColor(owner,white);
                g.drawLine(owner,pos,ray(pos,new Vec3(0,0,1),rolled,axisLength*value.scale.z));
            }
        }
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
