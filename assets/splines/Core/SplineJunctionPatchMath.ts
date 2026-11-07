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

/** Exact Road mesh edge, including its precomputed U/V coordinates. */
export interface MatchedRoadEdgeVertex {position:V3;uv:[number,number]}
export interface MatchedRoadCrossSection {left:MatchedRoadEdgeVertex;right:MatchedRoadEdgeVertex}
export interface MatchedRoadPatchBranch {
    center:V3;
    outer:MatchedRoadCrossSection;
    inner:MatchedRoadCrossSection;
}
/** Connect actual Road asphalt rings and blend incompatible branch UVs only in
 * the central fan. Outer-ring positions and UVs come directly from the Road;
 * inner-ring UVs are Road-sampled but positions shrink radially to prevent
 * crossing at tight multi-road intersections. A single shared center UV avoids
 * discontinuity INSIDE the patch. This is not UV Boolean/unwrapping for lane
 * markings; 3+ different branch directions cannot all remain straight.
 * Material sampler must use Repeat for both axes to allow integer phase shifts.
 */
export function buildRoadMatchedJunctionPatch(branches:ReadonlyArray<MatchedRoadPatchBranch>,lift:number,blendRadius=.55):PatchGeometry {
    const empty=():PatchGeometry=>({positions:[],normals:[],uvs:[],indices:[],branches:0});
    if(branches.length<2)return empty();
    const center={x:0,y:0,z:0};
    for(const b of branches){
        const values=[b.center.x,b.center.y,b.center.z];
        for(const ring of [b.outer,b.inner])for(const edge of [ring.left,ring.right])
            values.push(edge.position.x,edge.position.y,edge.position.z,edge.uv[0],edge.uv[1]);
        if(values.some(v=>!Number.isFinite(v)))return empty();
        center.x+=b.center.x;center.y+=b.center.y;center.z+=b.center.z;
    }
    center.x/=branches.length;center.y/=branches.length;center.z/=branches.length;
    const ref=branches[0].outer;
    const refMid=[(ref.left.uv[0]+ref.right.uv[0])*.5,(ref.left.uv[1]+ref.right.uv[1])*.5];
    // Also move the reference branch near UV origin; this avoids GPU precision
    // loss on long roads with tens of thousands of texture repetitions.
    const originShift=[-Math.round(refMid[0]),-Math.round(refMid[1])];
    const vertices:Array<{outer:V3;inner:V3;outerUV:[number,number];innerUV:[number,number]}>=[];
    for(const b of branches){
        const mid=[(b.outer.left.uv[0]+b.outer.right.uv[0])*.5,
            (b.outer.left.uv[1]+b.outer.right.uv[1])*.5];
        // Shift the ENTIRE branch by integer texture periods, never each edge
        // independently: independent wrapping would destroy across-road UVs.
        const shift=[Math.round(refMid[0]-mid[0])+originShift[0],
            Math.round(refMid[1]-mid[1])+originShift[1]];
        for(const side of ['left','right'] as const){
            const outer=b.outer[side],inner=b.inner[side];
            vertices.push({outer:outer.position,inner:inner.position,
                outerUV:[outer.uv[0]+shift[0],outer.uv[1]+shift[1]],
                innerUV:[inner.uv[0]+shift[0],inner.uv[1]+shift[1]]});
        }
    }
    vertices.sort((a,b)=>Math.atan2(a.outer.z-center.z,a.outer.x-center.x)
        -Math.atan2(b.outer.z-center.z,b.outer.x-center.x));
    const n=vertices.length;
    const uvCenter:[number,number]=[0,0];
    for(const v of vertices){uvCenter[0]+=v.innerUV[0]/n;uvCenter[1]+=v.innerUV[1]/n;}
    const positions:number[]=[center.x,center.y+lift,center.z];
    const uvs:number[]=[...uvCenter];
    const radius=Math.max(.1,Math.min(.9,blendRadius));
    for(const ring of ['outer','inner'] as const)for(const v of vertices){
        const p=ring==='outer'?v.outer:{
            x:center.x+(v.outer.x-center.x)*radius,
            y:center.y+(v.outer.y-center.y)*radius,
            z:center.z+(v.outer.z-center.z)*radius};
        const uv=v[ring==='outer'?'outerUV':'innerUV'];
        positions.push(p.x,p.y+lift,p.z);uvs.push(uv[0],uv[1]);
    }
    const indices:number[]=[];
    for(let i=0;i<n;i++){
        const j=(i+1)%n,outerI=1+i,outerJ=1+j,innerI=1+n+i,innerJ=1+n+j;
        // XZ polar angle increases clockwise when viewed along +Y.
        indices.push(innerI,innerJ,outerI,outerI,innerJ,outerJ);
        indices.push(0,innerJ,innerI);
    }
    const normals:number[]=Array(positions.length).fill(0);
    for(let i=0;i<indices.length;i+=3){
        const [ia,ib,ic]=indices.slice(i,i+3).map(k=>k*3);
        const ax=positions[ib]-positions[ia],ay=positions[ib+1]-positions[ia+1],az=positions[ib+2]-positions[ia+2];
        const bx=positions[ic]-positions[ia],by=positions[ic+1]-positions[ia+1],bz=positions[ic+2]-positions[ia+2];
        const x=ay*bz-az*by,y=az*bx-ax*bz,z=ax*by-ay*bx;
        for(const k of [ia,ib,ic]){normals[k]+=x;normals[k+1]+=y;normals[k+2]+=z;}
    }
    for(let i=0;i<normals.length;i+=3){
        const l=Math.hypot(normals[i],normals[i+1],normals[i+2]);
        if(l<1e-7){normals[i]=0;normals[i+1]=1;normals[i+2]=0;}
        else {normals[i]/=l;normals[i+1]/=l;normals[i+2]/=l;}
    }
    return {positions,normals,uvs,indices,branches:branches.length};
}
