import {type SplineFrameV2} from '../core/SplineFrames';
import {type RoadCornerSectionV2} from './RoadCorners';

/** Per-ring asymmetric clearance for a continuous, non-Boolean Road ribbon. */
export interface RoadContinuousOptionsV2 {
    /** Spatial safety margin relative to half the distance to another road arm. */
    readonly clearanceSafety?:number;
    /** Maximum change in rendered half-width per metre of spline. */
    readonly widthSlope?:number;
    /** Local curvature constraints sampled at exactly the same spline frames. */
    readonly cornerSections?:ReadonlyArray<RoadCornerSectionV2>;
    /** True for a spline whose final sample joins the first. */
    readonly closed?:boolean;
}
export interface RoadContinuousSectionV2 {
    readonly left:number;
    readonly right:number;
}
export interface RoadContinuousReportV2 {
    readonly constrainedSections:number;
    readonly curvatureConstrainedSections:number;
    readonly effectiveWidthSlope:number;
    readonly slopeSafetyCapped:boolean;
    readonly minimumWidthRatio:number;
    readonly impossibleCrossings:number;
    /** Safety cap reached when many nearby frame pairs occupy a small area. */
    readonly hitSafetyLimit:boolean;
}
export interface RoadContinuousResultV2 {
    readonly sections:ReadonlyArray<RoadContinuousSectionV2>;
    readonly report:RoadContinuousReportV2;
}
const dot=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>a.x*b.x+a.y*b.y+a.z*b.z;
/**
 * Guarantee ONE regular UV strip. Unlike planar Boolean clipping this never
 * deletes faces or introduces internal UV boundaries. For a hairpin whose
 * centreline arms are closer than the requested width, the two INSIDE edges
 * narrow smoothly to make the authored path topologically usable.
 * Maintaining BOTH constant width and injectivity is impossible there.
 * Excludes height-separated overpasses and tubes.
 */
export function buildRoadContinuousSectionsV2(
    frames:ReadonlyArray<SplineFrameV2>, halfExtent:number,
    options:RoadContinuousOptionsV2={}
):RoadContinuousResultV2 {
    if(!Number.isFinite(halfExtent)||halfExtent<=0)throw new Error('Invalid continuous Road half extent');
    const safety=options.clearanceSafety??.35,requestedSlope=options.widthSlope??.65;
    // A larger width derivative produces sharp corners in inside-edge UV isolines.
    const slope=Math.min(requestedSlope,.25);
    if(!Number.isFinite(safety)||safety<.05||safety>.98)throw new Error('Continuous Road clearanceSafety must be 0.05..0.98');
    if(!Number.isFinite(requestedSlope)||requestedSlope<=0||requestedSlope>4)throw new Error('Continuous Road widthSlope must be >0 and <=4');
    const n=frames.length;
    if(options.cornerSections&&options.cornerSections.length!==n)
        throw new Error('Continuous Road corner section count mismatch');
    if(n<2)throw new Error('Continuous Road needs at least two frames');
    const negative=Array(n).fill(halfExtent) as number[];
    const positive=Array(n).fill(halfExtent) as number[];
    const size=2*halfExtent;
    const grid=new Map<string,number[]>();
    const hash=(x:number,y:number,z:number)=>x+':'+y+':'+z;
    const cell=(x:number)=>Math.floor(x/size);
    for(let i=0;i<n;i++){
        const p=frames[i].position;
        const key=hash(cell(p.x),cell(p.y),cell(p.z));
        const a=grid.get(key);
        if(a)a.push(i);else grid.set(key,[i]);
    }
    let crossings=0,visits=0,hitSafetyLimit=false;
    const skipArc=Math.min(2*halfExtent,frames[n-1].distance*.42);
    outer:for(let i=0;i<n;i++){
        const f=frames[i],p=f.position;
        const cx=cell(p.x),cy=cell(p.y),cz=cell(p.z);
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
            const ids=grid.get(hash(cx+dx,cy+dy,cz+dz));
            if(!ids)continue;
            for(const j of ids){
                if(j<=i)continue;
                if(++visits>500000){hitSafetyLimit=true;break outer;}
                const other=frames[j];
                if(other.distance-f.distance<=skipArc||
                   (options.closed===true&&frames[n-1].distance-(other.distance-f.distance)<=skipArc))continue;
                // Preserve bridges and steep helical crossings on other planes.
                if(dot(f.up,other.up)<.85)continue;
                const delta={x:other.position.x-p.x,y:other.position.y-p.y,z:other.position.z-p.z};
                if(Math.abs(dot(delta,f.up))>size*.18||Math.abs(dot(delta,other.up))>size*.18)continue;
                const dist=Math.hypot(delta.x,delta.y,delta.z);
                if(dist>=size||dist<1e-7){if(dist<1e-7)crossings++;continue;}
                const lateralA=dot(delta,f.right),lateralB=-dot(delta,other.right);
                // A same-path segment separated mainly in the tangent
                // direction is NOT a competing parallel arm.
                if(Math.abs(lateralA)<dist*.55||Math.abs(lateralB)<dist*.55)continue;
                const allowed=Math.max(.005*halfExtent,safety*dist*.5);
                if(lateralA<0)negative[i]=Math.min(negative[i],allowed);
                else positive[i]=Math.min(positive[i],allowed);
                if(lateralB<0)negative[j]=Math.min(negative[j],allowed);
                else positive[j]=Math.min(positive[j],allowed);
            }
        }
    }
    // The original solver only checked clearance between distant arms.
    // A single C1 bend can also fold when its inside half-width exceeds the
    // local curvature radius. Keep the inside offset well below the radius,
    // with a margin under RoadCorners' nonlinear compression threshold (0.7).
    // Applying the cap before smoothing means UV0 and geometry remain one strip.
    let curvatureConstrainedSections=0;
    if(options.cornerSections)for(let i=0;i<n;i++){
        const corner=options.cornerSections[i];
        if(!corner.insideSign||!Number.isFinite(corner.insideLimit))continue;
        const safe=Math.max(.005*halfExtent,Math.min(halfExtent,corner.insideLimit*.35));
        if(corner.insideSign>0){
            if(safe<positive[i]-1e-6)curvatureConstrainedSections++;
            positive[i]=Math.min(positive[i],safe);
        }else{
            if(safe<negative[i]-1e-6)curvatureConstrainedSections++;
            negative[i]=Math.min(negative[i],safe);
        }
    }
    // Lipschitz envelope: local width cannot jump sharply between rings.
    const spread=(values:number[])=>{
        for(let i=1;i<n;i++)values[i]=Math.min(values[i],values[i-1]+slope*Math.max(0,frames[i].distance-frames[i-1].distance));
        for(let i=n-2;i>=0;i--)values[i]=Math.min(values[i],values[i+1]+slope*Math.max(0,frames[i+1].distance-frames[i].distance));
    };
    spread(negative);spread(positive);
    // A plain minimum-of-linear-cones has a derivative cusp at the narrowest
    // ring: this showed up as a visibly stepped yellow line on a real 3-knot
    // turn. Rounded minimum convolution preserves conservative width bounds,
    // but transitions through that narrow ring with a smooth derivative.
    const soften=(values:number[])=>{
        const original=values.slice(),out=values.slice();
        const radius=Math.max(2,halfExtent*5),transition=Math.max(.5,halfExtent*2);
        for(let i=0;i<n;i++){
            let best=original[i];
            for(let delta=1;delta<=128;delta++){
                let any=false;
                for(const j of [i-delta,i+delta]){
                    if(j<0||j>=n)continue;
                    const distance=Math.abs(frames[i].distance-frames[j].distance);
                    if(distance>radius)continue;
                    any=true;
                    const cost=slope*distance*distance/(distance+transition);
                    best=Math.min(best,original[j]+cost);
                }
                if(!any)break;
            }
            out[i]=best;
        }
        for(let i=0;i<n;i++)values[i]=out[i];
    };
    soften(negative);soften(positive);
    const sections=negative.map((left,i)=>({left,right:positive[i]}));
    let constrained=0,minRatio=1;
    for(const s of sections){
        if(s.left<halfExtent-1e-5||s.right<halfExtent-1e-5)constrained++;
        minRatio=Math.min(minRatio,(s.left+s.right)/(2*halfExtent));
    }
    return {sections,report:{constrainedSections:constrained,curvatureConstrainedSections,
        effectiveWidthSlope:slope,slopeSafetyCapped:requestedSlope>slope,
        minimumWidthRatio:minRatio,impossibleCrossings:crossings,hitSafetyLimit}};
}
export function roadContinuousProfileX_V2(x:number,halfExtent:number,section:RoadContinuousSectionV2):number {
    return x<0?x*section.left/halfExtent:x*section.right/halfExtent;
}
