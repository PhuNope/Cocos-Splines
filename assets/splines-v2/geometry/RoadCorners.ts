import {type V3} from '../core/SplineCurves';
import {type SplineFrameV2} from '../core/SplineFrames';

export type RoadCornerModeV2='join-trim'|'legacy';
export interface RoadCornerOptionsV2 {
    /** 'join-trim' is the v2 Road default; 'legacy' keeps perpendicular sections. */
    readonly cornerMode?:RoadCornerModeV2;
    /** Maximum fraction of the estimated inside bend radius. 0.5–0.98. */
    readonly cornerTrimSafety?:number;
    /** Limit outward miter spikes near sharp corners. 1–4. */
    readonly cornerMiterLimit?:number;
}
export interface RoadCornerSectionV2 {
    readonly right:V3;
    /** +1/-1: the side of the local right vector on the inside of the turn. */
    readonly insideSign:number;
    /** Maximum local profile X before the miter transform. */
    readonly insideLimit:number;
    readonly angleRadians:number;
    readonly isPinched:boolean;
}
export interface RoadCornerReportV2 {
    readonly pinchedSections:number;
    readonly sharpSections:number;
    readonly largestTurnDegrees:number;
    readonly measuredSections:number;
    /** Distant centreline segments closer than full road width (Editor hint only). */
    readonly potentialOverlapPairs?:number;
    readonly minimumClearance?:number;
}
const v=(x:number,y:number,z:number):V3=>({x,y,z});
const add=(a:V3,b:V3):V3=>v(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a:V3,b:V3):V3=>v(a.x-b.x,a.y-b.y,a.z-b.z);
const mul=(a:V3,k:number):V3=>v(a.x*k,a.y*k,a.z*k);
const cross=(a:V3,b:V3):V3=>v(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const dot=(a:V3,b:V3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const len=(a:V3)=>Math.hypot(a.x,a.y,a.z);
const norm=(a:V3,fallback:V3):V3=>{const l=len(a);return l>1e-10?mul(a,1/l):fallback;};
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));

/**
 * Local miter joins on the actual sampled path chords (not only spline knots).
 * Keeps the outside edge, smoothly compresses the inside before an offset
 * ribbon reverses. No global CSG: two distant road segments can still cross.
 * Work is O(number of sample frames), independently of profile complexity.
 */
export function buildRoadCornerSectionsV2(
    frames:ReadonlyArray<SplineFrameV2>,
    maxHalfWidth:number,
    options:RoadCornerOptionsV2={},
    closed=false
):ReadonlyArray<RoadCornerSectionV2> {
    if(!Number.isFinite(maxHalfWidth)||maxHalfWidth<=0)
        throw new Error('Road maxHalfWidth must be positive');
    const mode=options.cornerMode??'join-trim';
    if(mode!=='join-trim'&&mode!=='legacy')throw new Error('Unknown Road corner mode');
    const safety=options.cornerTrimSafety??.9;
    const miterCap=options.cornerMiterLimit??2.5;
    if(!Number.isFinite(safety)||safety<.5||safety>.98)
        throw new Error('cornerTrimSafety must be in [0.5, 0.98]');
    if(!Number.isFinite(miterCap)||miterCap<1||miterCap>4)
        throw new Error('cornerMiterLimit must be in [1, 4]');
    const sections:RoadCornerSectionV2[]=frames.map(f=>({
        right:f.right,insideSign:0,insideLimit:Infinity,angleRadians:0,isPinched:false
    }));
    if(mode==='legacy'||frames.length<3)return sections;
    const last=frames.length-1;
    const seam=closed&&len(sub(frames[0].position,frames[last].position))<1e-4;
    const start=seam?0:1;
    const end=last;
    for(let i=start;i<end;i++){
        const prev=frames[i===0?last-1:i-1],curr=frames[i],next=frames[i+1];
        const up=norm(curr.up,v(0,1,0));
        const plane=(p:V3):V3=>sub(p,mul(up,dot(p,up)));
        const a=plane(sub(curr.position,prev.position));
        const b=plane(sub(next.position,curr.position));
        const la=len(a),lb=len(b);
        if(la<1e-8||lb<1e-8)continue;
        const ta=mul(a,1/la),tb=mul(b,1/lb);
        const angle=Math.acos(clamp(dot(ta,tb),-1,1));
        if(angle<1e-5)continue;
        const signed=dot(cross(ta,tb),up);
        if(Math.abs(signed)<1e-9&&angle<Math.PI-.05)continue;
        const ra=norm(cross(up,ta),curr.right),rb=norm(cross(up,tb),curr.right);
        // A flip in the transported frame is not a valid planar join.
        if(dot(ra,curr.right)<.2||dot(rb,curr.right)<.2)continue;
        const sum=add(ra,rb),sumLen=len(sum);
        let miter=curr.right,miterScale=1;
        if(sumLen>1e-5&&angle<Math.PI-.03){
            const direction=mul(sum,1/sumLen);
            const divisor=dot(direction,ra);
            if(divisor>.02){
                miterScale=Math.min(miterCap,1/divisor);
                miter=mul(direction,miterScale);
            }
        }
        // Discrete osculating radius of the sampled centreline. Miter
        // multiplies the transverse displacement, so divide by its scale.
        const radius=(la+lb)*.25/Math.max(1e-9,Math.sin(angle*.5));
        const nearHairpin=angle>=Math.PI-.03;
        const limit=nearHairpin
            ?Math.max(1e-5,Math.min(la,lb)*.05)
            :Math.max(1e-5,safety*radius/Math.max(1,miterScale));
        const insideSign=signed>=0?1:-1;
        sections[i]={right:miter,insideSign,insideLimit:limit,
            angleRadians:angle,isPinched:nearHairpin||maxHalfWidth>limit*.7};
    }
    if(seam)sections[last]=sections[0];
    else if(last>=2){
        // Endpoints can be inside the same tight bend as the next ring.
        sections[0]={...sections[1],right:frames[0].right};
        sections[last]={...sections[last-1],right:frames[last].right};
    }
    return sections;
}
/**
 * C1-continuous, strictly increasing inside-offset saturation. An inside
 * profile band never collapses onto another band (unlike hard-clamp).
 * UVs stay based on the untrimmed profile coordinate, preserving tiling.
 */
export function roadCornerProfileX_V2(x:number,section:RoadCornerSectionV2):number {
    if(!section.insideSign||x*section.insideSign<=0||!Number.isFinite(section.insideLimit))
        return x;
    const limit=section.insideLimit,abs=Math.abs(x),threshold=limit*.7;
    if(abs<=threshold)return x;
    const tail=limit-threshold;
    return section.insideSign*(threshold+tail*(1-Math.exp(-(abs-threshold)/tail)));
}
export function roadCornerPositionV2(
    frame:SplineFrameV2,section:RoadCornerSectionV2,x:number,y:number
):V3 {
    const lateral=roadCornerProfileX_V2(x,section);
    return add(frame.position,add(mul(section.right,lateral),mul(frame.up,y)));
}
/** Diagnostic-only report; callers decide how/when to display authoring warnings. */
export function inspectRoadCornersV2(
    sections:ReadonlyArray<RoadCornerSectionV2>
):RoadCornerReportV2 {
    let pinchedSections=0,sharpSections=0,largestTurnDegrees=0;
    for(const c of sections){
        if(c.isPinched)pinchedSections++;
        if(c.angleRadians>Math.PI*.48)sharpSections++;
        largestTurnDegrees=Math.max(largestTurnDegrees,c.angleRadians*180/Math.PI);
    }
    return {pinchedSections,sharpSections,largestTurnDegrees,measuredSections:sections.length};
}

/**
 * Build two outward-facing triangles for a potentially concave Road quad.
 * A tight inner bend can put one ring vertex on the opposite side of the
 * fixed diagonal. Choose the OTHER diagonal when that keeps both triangles
 * facing the authored normals. For truly crossed quads, omit only inverted
 * triangles rather than drawing long, black, back-facing geometry.
 * Returns the number of triangles emitted (normally 2).
 */
export function appendRoadQuadV2(
    positions:ReadonlyArray<V3>,
    normals:ReadonlyArray<V3>,
    a:number,b:number,c:number,d:number,
    indices:number[],
    flipFaces=false
):number {
    const base:[[number,number,number],[number,number,number]]=
        flipFaces?[[a,b,c],[b,d,c]]:[[a,c,b],[b,c,d]];
    const alternate:[[number,number,number],[number,number,number]]=
        flipFaces?[[a,d,c],[a,b,d]]:[[a,c,d],[a,d,b]];
    function score(tri:[number,number,number]):number {
        const [i,j,k]=tri;
        // GPU and baked .mesh positions are Float32. Validate after that
        // quantization, or tiny but valid Float64 curb wedges can collapse
        // into zero-area triangles when finally uploaded.
        const f=(a:V3):V3=>v(Math.fround(a.x),Math.fround(a.y),Math.fround(a.z));
        const p=f(positions[i]),q=f(positions[j]),r=f(positions[k]);
        const e1=sub(q,p),e2=sub(r,p),face=cross(e1,e2);
        const area=len(face);
        if(!Number.isFinite(area)||area<1e-11)return -1;
        const expected=add(add(normals[i],normals[j]),normals[k]);
        const expectedLen=len(expected);
        if(!Number.isFinite(expectedLen)||expectedLen<1e-11)return -1;
        return dot(face,expected)/(area*expectedLen);
    }
    const s0=base.map(score),s1=alternate.map(score);
    const ok=(scores:number[])=>scores.every(x=>x>1e-7);
    let chosen=base,scores=s0;
    if(!ok(s0)&&ok(s1)){chosen=alternate;scores=s1;}
    else if(!ok(s0)&&!ok(s1)){
        // Crossed or degenerate quad. Salvage only valid triangles, not
        // a back-facing or zero-area wedge.
        if(s1.filter(x=>x>1e-7).length>s0.filter(x=>x>1e-7).length){
            chosen=alternate;scores=s1;
        }
    }
    let written=0;
    for(let i=0;i<2;i++)if(scores[i]>1e-7){
        indices.push(...chosen[i]);written++;
    }
    return written;
}
/**
 * Warn only in the Editor when distant portions of one road centreline come
 * within a full road width. This is a conservative proximity hint (not CSG).
 * A subsampling cap prevents large roads from triggering quadratic lag.
 */
export function inspectRoadCenterlineClearanceV2(
    frames:ReadonlyArray<SplineFrameV2>,fullWidth:number,maxSamples=384
):{potentialOverlapPairs:number;minimumClearance:number} {
    if(!Number.isFinite(fullWidth)||fullWidth<=0)throw new Error('Invalid road clearance width');
    const step=Math.max(1,Math.ceil((frames.length-1)/maxSamples));
    const points:SplineFrameV2[]=[];
    for(let i=0;i<frames.length;i+=step)points.push(frames[i]);
    if(points[points.length-1]!==frames[frames.length-1])points.push(frames[frames.length-1]);
    const sq=(a:V3)=>dot(a,a);
    const distanceBetween=(p1:V3,q1:V3,p2:V3,q2:V3):number=>{
        // Shortest 3D distance between line segments, including endpoints.
        const u=sub(q1,p1),v2=sub(q2,p2),w=sub(p1,p2);
        const a=dot(u,u),b=dot(u,v2),c=dot(v2,v2),d=dot(u,w),e=dot(v2,w);
        const D=a*c-b*b;
        let sN:number,sD=D,tN:number,tD=D;
        if(D<1e-14){sN=0;sD=1;tN=e;tD=c;}
        else{
            sN=b*e-c*d;tN=a*e-b*d;
            if(sN<0){sN=0;tN=e;tD=c;}
            else if(sN>sD){sN=sD;tN=e+b;tD=c;}
        }
        if(tN<0){tN=0;if(-d<0)sN=0;else if(-d>a)sN=sD;else{sN=-d;sD=a;}}
        else if(tN>tD){tN=tD;if(-d+b<0)sN=0;else if(-d+b>a)sN=sD;else{sN=-d+b;sD=a;}}
        const sc=Math.abs(sN)<1e-14?0:sN/Math.max(sD,1e-14);
        const tc=Math.abs(tN)<1e-14?0:tN/Math.max(tD,1e-14);
        return Math.sqrt(sq(sub(add(w,mul(u,sc)),mul(v2,tc))));
    };
    let min=Infinity,pairs=0;
    for(let i=0;i+1<points.length;i++)for(let j=i+2;j+1<points.length;j++){
        const a=points[i],b=points[i+1],c=points[j],d=points[j+1];
        // Neighbor samples share a swept surface and are not road crossings.
        const arcGap=Math.min(Math.abs(a.distance-d.distance),Math.abs(b.distance-c.distance));
        if(arcGap<fullWidth)continue;
        const dx=Math.max(0,Math.max(Math.min(a.position.x,b.position.x),Math.min(c.position.x,d.position.x))
            -Math.min(Math.max(a.position.x,b.position.x),Math.max(c.position.x,d.position.x)));
        const dy=Math.max(0,Math.max(Math.min(a.position.y,b.position.y),Math.min(c.position.y,d.position.y))
            -Math.min(Math.max(a.position.y,b.position.y),Math.max(c.position.y,d.position.y)));
        const dz=Math.max(0,Math.max(Math.min(a.position.z,b.position.z),Math.min(c.position.z,d.position.z))
            -Math.min(Math.max(a.position.z,b.position.z),Math.max(c.position.z,d.position.z)));
        if(dx*dx+dy*dy+dz*dz>=fullWidth*fullWidth)continue;
        const clearance=distanceBetween(a.position,b.position,c.position,d.position);
        min=Math.min(min,clearance);
        if(clearance<fullWidth) pairs++;
    }
    return {potentialOverlapPairs:pairs,minimumClearance:Number.isFinite(min)?min:-1};
}
