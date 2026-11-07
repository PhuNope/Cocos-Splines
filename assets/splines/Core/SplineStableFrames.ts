/** Continuous right/up frames along an ordered 3D path.
 * A per-point `right = up x tangent` frame flips when `up` approaches the
 * tangent (e.g. on a steep hill / loop). Transport the previous frame along
 * the curve, then blend towards the nearest equivalent up hint. Pure math so
 * this can be tested without Cocos Creator or GPU rendering.
 */
export interface FrameVec3 { x:number;y:number;z:number }
export interface FrameInput { t:number; position:FrameVec3; tangent:FrameVec3; up:FrameVec3 }
export interface StableFrame extends FrameInput { right:FrameVec3 }
const V=(x=0,y=0,z=0):FrameVec3=>({x,y,z});
const add=(a:FrameVec3,b:FrameVec3)=>V(a.x+b.x,a.y+b.y,a.z+b.z);
const mul=(a:FrameVec3,s:number)=>V(a.x*s,a.y*s,a.z*s);
const sub=(a:FrameVec3,b:FrameVec3)=>V(a.x-b.x,a.y-b.y,a.z-b.z);
const dot=(a:FrameVec3,b:FrameVec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:FrameVec3,b:FrameVec3)=>V(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const length=(a:FrameVec3)=>Math.sqrt(dot(a,a));
const normalize=(a:FrameVec3,fallback:FrameVec3)=>{const d=length(a);return d>1e-9?mul(a,1/d):fallback;};
const project=(v:FrameVec3,t:FrameVec3)=>sub(v,mul(t,dot(v,t)));
const clamp=(x:number,low:number,high:number)=>Math.min(high,Math.max(low,x));
function fallbackUp(t:FrameVec3):FrameVec3 {
    const ref=Math.abs(t.y)<.92?V(0,1,0):Math.abs(t.x)<.92?V(1,0,0):V(0,0,1);
    return normalize(project(ref,t),V(1,0,0));
}
function rotate(v:FrameVec3,axis:FrameVec3,c:number,s:number):FrameVec3 {
    return add(add(mul(v,c),mul(cross(axis,v),s)),mul(axis,dot(axis,v)*(1-c)));
}
/** The frames must be in travel order. A smooth continuously moving up hint is
 * followed (including bank/roll), but opposite near-singular projected hints
 * are disambiguated using the transported previous right/up frame.
 */
export function buildStableFrames(samples:FrameInput[],closed=false):StableFrame[] {
    const frames:StableFrame[]=[];
    for(let i=0;i<samples.length;i++){
        const raw=samples[i];
        let tangent=normalize(raw.tangent,i?frames[i-1].tangent:V(0,0,1));
        let right:FrameVec3,up:FrameVec3;
        if(!i){
            up=normalize(project(raw.up,tangent),fallbackUp(tangent));
            right=normalize(cross(up,tangent),V(1,0,0));
            up=normalize(cross(tangent,right),fallbackUp(tangent));
        }else{
            const previous=frames[i-1],oldT=previous.tangent;
            const axis=cross(oldT,tangent),sin=length(axis),cos=clamp(dot(oldT,tangent),-1,1);
            if(sin>1e-8){
                const unit=mul(axis,1/sin);
                right=rotate(previous.right,unit,cos,sin);
            }else if(cos<0){
                // Exact reversal/cusp has no unique frame. Keep the same up by
                // rotating 180 degrees around previous.up.
                right=rotate(previous.right,previous.up,-1,0);
            }else right=previous.right;
            right=normalize(project(right,tangent),V(1,0,0));
            up=normalize(cross(tangent,right),fallbackUp(tangent));
            const projected=project(raw.up,tangent),strength=length(projected)/(length(raw.up)||1);
            if(strength>.035){
                let target=normalize(projected,up);
                // Choose the continuous side of the up axis. An arbitrary
                // sign flip of projected world-up must not flip the mesh.
                if(dot(target,up)<0)target=mul(target,-1);
                const angle=Math.atan2(dot(target,right),dot(target,up));
                // Ignore the unreliable hint near parallel up/tangent.
                const weight=clamp((strength-.035)/.12,0,1);
                const c=Math.cos(angle*weight),s=Math.sin(angle*weight);
                const newUp=add(mul(up,c),mul(right,s));
                right=normalize(cross(newUp,tangent),right);
                up=normalize(cross(tangent,right),up);
            }
        }
        frames.push({t:raw.t,position:raw.position,tangent,right,up});
    }
    // For a smooth closed loop, distribute the small residual twist over the
    // entire path rather than leaving a visible seam between last/first ring.
    if(closed&&frames.length>2){
        const first=frames[0],last=frames[frames.length-1];
        if(dot(first.tangent,last.tangent)>.995){
            const delta=Math.atan2(dot(first.up,last.right),dot(first.up,last.up));
            for(let i=1;i<frames.length;i++){
                const f=frames[i],angle=delta*i/(frames.length-1),c=Math.cos(angle),s=Math.sin(angle);
                const up=add(mul(f.up,c),mul(f.right,s));
                f.right=normalize(cross(up,f.tangent),f.right);
                f.up=normalize(cross(f.tangent,f.right),up);
            }
        }
    }
    return frames;
}
/** Get a stable frame for a parameter between cached samples. An optional
 * exact tangent keeps a deformed vertex on the true spline, not a chord.
 */
export function interpolateStableFrame(frames:StableFrame[],t:number,exactTangent?:FrameVec3):StableFrame {
    if(!frames.length)throw new Error('No stable spline frames');
    let lo=0,hi=frames.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(frames[mid].t<t)lo=mid;else hi=mid;}
    const a=frames[lo],b=frames[hi];
    const u=lo===hi?0:clamp((t-a.t)/(b.t-a.t||1),0,1);
    const lerp=(x:FrameVec3,y:FrameVec3)=>add(mul(x,1-u),mul(y,u));
    const tangent=normalize(exactTangent||lerp(a.tangent,b.tangent),a.tangent);
    const right=normalize(project(lerp(a.right,b.right),tangent),a.right);
    const up=normalize(cross(tangent,right),a.up);
    return {t,position:lerp(a.position,b.position),tangent,right,up};
}

/** Geometric estimate for tight corners in world units. If the outermost road
 * cross-section half-width exceeds the minimum bend radius, the inner edge can
 * self-intersect even though the moving frame is perfectly continuous. */
export function estimateMinimumBendRadius(frames:ReadonlyArray<StableFrame>):number {
    let minimum=Infinity;
    for(let i=1;i<frames.length;i++){
        const a=frames[i-1],b=frames[i];
        const bend=Math.acos(clamp(dot(a.tangent,b.tangent),-1,1));
        if(bend<1e-5)continue;
        const chord=length(sub(b.position,a.position));
        if(chord<1e-9)continue;
        minimum=Math.min(minimum,chord/(2*Math.sin(bend/2)));
    }
    return minimum;
}
