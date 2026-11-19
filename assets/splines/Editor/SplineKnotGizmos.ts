import { Vec3, Quat } from 'cc';
import type { SplineKnot } from '../Core/SplineKnot';
import type { SplineContainer } from '../Core/SplineContainer';
import { drawSplineCurve, drawSplineKnot } from './SplineContainerGizmos';

interface Before {
    mode:number;
    inTangent:Vec3;outTangent:Vec3;
    inHandle:Vec3|null;outHandle:Vec3|null;
    worldRotation:Quat;
}
export class SplineKnotGizmos{
    private before:Before|null=null;
    constructor(public readonly component:SplineKnot){}
    private spline():SplineContainer|null{
        return (this.component.node.parent as any)?.getComponent('Splines.SplineContainer')||null;
    }
    onGizmoSettings(){return {display:'always' as const};}
    onGizmoHandles():any[]{
        const spline=this.spline();
        if(!spline||spline.count<2)return [];
        const g2=(globalThis as any).Gizmos2D,g3=(globalThis as any).Gizmos3D;
        const g=spline.dimension===1&&g2?g2:g3;
        if(!g?.move)return [];
        const handles=[
            ...g.move('editorTangentIn',{space:'local',pickSize:25}),
            ...g.move('editorTangentOut',{space:'local',pickSize:25}),
        ];
        if(g.rotate)handles.push(...g.rotate('editorWorldEuler',{space:'world',ringSize:70,pickSize:14}));
        return handles;
    }
    onDrawGizmos():void{
        const knot=this.component,spline=this.spline();
        if(spline&&knot.editTangentHandles&&knot.hasTangentHandles)drawSplineKnot(spline,knot,true);
    }
    onDrawGizmosSelected():void{
        const spline=this.spline();if(!spline)return;
        if(!spline.showGizmosAlways&&!spline.knots.some(k=>k.editTangentHandles&&k.hasTangentHandles))
            drawSplineCurve(spline,true);
        drawSplineKnot(spline,this.component,true);
    }
    onGizmoChanged(_property:string,phase:string):void{
        const k=this.component;
        if(phase==='begin'){
            this.before={mode:k.mode,inTangent:k.tangentIn.clone(),outTangent:k.tangentOut.clone(),
                inHandle:k.tangentInHandle?.isValid?k.tangentInHandle.position.clone():null,
                outHandle:k.tangentOutHandle?.isValid?k.tangentOutHandle.position.clone():null,
                worldRotation:k.node.worldRotation.clone()};
        }
        if(phase==='cancel'&&this.before){
            const s=this.before;
            k.mode=s.mode;k.tangentIn=s.inTangent;k.tangentOut=s.outTangent;
            if(s.inHandle&&k.tangentInHandle?.isValid)k.tangentInHandle.setPosition(s.inHandle);
            if(s.outHandle&&k.tangentOutHandle?.isValid)k.tangentOutHandle.setPosition(s.outHandle);
            k.node.setWorldRotation(s.worldRotation);
        }
        if(phase==='end'||phase==='cancel')this.before=null;
        this.spline()?.refresh();
    }
}
