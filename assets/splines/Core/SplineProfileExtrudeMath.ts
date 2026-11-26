/** Phase 4.3b — bounded profile extrusion along a spline frame field.
 * Pure and deterministic: built-in profiles remain defaults; optional
 * author-owned polygon points are validated and never executed as code.
 *
 * Shapes are counter-clockwise when viewed along +forward:
 *   0 Rectangle, 1 Beveled rectangle, 2 U-channel (concave).
 * Separate side bands provide crisp profile corners and independent cap UVs.
 */
import {RoadFrame,RoadGeometry,V3} from './SplineRoadMath';
import {packProfileUvAtlas,unwrapProfileUvTriangles,UvAtlasIsland,UvAtlasPixelPadding} from './SplineUvAtlas';

export enum GraphProfileShape {Rectangle=0,Beveled=1,UChannel=2}
export interface ProfileExtrudeFrame extends RoadFrame {widthFactor:number}
export interface GraphProfilePoint {x:number;y:number}
/** Optional UV0 side-band mapping. Seam starts the U cycle; edge weights
 * redistribute its perimeter. uMetersPerRepeat opts into meter-based U
 * (at nominal Width/Height); absent value preserves normalized U=[0,1].
 */
export interface GraphProfileUV {
    seamEdge?:number;
    edgeWeights?:number[];
    /** Optional positive authored side U tile length at nominal width/height.
     * Omitted => one repeat around weighted section circumference.
     */
    uMetersPerRepeat?:number;
    /** Opt-in UV0 U derived from actual local side lengths at each frame.
     * Requires metric uMetersPerRepeat; independent of node world transform.
     */
    uFollowFrameScale?:boolean;
    /** World-space metric U (includes renderer Node scale/rotation/shear).
     * Requires uMetersPerRepeat; overrides frame-local U when both enabled.
     */
    uWorldSpace?:boolean;
    /** Opt-in UV0 side islands: 0 continuous legacy perimeter (default),
     * 1 edge islands (independent U per cross-section edge, continuous V),
     * 2 quad islands (separate U/V for each spline-span side face).
     * Cap UV islands are always independent and are unchanged.
     */
    sideIslandMode?:number;
    /** Opt-in deterministic UV0 atlas for side + cap islands (all 0..1).
     * 0/false/absent maintains untouched legacy UV; true uses uniform scale.
     */
    atlasPacking?:boolean;
    /** Cell-relative UV gutter [0,0.2], default 0.04 when atlas enabled. */
    atlasPadding?:number;
    /** Opt-in proper 90-degree rotation in deterministic atlas candidates. */
    atlasRotate?:boolean;
    /** Optional square atlas resolution and exact minimum pixel gutter per side. */
    atlasPixelPadding?:UvAtlasPixelPadding;
    /** Split each side/cap triangle into independent UV0 vertices.
     * Keeps world geometry, normals and triangle winding unchanged.
     * Triangle UVs are rebased to their own local origin (not rescaled).
     */
    triangleUnwrap?:boolean;
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
       Object.keys(raw).some(k=>!['seamEdge','edgeWeights','uMetersPerRepeat','uFollowFrameScale','uWorldSpace','sideIslandMode','atlasPacking','atlasPadding','atlasRotate','atlasPixelPadding','triangleUnwrap'].includes(k)))
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
    if(Object.prototype.hasOwnProperty.call(raw,'uMetersPerRepeat')){
        if(typeof raw.uMetersPerRepeat!=='number'||
           !Number.isFinite(raw.uMetersPerRepeat)||
           raw.uMetersPerRepeat<.01||raw.uMetersPerRepeat>10000)
            throw Error('Graph Profile Asset UV uMetersPerRepeat must be finite in [0.01,10000].');
        uv.uMetersPerRepeat=raw.uMetersPerRepeat;
    }
    if(Object.prototype.hasOwnProperty.call(raw,'uFollowFrameScale')){
        if(typeof raw.uFollowFrameScale!=='boolean'||
           (raw.uFollowFrameScale&&!Object.prototype.hasOwnProperty.call(uv,'uMetersPerRepeat')))
            throw Error('Graph Profile Asset UV uFollowFrameScale requires boolean and metric uMetersPerRepeat when enabled.');
        uv.uFollowFrameScale=raw.uFollowFrameScale;
    }
    if(Object.prototype.hasOwnProperty.call(raw,'uWorldSpace')){
        if(typeof raw.uWorldSpace!=='boolean'||
           (raw.uWorldSpace&&!Object.prototype.hasOwnProperty.call(uv,'uMetersPerRepeat')))
            throw Error('Graph Profile Asset UV uWorldSpace requires boolean and metric uMetersPerRepeat when enabled.');
        uv.uWorldSpace=raw.uWorldSpace;
    }
    if(Object.prototype.hasOwnProperty.call(raw,'sideIslandMode')){
        if(!Number.isInteger(raw.sideIslandMode)||
           (raw.sideIslandMode as number)<0||(raw.sideIslandMode as number)>2)
            throw Error('Graph Profile Asset UV sideIslandMode must be an integer 0–2.');
        uv.sideIslandMode=raw.sideIslandMode as number;
    }
    if(Object.prototype.hasOwnProperty.call(raw,'atlasPacking')){
        if(typeof raw.atlasPacking!=='boolean')
            throw Error('Graph Profile Asset UV atlasPacking must be boolean.');
        uv.atlasPacking=raw.atlasPacking;
    }
    if(Object.prototype.hasOwnProperty.call(raw,'atlasPadding')){
        if(typeof raw.atlasPadding!=='number'||!Number.isFinite(raw.atlasPadding)||
           raw.atlasPadding<0||raw.atlasPadding>.2||
           uv.atlasPacking!==true)
            throw Error('Graph Profile Asset UV atlasPadding requires enabled atlasPacking and a value in [0,0.2].');
        uv.atlasPadding=raw.atlasPadding;
    }
    if(Object.prototype.hasOwnProperty.call(raw,'atlasRotate')){
        if(typeof raw.atlasRotate!=='boolean'||uv.atlasPacking!==true)
            throw Error('Graph Profile Asset UV atlasRotate requires enabled atlasPacking and a boolean.');
        uv.atlasRotate=raw.atlasRotate;
    }
    if(Object.prototype.hasOwnProperty.call(raw,'atlasPixelPadding')){
        const p=raw.atlasPixelPadding as Record<string,unknown>;
        if(uv.atlasPacking!==true||!p||typeof p!=='object'||Array.isArray(p)||
           Object.keys(p).some(k=>k!=='resolution'&&k!=='pixels')||
           typeof p.resolution!=='number'||!Number.isInteger(p.resolution)||
           p.resolution<16||p.resolution>16384||
           typeof p.pixels!=='number'||!Number.isInteger(p.pixels)||
           p.pixels<0||p.pixels>64||2*p.pixels>=p.resolution)
            throw Error('Graph Profile Asset UV atlasPixelPadding requires enabled atlasPacking, resolution 16–16384 and pixels 0–64 with room for gutters.');
        uv.atlasPixelPadding={resolution:p.resolution,pixels:p.pixels};
    }
    if(Object.prototype.hasOwnProperty.call(raw,'triangleUnwrap')){
        if(typeof raw.triangleUnwrap!=='boolean')
            throw Error('Graph Profile Asset UV triangleUnwrap must be boolean.');
        uv.triangleUnwrap=raw.triangleUnwrap;
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
    /** Renderer local->world linear matrix, column-major (no translation).
     * Required only by opt-in uWorldSpace, not by legacy graphs.
     */
    worldUvLinear?:ReadonlyArray<number>;
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
    const sideIslandMode=authored?.uv?.sideIslandMode??0;
    const worldUv=authored?.uv?.uWorldSpace===true;
    const worldLinear=settings.worldUvLinear;
    if(worldUv&&(!Array.isArray(worldLinear)||worldLinear.length!==9||
        worldLinear.some(x=>!Number.isFinite(x)||Math.abs(x)>1e7)))
        throw Error('Graph Profile Asset UV world-space mode needs a finite 3x3 renderer world transform.');
    const toWorld=(v:V3):V3=>{
        const m=worldLinear!;
        return {
            x:m[0]*v.x+m[3]*v.y+m[6]*v.z,
            y:m[1]*v.x+m[4]*v.y+m[7]*v.z,
            z:m[2]*v.x+m[5]*v.y+m[8]*v.z,
        };
    };
    // Per-triangle unwrap is an explicit alternative to shared vertex UVs.
    // Reject over-budget graphs BEFORE allocating the side/cap mesh.
    const triangleCount=2*bands*(frames.length-1)+2*triangles.length/3;
    if(authored?.uv?.triangleUnwrap===true&&
       (triangleCount*3>65536||triangleCount>16384))
        throw Error('Graph Profile UV Triangle Unwrap exceeds the 65536-vertex / 16384-island limit.');
    // Quad islands duplicate only side vertices per spline span. Preflight
    // prevents exceeding the same 16-bit-safe graph mesh budget as the runner.
    const plannedVertices=sideIslandMode===2?
        bands*(frames.length-1)*4+(triangles.length?2*bands:0):
        bands*frames.length*2+(triangles.length?2*bands:0);
    if(plannedVertices>65536)
        throw Error('Graph Profile Asset UV side islands exceed the 65536-vertex mesh limit.');
    // Opt-in metric tiling: U grows with actual nominal profile side lengths.
    // Legacy weighted/seamed UV stays normalized to [0,1] without this field.
    const uDenominator=authored?.uv?.uMetersPerRepeat??perimeter;
    for(let i=0;i<bands;i++){
        // Side bands use duplicated endpoints, so the discontinuity can move
        // to any selected edge WITHOUT moving geometry or altering cap UV.
        const rotated=sideIslandMode===0?
            (i>=seam?prefix[i]-prefix[seam]:
                perimeter-prefix[seam]+prefix[i]):0;
        const edgeDenominator=sideIslandMode===0?uDenominator:
            (authored?.uv?.uMetersPerRepeat??weightedLengths[i]);
        const u=rotated/edgeDenominator;
        uvStart.push(u);uvEnd.push(u+weightedLengths[i]/edgeDenominator);
    }
    // This opt-in mode derives physical U per ring from the same local
    // geometry used to emit the section, including widthFactor, nonunit
    // frame right/up vectors, and cross-section edge weights. This changes
    // UV0 only; no geometry, cap, normals or topology changes.
    const ringUV=(worldUv||authored?.uv?.uFollowFrameScale)?frames.map(f=>{
        if(!Number.isFinite(f.widthFactor)||f.widthFactor<.0001||
           f.widthFactor>1000||!isFinite3(f.right)||!isFinite3(f.up))
            throw Error('Graph Profile Asset UV frame scale requires finite valid basis.');
        const lengths=profile.map((p,i)=>{
            const next=profile[(i+1)%bands];
            const tangent=add(mul(f.right,(next.x-p.x)*width*f.widthFactor),
                mul(f.up,(next.y-p.y)*height*f.widthFactor));
            const len=length(worldUv?toWorld(tangent):tangent)*(uvWeights?.[i]??1);
            if(!Number.isFinite(len)||len<1e-8)
                throw Error('Graph Profile Asset UV frame edge is degenerate.');
            return len;
        });
        const total=lengths.reduce((sum,len)=>sum+len,0);
        if(!Number.isFinite(total)||total<1e-8)
            throw Error('Graph Profile Asset UV frame perimeter is invalid.');
        const prefix:number[]=[];let cursor=0;
        for(const len of lengths){prefix.push(cursor);cursor+=len;}
        const start:number[]=[],end:number[]=[];
        for(let i=0;i<bands;i++){
            const rotated=sideIslandMode===0?
                (i>=seam?prefix[i]-prefix[seam]:
                    total-prefix[seam]+prefix[i]):0;
            const u=rotated/uDenominator,finish=u+lengths[i]/uDenominator;
            if(!Number.isFinite(u)||!Number.isFinite(finish))
                throw Error('Graph Profile Asset UV frame U overflow.');
            start.push(u);end.push(finish);
        }
        return {start,end};
    }):null;
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
        if(sideIslandMode===2){
            // Each side quad needs its own four UV0 vertices, because its V
            // must restart at zero at every spline span. Existing geometry
            // and normals are evaluated at the SAME frame positions as the
            // continuous mode, preserving hard profile corners.
            const sideNormal=(f:ProfileExtrudeFrame):V3=>{
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
                return unit(mul(cross(edge,f.forward),handedness));
            };
            for(let fi=0;fi<frames.length-1;fi++){
                const f0=frames[fi],f1=frames[fi+1];
                const n0=sideNormal(f0),n1=sideNormal(f1);
                const start0=ringUV?.[fi].start[j]??uvStart[j];
                const end0=ringUV?.[fi].end[j]??uvEnd[j];
                const start1=ringUV?.[fi+1].start[j]??uvStart[j];
                const end1=ringUV?.[fi+1].end[j]??uvEnd[j];
                const v=(f1.distance-f0.distance)/uvMetersPerRepeat;
                if(!Number.isFinite(v)||v<0)
                    throw Error('Graph Profile Asset UV Quad Islands require ordered finite frames.');
                const a=push(at(f0,A),n0,start0,0);
                const b=push(at(f0,B),n0,end0,0);
                const c=push(at(f1,A),n1,start1,v);
                const d=push(at(f1,B),n1,end1,v);
                if(handedness>0)indices.push(a,b,c,b,d,c);
                else indices.push(a,c,b,b,c,d);
            }
            continue;
        }
        for(let fi=0;fi<frames.length;fi++){
            const f=frames[fi];
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
            push(at(f,A),n,ringUV?.[fi].start[j]??uvStart[j],f.distance/uvMetersPerRepeat);
            push(at(f,B),n,ringUV?.[fi].end[j]??uvEnd[j],f.distance/uvMetersPerRepeat);
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
    const triangleGroups=authored?.uv?.triangleUnwrap===true?
        unwrapProfileUvTriangles(result):null;
    if(authored?.uv?.atlasPacking===true){
        // Each side quad is individually unwrap-ready in mode 2. In mode 1,
        // an edge strip is one island. In mode 0, the entire perimeter is one.
        // Caps each get a separate nonoverlapping island when present.
        const groups:UvAtlasIsland[]=triangleGroups??[];
        const sideVertices=sideIslandMode===2?
            bands*(frames.length-1)*4:bands*frames.length*2;
        if(!triangleGroups){
            if(sideIslandMode===2){
                for(let i=0;i<bands*(frames.length-1);i++)
                    groups.push({firstVertex:i*4,vertexCount:4});
            }else if(sideIslandMode===1){
                for(let i=0;i<bands;i++)
                    groups.push({firstVertex:i*frames.length*2,
                        vertexCount:frames.length*2});
            }else groups.push({firstVertex:0,vertexCount:sideVertices});
            if(capEnds&&!closed){
                groups.push({firstVertex:sideVertices,vertexCount:bands});
                groups.push({firstVertex:sideVertices+bands,vertexCount:bands});
            }
        }
        packProfileUvAtlas(uvs,groups,authored.uv.atlasPadding??.04,{
            rotate:authored.uv.atlasRotate,pixelPadding:authored.uv.atlasPixelPadding,
        });
    }
    return result;
}
