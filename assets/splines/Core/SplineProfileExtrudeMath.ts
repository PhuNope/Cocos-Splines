/** Phase 4.3b — bounded profile extrusion along a spline frame field.
 * Pure and deterministic: built-in profiles remain defaults; optional
 * author-owned polygon points are validated and never executed as code.
 *
 * Shapes are counter-clockwise when viewed along +forward:
 *   0 Rectangle, 1 Beveled rectangle, 2 U-channel (concave).
 * Separate side bands provide crisp profile corners and independent cap UVs.
 */
import {RoadFrame,RoadGeometry,V3} from './SplineRoadMath';

export enum GraphProfileShape {Rectangle=0,Beveled=1,UChannel=2}
export interface ProfileExtrudeFrame extends RoadFrame {widthFactor:number}
export interface GraphProfilePoint {x:number;y:number}
/** Optional UV0 side-band mapping. Seam is the starting edge; edge weights
 * redistribute its normalized U span. Absent UV keeps legacy perimeter mapping.
 */
export interface GraphProfileUV {
    seamEdge?:number;
    edgeWeights?:number[];
}
export interface GraphAuthoredProfile {
    format:'cocos-splines/profile';
    version:1;
    points:GraphProfilePoint[];
    uv?:GraphProfileUV;
}
/** Strict data-only profile; copied out of the Cocos JsonAsset, never mutated. */
export function parseGraphProfileAsset(input:unknown):GraphAuthoredProfile{
    const r=input as Record<string,unknown>;
    if(!r||typeof r!=='object'||Array.isArray(r)||
       Object.keys(r).some(k=>!['format','version','points','uv'].includes(k))||
       r.format!=='cocos-splines/profile'||r.version!==1||
       !Array.isArray(r.points)||r.points.length<3||r.points.length>16)
        throw Error('Graph Profile Asset requires cocos-splines/profile v1 with 3–16 points.');
    const points:GraphProfilePoint[]=r.points.map(raw=>{
        const p=raw as Record<string,unknown>;
        if(!p||typeof p!=='object'||Array.isArray(p)||
           Object.keys(p).some(k=>!['x','y'].includes(k))||
           typeof p.x!=='number'||typeof p.y!=='number'||
           !Number.isFinite(p.x)||!Number.isFinite(p.y)||
           Math.abs(p.x)>1||Math.abs(p.y)>1)
            throw Error('Graph Profile Asset point requires finite x/y in [-1,1].');
        return {x:p.x,y:p.y};
    });
    checkAuthoredProfilePolygon(points);
    if(!Object.prototype.hasOwnProperty.call(r,'uv'))
        return {format:'cocos-splines/profile',version:1,points};
    const raw=r.uv as Record<string,unknown>;
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||
       Object.keys(raw).some(k=>!['seamEdge','edgeWeights'].includes(k)))
        throw Error('Graph Profile Asset UV must be an object with seamEdge/edgeWeights.');
    const uv:GraphProfileUV={};
    if(Object.prototype.hasOwnProperty.call(raw,'seamEdge')){
        if(!Number.isInteger(raw.seamEdge)||!Number.isFinite(raw.seamEdge as number)||
           (raw.seamEdge as number)<0||(raw.seamEdge as number)>=points.length)
            throw Error('Graph Profile Asset UV seamEdge is outside polygon edge range.');
        uv.seamEdge=raw.seamEdge as number;
    }
    if(Object.prototype.hasOwnProperty.call(raw,'edgeWeights')){
        if(!Array.isArray(raw.edgeWeights)||raw.edgeWeights.length!==points.length||
           raw.edgeWeights.some(w=>typeof w!=='number'||!Number.isFinite(w)||
               w<.25||w>4))
            throw Error('Graph Profile Asset UV edgeWeights must contain one value in [0.25,4] per edge.');
        uv.edgeWeights=(raw.edgeWeights as number[]).slice();
    }
    return {format:'cocos-splines/profile',version:1,points,uv};
}
function checkAuthoredProfilePolygon(points:ReadonlyArray<Readonly<GraphProfilePoint>>):void{
    const epsilon=1e-8,n=points.length;
    const cross2=(a:GraphProfilePoint,b:GraphProfilePoint,c:GraphProfilePoint)=>
        (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const on=(a:GraphProfilePoint,b:GraphProfilePoint,p:GraphProfilePoint)=>
        Math.abs(cross2(a,b,p))<=epsilon&&
        p.x>=Math.min(a.x,b.x)-epsilon&&p.x<=Math.max(a.x,b.x)+epsilon&&
        p.y>=Math.min(a.y,b.y)-epsilon&&p.y<=Math.max(a.y,b.y)+epsilon;
    const intersects=(a:GraphProfilePoint,b:GraphProfilePoint,
        c:GraphProfilePoint,d:GraphProfilePoint)=>{
        const o1=cross2(a,b,c),o2=cross2(a,b,d);
        const o3=cross2(c,d,a),o4=cross2(c,d,b);
        return on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)||
            (((o1>epsilon&&o2<-epsilon)||(o1<-epsilon&&o2>epsilon))&&
             ((o3>epsilon&&o4<-epsilon)||(o3<-epsilon&&o4>epsilon)));
    };
    let area=0;
    for(let i=0;i<n;i++){
        const a=points[i],b=points[(i+1)%n],next=points[(i+2)%n];
        if(Math.hypot(b.x-a.x,b.y-a.y)<.0001||
           Math.abs(cross2(a,b,next))<=epsilon)
            throw Error('Graph Profile Asset has zero-length or collinear edges.');
        area+=a.x*b.y-b.x*a.y;
        for(let j=i+1;j<n;j++){
            if(j===i+1||(i===0&&j===n-1))continue;
            if(intersects(a,b,points[j],points[(j+1)%n]))
                throw Error('Graph Profile Asset polygon self-intersects.');
        }
    }
    if(area<=.0002)
        throw Error('Graph Profile Asset polygon must be counter-clockwise (CCW) with positive area.');
}
export interface ProfileExtrudeSettings {
    /** Optional data-only polygon; absent preserves built-in preset. */
    profile?:ReadonlyArray<Readonly<GraphProfilePoint>>;
    /** Only for authored profile; no implicit UV changes to built-in presets. */
    profileUV?:Readonly<GraphProfileUV>;
    width:number;
    height:number;
    profileShape:GraphProfileShape;
    uvMetersPerRepeat:number;
    capEnds:boolean;
}
interface P2 {x:number;y:number}
const PROFILES:Readonly<Record<GraphProfileShape,ReadonlyArray<Readonly<P2>>>>={
    [GraphProfileShape.Rectangle]:[
        {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},
    ],
    [GraphProfileShape.Beveled]:[
        {x:-.4,y:-.5},{x:.4,y:-.5},{x:.5,y:-.4},{x:.5,y:.4},
        {x:.4,y:.5},{x:-.4,y:.5},{x:-.5,y:.4},{x:-.5,y:-.4},
    ],
    [GraphProfileShape.UChannel]:[
        {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:.3,y:.5},
        {x:.3,y:-.2},{x:-.3,y:-.2},{x:-.3,y:.5},{x:-.5,y:.5},
    ],
};
const add=(a:V3,b:V3):V3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul=(a:V3,k:number):V3=>({x:a.x*k,y:a.y*k,z:a.z*k});
const cross=(a:V3,b:V3):V3=>({
    x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x,
});
const dot=(a:V3,b:V3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const length=(a:V3)=>Math.hypot(a.x,a.y,a.z);
const cross2=(a:P2,b:P2,c:P2)=>
    (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const isFinite3=(v:V3)=>!!v&&[v.x,v.y,v.z].every(Number.isFinite);
const unit=(v:V3):V3=>{
    const size=length(v);
    if(!Number.isFinite(size)||size<1e-8)
        throw Error('Geometry Graph Extrude requires nondegenerate frames.');
    return mul(v,1/size);
};
function profileTriangles(profile:ReadonlyArray<Readonly<P2>>):number[] {
    // Ear clipping works for U-channel too (a triangle fan would fill its gap).
    // Built-in profiles are fixed/short; their triangulation is deterministic.
    const remaining=profile.map((_,i)=>i),triangles:number[]=[];
    let attempts=0;
    while(remaining.length>3){
        if(++attempts>profile.length*profile.length)
            throw Error('Geometry Graph Extrude cannot triangulate its profile.');
        let found=false;
        for(let i=0;i<remaining.length;i++){
            const a=remaining[(i+remaining.length-1)%remaining.length],
                b=remaining[i],c=remaining[(i+1)%remaining.length];
            const A=profile[a],B=profile[b],C=profile[c];
            if(cross2(A,B,C)<=1e-10)continue;
            const hasInterior=remaining.some(p=>{
                if(p===a||p===b||p===c)return false;
                const P=profile[p];
                return cross2(A,B,P)>=-1e-10&&
                    cross2(B,C,P)>=-1e-10&&cross2(C,A,P)>=-1e-10;
            });
            if(hasInterior)continue;
            triangles.push(a,b,c);remaining.splice(i,1);
            found=true;break;
        }
        if(!found)throw Error('Geometry Graph Extrude profile has no valid ear.');
    }
    triangles.push(...remaining);
    return triangles;
}
export function buildProfileExtrudeGeometry(
    frames:ReadonlyArray<ProfileExtrudeFrame>,settings:ProfileExtrudeSettings,
    closed:boolean):RoadGeometry {
    const {width,height,profileShape,uvMetersPerRepeat,capEnds}=settings;
    if(!Number.isFinite(width)||width<.05||width>100||
       !Number.isFinite(height)||height<.05||height>100||
       !Number.isInteger(profileShape)||!Object.prototype.hasOwnProperty.call(PROFILES,profileShape)||
       !Number.isFinite(uvMetersPerRepeat)||uvMetersPerRepeat<.01||uvMetersPerRepeat>10000||
       typeof capEnds!=='boolean'||typeof closed!=='boolean'||
       !Array.isArray(frames)||frames.length<2||frames.length>1025)
        throw Error('Geometry Graph Extrude settings or frame count are invalid.');
    if(settings.profileUV!==undefined&&!settings.profile)
        throw Error('Graph Profile Asset UV requires an authored profile.');
    const authored=settings.profile?
        parseGraphProfileAsset({format:'cocos-splines/profile',version:1,
            points:settings.profile,...(settings.profileUV===undefined?{}:{uv:settings.profileUV})}):null;
    const profile=authored?.points??PROFILES[profileShape];
    const bands=profile.length;
    const triangles=capEnds&&!closed?profileTriangles(profile):[];
    const perimeterLengths=profile.map((p,i)=>{
        const next=profile[(i+1)%bands];
        return Math.hypot((next.x-p.x)*width,(next.y-p.y)*height);
    });
    const uvWeights=authored?.uv?.edgeWeights;
    const weightedLengths=perimeterLengths.map((len,i)=>
        len*(uvWeights?.[i]??1));
    const perimeter=weightedLengths.reduce((total,l)=>total+l,0);
    const uvStart:number[]=[],uvEnd:number[]=[];
    const prefix:number[]=[];
    let cumulative=0;
    for(const len of weightedLengths){prefix.push(cumulative);cumulative+=len;}
    const seam=authored?.uv?.seamEdge??0;
    for(let i=0;i<bands;i++){
        // Side bands use duplicated endpoints, so the discontinuity can move
        // to any selected edge WITHOUT moving geometry or altering cap UV.
        const rotated=i>=seam?prefix[i]-prefix[seam]:
            perimeter-prefix[seam]+prefix[i];
        const u=rotated/perimeter;
        uvStart.push(u);uvEnd.push(u+weightedLengths[i]/perimeter);
    }
    const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
    const result:RoadGeometry={positions,normals,uvs,indices,bands,ringCount:frames.length};
    const push=(p:V3,n:V3,u:number,v:number):number=>{
        const idx=positions.length/3;
        positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);uvs.push(u,v);
        return idx;
    };
    const at=(f:ProfileExtrudeFrame,p:Readonly<P2>):V3=>
        add(add(f.position,mul(f.right,p.x*width*f.widthFactor)),
            mul(f.up,p.y*height*f.widthFactor));
    let handedness=0;
    // Band-major layout makes normals hard at every edge and avoids smoothing
    // across sharp corners. Two distinct vertices per edge per frame.
    for(let j=0;j<bands;j++){
        const A=profile[j],B=profile[(j+1)%bands];
        for(const f of frames){
            if(!Number.isFinite(f.widthFactor)||f.widthFactor<.0001||
               f.widthFactor>1000||!Number.isFinite(f.distance)||
               ![f.position,f.forward,f.right,f.up].every(isFinite3))
                throw Error('Geometry Graph Extrude contains an invalid frame.');
            const orientation=dot(cross(f.right,f.up),f.forward);
            if(!Number.isFinite(orientation)||Math.abs(orientation)<1e-10)
                throw Error('Geometry Graph Extrude frame basis is degenerate.');
            const sign=orientation>0?1:-1;
            if(handedness!==0&&handedness!==sign)
                throw Error('Geometry Graph Extrude frame handedness changed.');
            handedness=sign;
            const edge=add(mul(f.right,(B.x-A.x)*width*f.widthFactor),
                mul(f.up,(B.y-A.y)*height*f.widthFactor));
            const n=unit(mul(cross(edge,f.forward),handedness));
            push(at(f,A),n,uvStart[j],f.distance/uvMetersPerRepeat);
            push(at(f,B),n,uvEnd[j],f.distance/uvMetersPerRepeat);
        }
        const first=j*frames.length*2;
        for(let i=0;i<frames.length-1;i++){
            const a=first+i*2,b=a+1,c=a+2,d=c+1;
            if(handedness>0)indices.push(a,b,c,b,d,c);
            else indices.push(a,c,b,b,c,d);
        }
    }
    if(capEnds&&!closed){
        for(let end=0;end<2;end++){
            const f=frames[end===0?0:frames.length-1];
            const outward=unit(mul(cross(f.right,f.up),
                handedness*(end===0?-1:1)));
            const offset=positions.length/3;
            for(const point of profile)
                push(at(f,point),outward,point.x+.5,point.y+.5);
            const ccw=(end===1)===(handedness>0);
            for(let t=0;t<triangles.length;t+=3){
                const a=offset+triangles[t],b=offset+triangles[t+1],
                    c=offset+triangles[t+2];
                if(ccw)indices.push(a,b,c);
                else indices.push(a,c,b);
            }
        }
    }
    return result;
}
