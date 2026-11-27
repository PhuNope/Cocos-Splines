/** Phase 4.3b — bounded profile extrusion along a spline frame field.
 * Pure and deterministic: built-in profiles remain defaults; optional
 * author-owned polygon points are validated and never executed as code.
 *
 * Shapes are counter-clockwise when viewed along +forward:
 *   0 Rectangle, 1 Beveled rectangle, 2 U-channel (concave).
 * Separate side bands provide crisp profile corners and independent cap UVs.
 */
import {RoadFrame,RoadGeometry,V3} from './SplineRoadMath';
import {packProfileUvAtlas,unwrapProfileUvTriangles,UvAtlasIsland,UvAtlasPixelPadding,UvAtlasPriority} from './SplineUvAtlas';

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
    /** Relative linear texel density by surface group, default 1 each. */
    atlasPriority?:UvAtlasPriority;
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
    /** Up to three strictly contained, clockwise inner boundaries. */
    holes?:GraphProfilePoint[][];
    /** Up to three disconnected CCW outer contours, without nested holes. */
    outerContours?:GraphProfilePoint[][];
    /** Hole lists aligned with the additional outer contours. */
    outerHoles?:GraphProfilePoint[][][];
    uv?:GraphProfileUV;
}
/** Strict data-only profile; copied out of the Cocos JsonAsset, never mutated. */
export function parseGraphProfileAsset(input:unknown):GraphAuthoredProfile{
    const r=input as Record<string,unknown>;
    if(!r||typeof r!=='object'||Array.isArray(r)||
       Object.keys(r).some(k=>!['format','version','points','holes','outerContours','outerHoles','uv'].includes(k))||
       r.format!=='cocos-splines/profile'||r.version!==1||
       !Array.isArray(r.points)||r.points.length<3||r.points.length>16)
        throw Error('Graph Profile Asset requires cocos-splines/profile v1 with 3–16 points.');
    const readPoint=(raw:unknown):GraphProfilePoint=>{
        const p=raw as Record<string,unknown>;
        if(!p||typeof p!=='object'||Array.isArray(p)||
           Object.keys(p).some(k=>!['x','y'].includes(k))||
           typeof p.x!=='number'||typeof p.y!=='number'||
           !Number.isFinite(p.x)||!Number.isFinite(p.y)||
           Math.abs(p.x)>1||Math.abs(p.y)>1)
            throw Error('Graph Profile Asset point requires finite x/y in [-1,1].');
        return {x:p.x,y:p.y};
    };
    const points:GraphProfilePoint[]=r.points.map(readPoint);
    checkAuthoredProfilePolygon(points);
    let holes:GraphProfilePoint[][]|undefined;
    if(Object.prototype.hasOwnProperty.call(r,'holes')){
        if(!Array.isArray(r.holes)||r.holes.length<1||r.holes.length>3)
            throw Error('Graph Profile Asset holes requires 1–3 clockwise contours.');
        holes=r.holes.map(loop=>{
            if(!Array.isArray(loop)||loop.length<3||loop.length>16)
                throw Error('Graph Profile Asset hole requires 3–16 points.');
            const ring=loop.map(readPoint);
            checkAuthoredProfilePolygon(ring,true);
            return ring;
        });
        checkProfileHoles(points,holes);
    }
    let outerContours:GraphProfilePoint[][]|undefined;
    if(Object.prototype.hasOwnProperty.call(r,'outerContours')){
        if(!Array.isArray(r.outerContours)||r.outerContours.length<1||r.outerContours.length>3)
            throw Error('Graph Profile Asset outerContours requires 1–3 additional CCW contours.');
        outerContours=r.outerContours.map(loop=>{
            if(!Array.isArray(loop)||loop.length<3||loop.length>16)
                throw Error('Graph Profile Asset outer contour requires 3–16 points.');
            const ring=loop.map(readPoint);checkAuthoredProfilePolygon(ring);return ring;
        });
        const outers=[points,...outerContours];
        for(let i=1;i<outers.length;i++)for(let j=0;j<i;j++){
            const a=outers[i],b=outers[j];
            if(insideContour(a[0],b)||insideContour(b[0],a)||
               a.some((p,k)=>b.some((q,l)=>segmentsMeet(p,a[(k+1)%a.length],q,b[(l+1)%b.length]))))
                throw Error('Graph Profile Asset outer contours must be disjoint and not nested.');
        }
    }
    let outerHoles:GraphProfilePoint[][][]|undefined;
    if(Object.prototype.hasOwnProperty.call(r,'outerHoles')){
        if(!outerContours||!Array.isArray(r.outerHoles)||r.outerHoles.length!==outerContours.length)
            throw Error('Graph Profile Asset outerHoles must align with outerContours.');
        outerHoles=r.outerHoles.map((list,i)=>{
            if(!Array.isArray(list)||list.length>3)
                throw Error('Graph Profile Asset outerHoles allows up to three holes per contour.');
            const rings=list.map(loop=>{
                if(!Array.isArray(loop)||loop.length<3||loop.length>16)
                    throw Error('Graph Profile Asset hole requires 3–16 points.');
                const ring=loop.map(readPoint);checkAuthoredProfilePolygon(ring,true);return ring;
            });
            checkProfileHoles(outerContours![i],rings);return rings;
        });
    }
    const contours={...(holes?{holes}:{}),...(outerContours?{outerContours}:{}),...(outerHoles?{outerHoles}:{})};
    if(!Object.prototype.hasOwnProperty.call(r,'uv'))
        return {format:'cocos-splines/profile',version:1,points,...contours};
    const raw=r.uv as Record<string,unknown>;
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||
       Object.keys(raw).some(k=>!['seamEdge','edgeWeights','uMetersPerRepeat','uFollowFrameScale','uWorldSpace','sideIslandMode','atlasPacking','atlasPadding','atlasRotate','atlasPixelPadding','atlasPriority','triangleUnwrap'].includes(k)))
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
    if(Object.prototype.hasOwnProperty.call(raw,'atlasPriority')){
        const p=raw.atlasPriority as Record<string,unknown>;
        if(uv.atlasPacking!==true||!p||typeof p!=='object'||Array.isArray(p)||
           Object.keys(p).some(k=>!['outer','inner','cap'].includes(k))||
           !['outer','inner','cap'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&
               (p[k] as number)>=.25&&(p[k] as number)<=4))
            throw Error('Graph Profile Asset UV atlasPriority requires Atlas and outer/inner/cap densities in [0.25,4].');
        uv.atlasPriority={outer:p.outer as number,inner:p.inner as number,cap:p.cap as number};
    }
    if(Object.prototype.hasOwnProperty.call(raw,'triangleUnwrap')){
        if(typeof raw.triangleUnwrap!=='boolean')
            throw Error('Graph Profile Asset UV triangleUnwrap must be boolean.');
        uv.triangleUnwrap=raw.triangleUnwrap;
    }
    return {format:'cocos-splines/profile',version:1,points,...contours,uv};
}
function checkAuthoredProfilePolygon(points:ReadonlyArray<Readonly<GraphProfilePoint>>,hole=false):void{
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
    if(hole?area>=-.0002:area<=.0002)
        throw Error(hole?'Graph Profile Asset hole must be clockwise (CW).':
            'Graph Profile Asset polygon must be counter-clockwise (CCW) with positive area.');
}
// Boundary intersection/containment checks are shared by validation and
// the deterministic constrained triangulation. Boundary contact is invalid.
const contourEps=1e-8;
const orient2=(a:GraphProfilePoint,b:GraphProfilePoint,c:GraphProfilePoint)=>
    (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const onSegment=(a:GraphProfilePoint,b:GraphProfilePoint,p:GraphProfilePoint)=>
    Math.abs(orient2(a,b,p))<=contourEps&&
    p.x>=Math.min(a.x,b.x)-contourEps&&p.x<=Math.max(a.x,b.x)+contourEps&&
    p.y>=Math.min(a.y,b.y)-contourEps&&p.y<=Math.max(a.y,b.y)+contourEps;
function segmentsMeet(a:GraphProfilePoint,b:GraphProfilePoint,c:GraphProfilePoint,d:GraphProfilePoint):boolean{
    const x=orient2(a,b,c),y=orient2(a,b,d),z=orient2(c,d,a),w=orient2(c,d,b);
    return onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b)||
        (((x>contourEps&&y<-contourEps)||(x<-contourEps&&y>contourEps))&&
         ((z>contourEps&&w<-contourEps)||(z<-contourEps&&w>contourEps)));
}
function insideContour(p:GraphProfilePoint,loop:ReadonlyArray<GraphProfilePoint>):boolean{
    let inside=false;
    for(let i=0,j=loop.length-1;i<loop.length;j=i++){
        const a=loop[j],b=loop[i];
        if(onSegment(a,b,p))return false;
        if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)
            inside=!inside;
    }
    return inside;
}
function checkProfileHoles(outer:GraphProfilePoint[],holes:GraphProfilePoint[][]):void{
    const rings=[outer,...holes];
    for(let i=1;i<rings.length;i++){
        const ring=rings[i];
        if(!ring.every(p=>insideContour(p,outer)))
            throw Error('Graph Profile Asset hole must be strictly inside outer contour.');
        for(let j=0;j<i;j++){
            const other=rings[j];
            for(let a=0;a<ring.length;a++)for(let b=0;b<other.length;b++)
                if(segmentsMeet(ring[a],ring[(a+1)%ring.length],other[b],other[(b+1)%other.length]))
                    throw Error('Graph Profile Asset contours intersect or touch.');
            if(j>0&&(insideContour(ring[0],other)||insideContour(other[0],ring)))
                throw Error('Graph Profile Asset holes overlap or are nested.');
        }
    }
}
/** Bounded constrained planar triangulation: insert visible non-crossing
 * diagonals in stable shortest-first order, then extract the bounded faces.
 * No bridge duplicates, extra cap vertices or external dependencies.
 */
function triangulateContours(rings:ReadonlyArray<ReadonlyArray<GraphProfilePoint>>):number[]{
    const points=rings.flat(),n=points.length,edges:[number,number][]=[];
    const neighbors=points.map(()=>new Set<number>());
    const addEdge=(a:number,b:number)=>{
        neighbors[a].add(b);neighbors[b].add(a);edges.push([a,b]);
    };
    const holeFaces=new Set<string>();
    let offset=0;
    for(let r=0;r<rings.length;r++){
        const len=rings[r].length;
        for(let i=0;i<len;i++)addEdge(offset+i,offset+(i+1)%len);
        if(r>0)holeFaces.add(Array.from({length:len},(_,i)=>offset+i).join(','));
        offset+=len;
    }
    const domain=(p:GraphProfilePoint)=>insideContour(p,rings[0])&&
        !rings.slice(1).some(r=>insideContour(p,r));
    const candidates:{a:number;b:number;d:number}[]=[];
    for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){
        if(neighbors[a].has(b))continue;
        const A=points[a],B=points[b];
        if(!domain({x:(A.x+B.x)/2,y:(A.y+B.y)/2})||
           points.some((p,k)=>k!==a&&k!==b&&onSegment(A,B,p)))continue;
        candidates.push({a,b,d:(A.x-B.x)**2+(A.y-B.y)**2});
    }
    candidates.sort((a,b)=>a.d-b.d||a.a-b.a||a.b-b.b);
    for(const {a,b} of candidates){
        if(edges.some(([c,d])=>a!==c&&a!==d&&b!==c&&b!==d&&
           segmentsMeet(points[a],points[b],points[c],points[d])))continue;
        addEdge(a,b);
    }
    const sorted=neighbors.map((set,i)=>[...set].sort((a,b)=>
        Math.atan2(points[a].y-points[i].y,points[a].x-points[i].x)-
        Math.atan2(points[b].y-points[i].y,points[b].x-points[i].x)));
    const visited=new Set<number>(),triangles:number[]=[];
    let area2=0;
    for(let a=0;a<n;a++)for(const b of sorted[a]){
        if(visited.has(a*n+b))continue;
        const face:number[]=[];
        let u=a,v=b;
        do{
            const key=u*n+v;
            if(visited.has(key)||face.length>2*edges.length)
                throw Error('Graph Profile Asset contour triangulation is inconsistent.');
            visited.add(key);face.push(u);
            const around=sorted[v],next=around[(around.indexOf(u)+around.length-1)%around.length];
            u=v;v=next;
        }while(u!==a||v!==b);
        const signed=face.reduce((sum,i,k)=>{
            const p=points[i],q=points[face[(k+1)%face.length]];
            return sum+p.x*q.y-q.x*p.y;
        },0);
        if(signed<=contourEps||holeFaces.has(face.slice().sort((x,y)=>x-y).join(',')))continue;
        if(face.length!==3||!domain({
            x:face.reduce((sum,i)=>sum+points[i].x,0)/3,
            y:face.reduce((sum,i)=>sum+points[i].y,0)/3}))
            throw Error('Graph Profile Asset cannot triangulate contour domain.');
        triangles.push(...face);area2+=signed;
    }
    const expected=rings.reduce((sum,ring)=>sum+ring.reduce((a,p,i)=>{
        const q=ring[(i+1)%ring.length];return a+p.x*q.y-q.x*p.y;
    },0),0);
    if(triangles.length!==3*(n+2*(rings.length-1)-2)||
       Math.abs(area2-expected)>1e-7*Math.max(1,expected))
        throw Error('Graph Profile Asset contour triangulation area mismatch.');
    return triangles;
}
/** Stable ordered part/loop correspondence: main outer + holes, then
 * each additional outer + its holes. No implicit contour or vertex matching. */
export function graphProfileParts(profile:GraphAuthoredProfile):GraphProfilePoint[][][]{
    return [[profile.points,...(profile.holes??[])],
        ...(profile.outerContours??[]).map((outer,i)=>[outer,...(profile.outerHoles?.[i]??[])])];
}
export function graphProfileTopology(profile:GraphAuthoredProfile):string{
    return JSON.stringify(graphProfileParts(profile).map(part=>part.map(loop=>loop.length)));
}
/** parseGraphProfileAsset emits UV keys in canonical order, including nested
 * atlas settings. Require a single shared configuration for a keyed strip:
 * no seam/atlas layout switches or interpolation of UV settings. */
export function graphProfileUVSignature(profile:GraphAuthoredProfile):string{
    return JSON.stringify(profile.uv??null);
}
/** Caller supplies validated profiles with identical topology. The builder
 * validates each interpolated section, including hole containment and overlap. */
export function interpolateGraphProfile(a:GraphAuthoredProfile,b:GraphAuthoredProfile,t:number):GraphAuthoredProfile{
    if(graphProfileTopology(a)!==graphProfileTopology(b))
        throw Error('Graph Profile keys require matching contour topology and vertex counts.');
    if(graphProfileUVSignature(a)!==graphProfileUVSignature(b))
        throw Error('Graph Profile keys require matching custom UV metadata.');
    const left=graphProfileParts(a),right=graphProfileParts(b);
    const parts=left.map((part,i)=>part.map((loop,j)=>loop.map((p,k)=>{
        const q=right[i][j][k];return {x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};
    })));
    const extra=parts.slice(1);
    return {format:'cocos-splines/profile',version:1,points:parts[0][0],
        ...(parts[0].length>1?{holes:parts[0].slice(1)}:{}),
        ...(extra.length?{outerContours:extra.map(part=>part[0])}:{}),
        ...(extra.some(part=>part.length>1)?{outerHoles:extra.map(part=>part.slice(1))}:{}),
        ...(a.uv===undefined?{}:{uv:a.uv})};
}
/** Material group IDs 0–3, independent of renderer-local material references.
 * edgeSlots follows flattened part/loop/edge order; -1 inherits outer/inner.
 */
export interface ProfileMaterialMapping {
    outer?:number;inner?:number;startCap?:number;endCap?:number;edgeSlots?:number[];
}
export function validateProfileMaterialMapping(raw:unknown):ProfileMaterialMapping{
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||
       Object.keys(raw).some(k=>!['outer','inner','startCap','endCap','edgeSlots'].includes(k)))
        throw Error('Profile material mapping requires outer/inner/startCap/endCap/edgeSlots.');
    const r=raw as Record<string,unknown>,result:ProfileMaterialMapping={};
    const valid=(n:unknown,min=0):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=min&&n<=3;
    for(const k of ['outer','inner','startCap','endCap'] as const)if(Object.prototype.hasOwnProperty.call(r,k)){
        const v=r[k];if(!valid(v))throw Error('Profile material slot must be an integer 0–3.');
        result[k]=v;
    }
    if(Object.prototype.hasOwnProperty.call(r,'edgeSlots')){
        const slots=r.edgeSlots;
        if(!Array.isArray(slots)||slots.length<1||slots.length>256||
           Array.from(slots).some(v=>!valid(v,-1)))
            throw Error('Profile material edgeSlots requires 1–256 integer entries -1–3.');
        result.edgeSlots=slots.slice();
    }
    return result;
}
export interface ProfileExtrudeSettings {
    profileMaterials?:ProfileMaterialMapping;
    /** Optional data-only polygon; absent preserves built-in preset. */
    profile?:ReadonlyArray<Readonly<GraphProfilePoint>>;
    /** Optional one simple, index-compatible authored polygon per path frame. */
    profileRings?:ReadonlyArray<ReadonlyArray<Readonly<GraphProfilePoint>>>;
    /** Complete index-compatible sections per frame, including holes/extra solids. */
    profileSections?:ReadonlyArray<GraphAuthoredProfile>;
    profileHoles?:ReadonlyArray<ReadonlyArray<Readonly<GraphProfilePoint>>>;
    profileOuterContours?:ReadonlyArray<ReadonlyArray<Readonly<GraphProfilePoint>>>;
    profileOuterHoles?:ReadonlyArray<ReadonlyArray<ReadonlyArray<Readonly<GraphProfilePoint>>>>;
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
    if((settings.profileUV!==undefined||settings.profileHoles!==undefined||settings.profileOuterContours!==undefined||settings.profileOuterHoles!==undefined)&&!settings.profile)
        throw Error('Graph Profile Asset UV requires an authored profile.');
    const authored=settings.profile?
        parseGraphProfileAsset({format:'cocos-splines/profile',version:1,
            points:settings.profile,...(settings.profileHoles===undefined?{}:{holes:settings.profileHoles}),
            ...(settings.profileOuterContours===undefined?{}:{outerContours:settings.profileOuterContours}),
            ...(settings.profileOuterHoles===undefined?{}:{outerHoles:settings.profileOuterHoles}),
            ...(settings.profileUV===undefined?{}:{uv:settings.profileUV})}):null;
    if(settings.profileRings!==undefined&&settings.profileSections!==undefined)
        throw Error('Graph Profile keys cannot mix polygon rings and sections.');
    if(settings.profileRings!==undefined&&!Array.isArray(settings.profileRings))
        throw Error('Graph Profile keys require an array of polygons.');
    // Keep the original pure polygon API working. Reuse its ring objects for
    // identity caching rather than reparsing unchanged Step rings per frame.
    const legacy=new Map<ReadonlyArray<Readonly<GraphProfilePoint>>,GraphAuthoredProfile>();
    const rawSections:ReadonlyArray<GraphAuthoredProfile>|undefined=settings.profileSections??
        settings.profileRings?.map((ring:ReadonlyArray<Readonly<GraphProfilePoint>>)=>{
            let section=legacy.get(ring);
            if(!section){
                section={format:'cocos-splines/profile',version:1,points:ring as GraphProfilePoint[]};
                legacy.set(ring,section);
            }
            return section;
        });
    let keyed:ReadonlyArray<ReadonlyArray<Readonly<P2>>>|undefined;
    let keyedParts:ReadonlyArray<GraphProfilePoint[][][]>|undefined;
    let activeUV=authored?.uv;
    if(rawSections!==undefined){
        if(!Array.isArray(rawSections)||rawSections.length!==frames.length||authored)
            throw Error('Graph Profile keys require exactly one section per frame and no static authored profile.');
        const checked=new Map<GraphAuthoredProfile,GraphProfilePoint[][][]>();
        let topology:string|undefined,uvSignature:string|undefined;
        const validated=rawSections.map((section:GraphAuthoredProfile)=>{
            let part=checked.get(section);
            if(part)return part;
            let parsed:GraphAuthoredProfile;
            try{parsed=parseGraphProfileAsset(section);}
            catch(error){throw Error('Graph Profile morph contains an invalid sampled polygon: '+String((error as Error)?.message??error));}
            const signature=graphProfileUVSignature(parsed);
            if(uvSignature!==undefined&&uvSignature!==signature)
                throw Error('Graph Profile keys require matching custom UV metadata.');
            uvSignature=signature;activeUV=parsed.uv;
            const next=graphProfileTopology(parsed);
            if(topology!==undefined&&topology!==next)
                throw Error('Graph Profile keys require matching contour topology and vertex counts.');
            topology=next;part=graphProfileParts(parsed);checked.set(section,part);return part;
        });
        const flattened=new Map<GraphProfilePoint[][][],GraphProfilePoint[]>();
        keyed=validated.map((part:GraphProfilePoint[][][])=>{
            let flat=flattened.get(part);
            if(!flat){flat=part.flat(2);flattened.set(part,flat);}
            return flat;
        });
        keyedParts=validated;
        if(closed&&keyed[0].some((p:Readonly<P2>,i:number)=>p.x!==keyed![keyed!.length-1][i].x||p.y!==keyed![keyed!.length-1][i].y))
            throw Error('Graph Profile keys require identical closed seam polygons.');
    }
    const parts=keyedParts?.[0]??(authored?graphProfileParts(authored):[[PROFILES[profileShape]]]);
    const rings=parts.flat();
    const profile=rings.flat(),bands=profile.length;
    const mapping=settings.profileMaterials===undefined?undefined:validateProfileMaterialMapping(settings.profileMaterials);
    if(mapping?.edgeSlots&&mapping.edgeSlots.length!==bands)
        throw Error('Profile material edgeSlots must match the total flattened profile edge count.');
    const nextEdge:number[]=[],ringStart:number[]=[],ringEnd:number[]=[];
    let offset=0;
    for(const ring of rings){
        for(let j=0;j<ring.length;j++){
            nextEdge.push(offset+(j+1)%ring.length);
            ringStart.push(offset);ringEnd.push(offset+ring.length);
        }
        offset+=ring.length;
    }
    const capParts=parts.map(part=>part.reduce((sum,ring)=>sum+ring.length,0));
    const triangulateParts=(sections:ReadonlyArray<ReadonlyArray<ReadonlyArray<Readonly<P2>>>>):number[]=>{
        let base=0;
        const triangles:number[]=[];
        for(const part of sections){
            const local=part.length===1?profileTriangles(part[0]):triangulateContours(part);
            triangles.push(...local.map(j=>j+base));
            base+=part.reduce((sum,ring)=>sum+ring.length,0);
        }
        return triangles;
    };
    const triangles=capEnds&&!closed?triangulateParts(parts):[];
    const endTriangles=capEnds&&!closed&&keyedParts?triangulateParts(keyedParts[frames.length-1]):triangles;
    const perimeterLengths=profile.map((p,i)=>{
        const next=profile[nextEdge[i]];
        return Math.hypot((next.x-p.x)*width,(next.y-p.y)*height);
    });
    const uvWeights=activeUV?.edgeWeights;
    const weightedLengths=perimeterLengths.map((len,i)=>
        len*(uvWeights?.[i]??1));
    const perimeter=weightedLengths.reduce((total,l)=>total+l,0);
    const uvStart:number[]=[],uvEnd:number[]=[];
    const prefix:number[]=[];
    let cumulative=0;
    for(const len of weightedLengths){prefix.push(cumulative);cumulative+=len;}
    const seam=activeUV?.seamEdge??0;
    const loopSeam=(i:number)=>ringStart[i]===0?seam:ringStart[i];
    const sideIslandMode=activeUV?.sideIslandMode??0;
    const worldUv=activeUV?.uWorldSpace===true;
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
    const triangleCount=2*bands*(frames.length-1)+(triangles.length+endTriangles.length)/3;
    if(activeUV?.triangleUnwrap===true&&
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
    const loopLength=(i:number,lengths:ReadonlyArray<number>)=>
        lengths.slice(ringStart[i],ringEnd[i]).reduce((sum,l)=>sum+l,0);
    const uDenominator=activeUV?.uMetersPerRepeat??perimeter;
    for(let i=0;i<bands;i++){
        // Side bands use duplicated endpoints, so the discontinuity can move
        // to any selected edge WITHOUT moving geometry or altering cap UV.
        const start=loopSeam(i),total=rings.length===1?perimeter:loopLength(i,weightedLengths);
        const rotated=sideIslandMode===0?
            (i>=start?prefix[i]-prefix[start]:
                total-prefix[start]+prefix[i]):0;
        const edgeDenominator=sideIslandMode===0?
            (activeUV?.uMetersPerRepeat??total):
            (activeUV?.uMetersPerRepeat??weightedLengths[i]);
        const u=rotated/edgeDenominator;
        uvStart.push(u);uvEnd.push(u+weightedLengths[i]/edgeDenominator);
    }
    // This opt-in mode derives physical U per ring from the same local
    // geometry used to emit the section, including widthFactor, nonunit
    // frame right/up vectors, and cross-section edge weights. This changes
    // UV0 only; no geometry, cap, normals or topology changes.
    const ringUV=(!keyed&&(worldUv||activeUV?.uFollowFrameScale))?frames.map(f=>{
        if(!Number.isFinite(f.widthFactor)||f.widthFactor<.0001||
           f.widthFactor>1000||!isFinite3(f.right)||!isFinite3(f.up))
            throw Error('Graph Profile Asset UV frame scale requires finite valid basis.');
        const lengths=profile.map((p,i)=>{
            const next=profile[nextEdge[i]];
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
            const first=loopSeam(i),loopTotal=rings.length===1?total:loopLength(i,lengths);
            const rotated=sideIslandMode===0?
                (i>=first?prefix[i]-prefix[first]:
                    loopTotal-prefix[first]+prefix[i]):0;
            const u=rotated/uDenominator,finish=u+lengths[i]/uDenominator;
            if(!Number.isFinite(u)||!Number.isFinite(finish))
                throw Error('Graph Profile Asset UV frame U overflow.');
            start.push(u);end.push(finish);
        }
        return {start,end};
    }):null;
    // Keyed sections use their own edge lengths. Cache nominal UV by
    // polygon identity; metric frame/world U must evaluate every frame.
    const keyedUv=new Map<ReadonlyArray<Readonly<P2>>,{start:number[];end:number[]}>();
    const keyedMetric=worldUv||activeUV?.uFollowFrameScale===true;
    const keyedRingUV=keyed?.map((ring,fi)=>{
        const cached=keyedMetric?undefined:keyedUv.get(ring);
        if(cached)return cached;
        const f=frames[fi];
        const lengths=ring.map((p,i)=>{
            const q=ring[nextEdge[i]],dx=(q.x-p.x)*width,dy=(q.y-p.y)*height;
            let len=Math.hypot(dx,dy);
            if(keyedMetric){
                if(!Number.isFinite(f.widthFactor)||f.widthFactor<.0001||f.widthFactor>1000||
                   !isFinite3(f.right)||!isFinite3(f.up))
                    throw Error('Graph Profile Asset UV frame scale requires finite valid basis.');
                const tangent=add(mul(f.right,dx*f.widthFactor),mul(f.up,dy*f.widthFactor));
                len=length(worldUv?toWorld(tangent):tangent);
            }
            len*=uvWeights?.[i]??1;
            if(!Number.isFinite(len)||len<1e-8)
                throw Error('Graph Profile Asset UV keyed edge is degenerate.');
            return len;
        });
        const start:number[]=[],end:number[]=[];
        // Accumulate from each loop's seam. Weights/seam metadata is defined
        // only for the main outer contour, same as the static asset format.
        for(let base=0;base<bands;base=ringEnd[base]){
            const count=ringEnd[base]-base,first=loopSeam(base);
            const total=loopLength(base,lengths);
            let cursor=0;
            for(let j=0;j<count;j++){
                const i=base+(first-base+j)%count;
                const denom=activeUV?.uMetersPerRepeat??(sideIslandMode===0?total:lengths[i]);
                const u=sideIslandMode===0?cursor/denom:0;
                start[i]=u;
                cursor+=lengths[i];
                end[i]=sideIslandMode===0?cursor/denom:lengths[i]/denom;
                if(!Number.isFinite(start[i])||!Number.isFinite(end[i]))
                    throw Error('Graph Profile Asset UV keyed U overflow.');
            }
        }
        const uv={start,end};
        if(!keyedMetric)keyedUv.set(ring,uv);
        return uv;
    });
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
        const A=profile[j],B=profile[nextEdge[j]];
        const sideSample=(fi:number)=>{
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
            const ring=keyed?.[fi],a=ring?.[j]??A,b=ring?.[nextEdge[j]]??B;
            const edge=add(mul(f.right,(b.x-a.x)*width*f.widthFactor),
                mul(f.up,(b.y-a.y)*height*f.widthFactor));
            let longitudinal=f.forward;
            // For a section transition, use the neighboring edge midpoints to
            // account for cross-section slope. Constant sections keep legacy normals.
            if(keyed&&ring){
                const prev=fi===0?(closed?frames.length-2:0):fi-1;
                const next=fi===frames.length-1?(closed?1:fi):fi+1;
                const same=(other:ReadonlyArray<Readonly<P2>>)=>other===ring||
                    other.every((p,i)=>p.x===ring[i].x&&p.y===ring[i].y);
                if(!same(keyed[prev])||!same(keyed[next])){
                    const mid=(i:number)=>mul(add(at(frames[i],keyed[i][j]),at(frames[i],keyed[i][nextEdge[j]])),.5);
                    const p=mid(prev),q=mid(next);
                    longitudinal={x:q.x-p.x,y:q.y-p.y,z:q.z-p.z};
                }
            }
            const n=unit(mul(cross(edge,longitudinal),handedness));
            const uv=keyedRingUV?.[fi]??ringUV?.[fi];
            return {a:at(f,a),b:at(f,b),n,u0:uv?.start[j]??uvStart[j],u1:uv?.end[j]??uvEnd[j]};
        };
        if(sideIslandMode===2){
            for(let fi=0;fi<frames.length-1;fi++){
                const p=sideSample(fi),q=sideSample(fi+1);
                const v=(frames[fi+1].distance-frames[fi].distance)/uvMetersPerRepeat;
                if(!Number.isFinite(v)||v<0)
                    throw Error('Graph Profile Asset UV Quad Islands require ordered finite frames.');
                const a=push(p.a,p.n,p.u0,0),b=push(p.b,p.n,p.u1,0);
                const c=push(q.a,q.n,q.u0,v),d=push(q.b,q.n,q.u1,v);
                if(handedness>0)indices.push(a,b,c,b,d,c);
                else indices.push(a,c,b,b,c,d);
            }
            continue;
        }
        for(let fi=0;fi<frames.length;fi++){
            const p=sideSample(fi),v=frames[fi].distance/uvMetersPerRepeat;
            push(p.a,p.n,p.u0,v);push(p.b,p.n,p.u1,v);
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
            const capProfile=keyed?.[end===0?0:frames.length-1]??profile;
            const capTriangles=end===0?triangles:endTriangles;
            for(const point of capProfile)
                push(at(f,point),outward,point.x+.5,point.y+.5);
            const ccw=(end===1)===(handedness>0);
            for(let t=0;t<capTriangles.length;t+=3){
                const a=offset+capTriangles[t],b=offset+capTriangles[t+1],
                    c=offset+capTriangles[t+2];
                if(ccw)indices.push(a,b,c);
                else indices.push(a,c,b);
            }
        }
    }
    if(mapping){
        const sideSlots=parts.flatMap(part=>part.flatMap((loop,i)=>loop.map(()=>i===0?(mapping.outer??0):(mapping.inner??mapping.outer??0))));
        const slots:number[]=[];
        for(let j=0;j<bands;j++){
            const override=mapping.edgeSlots?.[j]??-1;
            const slot=override<0?sideSlots[j]:override;
            for(let i=0;i<2*(frames.length-1);i++)slots.push(slot);
        }
        for(let i=0;i<triangles.length/3;i++)slots.push(mapping.startCap??mapping.outer??0);
        for(let i=0;i<endTriangles.length/3;i++)slots.push(mapping.endCap??mapping.outer??0);
        if(slots.length!==indices.length/3)throw Error('Profile material triangle count mismatch.');
        // Triangle unwrap retains triangle order, only remaps vertex indices.
        result.triangleMaterialSlots=slots;
    }
    const triangleGroups=activeUV?.triangleUnwrap===true?
        unwrapProfileUvTriangles(result):null;
    if(activeUV?.atlasPacking===true){
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
            }else {
                let first=0;
                for(const ring of rings){
                    const count=ring.length*frames.length*2;
                    groups.push({firstVertex:first,vertexCount:count});first+=count;
                }
            }
            if(capEnds&&!closed){
                let first=sideVertices;
                for(let end=0;end<2;end++)for(const count of capParts){
                    groups.push({firstVertex:first,vertexCount:count});first+=count;
                }
            }
        }
        const priority=activeUV.atlasPriority;
        if(priority){
            // Side indices are emitted edge-major; each edge has two triangles
            // per span. Cap vertices/triangles follow all side geometry.
            const edgeDensity=parts.flatMap(part=>part.flatMap((ring,i)=>
                ring.map(()=>i===0?priority.outer:priority.inner)));
            const sideTriangleCount=bands*(frames.length-1)*2;
            let ringEdge=0;
            for(let i=0;i<groups.length;i++){
                const g=groups[i];
                if(triangleGroups)
                    g.density=i<sideTriangleCount?
                        edgeDensity[Math.floor(i/((frames.length-1)*2))]:priority.cap;
                else if(g.firstVertex>=sideVertices)g.density=priority.cap;
                else if(sideIslandMode===2)g.density=edgeDensity[Math.floor(i/(frames.length-1))];
                else if(sideIslandMode===1)g.density=edgeDensity[i];
                else{
                    g.density=edgeDensity[ringEdge];
                    ringEdge+=g.vertexCount/(frames.length*2);
                }
            }
        }
        packProfileUvAtlas(uvs,groups,activeUV.atlasPadding??.04,{
            rotate:activeUV.atlasRotate,pixelPadding:activeUV.atlasPixelPadding,
        });
    }
    return result;
}
