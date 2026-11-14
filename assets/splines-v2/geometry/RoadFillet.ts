import {buildSplineCacheV2,type SplineCacheV2} from '../core/SplineCache';
import {type SplineDataV2,type V3} from '../core/SplineCurves';

/** A geometric fit constraint, not a malformed spline or a UV failure.
 * This typed error lets the Road component opt into a safe Continuous
 * fallback without hiding unrelated fillet/tessellation errors.
 */
export class RoadFilletSpacingErrorV2 extends Error {
 constructor(
     readonly segmentIndex:number,
     readonly distance:number,
     readonly radius:number,
     readonly requiredDistance:number
 ) {
     super('Constant Width Road: Knot '+segmentIndex+'-'+(segmentIndex+1)+
         ' spacing '+distance.toFixed(3)+' is too short for radius '+
         radius.toFixed(3)+' (needs >'+requiredDistance.toFixed(3)+
         '). Move knots apart, reduce Width, or use Continuous');
     this.name='RoadFilletSpacingErrorV2';
 }
}
export interface RoadFilletOptionsV2 {
 readonly minimumRadiusScale?:number;
 readonly maxArcAngleDegrees?:number;
 readonly maxArcChordError?:number;
 readonly maxArcStep?:number;
}
export interface RoadFilletReportV2 {
 readonly filletedCorners:number;
 readonly minimumRadius:number;
 readonly modifiedKnotCount:number;
 readonly emittedKnots:number;
 readonly maxKnotDeviation:number;
}
export interface RoadFilletResultV2 {readonly cache:SplineCacheV2;readonly report:RoadFilletReportV2;}
type Fillet={start:V3;end:V3;center:V3;normal:V3;radius:number;theta:number}|null;
const v=(x:number,y:number,z:number):V3=>({x,y,z});
const add=(a:V3,b:V3):V3=>v(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a:V3,b:V3):V3=>v(a.x-b.x,a.y-b.y,a.z-b.z);
const mul=(a:V3,k:number):V3=>v(a.x*k,a.y*k,a.z*k);
const dot=(a:V3,b:V3):number=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:V3,b:V3):V3=>v(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const len=(a:V3)=>Math.hypot(a.x,a.y,a.z);
const clamp=(x:number,l:number,h:number)=>Math.max(l,Math.min(h,x));
const norm=(a:V3):V3=>mul(a,1/len(a));
const dist=(a:V3,b:V3)=>len(sub(a,b));
const rotate=(p:V3,axis:V3,angle:number):V3=>{
 const sn=Math.sin(angle),cs=Math.cos(angle);
 return add(add(mul(p,cs),mul(cross(axis,p),sn)),mul(axis,dot(axis,p)*(1-cs)));
};
/**
 * Convert polygonal guide Knots into a constant-width tangent fillet centreline.
 * Each corner is replaced by a circular arc approximated by cubic Beziers with
 * matching tangents at every segment join. The guide Knot need not lie on the
 * final centreline. Unlike planar clipping or width fitting, this does not
 * shrink the road, cut its UVs, or patch directional lane markings.
 *
 * When adjacent Knot spacing cannot fit the minimum radius, throw an
 * actionable error; never silently reduce Width or fillet radius.
 * Global self-crossings remain a separate topology/junction problem.
 */
export function buildRoadFilletCacheV2(
 source:SplineCacheV2,halfExtent:number,options:RoadFilletOptionsV2={}
):RoadFilletResultV2 {
 const factor=options.minimumRadiusScale??1.35;
 const maxAngle=options.maxArcAngleDegrees??4;
 const chordError=options.maxArcChordError??.015;
 const step=options.maxArcStep??.25;
 if(!Number.isFinite(halfExtent)||halfExtent<=0||!Number.isFinite(factor)||factor<=1.01||factor>6||
    !Number.isFinite(maxAngle)||maxAngle<.5||maxAngle>45||
    !Number.isFinite(chordError)||chordError<=0||
    !Number.isFinite(step)||step<=0)
    throw new Error('Invalid Constant Width Road radius/sampling settings');
 if(source.spline.type==='bezier')
    throw new Error('Constant Width Fillet does not currently support Bezier handles; select Linear/Centripetal or Continuous');
 const knots=source.spline.knots.map(x=>x.position),n=knots.length,closed=source.spline.closed;
 if(closed&&n<3)throw new Error('Constant Width closed Road needs at least 3 knots');
 const minRadius=halfExtent*factor;
 const arc:Fillet[]=Array(n).fill(null);
 const trim:number[]=Array(n).fill(0);
 const edgeLen=knots.map((p,i)=>dist(p,knots[(i+1)%n]));
 const edgeCount=closed?n:n-1;
 for(let i=0;i<edgeCount;i++)if(edgeLen[i]<1e-4)
    throw new Error('Constant Width Road: duplicate or nearly coincident Knot '+i);
 let modified=0,maxDeviation=0;
 for(let i=closed?0:1;i<(closed?n:n-1);i++){
    const last=knots[(i+n-1)%n],p=knots[i],next=knots[(i+1)%n];
    const incoming=norm(sub(p,last)),outgoing=norm(sub(next,p));
    const theta=Math.acos(clamp(dot(incoming,outgoing),-1,1));
    if(theta<1e-4)continue;
    if(theta>Math.PI-.02)
        throw new Error('Constant Width Road: Knot '+i+' nearly reverses direction. Move knots or add a broader turnaround');
    const axis=norm(cross(incoming,outgoing));
    const tangentLength=minRadius*Math.tan(theta*.5);
    if(!Number.isFinite(tangentLength))throw new Error('Constant Width Road invalid corner at Knot '+i);
    trim[i]=tangentLength;
    const start=sub(p,mul(incoming,tangentLength)),end=add(p,mul(outgoing,tangentLength));
    const center=add(start,mul(cross(axis,incoming),minRadius));
    if(dist(add(center,rotate(sub(start,center),axis,theta)),end)>Math.max(1e-6,minRadius*1e-5))
        throw new Error('Constant Width Road circular join cannot be formed at Knot '+i);
    arc[i]={start,end,center,normal:axis,radius:minRadius,theta};
    modified++;maxDeviation=Math.max(maxDeviation,dist(p,center)-minRadius);
 }
 for(let i=0;i<edgeCount;i++){
    const j=(i+1)%n;
    if(trim[i]+trim[j]>=edgeLen[i]-1e-4)
        throw new RoadFilletSpacingErrorV2(i,edgeLen[i],minRadius,trim[i]+trim[j]);
 }
 interface Segment {start:V3;end:V3;startHandle:V3;endHandle:V3;}
 const segments:Segment[]=[];
 const line=(start:V3,end:V3):void=>{
    if(dist(start,end)<1e-7)return;
    const d=mul(sub(end,start),1/3);
    segments.push({start,end,startHandle:d,endHandle:mul(d,-1)});
 };
 const emitArc=(item:NonNullable<Fillet>):void=>{
    const arcAngle=item.theta;
    const angleN=Math.ceil(arcAngle/(maxAngle*Math.PI/180));
    const chordN=Math.ceil(arcAngle/(2*Math.acos(clamp(1-chordError/item.radius,-1,1))));
    const distanceN=Math.ceil(item.radius*arcAngle/step);
    const count=Math.max(1,angleN,chordN,distanceN);
    if(count>2048)throw new Error('Constant Width Road arc exceeds 2048 steps; increase sampling tolerances');
    const radial=sub(item.start,item.center),increment=item.theta/count;
    const handleLength=4/3*Math.tan(increment/4)*item.radius;
    for(let i=0;i<count;i++){
        const phi=increment*i,psi=increment*(i+1);
        const r0=rotate(radial,item.normal,phi),r1=rotate(radial,item.normal,psi);
        const start=i===0?item.start:add(item.center,r0);
        const end=i===count-1?item.end:add(item.center,r1);
        const t0=norm(cross(item.normal,r0)),t1=norm(cross(item.normal,r1));
        segments.push({start,end,startHandle:mul(t0,handleLength),endHandle:mul(t1,-handleLength)});
    }
 };
 if(!closed){
    let position=knots[0];
    for(let i=1;i<n-1;i++){
        if(arc[i]){line(position,arc[i]!.start);emitArc(arc[i]!);position=arc[i]!.end;}
        else {line(position,knots[i]);position=knots[i];}
    }
    line(position,knots[n-1]);
 }else{
    const start=arc[0]?.start??knots[0];
    let position=start;
    for(let i=0;i<n;i++){
        const target=arc[i]?.start??knots[i];
        line(position,target);
        if(arc[i]){emitArc(arc[i]!);position=arc[i]!.end;}
        else position=target;
    }
    line(position,start);
 }
 if(!segments.length)throw new Error('Constant Width Road has no usable path');
 if(segments.length>8192)throw new Error('Constant Width Road exceeds 8192 segments; increase fillet sampling tolerance');
 const generated:{position:V3;handleIn?:V3;handleOut?:V3}[]=[];
 const first:{position:V3;handleIn?:V3;handleOut?:V3}={position:segments[0].start};
 generated.push(first);
 for(let i=0;i<segments.length;i++){
    const segment=segments[i],previous=generated[generated.length-1];
    if(dist(previous.position,segment.start)>1e-5)
        throw new Error('Constant Width Road internal fillet continuity error');
    previous.handleOut=segment.startHandle;
    const isClosing=closed&&i===segments.length-1;
    if(isClosing){
        if(dist(segment.end,first.position)>1e-5)
            throw new Error('Constant Width Road closing fillet is discontinuous');
        first.handleIn=segment.endHandle;
    }else generated.push({position:segment.end,handleIn:segment.endHandle});
 }
 const filleted:SplineDataV2={type:'bezier',closed,knots:generated};
 return {cache:buildSplineCacheV2(filleted),report:{filletedCorners:modified,
    minimumRadius:minRadius,modifiedKnotCount:modified,emittedKnots:generated.length,maxKnotDeviation:maxDeviation}};
}
