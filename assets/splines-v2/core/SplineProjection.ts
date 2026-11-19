import {evaluateSplineV2,splineSegmentsV2,type V3} from './SplineCurves';
import {type SplineCacheV2} from './SplineCache';

/** Nearest-point query inspired by the use case (not code) of Dreamteck
 * SplineProjector, Curvy NearestSplinePoint and SplineArchitect nearest jobs.
 * Exact cubic evaluation with bounded global coarse search and per-interval
 * golden-section refinement. Does not depend on Unity or Cocos.
 */
export interface SplineProjectionOptionsV2 {
    /** Coarse intervals per original spline segment [4,128], default 24. */
    subdivisions?:number;
    /** Closest coarse intervals to refine [1,64], default 16. */
    candidates?:number;
    /** Optional local-to-world mapping for WORLD metric, including nonuniform scale. */
    transformPosition?:(point:V3)=>V3;
}
export interface SplineProjectionV2 {
    readonly parameter:number;
    readonly distanceAlong:number;
    readonly distanceFromPoint:number;
    readonly distanceSquared:number;
    readonly position:V3;
    readonly tangent:V3;
    readonly segmentIndex:number;
}
type Candidate={lo:number;hi:number;score:number};
const finite=(p:V3)=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
const distance2=(a:V3,b:V3)=>{
    const x=a.x-b.x,y=a.y-b.y,z=a.z-b.z;
    return x*x+y*y+z*z;
};
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
/** Linear interpolation against the *same* adaptive length table used by
 * parameterAtCachedDistanceV2, so distance/parameter round trips agree. */
export function distanceAtParameterV2(cache:SplineCacheV2,parameter:number):number {
    if(!Number.isFinite(parameter))throw new Error('Invalid spline parameter');
    const t=clamp(parameter,0,1),p=cache.table.points;
    if(p.length<2||t===0)return 0;
    if(t===1)return cache.length;
    let lo=0,hi=p.length-1;
    while(lo+1<hi){
        const mid=(lo+hi)>>1;
        if(p[mid].parameter<=t)lo=mid;else hi=mid;
    }
    const a=p[lo],b=p[hi],step=b.parameter-a.parameter;
    return step<=1e-15?a.distance:
        a.distance+(b.distance-a.distance)*(t-a.parameter)/step;
}
export function projectPointOnSplineV2(
    cache:SplineCacheV2,point:V3,options:SplineProjectionOptionsV2={}
):SplineProjectionV2 {
    if(!finite(point))throw new Error('Projection point must be finite');
    const subdivisions=options.subdivisions??24,candidates=options.candidates??16;
    if(!Number.isInteger(subdivisions)||subdivisions<4||subdivisions>128)
        throw new Error('Projection subdivisions must be 4..128');
    if(!Number.isInteger(candidates)||candidates<1||candidates>64)
        throw new Error('Projection candidates must be 1..64');
    const segments=splineSegmentsV2(cache.spline),total=segments*subdivisions;
    if(total<1||total>8192)throw new Error('Projection sample budget exceeded');
    const transform=options.transformPosition??((p:V3)=>p);
    const sample=(t:number):V3=>{
        const p=transform(evaluateSplineV2(cache.spline,t).position);
        if(!finite(p))throw new Error('Projection transform returned non-finite point');
        return p;
    };
    const metric=(t:number)=>distance2(sample(t),point);
    let bestT=0,best=metric(0);
    const ranking:Candidate[]=[];
    let last=sample(0);
    // Every original segment is visited, including the closing segment.
    // A chord projection ranks intervals without assuming monotonic distance
    // or a single local minimum across a high-curvature segment.
    for(let i=1;i<=total;i++){
        const t=i/total,current=sample(t);
        const t0=(i-1)/total,dx=current.x-last.x,
            dy=current.y-last.y,dz=current.z-last.z;
        const norm=dx*dx+dy*dy+dz*dz;
        const alpha=norm>1e-20?clamp(
            ((point.x-last.x)*dx+(point.y-last.y)*dy+
             (point.z-last.z)*dz)/norm,0,1):0;
        const foot:V3={x:last.x+dx*alpha,
            y:last.y+dy*alpha,z:last.z+dz*alpha};
        const score=distance2(foot,point);
        if(ranking.length<candidates||score<ranking[ranking.length-1].score){
            ranking.push({lo:t0,hi:t,score});
            ranking.sort((a,b)=>a.score-b.score);
            if(ranking.length>candidates)ranking.pop();
        }
        const d=distance2(current,point);
        if(d<best){best=d;bestT=t;}
        last=current;
    }
    // Refine independent neighborhoods, not just the nearest coarse vertex.
    // Endpoint tests above catch clamped extrema exactly.
    const inv=(Math.sqrt(5)-1)/2;
    for(const interval of ranking){
        let a=interval.lo,b=interval.hi;
        let x=b-inv*(b-a),y=a+inv*(b-a);
        let fx=metric(x),fy=metric(y);
        for(let iter=0;iter<29;iter++){
            if(fx<=fy){b=y;y=x;fy=fx;x=b-inv*(b-a);fx=metric(x);}
            else{a=x;x=y;fx=fy;y=a+inv*(b-a);fy=metric(y);}
        }
        const t=(a+b)*.5,d=metric(t);
        if(d<best){best=d;bestT=t;}
    }
    // A closed seam is canonically parameter 0, not 1.
    if(cache.spline.closed&&bestT>=1-1e-10)bestT=0;
    const evaluated=evaluateSplineV2(cache.spline,bestT);
    const along=distanceAtParameterV2(cache,bestT);
    return Object.freeze({
        parameter:bestT,distanceAlong:along,
        distanceSquared:best,distanceFromPoint:Math.sqrt(best),
        position:evaluated.position,tangent:evaluated.tangent,
        segmentIndex:Math.min(segments-1,Math.floor(bestT*segments))
    });
}
