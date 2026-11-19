import { Color, Vec3, Quat } from 'cc';
import type { SplineModifiers } from '../Components/SplineModifiers';

/** Editor-only modifier visualization; no runtime data mutation. */
export class SplineModifierGizmos {
    constructor(public readonly component:SplineModifiers){}
    onDrawGizmosSelected():void {
        const c=this.component;
        const g=(globalThis as any).Gizmos3D;
        if(!c.showGizmos||!g?.beginColor||!g?.drawLine||!c.node.isValid)return;
        const spline=c.getSpline();
        if(!spline||!spline.node.isValid||spline.count<2)return;
        const owner=c.node;
        const cyan=new Color(55,206,250,255),green=new Color(85,224,130,255);
        const purple=new Color(202,131,255,255),white=new Color(230,230,230,255);
        const frameAt=(p:number)=>{
            const t=Math.max(0,Math.min(1,Number.isFinite(p)?p:0));
            const value=c.sample(t);
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
        const total=Math.min(96,Math.max(8,Math.floor(c.gizmoSamples)||32));
        const width=Math.max(0.1,Math.min(100,c.gizmoBaseWidth));
        let previous:{pos:Vec3;left:Vec3;right:Vec3}|null=null;
        for(let i=0;i<=total;i++){
            const {pos,frame,value}=frameAt(i/total);
            const half=width*value.width*.5;
            const left=ray(pos,new Vec3(1,0,0),frame,-half);
            const right=ray(pos,new Vec3(1,0,0),frame,half);
            if(previous){
                if(c.showOffsetGizmos){g.beginColor(owner,cyan);g.drawLine(owner,previous.pos,pos);}
                if(c.showWidthGizmos){g.beginColor(owner,green);g.drawLine(owner,previous.left,left);g.drawLine(owner,previous.right,right);}
            }
            if(c.showWidthGizmos&&i%4===0){g.beginColor(owner,green);g.drawLine(owner,left,right);}
            previous={pos,left,right};
        }
        if(!c.showKeyGizmos&&!c.showFrameGizmos)return;
        // Bound markers even for scenes containing thousands of keyframes.
        const maxKeys=64, keyCount=c.keys.length;
        for(let i=0;i<Math.min(maxKeys,keyCount);i++){
            const key=c.keys[Math.min(keyCount-1,Math.floor((i+.5)*keyCount/Math.min(maxKeys,keyCount)))];
            const {pos,frame,value}=frameAt(key.progress);
            if(c.showKeyGizmos){
                const color=value.speed<.995?new Color(70,140,255,255):value.speed>1.005?
                    new Color(255,154,55,255):new Color(255,225,88,255);
                g.beginColor(owner,color);
                if(g.drawSphere)g.drawSphere(owner,pos,.12,false,8,6);
                else {g.drawLine(owner,ray(pos,new Vec3(1,0,0),frame,-.12),ray(pos,new Vec3(1,0,0),frame,.12));}
            }
            if(c.showFrameGizmos){
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
}
