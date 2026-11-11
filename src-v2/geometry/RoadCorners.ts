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
