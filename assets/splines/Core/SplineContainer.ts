import { _decorator, Component, Vec3, Quat, Enum, Color } from 'cc';
import { SplineKnot, TangentMode } from './SplineKnot';
import * as M from './SplineMath';
import { closestParameter } from './SplineProjectionMath';
const {ccclass,property,menu,executeInEditMode}= _decorator;
export enum SplineDimension { Space3D=0, XY2D=1, XZ2D=2 }
Enum(SplineDimension);
function gizmos3D():any { return (globalThis as any).Gizmos3D; }
function gizmos2D():any { return (globalThis as any).Gizmos2D; }


/** One spline per container; direct children bearing SplineKnot are evaluated in sibling order. */
@ccclass('Splines.SplineContainer')
@menu('Splines/Spline Container')
@executeInEditMode(true)
export class SplineContainer extends Component {
    @property({tooltip:'Connect final knot to first knot'}) closed=false;
    @property({tooltip:'Evaluate spline from last knot to first knot'}) reversed=false;
    @property({min:4,max:256,step:1,tooltip:'Arc-length accuracy per cubic segment'}) samplesPerCurve=32;
    @property({type:Enum(SplineDimension),tooltip:'3D: full curve; XY: 2D/UI plane; XZ: ground plane. 2D modes project positions/tangents onto their plane without moving knot nodes.'})
    dimension:SplineDimension=SplineDimension.Space3D;
    @property({tooltip:'Draw spline curve and knots when selected (requires Cocos-Gizmos extension).'}) showGizmos=true;
    @property({tooltip:'Show curve even when container is not selected. Requires Cocos-Gizmos.'}) showGizmosAlways=false;
    @property({tooltip:'Draw tangent handles on selected knots.'}) showTangentGizmos=true;
    @property({min:2,max:64,step:1,tooltip:'Visualization density per cubic segment.'}) gizmoSteps=12;
    @property({type:Color,tooltip:'Editor-only curve color.'}) gizmoColor:Color=new Color(45,208,255,255);
    private _lut:M.ArcLUT|null=null;
    private _signature='';

    get knots():SplineKnot[]{const result=this.node.children.map(c=>c.getComponent(SplineKnot)).filter((x):x is SplineKnot=>!!x&&x.enabled);return this.reversed?result.reverse():result;}
    private collect(reverse=this.reversed):M.KnotData[]{
        const knots=this.node.children.map(n=>n.getComponent(SplineKnot))
            .filter((k):k is SplineKnot=>!!k&&k.enabled);
        if(reverse)knots.reverse();
        return knots.map(k=>{
            const input=k.tangentInHandle && k.tangentInHandle.isValid?k.tangentInHandle.position:k.tangentIn;
            const output=k.tangentOutHandle && k.tangentOutHandle.isValid?k.tangentOutHandle.position:k.tangentOut;
            // Handles are knot-local, while math operates in container-local space.
            const inVec=input.clone(),outVec=output.clone();
            if(k.tangentInHandle||k.tangentsInKnotSpace)Vec3.transformQuat(inVec,inVec,k.node.rotation);
            if(k.tangentOutHandle||k.tangentsInKnotSpace)Vec3.transformQuat(outVec,outVec,k.node.rotation);
            if(reverse){const tmp=inVec.clone();inVec.set(outVec);outVec.set(tmp);}
            if(k.mode===TangentMode.Mirrored){
                // A single outgoing tangent defines both handles, by convention.
                Vec3.multiplyScalar(inVec,outVec,-1);
            } else if(k.mode===TangentMode.Continuous){
                const len=inVec.length();Vec3.multiplyScalar(inVec,Vec3.normalize(new Vec3(),outVec),-len);
            }
            const pos=k.node.position.clone();
            if(this.dimension===SplineDimension.XY2D){pos.z=0;inVec.z=0;outVec.z=0;}
            else if(this.dimension===SplineDimension.XZ2D){pos.y=0;inVec.y=0;outVec.y=0;}
            return {position:pos,tangentIn:inVec,tangentOut:outVec,mode:k.mode,tension:k.tension};
        });
    }
    /** Returns control vectors in natural Hierarchy order, for non-destructive editing tools. */
    public getNaturalResolvedKnots():M.KnotData[]{return M.resolvedKnots(this.collect(false),this.closed);}
    /** Split geometry (not node creation) for the Inspector's Insert Knot action. */
    public describeSplitAfter(index:number,t=0.5){return M.splitSegment(this.collect(false),this.closed,index,t);}
    private ensure():M.ArcLUT{
        const data=this.collect();
        const rotations=this.knots.map(k=>k.node.rotation);
        const signature=JSON.stringify([data,rotations,this.closed,this.reversed,this.dimension,this.samplesPerCurve]);
        if(!this._lut||this._signature!==signature){
            this._lut=M.buildArcLUT(data,this.closed,this.samplesPerCurve);
            this._signature=signature;
        }
        return this._lut;
    }
    public refresh():void{this._lut=null;this._signature='';}
    public get length():number{return this.ensure().total;}
    public get count():number{return this.knots.length;}
    public get segmentCount():number{return this.ensure().segments;}
    /** t in [0,1] advances uniformly per cubic curve, like Unity SplineUtility.Evaluate. */
    public evaluate(t:number):M.SplinePoint{
        const lut=this.ensure();return M.sample(lut.knots,lut.closed,t);
    }
    /** t in [0,1] advances approximately uniformly in physical distance. */
    public evaluateByDistance(t:number):M.SplinePoint{
        return M.sampleNormalizedDistance(this.ensure(),t);
    }
    /** Distance in local-space Cocos units. */
    public evaluateAtDistance(d:number):M.SplinePoint{
        return M.sampleDistance(this.ensure(),d);
    }
    /** Distance (spline-local units) at geometric Bezier parameter t. */
    public distanceAtT(t:number):number{return M.distanceAtParameter(this.ensure(),t);}
    /** Uniform Bezier t at an absolute arc distance. */
    public tAtDistance(distance:number):number{return M.parameterAtDistance(this.ensure(),distance);}
    /** Uniform Bezier t at normalized arc length, not normalized cubic segment index. */
    public tAtProgress(progress:number):number{return this.tAtDistance(M.clamp01(progress)*this.length);}
    /** Normalized arc length at uniform Bezier t. */
    public progressAtT(t:number):number{return this.length>1e-8?this.distanceAtT(t)/this.length:0;}
    public nearestT(point:M.V3):number{return M.nearestParameter(this.ensure(),point);}
    /** Nearest world-space point, correct even if the spline Node uses non-uniform scale.
     * t is geometric Bezier parameter; distance/progress are spline-LOCAL arc units.
     */
    public projectWorld(worldPoint:Vec3,steps=128):{
        t:number;progress:number;distance:number;worldPosition:Vec3;squaredDistance:number;
    } {
        if(this.count<2){
            const p=this.node.worldPosition.clone();
            const dx=p.x-worldPoint.x,dy=p.y-worldPoint.y,dz=p.z-worldPoint.z;
            return {t:0,progress:0,distance:0,worldPosition:p,squaredDistance:dx*dx+dy*dy+dz*dz};
        }
        const hit=closestParameter(t=>this.evaluateWorldPositionAtT(t),worldPoint,steps);
        const distance=this.distanceAtT(hit.t);
        return {t:hit.t,progress:this.length>1e-8?distance/this.length:0,distance,
            worldPosition:this.evaluateWorldPositionAtT(hit.t),squaredDistance:hit.squaredDistance};
    }
    public nearestWorldT(worldPoint:Vec3,steps=128):number{return this.projectWorld(worldPoint,steps).t;}
    public evaluatePosition(t:number,uniform=true,out=new Vec3()):Vec3{
        const p=uniform?this.evaluateByDistance(t):this.evaluate(t);
        return out.set(p.position.x,p.position.y,p.position.z);
    }
    /** Local position by an absolute distance, clamped to the spline extent. */
    public evaluatePositionAtDistance(distance:number,out=new Vec3()):Vec3{
        const p=this.evaluateAtDistance(distance);return out.set(p.position.x,p.position.y,p.position.z);
    }
    /** World-space position by an absolute distance in spline-local units. */
    public evaluateWorldPositionAtDistance(distance:number,out=new Vec3()):Vec3{
        return Vec3.transformMat4(out,this.evaluatePositionAtDistance(distance),this.node.worldMatrix);
    }
    /** World-space position by cubic t (NOT normalized arc length). */
    public evaluateWorldPositionAtT(t:number,out=new Vec3()):Vec3{
        return this.evaluateWorldPosition(t,false,out);
    }
    public evaluateWorldPosition(t:number,uniform=true,out=new Vec3()):Vec3{
        Vec3.transformMat4(out,this.evaluatePosition(t,uniform),this.node.worldMatrix);return out;
    }
    public evaluateTangent(t:number,uniform=true,out=new Vec3()):Vec3{
        const p=uniform?this.evaluateByDistance(t):this.evaluate(t);
        return out.set(p.tangent.x,p.tangent.y,p.tangent.z);
    }
    public evaluateUp(t:number,uniform=true,out=new Vec3()):Vec3{
        if(this.dimension===SplineDimension.XY2D)return out.set(0,0,1);
        if(this.dimension===SplineDimension.XZ2D)return out.set(0,1,0);
        const knots=this.knots,pt=uniform?this.evaluateByDistance(t):this.evaluate(t);
        if(!knots.length)return out.set(0,1,0);
        const a=knots[Math.min(pt.segment,knots.length-1)];
        const b=knots[(pt.segment+1)%knots.length]||a;
        const qa=a.node.rotation,qb=b.node.rotation,q=new Quat();
        Quat.slerp(q,qa,qb,pt.u);
        Vec3.transformQuat(out,Vec3.UP,q);
        const tangent=new Vec3(pt.tangent.x,pt.tangent.y,pt.tangent.z);
        Vec3.multiplyScalar(tangent,tangent,Vec3.dot(tangent,out));
        Vec3.subtract(out,out,tangent);
        if(out.lengthSqr()<1e-7){out.set(0,1,0);if(Math.abs(Vec3.dot(out,new Vec3(pt.tangent.x,pt.tangent.y,pt.tangent.z)))>.98)out.set(1,0,0);}
        return Vec3.normalize(out,out);
    }
    /** Output quaternion points local +Z along spline, with +Y equal to spline up. */
    public evaluateRotation(t:number,uniform=true,out=new Quat()):Quat{
        const dir=this.evaluateTangent(t,uniform),up=this.evaluateUp(t,uniform);
        const right=Vec3.cross(new Vec3(),up,dir);
        if(right.lengthSqr()<1e-8)right.set(1,0,0);Vec3.normalize(right,right);
        Vec3.cross(up,dir,right);Vec3.normalize(up,up);
        return Quat.fromAxes(out,right,up,dir);
    }
    /** Visual helper for Cocos-Gizmos; only the extension invokes these callbacks in Scene Editor. */
    public drawCurveGizmos(force=false):void{
        if((!force&&!this.showGizmos)||this.count<2)return;
        const g3=gizmos3D(),g2=gizmos2D();
        if(!g3&&!g2)return;
        const use2D=this.dimension===SplineDimension.XY2D&&!!g2;
        const g=use2D?g2:g3;
        if(!g)return;
        const steps=Math.min(64,Math.max(2,Math.floor(this.gizmoSteps)))*Math.max(1,this.segmentCount);
        g.beginColor(this.node,this.gizmoColor);
        let previous=this.evaluateWorldPosition(0);
        for(let i=1;i<=steps;i++){
            const current=this.evaluateWorldPosition(i/steps);
            g.drawLine(this.node,previous,current);
            previous=current;
        }
        for(let i=0;i<this.knots.length;i++){
            const knot=this.knots[i],position=this.nodeToWorldKnot(knot);
            if(use2D)g.drawCircle(this.node,position,6);
            else g.drawSphere(this.node,position,0.09,false,8,6);
            if(this.showTangentGizmos&&(knot.tangentInHandle||knot.tangentOutHandle))this.drawKnotGizmos(knot);
        }
    }
    public nodeToWorldKnot(knot:SplineKnot):Vec3{
        const pos=knot.node.position.clone();
        if(this.dimension===SplineDimension.XY2D)pos.z=0;
        if(this.dimension===SplineDimension.XZ2D)pos.y=0;
        return Vec3.transformMat4(pos,pos,this.node.worldMatrix);
    }
    public drawKnotGizmos(knot:SplineKnot,force=false):void {
        // force=true is used by selected knots and explicit edit mode. This
        // deliberately overrides BOTH global container visualization flags.
        if(!force&&(!this.showGizmos||!this.showTangentGizmos))return;
        const g3=gizmos3D(),g2=gizmos2D();
        const use2D=this.dimension===SplineDimension.XY2D&&!!g2;
        const g=use2D?g2:g3;
        if(!g)return;
        const source=this.getNaturalResolvedKnots();
        const nodes=this.node.children.map(n=>n.getComponent(SplineKnot)).filter((k):k is SplineKnot=>!!k&&k.enabled);
        const idx=nodes.indexOf(knot);if(idx<0||!source[idx])return;
        const data=source[idx],origin=this.nodeToWorldKnot(knot);
        const incoming=Vec3.transformMat4(new Vec3(),new Vec3(data.position.x+data.tangentIn.x,data.position.y+data.tangentIn.y,data.position.z+data.tangentIn.z),this.node.worldMatrix);
        const outgoing=Vec3.transformMat4(new Vec3(),new Vec3(data.position.x+data.tangentOut.x,data.position.y+data.tangentOut.y,data.position.z+data.tangentOut.z),this.node.worldMatrix);
        const tangentColor=new Color(255,164,73,255);
        g.beginColor(this.node,tangentColor);
        for(const p of [incoming,outgoing]){
            g.drawLine(this.node,origin,p);
            if(use2D)g.drawCircle(this.node,p,6);
            else g.drawSphere(this.node,p,this.dimension===SplineDimension.Space3D?0.07:5,false,8,6);
        }
        // Gizmos2D requires a Canvas / RenderRoot2D ancestor to render its
        // Graphics. Draw a 3D XY-plane fallback as well: 2D splines outside
        // Canvas still display their tangent lines/points in Scene View.
        // Cocos-Gizmos3D is documented to support drawing inside Canvas too.
        if(use2D&&g3){
            if(typeof g3.setDepTest==='function')g3.setDepTest(this.node,false);
            g3.beginColor(this.node,tangentColor);
            for(const p of [incoming,outgoing]){
                g3.drawLine(this.node,origin,p);
                g3.drawSphere(this.node,p,5,false,8,6);
            }
            if(typeof g3.setDepTest==='function')g3.setDepTest(this.node,true);
        }
    }
    private hasEditingKnot():boolean {
        return this.knots.some(k=>k.editTangentHandles&&k.hasTangentHandles);
    }
    public onDrawGizmos():void {
        // Editing one knot is an explicit per-knot override of "Always Show".
        if(this.showGizmosAlways||this.hasEditingKnot())this.drawCurveGizmos(true);
    }
    public onDrawGizmosSelected():void {
        if(!this.showGizmosAlways&&!this.hasEditingKnot())this.drawCurveGizmos();
    }
    public getRevision():string{this.ensure();return this._signature;}
}
