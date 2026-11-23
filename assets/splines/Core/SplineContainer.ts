import { _decorator, Component, Vec3, Quat, Enum, Color } from 'cc';
import { SplineKnot, TangentMode } from './SplineKnot';
import * as M from './SplineMath';
import {resampleSpline, ResampleOptions, ResampleResult} from './SplineResampleMath';
import {simplifySpline, SimplifyOptions} from './SplineSimplifyMath';
import { registerGizmos } from 'db://cocos-gizmos/RegisterGizmos';
import { SplineContainerGizmos } from '../Editor/SplineContainerGizmos';
import { closestParameter } from './SplineProjectionMath';
const {ccclass,property,menu,executeInEditMode}= _decorator;
export enum SplineDimension { Space3D=0, XY2D=1, XZ2D=2 }
Enum(SplineDimension);

/** One spline per container; direct children bearing SplineKnot are evaluated in sibling order. */
@ccclass('Splines.SplineContainer')
@registerGizmos(SplineContainerGizmos)
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
    /** A single immutable planning LUT; metric affects distance, not geometry. */
    public createArcDistributionEvaluator(metric?:(point:M.V3)=>M.V3){
        const steps=Math.max(4,Math.min(256,Math.floor(this.samplesPerCurve)||24));
        const segments=Math.max(0,this.knots.length-(this.closed?0:1));
        if(segments*steps>65536)throw Error('Arc distribution exceeds 65536 samples; reduce Samples Per Curve.');
        const lut=metric?M.buildArcLUT(this.collect(),this.closed,steps,metric):this.ensure();
        return {segmentCount:lut.segments,
            distanceAtT:(t:number)=>M.distanceAtParameter(lut,t),
            evaluateAtDistance:(distance:number)=>M.sampleDistance(lut,distance)};
    }
    /** Non-destructive topology plan. Editor creates a NEW spline sibling.
     * Source Knot nodes / Prefab instance data are never modified. */
    public createResamplePlan(options:ResampleOptions,metric?:(point:M.V3)=>M.V3):ResampleResult {
        return resampleSpline(this.collect(),this.closed,
            {...options,samplesPerCurve:this.samplesPerCurve},metric);
    }
    /** Preserve source and generate a simplified sibling using the Editor's existing copy transaction. */
    public createSimplifyPlan(options:SimplifyOptions,metric?:(point:M.V3)=>M.V3):ResampleResult {
        return simplifySpline(this.collect(),this.closed,
            {...options,samplesPerCurve:this.samplesPerCurve},metric);
    }
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
    public getRevision():string{this.ensure();return this._signature;}
}
