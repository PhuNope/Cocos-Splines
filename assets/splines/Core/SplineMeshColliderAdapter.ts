/** Opt-in Cocos MeshCollider -> WORLD triangle BVH adapter.
 * Uses injected Mesh readers/format enums so geometry conversion remains
 * pure TypeScript, without physics backend dependencies or scene mutations.
 * The caller must reject convex colliders (native convex hull != triangles).
 */
import {findStoredAttributeFormat,readPositionTriples,
    resolveAttributeFormatName,type VertexFormat} from './SplineMeshRead';
import {buildProximityTriangleMesh,type ProximityTriangleMesh} from './SplineProximityMesh';
import type {ColliderBoxMatrix,ColliderBoundsPoint,ColliderWorldBounds} from './SplineColliderBounds';

export interface ReadableColliderMesh {
    readonly allowDataAccess:boolean;
    readonly struct:{readonly primitives:{primitiveMode?:number;
        vertexBundelIndices?:number[]}[];
        vertexBundles?:Array<{attributes?:Array<{name:string;format:unknown}>}>};
    readAttribute(index:number,name:string):ArrayLike<number>|null;
    readAttributeFormat(index:number,name:string):unknown;
    readIndices(index:number):ArrayLike<number>|null;
}
export interface MeshColliderGeometryOptions {
    readonly positionAttribute:string;
    readonly formatTable:Readonly<Record<string,number|string>>;
    readonly triangleListMode:number;
}
type V=ColliderBoundsPoint;
const finite=(n:number)=>Number.isFinite(n);
const valid=(p:V|null|undefined):p is V=>!!p&&[p.x,p.y,p.z].every(finite);
const matrixValid=(m:ColliderBoxMatrix|null|undefined):m is ColliderBoxMatrix=>
    !!m&&[m.m00,m.m01,m.m02,m.m04,m.m05,m.m06,m.m08,m.m09,m.m10,
        m.m12,m.m13,m.m14].every(finite);
const transform=(p:V,m:ColliderBoxMatrix):V=>({
    x:m.m00*p.x+m.m04*p.y+m.m08*p.z+m.m12,
    y:m.m01*p.x+m.m05*p.y+m.m09*p.z+m.m13,
    z:m.m02*p.x+m.m06*p.y+m.m10*p.z+m.m14,
});
/** Returns null on any ambiguous/unsupported source or backend bounds.
 * Supports indexed, triangle-list submeshes, packed half-float positions,
 * center offset and arbitrary finite non-singular affine world transforms.
 * Rebuild when a source mesh or its transform changes.
 */
export function meshColliderWorldBvh(mesh:ReadableColliderMesh|null|undefined,
    matrix:ColliderBoxMatrix|null|undefined,center:V|null|undefined,
    worldBounds:ColliderWorldBounds|null|undefined,
    options:MeshColliderGeometryOptions):ProximityTriangleMesh|null {
    if(!mesh?.allowDataAccess||!matrixValid(matrix)||!valid(center)||
       !worldBounds||!valid(worldBounds.center)||!valid(worldBounds.halfExtents)||
       [worldBounds.halfExtents.x,worldBounds.halfExtents.y,worldBounds.halfExtents.z]
           .some(v=>v<0)||
       !options?.positionAttribute||!options.formatTable||
       !Number.isInteger(options.triangleListMode))return null;
    const x={x:matrix.m00,y:matrix.m01,z:matrix.m02},
        y={x:matrix.m04,y:matrix.m05,z:matrix.m06},
        z={x:matrix.m08,y:matrix.m09,z:matrix.m10};
    const det=x.x*(y.y*z.z-y.z*z.y)-x.y*(y.x*z.z-y.z*z.x)+
        x.z*(y.x*z.y-y.y*z.x);
    if(!finite(det)||Math.abs(det)<1e-10)return null;
    const primitives=mesh.struct?.primitives;
    if(!Array.isArray(primitives)||primitives.length<1||primitives.length>16)return null;
    const world:V[]=[],indices:number[]=[];
    const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
    try{
        for(let primitiveIndex=0;primitiveIndex<primitives.length;primitiveIndex++){
            const primitive=primitives[primitiveIndex];
            if(!primitive||(primitive.primitiveMode!==undefined&&
                primitive.primitiveMode!==options.triangleListMode))return null;
            const raw=mesh.readAttribute(primitiveIndex,options.positionAttribute);
            const rawIndices=mesh.readIndices(primitiveIndex);
            if(!raw||!rawIndices||rawIndices.length<3||rawIndices.length%3!==0||
               indices.length+rawIndices.length>16384*3)return null;
            if(raw.length>65536*3)return null; // Bound decoding allocations.
            const format=resolveAttributeFormatName(
                mesh.readAttributeFormat(primitiveIndex,options.positionAttribute),
                options.formatTable,
                findStoredAttributeFormat(mesh,primitiveIndex,options.positionAttribute)
            ) as VertexFormat;
            const xyz=readPositionTriples(raw,format);
            const count=xyz.length/3;
            if(count<3||count+world.length>65536)return null;
            const offset=world.length;
            for(let i=0;i<count;i++){
                const local={x:xyz[i*3]+center.x,y:xyz[i*3+1]+center.y,
                    z:xyz[i*3+2]+center.z};
                const p=transform(local,matrix);
                if(!valid(p)||Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))>1e6)return null;
                world.push(p);
            }
            for(let i=0;i<rawIndices.length;i++){
                const k=Number(rawIndices[i]);
                if(!Number.isInteger(k)||k<0||k>=count)return null;
                const p=world[offset+k];
                min.x=Math.min(min.x,p.x);min.y=Math.min(min.y,p.y);min.z=Math.min(min.z,p.z);
                max.x=Math.max(max.x,p.x);max.y=Math.max(max.y,p.y);max.z=Math.max(max.z,p.z);
                indices.push(offset+k);
            }
        }
        // Engine's worldBounds acts as a fail-closed sanity check. A small
        // tolerance permits backend AABB inflation; stale/mismatched transforms
        // must use the conservative engine AABB instead.
        for(const axis of ['x','y','z'] as const){
            const c=(min[axis]+max[axis])/2,e=(max[axis]-min[axis])/2;
            const actual=worldBounds.center[axis],half=worldBounds.halfExtents[axis];
            const tolerance=.001+.01*Math.max(1,half,e);
            if(!finite(c)||!finite(e)||Math.abs(c-actual)>tolerance||
               Math.abs(e-half)>tolerance)return null;
        }
        const radius=Math.hypot(max.x-min.x,max.y-min.y,max.z-min.z)/2;
        if(!finite(radius)||radius>100)return null;
        return buildProximityTriangleMesh(world,indices);
    }catch{return null;} // Never crash SplineAnimate on unreadable engine assets.
}
