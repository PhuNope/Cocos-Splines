import {type MeshDataV2,buildMeshV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';

/** Planar road self-overlap resolver. No 3D Boolean or bridge/overpass welding. */
export interface RoadOverlapOptionsV2 {
    /** Full road width used to size a spatial acceleration grid. */
    readonly roadWidth:number;
    /** Maximum separation of overlapping surfaces along world Y. */
    readonly heightTolerance?:number;
    /** Non-horizontal faces (steep ramps, walls) are preserved untouched. */
    readonly minUpComponent?:number;
    /** Match wrapped UV0 phase to the retained sheet along new cut edges. Default true. */
    readonly stitchCutUV?:boolean;
}
export interface RoadOverlapReportV2 {
    readonly clippedSourceTriangles:number;
    readonly stitchedCutVertices:number;
    readonly removedSourceTriangles:number;
    readonly outputTriangles:number;
    readonly originalTriangles:number;
    readonly skippedNonplanarPairs:number;
    readonly hitSafetyLimit:boolean;
}
export interface RoadOverlapResultV2 {readonly mesh:MeshDataV2;readonly report:RoadOverlapReportV2;}
interface Vertex {
    x:number;y:number;z:number;u:number;v:number;u2:number;v2:number;
    nx:number;ny:number;nz:number;
}
interface Tri {
    readonly verts:readonly [Vertex,Vertex,Vertex];
    readonly minX:number;readonly maxX:number;readonly minZ:number;readonly maxZ:number;
    readonly minY:number;readonly maxY:number;readonly ny:number;
}
const cross2=(a:Vertex,b:Vertex,c:Vertex):number=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const area2=(a:ReadonlyArray<Vertex>):number=>{
    let sum=0;
    for(let i=0;i<a.length;i++){
        const p=a[i],q=a[(i+1)%a.length];sum+=p.x*q.z-q.x*p.z;
    }
    return sum*.5;
};
const interp=(a:Vertex,b:Vertex,t:number):Vertex=>{
    const lerp=(x:number,y:number)=>x+(y-x)*t;
    return {x:lerp(a.x,b.x),y:lerp(a.y,b.y),z:lerp(a.z,b.z),
        u:lerp(a.u,b.u),v:lerp(a.v,b.v),u2:lerp(a.u2,b.u2),v2:lerp(a.v2,b.v2),
        nx:lerp(a.nx,b.nx),ny:lerp(a.ny,b.ny),nz:lerp(a.nz,b.nz)};
};
const bounds=(a:readonly [Vertex,Vertex,Vertex]):Tri=>({
    verts:a,minX:Math.min(...a.map(v=>v.x)),maxX:Math.max(...a.map(v=>v.x)),
    minZ:Math.min(...a.map(v=>v.z)),maxZ:Math.max(...a.map(v=>v.z)),
    minY:Math.min(...a.map(v=>v.y)),maxY:Math.max(...a.map(v=>v.y)),
    ny:(a[0].ny+a[1].ny+a[2].ny)/3
});
const overlapBBox=(a:Tri,b:Tri,eps:number)=>
    Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX)>eps&&
    Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ)>eps;
function side(p:Vertex,a:Vertex,b:Vertex,sign:number):number {
    return sign*cross2(a,b,p);
}
/**
 * Half-plane clip of a convex input polygon. New vertices interpolate
 * UV0/UV2, normals and height; unchanged interior corners are reused.
 */
function half(poly:ReadonlyArray<Vertex>,a:Vertex,b:Vertex,sign:number,inside:boolean):Vertex[] {
    const out:Vertex[]=[];
    if(!poly.length)return out;
    let prev=poly[poly.length-1],sp=side(prev,a,b,sign);
    let was=inside?sp>=-1e-9:sp<=1e-9;
    for(const curr of poly){
        const sc=side(curr,a,b,sign),is=inside?sc>=-1e-9:sc<=1e-9;
        if(was!==is){
            const den=sp-sc,t=Math.abs(den)>1e-20?Math.max(0,Math.min(1,sp/den)):0;
            out.push(interp(prev,curr,t));
        }
        if(is)out.push(curr);
        prev=curr;sp=sc;was=is;
    }
    return out;
}
/** Clip one subject polygon to the inside of a candidate triangle. */
function intersection(poly:ReadonlyArray<Vertex>,candidate:Tri):Vertex[] {
    const v=candidate.verts,sign=Math.sign(cross2(v[0],v[1],v[2]));
    if(!sign)return [];
    let inside=Array.from(poly);
    for(let e=0;e<3&&inside.length>=3;e++)
        inside=half(inside,v[e],v[(e+1)%3],sign,true);
    return inside;
}
/** Difference against a candidate convex triangle, returning nonoverlapping pieces. */
/**
 * Sample the retained triangle's linear UV field in XZ. The clipping phase
 * must be matched modulo a whole tile, not by copying raw distance values:
 * doing the latter could stretch UV0 by tens of repetitions in a hairpin.
 * UV2 must never be modified here.
 */
function retainedUVAt(p:Vertex,tri:Tri):{u:number;v:number}|null {
    const [a,b,c]=tri.verts,den=cross2(a,b,c);
    if(Math.abs(den)<1e-12)return null;
    const wb=cross2(a,p,c)/den,wc=cross2(a,b,p)/den,wa=1-wb-wc;
    if(Math.min(wa,wb,wc)<-1e-5||Math.max(wa,wb,wc)>1+1e-5)return null;
    return {u:wa*a.u+wb*b.u+wc*c.u,v:wa*a.v+wb*b.v+wc*c.v};
}
function matchUVAtCut(p:Vertex,tri:Tri,phase:{u:number;v:number}):Vertex {
    const retained=retainedUVAt(p,tri);
    if(!retained)return p;
    const verts=tri.verts;
    // Only correct NEW cut-border vertices. Source vertices and interior
    // vertices retain their spline-distance UVs, like the legacy Road.
    let onEdge=false;
    for(let i=0;i<3;i++){
        const a=verts[i],b=verts[(i+1)%3];
        const length=Math.hypot(b.x-a.x,b.z-a.z);
        if(length>1e-10&&Math.abs(cross2(a,b,p))/length<2e-5){onEdge=true;break;}
    }
    if(!onEdge)return p;
    // Use ONE integer offset for the whole clipped seam. Rounding at each
    // endpoint separately breaks continuity between them when the relative
    // UV phase traverses half a tile along an edge.
    return {...p,u:retained.u+phase.u,v:retained.v+phase.v};
}
/** Difference against a candidate convex triangle, returning nonoverlapping pieces. */
function subtract(poly:ReadonlyArray<Vertex>,candidate:Tri,epsilonArea:number,
    stitchUV:boolean,phase:{u:number;v:number}):Vertex[][] {
    const clip=candidate.verts,sign=Math.sign(cross2(clip[0],clip[1],clip[2]));
    if(!sign)return [Array.from(poly)];
    let rest=Array.from(poly);
    const outside:Vertex[][]=[];
    for(let e=0;e<3&&rest.length>=3;e++){
        const next=half(rest,clip[e],clip[(e+1)%3],sign,false);
        if(next.length>=3&&Math.abs(area2(next))>epsilonArea)
            outside.push(stitchUV?next.map(p=>matchUVAtCut(p,candidate,phase)):next);
        const remaining=half(rest,clip[e],clip[(e+1)%3],sign,true);
        // Outside fragments and the still-clipped interior share the very
        // same new border. Correct BOTH sides of that temporary split so
        // subsequent outside fragments do not inherit a UV discontinuity.
        rest=stitchUV?remaining.map(p=>matchUVAtCut(p,candidate,phase)):remaining;
    }
    return outside;
}
function heightAt(x:number,z:number,tri:Tri):number {
    const [a,b,c]=tri.verts,den=cross2(a,b,c);
    if(Math.abs(den)<1e-14)return NaN;
    const bWeight=((x-a.x)*(c.z-a.z)-(z-a.z)*(c.x-a.x))/den;
    const cWeight=((b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x))/den;
    return a.y+(b.y-a.y)*bWeight+(c.y-a.y)*cWeight;
}
function normalDot(a:Tri,b:Tri):number {
    const va=a.verts,vb=b.verts;
    const n=(t:readonly [Vertex,Vertex,Vertex])=>{
        let x=0,y=0,z=0;
        for(const p of t){x+=p.nx;y+=p.ny;z+=p.nz;}
        const len=Math.hypot(x,y,z)||1;
        return {x:x/len,y:y/len,z:z/len};
    };
    const aa=n(va),bb=n(vb);
    return aa.x*bb.x+aa.y*bb.y+aa.z*bb.z;
}
/**
 * Union of near-coplanar triangle sheets by first-wins polygon subtraction.
 *
 * Unlike merely culling back-facing triangles, this prevents distant portions
 * of the SAME road from drawing over each other in a flat U-turn. UV0 and UV2
 * are interpolated at cut edges. When stitchCutUV=true, the losing face's
 * border UV0 is phase-matched (modulo Repeat) to the winning face of the SAME
 * material. This avoids an arbitrary texture discontinuity at the cut, but
 * cannot connect road markings on branches whose directions genuinely diverge.
 * UV2 is never phase-adjusted. Shoulder/curb mesh groups retain slots.
 *
 * Vertical walls, steep/rolled roads, overpasses and distinct-height sheets
 * are not welded. Always use a junction/CSG tool for genuinely crossed roads.
 * A spatial hash, triangle cap and polygon cap keep Editor calls bounded.
 */
export function resolveRoadOverlapV2(mesh:MeshDataV2,options:RoadOverlapOptionsV2):RoadOverlapResultV2 {
    const width=options.roadWidth,heightTol=options.heightTolerance??.025,upMin=options.minUpComponent??.85;
    if(!Number.isFinite(width)||width<=0||!Number.isFinite(heightTol)||heightTol<0||
       !Number.isFinite(upMin)||upMin<0||upMin>1)
        throw new Error('Invalid Road overlap resolution options');
    const total=mesh.triangleCount;
    const empty={clippedSourceTriangles:0,stitchedCutVertices:0,removedSourceTriangles:0,outputTriangles:total,
        originalTriangles:total,skippedNonplanarPairs:0,hitSafetyLimit:false};
    if(total<2)return {mesh,report:empty};
    if(total>24000)return {mesh,report:{...empty,hitSafetyLimit:true}};
    const pts=mesh.positions,normals=mesh.normals,uv=mesh.uv0,uv2=mesh.uv2;
    const point=(i:number):Vertex=>({
        // Clip in the precision actually submitted to the GPU.
        x:pts[3*i],y:pts[3*i+1],z:pts[3*i+2],
        u:uv[2*i],v:uv[2*i+1],u2:uv2?uv2[2*i]:0,v2:uv2?uv2[2*i+1]:0,
        nx:normals[3*i],ny:normals[3*i+1],nz:normals[3*i+2]
    });
    const cell=Math.max(.1,width),areaEps=Math.max(1e-11,width*width*1e-10);
    const buckets=new Map<string,number[]>();
    const originals:Tri[]=[];
    const originalSlots:number[]=[];
    const finalPieces:{poly:Vertex[];slot:number}[]=[];
    let clipped=0,removed=0,nonplanar=0,limitHit=false,stitched=0;
    let visits=0;
    outer:for(const sub of mesh.submeshes)for(let k=0;k<sub.indices.length;k+=3){
        const indices=sub.indices,tri=bounds([point(indices[k]),point(indices[k+1]),point(indices[k+2])]);
        const originalId=originals.length;
        const x0=Math.floor(tri.minX/cell),x1=Math.floor(tri.maxX/cell);
        const z0=Math.floor(tri.minZ/cell),z1=Math.floor(tri.maxZ/cell);
        // Limit cell coverage for huge triangles or pathological coordinates.
        if(!Number.isSafeInteger(x0)||!Number.isSafeInteger(x1)||!Number.isSafeInteger(z0)||!Number.isSafeInteger(z1)||
           (x1-x0+1)*(z1-z0+1)>256){limitHit=true;break outer;}
        let parts:Vertex[][]=[Array.from(tri.verts)];
        let changed=false;
        if(Math.abs(tri.ny)>=upMin&&Math.abs(area2(parts[0]))>areaEps){
            const candidates=new Set<number>();
            for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
                for(const id of buckets.get(x+':'+z)||[])candidates.add(id);
            }
            if(candidates.size>600){limitHit=true;break outer;}
            for(const id of candidates){
                const other=originals[id];
                if(Math.abs(other.ny)<upMin||!overlapBBox(tri,other,1e-8))continue;
                if(normalDot(tri,other)<.985){nonplanar++;continue;}
                if(tri.minY>other.maxY+heightTol||other.minY>tri.maxY+heightTol)continue;
                const overlap=intersection(tri.verts,other);
                if(overlap.length<3||Math.abs(area2(overlap))<=areaEps)continue;
                const xx=overlap.reduce((sum,v)=>sum+v.x,0)/overlap.length;
                const zz=overlap.reduce((sum,v)=>sum+v.z,0)/overlap.length;
                const delta=Math.abs(heightAt(xx,zz,tri)-heightAt(xx,zz,other));
                if(!Number.isFinite(delta)||delta>heightTol)continue;
                const next:Vertex[][]=[];
                const sameMaterial=options.stitchCutUV!==false&&sub.materialSlot===originalSlots[id];
                const midpoint={...overlap[0],x:xx,z:zz};
                const candidateUV=retainedUVAt(midpoint,other);
                const sourceUV=retainedUVAt(midpoint,tri);
                const enabled=!!(sameMaterial&&candidateUV&&sourceUV);
                const phase={u:enabled?Math.round(sourceUV!.u-candidateUV!.u):0,
                    v:enabled?Math.round(sourceUV!.v-candidateUV!.v):0};
                for(const piece of parts){
                    if(piece.length<3||Math.abs(area2(piece))<=areaEps)continue;
                    const slices=subtract(piece,other,areaEps,enabled,phase);
                    if(enabled){
                        for(const slice of slices)for(const point of slice){
                            // Report is diagnostic only; count unique-ish edited
                            // cut vertices by comparing against original source UV.
                            const original=retainedUVAt(point,tri);
                            if(original&&Math.abs(point.u-original.u)+Math.abs(point.v-original.v)>1e-5)
                                stitched++;
                        }
                    }
                    next.push(...slices);
                }
                const oldArea=parts.reduce((sum,p)=>sum+Math.abs(area2(p)),0);
                const newArea=next.reduce((sum,p)=>sum+Math.abs(area2(p)),0);
                if(oldArea-newArea>areaEps){
                    parts=next;changed=true;
                    if(!parts.length)break;
                }
                if(++visits>200000){limitHit=true;break outer;}
            }
        }
        if(changed){clipped++;if(!parts.length)removed++;}
        for(const poly of parts)if(poly.length>=3&&Math.abs(area2(poly))>areaEps)
            finalPieces.push({poly,slot:sub.materialSlot});
        originals.push(tri);
        originalSlots.push(sub.materialSlot);
        for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
            const key=x+':'+z,existing=buckets.get(key);
            if(existing)existing.push(originalId);else buckets.set(key,[originalId]);
        }
        if(finalPieces.length>100000){limitHit=true;break outer;}
    }
    if(limitHit)return {mesh,report:{...empty,skippedNonplanarPairs:nonplanar,hitSafetyLimit:true}};
    if(!clipped)return {mesh,report:{...empty,skippedNonplanarPairs:nonplanar}};
    if(options.stitchCutUV!==false){
        // Triangle clipping and local joins duplicate vertices across polygon
        // pieces. Retain first-surface UV0 on their shared boundary, modulo
        // whole texture tiles. Do not weld positions/normals or touch UV2.
        const owner=new Map<string,{u:number;v:number}>();
        for(const {poly,slot} of finalPieces)for(const vertex of poly){
            const key=slot+':'+[vertex.x,vertex.y,vertex.z]
                .map(n=>Math.fround(n).toFixed(5)).join(':');
            const first=owner.get(key);
            if(first){
                const u=first.u+Math.round(vertex.u-first.u);
                const v=first.v+Math.round(vertex.v-first.v);
                if(Math.abs(u-vertex.u)+Math.abs(v-vertex.v)>1e-6){
                    vertex.u=u;vertex.v=v;stitched++;
                }
            }else owner.set(key,{u:vertex.u,v:vertex.v});
        }
    }
    const positions:Vec3MeshV2[]=,uv0:Vec2MeshV2[]=[],secondary:Vec2MeshV2[]=[],outNormals:Vec3MeshV2[]=[];
    const groups=new Map<number,number[]>();
    for(const item of finalPieces){
        let indices=groups.get(item.slot);
        if(!indices){indices=[];groups.set(item.slot,indices);}
        const poly=item.poly;
        // Preserve polygon winding. Invalid zero-area Float32 triangles are omitted.
        for(let k=1;k+1<poly.length;k++){
            const triangle=[poly[0],poly[k],poly[k+1]];
            const cross=(a:Vertex,b:Vertex,c:Vertex)=>{
                const aa={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
                const bb={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
                return {x:aa.y*bb.z-aa.z*bb.y,y:aa.z*bb.x-aa.x*bb.z,z:aa.x*bb.y-aa.y*bb.x};
            };
            const area=cross(triangle[0],triangle[1],triangle[2]);
            const dot=area.x*triangle[0].nx+area.y*triangle[0].ny+area.z*triangle[0].nz;
            if(!Number.isFinite(dot)||dot<=1e-12)continue;
            for(const v of triangle){
                indices.push(positions.length);
                positions.push({x:v.x,y:v.y,z:v.z});
                uv0.push({x:v.u,y:v.v});
                secondary.push({x:v.u2,y:v.v2});
                outNormals.push({x:v.nx,y:v.ny,z:v.nz});
            }
        }
    }
    const submeshes=Array.from(groups.entries()).filter(([,idx])=>idx.length>0)
        .map(([materialSlot,indices])=>({materialSlot,indices}));
    if(!submeshes.length)return {mesh,report:{...empty,hitSafetyLimit:true}};
    const result=buildMeshV2({positions,uv0,uv2:uv2?secondary:undefined,normals:outNormals,submeshes});
    return {mesh:result,report:{clippedSourceTriangles:clipped,stitchedCutVertices:stitched,removedSourceTriangles:removed,
        outputTriangles:result.triangleCount,originalTriangles:total,
        skippedNonplanarPairs:nonplanar,hitSafetyLimit:false}};
}
