/** XZ-plane road junction fill. This is a surface PATCH (not boolean mesh union).
 * Collects left/right far-edge points from each outlet, polar-sorts the outline,
 * and fans triangles from their centroid. Recommended for co-planar 2-4 roads.
 */
export interface V3{x:number;y:number;z:number}
export interface PatchBranch {center:V3;outward:V3;width:number}
export interface PatchGeometry{positions:number[];normals:number[];uvs:number[];indices:number[];branches:number}
const len=(x:number,z:number)=>Math.hypot(x,z);
export function buildJunctionPatch(branches:ReadonlyArray<PatchBranch>,setback:number,lift:number,uvScale:number):PatchGeometry {
    const empty=():PatchGeometry=>({positions:[],normals:[],uvs:[],indices:[],branches:0});
    if(branches.length<2)return empty();
    const center={x:0,y:0,z:0};
    for(const b of branches){if(![b.center.x,b.center.y,b.center.z,b.outward.x,b.outward.z,b.width].every(Number.isFinite))return empty();
        center.x+=b.center.x;center.y+=b.center.y;center.z+=b.center.z;}
    center.x/=branches.length;center.y/=branches.length;center.z/=branches.length;
    const points:V3[]=[];
    for(const b of branches){
        const magnitude=len(b.outward.x,b.outward.z);
        if(magnitude<1e-7)continue;
        const x=b.outward.x/magnitude,z=b.outward.z/magnitude;
        const cx=b.center.x+x*Math.max(0.01,setback),cz=b.center.z+z*Math.max(0.01,setback);
        // right = UP x FORWARD for XZ roads.
        const rx=z,rz=-x,h=Math.max(0.025,b.width)*0.5;
        points.push({x:cx+rx*h,y:center.y+lift,z:cz+rz*h},{x:cx-rx*h,y:center.y+lift,z:cz-rz*h});
    }
    if(points.length<4)return empty();
    points.sort((a,b)=>Math.atan2(a.z-center.z,a.x-center.x)-Math.atan2(b.z-center.z,b.x-center.x));
    const positions=[center.x,center.y+lift,center.z],normals=[0,1,0],uvs=[0.5,0.5],indices:number[]=[];
    const vscale=Math.max(0.001,uvScale);
    for(const p of points){positions.push(p.x,p.y,p.z);normals.push(0,1,0);
        uvs.push((p.x-center.x)/vscale+0.5,(p.z-center.z)/vscale+0.5);}
    for(let i=0;i<points.length;i++){
        // XZ-angle ascending is -Y orientation; reverse the winding for +Y.
        indices.push(0,1+(i+1)%points.length,1+i);
    }
    return {positions,normals,uvs,indices,branches:points.length/2};
}
