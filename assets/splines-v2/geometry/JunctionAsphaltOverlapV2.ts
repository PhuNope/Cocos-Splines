import {type MeshDataV2} from './MeshData';

interface P {readonly x:number;readonly z:number;}
interface T {readonly a:P;readonly b:P;readonly c:P;
    readonly yA:number;readonly yB:number;readonly yC:number;
    readonly minX:number;readonly maxX:number;readonly minZ:number;readonly maxZ:number;
    readonly signedArea:number;}
export interface JunctionAsphaltOverlapReportV2 {
    /** False means the bounded scan could not certify topology. */
    readonly checked:boolean;
    readonly asphaltTriangles:number;
    readonly overlappingPairs:number;
    readonly maximumOverlapArea:number;
    readonly skippedReason?:string;
}
const cross=(a:P,b:P,c:P)=>
    (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const area=(polygon:ReadonlyArray<P>)=>{
    let result=0;
    for(let i=0;i<polygon.length;i++){
        const a=polygon[i],b=polygon[(i+1)%polygon.length];
        result+=a.x*b.z-b.x*a.z;
    }
    return Math.abs(result)*.5;
};
const mid=(a:P,b:P,t:number):P=>({
    x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t
});
const intersect=(a:P,b:P,sa:number,sb:number):P=>{
    const d=sa-sb;
    return mid(a,b,Math.abs(d)<1e-20?0:Math.max(0,Math.min(1,sa/d)));
};
/** Clip a convex planar triangle by the (possibly reversed) other triangle. */
const overlapPolygon=(a:T,b:T):P[]=>{
    const clip:[P,P,P]=[b.a,b.b,b.c];
    const sign=b.signedArea>0?1:-1;
    let polygon:P[]=[a.a,a.b,a.c];
    for(let i=0;i<3;i++){
        const p=clip[i],q=clip[(i+1)%3],incoming=polygon;
        polygon=[];
        if(!incoming.length)break;
        let previous=incoming[incoming.length-1];
        let previousSide=sign*cross(p,q,previous);
        for(const current of incoming){
            const side=sign*cross(p,q,current);
            if((side>=-1e-9)!==(previousSide>=-1e-9))
                polygon.push(intersect(previous,current,previousSide,side));
            if(side>=-1e-9)polygon.push(current);
            previous=current;previousSide=side;
        }
    }
    return polygon;
};
const interpolateHeight=(tri:T,p:P)=>{
    const a=cross(tri.b,tri.c,p)/tri.signedArea;
    const b=cross(tri.c,tri.a,p)/tri.signedArea;
    const c=1-a-b;
    return a*tri.yA+b*tri.yB+c*tri.yC;
};
/**
 * Bounded 2.5D positive-area intersection test on the ASPHALT submesh only.
 * Adjacent faces sharing an edge/vertex have zero clipped area and pass.
 * Same XZ at different Y (grade-separated levels) does not count.
 *
 * This does NOT check UV folds, curb walls, terrain cuttings or full CSG.
 * Returned "checked" must be true before using overlappingPairs as a gate.
 */
export function inspectJunctionAsphaltOverlapV2(
    mesh:MeshDataV2,
    options:{readonly asphaltSlot?:number;readonly maxTriangles?:number;
        readonly heightTolerance?:number}={}
):JunctionAsphaltOverlapReportV2 {
    const slot=options.asphaltSlot??0,maxTriangles=options.maxTriangles??2000;
    const heightTolerance=options.heightTolerance??.005;
    if(!Number.isSafeInteger(slot)||slot<0||
       !Number.isSafeInteger(maxTriangles)||maxTriangles<1||maxTriangles>8000||
       !Number.isFinite(heightTolerance)||heightTolerance<=0||heightTolerance>.1)
        throw new Error('Invalid Junction asphalt overlap audit options');
    const triangles:T[]=[];
    for(const group of mesh.submeshes){
        if(group.materialSlot!==slot)continue;
        if(group.indices.length%3!==0)throw new Error('Malformed Junction asphalt triangle indices');
        for(let i=0;i<group.indices.length;i+=3){
            const ids=[group.indices[i],group.indices[i+1],group.indices[i+2]];
            if(ids.some(id=>!Number.isInteger(id)||id<0||id>=mesh.vertexCount))
                throw new Error('Invalid Junction asphalt triangle index');
            const get=(idx:number):{p:P;y:number}=>({
                p:{x:mesh.positions[3*idx],z:mesh.positions[3*idx+2]},
                y:mesh.positions[3*idx+1]
            });
            const a=get(ids[0]),b=get(ids[1]),c=get(ids[2]);
            if(![a.p.x,a.p.z,a.y,b.p.x,b.p.z,b.y,c.p.x,c.p.z,c.y].every(Number.isFinite))
                throw new Error('Invalid Junction asphalt triangle position');
            const signedArea=cross(a.p,b.p,c.p);
            if(Math.abs(signedArea)<1e-10)continue; // walls or near-vertical slivers
            if(triangles.length>=maxTriangles)
                return {checked:false,asphaltTriangles:triangles.length+1,
                    overlappingPairs:0,maximumOverlapArea:0,
                    skippedReason:'Junction asphalt overlap audit exceeds '+maxTriangles+' triangles'};
            triangles.push({a:a.p,b:b.p,c:c.p,
                yA:a.y,yB:b.y,yC:c.y,
                minX:Math.min(a.p.x,b.p.x,c.p.x),
                maxX:Math.max(a.p.x,b.p.x,c.p.x),
                minZ:Math.min(a.p.z,b.p.z,c.p.z),
                maxZ:Math.max(a.p.z,b.p.z,c.p.z),signedArea});
        }
    }
    let overlappingPairs=0,maximumOverlapArea=0;
    for(let i=0;i<triangles.length;i++){
        const a=triangles[i];
        for(let j=i+1;j<triangles.length;j++){
            const b=triangles[j];
            if(a.maxX<=b.minX+1e-8||b.maxX<=a.minX+1e-8||
               a.maxZ<=b.minZ+1e-8||b.maxZ<=a.minZ+1e-8)continue;
            const polygon=overlapPolygon(a,b);
            if(polygon.length<3)continue;
            const overlapArea=area(polygon);
            if(overlapArea<=1e-7)continue;
            const centroid={
                x:polygon.reduce((n,p)=>n+p.x,0)/polygon.length,
                z:polygon.reduce((n,p)=>n+p.z,0)/polygon.length
            };
            if(Math.abs(interpolateHeight(a,centroid)-
                interpolateHeight(b,centroid))>heightTolerance)continue;
            overlappingPairs++;
            maximumOverlapArea=Math.max(maximumOverlapArea,overlapArea);
        }
    }
    return {checked:true,asphaltTriangles:triangles.length,
        overlappingPairs,maximumOverlapArea};
}
