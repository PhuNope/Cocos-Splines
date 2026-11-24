/** Engine-agnostic WORLD triangle mesh proximity, no Cocos Physics dependency.
 * Opt-in, bounded static geometry. Vertices and indices are copied once into
 * immutable triangles and a median-split AABB BVH. Double-sided contacts.
 */
import {sweptSphereCapsuleEntry,type ProximityVec3,type ProximityAabb} from './SplineProximityShapes';

type V=ProximityVec3;
interface Triangle { readonly a:V;readonly b:V;readonly c:V;
    readonly min:V;readonly max:V;readonly centroid:V; }
interface Node { readonly min:V; readonly max:V; readonly left?:Node;
    readonly right?:Node; readonly triangles?:readonly Triangle[]; }
export interface ProximityTriangleMesh {
    readonly root:Node;
    readonly bounds:ProximityAabb;
    readonly triangleCount:number;
}
export interface ProximityMeshSweepMetrics {
    triangleTests:number;
    visitedNodes:number;
}
const finite=(n:number)=>Number.isFinite(n);
const point=(v:V)=>!!v&&finite(v.x)&&finite(v.y)&&finite(v.z)&&
    Math.abs(v.x)<=1e6&&Math.abs(v.y)<=1e6&&Math.abs(v.z)<=1e6;
const vec=(x:number,y:number,z:number):V=>({x,y,z});
const sub=(a:V,b:V)=>vec(a.x-b.x,a.y-b.y,a.z-b.z);
const dot=(a:V,b:V)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:V,b:V)=>vec(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const min=(a:V,b:V)=>vec(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.min(a.z,b.z));
const max=(a:V,b:V)=>vec(Math.max(a.x,b.x),Math.max(a.y,b.y),Math.max(a.z,b.z));
const frozen=(v:V):V=>Object.freeze({...v});
function inside(p:V,a:V,b:V,c:V,n:V,norm2:number):boolean{
    const tolerance=norm2*1e-10;
    return dot(cross(sub(b,a),sub(p,a)),n)>=-tolerance&&
        dot(cross(sub(c,b),sub(p,b)),n)>=-tolerance&&
        dot(cross(sub(a,c),sub(p,c)),n)>=-tolerance;
}
function segmentDistance2(p:V,a:V,b:V):number{
    const v=sub(b,a),w=sub(p,a),vv=dot(v,v);
    const t=vv>0?Math.max(0,Math.min(1,dot(w,v)/vv)):0;
    const d=vec(w.x-v.x*t,w.y-v.y*t,w.z-v.z*t);
    return dot(d,d);
}
function triangleDistance2(p:V,a:V,b:V,c:V):number{
    const n=cross(sub(b,a),sub(c,a)),nn=dot(n,n);
    if(nn>1e-24){
        const d=dot(sub(p,a),n)/nn;
        const q=vec(p.x-n.x*d,p.y-n.y*d,p.z-n.z*d);
        if(inside(q,a,b,c,n,nn))return d*d*nn;
    }
    return Math.min(segmentDistance2(p,a,b),segmentDistance2(p,b,c),
        segmentDistance2(p,c,a));
}
/** Earliest contact of a linear swept sphere with a DOUBLE-SIDED triangle.
 * Plane-face contacts + rounded segment-edge/vertex contacts. Degenerate
 * triangles are safely treated as their surviving edge segments. */
export function sweptSphereTriangleEntry(start:V,end:V,a:V,b:V,c:V,radius:number):number|null{
    if(!point(start)||!point(end)||!point(a)||!point(b)||!point(c)||
       !finite(radius)||radius<=0||radius>200)
        throw Error('Invalid swept sphere/triangle query.');
    if(triangleDistance2(start,a,b,c)<=radius*radius+1e-12)return 0;
    let first=Infinity;
    // Reuse the exact cylinder + hemispheres sweep. Splitting the moving
    // radius avoids the capsule API's nonzero own-radius requirement.
    const edgeRadius=radius/2;
    for(const [u,v] of [[a,b],[b,c],[c,a]]){
        const t=sweptSphereCapsuleEntry(start,end,{a:u,b:v,radius:edgeRadius},edgeRadius);
        if(t!==null&&t<first)first=t;
    }
    const n=cross(sub(b,a),sub(c,a)),nn=dot(n,n);
    if(nn>1e-24){
        const length=Math.sqrt(nn),normal=vec(n.x/length,n.y/length,n.z/length);
        const velocity=sub(end,start),speed=dot(velocity,normal),d=dot(sub(start,a),normal);
        if(Math.abs(speed)>1e-15){
            for(const side of [-1,1]){
                const t=(side*radius-d)/speed;
                if(t<0||t>1||t>=first)continue;
                const contact=vec(start.x+velocity.x*t-normal.x*side*radius,
                    start.y+velocity.y*t-normal.y*side*radius,
                    start.z+velocity.z*t-normal.z*side*radius);
                if(inside(contact,a,b,c,n,nn))first=t;
            }
        }
    }
    return first<Infinity?first:null;
}
function triangle(a:V,b:V,c:V):Triangle{
    const lo=min(min(a,b),c),hi=max(max(a,b),c);
    return Object.freeze({a:frozen(a),b:frozen(b),c:frozen(c),
        min:frozen(lo),max:frozen(hi),centroid:frozen(vec(
            (a.x+b.x+c.x)/3,(a.y+b.y+c.y)/3,(a.z+b.z+c.z)/3))});
}
function buildTree(triangles:Triangle[]):Node{
    let lo=vec(Infinity,Infinity,Infinity),hi=vec(-Infinity,-Infinity,-Infinity);
    for(const tri of triangles){lo=min(lo,tri.min);hi=max(hi,tri.max);}
    if(triangles.length<=8)return Object.freeze({min:frozen(lo),max:frozen(hi),
        triangles:Object.freeze(triangles.slice())});
    const extent=sub(hi,lo),axis: keyof V=extent.x>=extent.y&&extent.x>=extent.z?'x':
        extent.y>=extent.z?'y':'z';
    triangles.sort((a,b)=>a.centroid[axis]-b.centroid[axis]);
    const mid=Math.floor(triangles.length/2);
    return Object.freeze({min:frozen(lo),max:frozen(hi),
        left:buildTree(triangles.slice(0,mid)),right:buildTree(triangles.slice(mid))});
}
/** Build once for static WORLD triangles. Max 65,536 vertices and 16,384
 * triangles per registered mesh; split larger maps into independent chunks.
 * Returned graph is frozen, including vertices, leaves and BVH nodes. */
export function buildProximityTriangleMesh(vertices:readonly V[],
    indices:readonly number[]):ProximityTriangleMesh {
    if(!Array.isArray(vertices)||vertices.length<3||vertices.length>65536||
       !Array.isArray(indices)||indices.length<3||indices.length%3!==0||
       indices.length>16384*3)
        throw Error('Invalid proximity mesh size.');
    const triangles:Triangle[]=[];
    for(let i=0;i<indices.length;i+=3){
        const k=[indices[i],indices[i+1],indices[i+2]];
        if(k.some(x=>!Number.isInteger(x)||x<0||x>=vertices.length))
            throw Error('Invalid proximity mesh indices.');
        const [a,b,c]=k.map(x=>vertices[x]);
        if(!point(a)||!point(b)||!point(c))
            throw Error('Invalid proximity mesh vertices.');
        triangles.push(triangle(a,b,c));
    }
    const root=buildTree(triangles);
    return Object.freeze({root,bounds:Object.freeze({
        min:root.min,max:root.max}),triangleCount:triangles.length});
}
function overlaps(minA:V,maxA:V,minB:V,maxB:V):boolean{
    return minA.x<=maxB.x&&maxA.x>=minB.x&&
        minA.y<=maxB.y&&maxA.y>=minB.y&&
        minA.z<=maxB.z&&maxA.z>=minB.z;
}
/** BVH-pruned first contact. The moving radius includes any safety gap.
 * The mesh is stationary; moving/reoriented meshes must be rebuilt/registered.
 * metrics is optional and records actual narrowphase triangle tests. */
export function sweptSphereMeshEntry(start:V,end:V,mesh:ProximityTriangleMesh,
    radius:number,metrics?:ProximityMeshSweepMetrics):number|null{
    if(!point(start)||!point(end)||!mesh?.root||!finite(radius)||
       radius<=0||radius>200)throw Error('Invalid swept sphere/mesh query.');
    const lo=vec(Math.min(start.x,end.x)-radius,Math.min(start.y,end.y)-radius,
        Math.min(start.z,end.z)-radius);
    const hi=vec(Math.max(start.x,end.x)+radius,Math.max(start.y,end.y)+radius,
        Math.max(start.z,end.z)+radius);
    if(!overlaps(lo,hi,mesh.root.min,mesh.root.max))return null;
    let first=Infinity;
    const stack:Node[]=[mesh.root];
    while(stack.length){
        const node=stack.pop()!;
        if(metrics)metrics.visitedNodes++;
        if(!overlaps(lo,hi,node.min,node.max))continue;
        if(node.triangles){
            for(const tri of node.triangles){
                if(!overlaps(lo,hi,tri.min,tri.max))continue;
                if(metrics)metrics.triangleTests++;
                const t=sweptSphereTriangleEntry(start,end,tri.a,tri.b,tri.c,radius);
                if(t!==null&&t<first)first=t;
                if(first===0)return 0;
            }
        }else{
            if(node.right)stack.push(node.right);
            if(node.left)stack.push(node.left);
        }
    }
    return first<Infinity?first:null;
}
