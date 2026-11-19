import { Color, Vec3 } from 'cc';
import type { SplineContainer } from '../Core/SplineContainer';
import type { SplineKnot } from '../Core/SplineKnot';

function api(spline:SplineContainer):{g:any;g3:any;is2D:boolean}|null{
    const g3=(globalThis as any).Gizmos3D,g2=(globalThis as any).Gizmos2D;
    const is2D=spline.dimension===1&&!!g2,g=is2D?g2:g3;
    return g?.beginColor&&g?.drawLine?{g,g3,is2D}:null;
}
function worldKnot(spline:SplineContainer,knot:SplineKnot):Vec3{
    const p=knot.node.position.clone();
    if(spline.dimension===1)p.z=0;
    if(spline.dimension===2)p.y=0;
    return Vec3.transformMat4(p,p,spline.node.worldMatrix);
}
export function drawSplineKnot(spline:SplineContainer,knot:SplineKnot,force=false):void{
    if(!force&&(!spline.showGizmos||!spline.showTangentGizmos))return;
    const ctx=api(spline);if(!ctx)return;
    const {g,g3,is2D}=ctx;
    const ordered=spline.node.children.map(n=>(n as any).getComponent('Splines.SplineKnot') as SplineKnot|null)
        .filter((x):x is SplineKnot=>!!x&&x.enabled);
    const index=ordered.indexOf(knot);
    const data=index>=0?spline.getNaturalResolvedKnots()[index]:null;
    if(!data)return;
    const origin=worldKnot(spline,knot);
    const incoming=Vec3.transformMat4(new Vec3(),
        new Vec3(data.position.x+data.tangentIn.x,data.position.y+data.tangentIn.y,data.position.z+data.tangentIn.z),spline.node.worldMatrix);
    const outgoing=Vec3.transformMat4(new Vec3(),
        new Vec3(data.position.x+data.tangentOut.x,data.position.y+data.tangentOut.y,data.position.z+data.tangentOut.z),spline.node.worldMatrix);
    const orange=new Color(255,164,73,255);
    g.beginColor(spline.node,orange);
    for(const point of [incoming,outgoing]){
        g.drawLine(spline.node,origin,point);
        if(is2D)g.drawCircle(spline.node,point,6);
        else g.drawSphere(spline.node,point,.07,false,8,6);
    }
    if(is2D&&g3?.beginColor&&g3?.drawLine){
        g3.beginColor(spline.node,orange);
        for(const point of [incoming,outgoing]){
            g3.drawLine(spline.node,origin,point);
            if(g3.drawSphere)g3.drawSphere(spline.node,point,.07,false,8,6);
        }
    }
}
export function drawSplineCurve(spline:SplineContainer,force=false):void{
    if((!force&&!spline.showGizmos)||spline.count<2)return;
    const ctx=api(spline);if(!ctx)return;
    const {g,is2D}=ctx;
    const steps=Math.min(64,Math.max(2,Math.floor(spline.gizmoSteps)))*Math.max(1,spline.segmentCount);
    g.beginColor(spline.node,spline.gizmoColor);
    let last=spline.evaluateWorldPosition(0);
    for(let i=1;i<=steps;i++){
        const current=spline.evaluateWorldPosition(i/steps);
        g.drawLine(spline.node,last,current);last=current;
    }
    for(const knot of spline.knots){
        const pos=worldKnot(spline,knot);
        if(is2D)g.drawCircle(spline.node,pos,6);
        else g.drawSphere(spline.node,pos,.09,false,8,6);
        if(spline.showTangentGizmos&&knot.hasTangentHandles)drawSplineKnot(spline,knot);
    }
}
export class SplineContainerGizmos{
    constructor(public readonly component:SplineContainer){}
    onGizmoSettings(){return {display:'always' as const};}
    onDrawGizmos():void{
        const c=this.component;
        if(c.showGizmosAlways||c.knots.some(k=>k.editTangentHandles&&k.hasTangentHandles))
            drawSplineCurve(c,true);
    }
    onDrawGizmosSelected():void{
        const c=this.component;
        if(!c.showGizmosAlways&&!c.knots.some(k=>k.editTangentHandles&&k.hasTangentHandles))
            drawSplineCurve(c);
    }
}
