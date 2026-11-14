import {type SplineFrameV2} from '../core/SplineFrames';
import {type V3} from '../core/SplineCurves';
import {type JunctionRoadBranchV2} from './JunctionPatchV2';

/**
 * Read-only Scene drawing instructions, deliberately independent of the
 * external Gizmos SDK. All positions are LOCAL to the owning Cocos Node.
 * The drawing bridge transforms to world, does not alter serialized Knots.
 */
export type SceneGuideGroupV2='center'|'edge'|'knot'|'trim'|'junction'|'curb'|'tangent-in'|'tangent-out'|'bank-right'|'bank-up';
export interface SceneGuideLineV2 {
    readonly a:V3;readonly b:V3;readonly group:SceneGuideGroupV2;
}
export interface SceneGuideDotV2 {
    readonly at:V3;readonly radius:number;readonly group:SceneGuideGroupV2;
}
export interface SceneGuideDataV2 {
    readonly lines:ReadonlyArray<SceneGuideLineV2>;
    readonly dots:ReadonlyArray<SceneGuideDotV2>;
}
const finite=(p:V3)=>[p.x,p.y,p.z].every(Number.isFinite);
const at=(p:V3,r:V3,n:number):V3=>({x:p.x+r.x*n,y:p.y+r.y*n,z:p.z+r.z*n});
const same=(a:V3,b:V3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-8;

/** A visual-only ROAD preview with bounded operations, not a mesh rebuild.
 * Edges follow rotation-minimizing frames: on tight fillets they are guides,
 * never a promise of exact clipping/planar Boolean topology.
 */
export function buildRoadSceneGuideV2(
    frames:ReadonlyArray<SplineFrameV2>,knots:ReadonlyArray<V3>,
    halfExtent:number,options:{maxSteps?:number;showEdges?:boolean;showKnots?:boolean}={}
):SceneGuideDataV2 {
    const maxSteps=options.maxSteps??48,showEdges=options.showEdges??true;
    if(!Number.isInteger(maxSteps)||maxSteps<2||maxSteps>192||
       !Number.isFinite(halfExtent)||halfExtent<0||halfExtent>1e5)
        throw new Error('Invalid v2 Road Gizmo samples/half-width');
    if(frames.some(f=>!finite(f.position)||!finite(f.right))||
       knots.some(k=>!finite(k)))
        throw new Error('Invalid v2 Road Gizmo geometry');
    const sampled:typeof frames[number][]=[];
    const count=Math.min(frames.length,maxSteps+1);
    for(let i=0;i<count;i++){
        const index=Math.floor(i*(frames.length-1)/Math.max(1,count-1));
        sampled.push(frames[index]);
    }
    const lines:SceneGuideLineV2[]=[],dots:SceneGuideDotV2[]=[];
    for(let i=1;i<sampled.length;i++){
        const a=sampled[i-1],b=sampled[i];
        if(same(a.position,b.position))continue;
        lines.push({a:a.position,b:b.position,group:'center'});
        if(showEdges){
            for(const side of [-1,1]){
                lines.push({a:at(a.position,a.right,side*halfExtent),
                    b:at(b.position,b.right,side*halfExtent),group:'edge'});
            }
        }
    }
    if(showEdges&&sampled.length>=2){
        for(const frame of [sampled[0],sampled[sampled.length-1]]){
            lines.push({a:at(frame.position,frame.right,-halfExtent),
                b:at(frame.position,frame.right,halfExtent),group:'trim'});
        }
    }
    if(options.showKnots!==false){
        const radius=Math.min(1,Math.max(.06,halfExtent*.12));
        for(const knot of knots.slice(0,128))dots.push({at:knot,radius,group:'knot'});
    }
    return {lines,dots};
}

/** Junction preview, based on exact trimmed source Road rings (no painting). */
export function buildJunctionSceneGuideV2(
    branches:ReadonlyArray<JunctionRoadBranchV2>,options:{showCurb?:boolean}={}
):SceneGuideDataV2 {
    if(branches.length!==3&&branches.length!==4)
        throw new Error('Junction Gizmo needs 3 or 4 Road links');
    const lines:SceneGuideLineV2[]=[],dots:SceneGuideDotV2[]=[];
    const center:V3={
        x:branches.reduce((a,b)=>a+b.endpoint.x,0)/branches.length,
        y:branches.reduce((a,b)=>a+b.endpoint.y,0)/branches.length,
        z:branches.reduce((a,b)=>a+b.endpoint.z,0)/branches.length
    };
    if(!finite(center))throw new Error('Invalid Junction Gizmo center');
    dots.push({at:center,radius:.22,group:'junction'});
    for(const b of branches){
        for(const p of [b.endpoint,b.left.position,b.middle.position,b.right.position])
            if(!finite(p))throw new Error('Invalid Junction Gizmo Road ring');
        lines.push({a:center,b:b.middle.position,group:'junction'});
        lines.push({a:b.left.position,b:b.right.position,group:'trim'});
        dots.push({at:b.middle.position,radius:.13,group:'trim'});
        if(options.showCurb!==false&&b.profile?.vertices.length){
            const profile=b.profile.vertices;
            const first=profile[0].position,last=profile[profile.length-1].position;
            if(!finite(first)||!finite(last))throw new Error('Invalid Junction Gizmo curb');
            dots.push({at:first,radius:.09,group:'curb'},
                {at:last,radius:.09,group:'curb'});
            lines.push({a:first,b:b.left.position,group:'curb'},
                {a:last,b:b.right.position,group:'curb'});
        }
    }
    return {lines,dots};
}
