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
}
export interface RoadGeometry {positions:number[];normals:number[];uvs:number[];indices:number[];bands:number;ringCount:number}
interface CrossPoint {x:number;y:number}
const add=(a:V3,b:V3):V3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a:V3,b:V3):V3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const mul=(a:V3,n:number):V3=>({x:a.x*n,y:a.y*n,z:a.z*n});
const cross=(a:V3,b:V3):V3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const len=(a:V3):number=>Math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z);
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
function at(frame:RoadFrame,point:CrossPoint):V3 {
    return add(frame.position,add(mul(frame.right,point.x),mul(frame.up,point.y)));
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
    const bands=sections[0].length-(settings.thickness>0?0:1);
    out.bands=bands;
    const push=(p:V3,n:V3,u:number,v:number):void=>{positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);uvs.push(u,v);};
    for(let band=0;band<bands;band++){
        const first=positions.length/3;
        for(let i=0;i<frames.length;i++){
            const frame=frames[i],profile=sections[i];
            const a=profile[band],b=profile[(band+1)%profile.length];
            const pa=at(frame,a),pb=at(frame,b);
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
                push(at(f,p),n,uv[0],uv[1]);
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
