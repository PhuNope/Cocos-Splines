/** Dependency-free road cross-section tessellator. Units are world units.
 *  A frame may contain non-unit right/up/forward vectors after inverse model transform;
 *  this deliberately preserves correct geometry for non-uniform renderer scaling.
 *  Separate vertex pairs per profile edge give curbs hard-edged normals.
 */
export interface V3 {x:number;y:number;z:number}
export interface RoadFrame {position:V3;forward:V3;right:V3;up:V3;distance:number}
/** Which UV channel receives distance traveled along the spline.
 *  Old scenes keep LengthAlongV; LengthAlongU supports horizontal road textures.
 */
export enum RoadUvDirection {LengthAlongV=0,LengthAlongU=1}
/** How the road handles corners. Legacy preserves existing scenes; JoinAndTrim
 * miters the outside of the turn and compresses the inside before it folds.
 * This is a local ribbon join, not a 3D Boolean union for intersecting roads. */
export enum RoadCornerMode {Legacy=0,JoinAndTrim=1}
export interface RoadSettings {
    width:number;endWidth:number;shoulderWidth:number;shoulderDrop:number;
    curbWidth:number;curbHeight:number;thickness:number;capEnds:boolean;
    uvLength:number;startProgress:number;endProgress:number;
    /** Optional UV controls; omitted fields retain the original mapping. */
    uvDirection?:RoadUvDirection;
    uvWidthTiles?:number;
    uvReverseAcross?:boolean;
    uvReverseLength?:boolean;
    uvOffsetU?:number;
    uvOffsetV?:number;
    /** Optional width multiplier sampled per frame. */
    widthAt?:(index:number,total:number)=>number;
    /** Optional correction for tight bends, disabled by default for old scenes. */
    cornerMode?:RoadCornerMode;
    /** Fraction of local bend radius left clear of the trimmed inside edge. */
    cornerTrimSafety?:number;
}
export interface RoadGeometry {positions:number[];normals:number[];uvs:number[];indices:number[];bands:number;ringCount:number}
interface CrossPoint {x:number;y:number}
const add=(a:V3,b:V3):V3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a:V3,b:V3):V3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const mul=(a:V3,n:number):V3=>({x:a.x*n,y:a.y*n,z:a.z*n});
const cross=(a:V3,b:V3):V3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const len=(a:V3):number=>Math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z);
const dot=(a:V3,b:V3):number=>a.x*b.x+a.y*b.y+a.z*b.z;
const clamp=(v:number,lo:number,hi:number):number=>Math.min(hi,Math.max(lo,v));
const norm=(v:V3):V3=>{const l=len(v);return l>1e-10?mul(v,1/l):{x:0,y:1,z:0};};
const finite=(v:number,def:number):number=>Number.isFinite(v)?v:def;
const positive=(v:number,def:number):number=>Math.max(0,finite(v,def));
export function crossSection(width:number,settings:RoadSettings):CrossPoint[]{
    const h=Math.max(.025,finite(width,6))/2;
    const shoulder=positive(settings.shoulderWidth,0);
    const drop=positive(settings.shoulderDrop,0);
    const curb=positive(settings.curbWidth,0);
    const curbHeight=positive(settings.curbHeight,0);
    const edge=h+shoulder;
    const profile:CrossPoint[]=[];
    if(curb>.000001&&curbHeight>.000001){
        profile.push({x:-edge-curb,y:curbHeight},{x:-edge,y:curbHeight});
    }
    if(shoulder>0)profile.push({x:-edge,y:-drop});
    profile.push({x:-h,y:0},{x:h,y:0});
    if(shoulder>0)profile.push({x:edge,y:-drop});
    if(curb>.000001&&curbHeight>.000001){
        profile.push({x:edge,y:curbHeight},{x:edge+curb,y:curbHeight});
    }
    // `thickness` closes the road's sides and underside; 0 leaves a surface strip.
    if(settings.thickness>0){
        const outer=curb>.000001&&curbHeight>.000001?edge+curb:edge;
        const bottom=-Math.max(.005,finite(settings.thickness,.2),drop+.005);
        profile.push({x:outer,y:bottom},{x:-outer,y:bottom});
    }
    return profile;
}
interface CornerFrame {right:V3;insideSign:number;insideLimit:number}
/** Prepare local polyline joins for ribbon-shaped roads, without touching the
 * frame input. Using the actual adjacent chord directions makes a miter at a
 * sharp corner (filling the outside and cutting the inside). On a bend whose
 * radius is smaller than the road half-width, a smooth monotone saturation of
 * inner X prevents the offset curve from reversing and overlapping itself.
 * Across/longitudinal UVs remain tied to the untrimmed source profile.
 */
export function buildRoadCornerFrames(frames:RoadFrame[],settings:RoadSettings,closed=false):CornerFrame[] {
    const result:CornerFrame[]=frames.map(frame=>({right:frame.right,insideSign:0,insideLimit:Infinity}));
    if(settings.cornerMode!==RoadCornerMode.JoinAndTrim || frames.length<3)return result;
    const last=frames.length-1;
    const loop=closed&&len(sub(frames[0].position,frames[last].position))<1e-4;
    const safety=clamp(finite(settings.cornerTrimSafety??.93,.93),.5,.99);
    for(let i=loop?0:1;i<(loop?last:last);i++){
        const prev=frames[i===0?last-1:i-1],here=frames[i],next=frames[i+1];
        // Project the path chords into the road plane. A pitch-only change
        // should not create a spurious lateral miter or trim.
        const up=norm(here.up);
        const a=sub(here.position,prev.position),b=sub(next.position,here.position);
        const project=(v:V3):V3=>sub(v,mul(up,dot(v,up)));
        const pa=project(a),pb=project(b),la=len(pa),lb=len(pb);
        if(la<1e-7||lb<1e-7)continue;
        const ta=mul(pa,1/la),tb=mul(pb,1/lb);
        const cosa=clamp(dot(ta,tb),-1,1),angle=Math.acos(cosa);
        if(angle<1e-5||angle>Math.PI-.1)continue;
        const ra=norm(cross(up,ta)),rb=norm(cross(up,tb));
        if(dot(ra,here.right)<=0||dot(rb,here.right)<=0)continue;
        const bisector=add(ra,rb),bisectorLength=len(bisector);
        if(bisectorLength<1e-5)continue;
        const miterUnit=mul(bisector,1/bisectorLength);
        const divisor=dot(miterUnit,ra);
        if(divisor<.05)continue;
        // Limiting extraordinary spikes is essential on near-hairpin turns.
        // In that case the join is an approximation; the road cannot be made
        // collision-free without a true planar/volumetric Boolean cut.
        const miterLength=Math.min(3,1/divisor);
        const miterRight=mul(miterUnit,miterLength*len(here.right));
        const signedBend=dot(cross(ta,tb),up);
        const bendRadius=(la+lb)*.25/Math.max(1e-7,Math.sin(angle*.5));
        const maxInner=bendRadius*safety/(len(miterRight)||1);
        result[i]={right:miterRight,insideSign:Math.abs(signedBend)>1e-8?(signedBend>0?1:-1):0,
            insideLimit:Math.max(1e-5,maxInner)};
    }
    if(loop)result[last]=result[0];
    else if(last>=2){
        // A curved path may start/end inside a tight bend. Without endpoint
        // trimming, the first/last triangle can still fold over even though
        // all middle samples were corrected.
        result[0]={...result[1],right:frames[0].right};
        result[last]={...result[last-1],right:frames[last].right};
    }
    return result;
}
/** Clamp only the inside of a turn, without collapsing adjacent profile bands
 * onto the same vertex. The exponential tail is C1 continuous at 70% of the
 * radius and strictly increasing, so the surface remains triangulatable. */
export function cornerProfileX(x:number,corner:CornerFrame):number {
    if(!corner.insideSign || x*corner.insideSign<=0 || !Number.isFinite(corner.insideLimit))return x;
    const value=Math.abs(x),max=corner.insideLimit,threshold=max*.7;
    if(value<=threshold)return x;
    const tail=max-threshold;
    return corner.insideSign*(threshold+tail*(1-Math.exp(-(value-threshold)/tail)));
}
function at(frame:RoadFrame,point:CrossPoint,corner?:CornerFrame):V3 {
    const x=corner?cornerProfileX(point.x,corner):point.x;
    return add(frame.position,add(mul(corner?.right||frame.right,x),mul(frame.up,point.y)));
}
function signedArea(points:CrossPoint[]):number {
    let area=0;for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y;
    }return area*.5;
}
/** Ear clipping triangulation of a simple road cross-section (may have concave curbs). */
export function capTriangles(polygon:CrossPoint[]):number[][]{
    const idx=polygon.map((_,i)=>i),result:number[][]=[];
    const ccw=signedArea(polygon)>0;
    let guard=0;
    const det=(a:CrossPoint,b:CrossPoint,c:CrossPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    while(idx.length>2&&guard++<200){
        let clipped=false;
        for(let p=0;p<idx.length;p++){
            const ia=idx[(p-1+idx.length)%idx.length],ib=idx[p],ic=idx[(p+1)%idx.length];
            const a=polygon[ia],b=polygon[ib],c=polygon[ic];
            if((ccw?1:-1)*det(a,b,c)<=1e-10)continue;
            let contains=false;
            for(const j of idx){if(j===ia||j===ib||j===ic)continue;
                const q=polygon[j],d0=det(a,b,q),d1=det(b,c,q),d2=det(c,a,q);
                if(ccw?d0>=-1e-9&&d1>=-1e-9&&d2>=-1e-9:d0<=1e-9&&d1<=1e-9&&d2<=1e-9){contains=true;break;}
            }
            if(contains)continue;
            result.push([ia,ib,ic]);idx.splice(p,1);clipped=true;break;
        }
        if(!clipped)break;
    }
    return result;
}
/** Maps cross-road 0..1 and longitudinal tile distance onto the source texture axes.
 *  The longitudinal coordinate remains continuous across spline curves.
 */
export function roadUV(across:number,lengthTiles:number,settings:RoadSettings):[number,number] {
    const widthTiles=Math.max(.001,finite(settings.uvWidthTiles??1,1));
    let acrossUV=across*widthTiles;
    let lengthUV=lengthTiles;
    if(settings.uvReverseAcross)acrossUV=widthTiles-acrossUV;
    if(settings.uvReverseLength)lengthUV=-lengthUV;
    const offsetU=finite(settings.uvOffsetU??0,0),offsetV=finite(settings.uvOffsetV??0,0);
    if(settings.uvDirection===RoadUvDirection.LengthAlongU)return [lengthUV+offsetU,acrossUV+offsetV];
    return [acrossUV+offsetU,lengthUV+offsetV];
}
export function buildRoadGeometry(frames:RoadFrame[],settings:RoadSettings,closed=false):RoadGeometry {
    const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
    const out:RoadGeometry={positions,normals,uvs,indices,bands:0,ringCount:frames.length};
    if(frames.length<2)return out;
    const valid=frames.every(f=>Number.isFinite(f.distance)&&[f.position,f.forward,f.right,f.up].every(v=>[v.x,v.y,v.z].every(Number.isFinite)));
    if(!valid)return out;
    const span=Math.max(0,finite(settings.endProgress,1)-finite(settings.startProgress,0));
    const length=Math.max(.001,finite(settings.uvLength,5));
    const tapered=settings.endWidth>0;
    const widths=frames.map((_,i)=>Math.max(.05,(finite(settings.width,6)+(tapered?settings.endWidth-settings.width:0)*i/(frames.length-1))*
        Math.max(.01,finite(settings.widthAt?.(i,frames.length)??1,1))));
    const sections=widths.map(w=>crossSection(w,settings));
    const corners=buildRoadCornerFrames(frames,settings,closed);
    const bands=sections[0].length-(settings.thickness>0?0:1);
    out.bands=bands;
    const push=(p:V3,n:V3,u:number,v:number):void=>{positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);uvs.push(u,v);};
    for(let band=0;band<bands;band++){
        const first=positions.length/3;
        for(let i=0;i<frames.length;i++){
            const frame=frames[i],profile=sections[i];
            const a=profile[band],b=profile[(band+1)%profile.length];
            const pa=at(frame,a,corners[i]),pb=at(frame,b,corners[i]);
            const across=sub(pb,pa);
            // For local +Z travel, forward x across (+X) is +Y (top-facing).
            const n=norm(cross(frame.forward,across));
            const overallHalf=widths[i]/2+positive(settings.shoulderWidth,0)+positive(settings.curbWidth,0);
            const ua=(a.x+overallHalf)/(2*overallHalf),ub=(b.x+overallHalf)/(2*overallHalf);
            const v=frame.distance/length;
            const uvA=roadUV(ua,v,settings),uvB=roadUV(ub,v,settings);
            push(pa,n,uvA[0],uvA[1]);push(pb,n,uvB[0],uvB[1]);
        }
        for(let i=0;i<frames.length-1;i++){
            const a=first+i*2,b=a+2;
            indices.push(a,b,a+1,a+1,b,b+1);
        }
    }
    // No cap on closed-loop roads; front/back ends are coincident.
    if(settings.capEnds&&settings.thickness>0&&!closed&&span>0){
        for(let side=0;side<2;side++){
            const f=frames[side===0?0:frames.length-1],profile=sections[side===0?0:sections.length-1];
            const tris=capTriangles(profile),base=positions.length/3;
            // At start (local travel points forward), outside normal is -forward.
            const n=norm(mul(f.forward,side===0?-1:1));
            const extent=widths[side===0?0:widths.length-1]/2+positive(settings.shoulderWidth,0)+positive(settings.curbWidth,0);
            for(const p of profile){
                const uv=roadUV((p.x+extent)/(2*extent),p.y,settings);
                push(at(f,p,corners[side===0?0:corners.length-1]),n,uv[0],uv[1]);
            }
            // 2-D profile is clockwise when viewed along +Z. +Z travel means
            // desired end cap is +Z and start cap -Z.
            const profileCCW=signedArea(profile)>0;
            for(const tri of tris){
                const [a,b,c]=tri.map(k=>k+base);
                if((side===1)===profileCCW)indices.push(a,b,c);
                else indices.push(a,c,b);
            }
        }
    }
    return out;
}
