/** CPU mesh-bending math. No dependencies on Cocos. Positions are in renderer-local space.
 * A readable input mesh is stretched/repeated along a sampled spline frame.
 * Tangent/normal and binormal vectors must form an orthonormal frame at each t.
 */
export type MeshAxis = 0|1|2; // X, Y, Z longitudinal source mesh axis
export type UVMode = 0|1|2; // Original, ContinuousRepeats, Distance
export interface V3 { x:number;y:number;z:number; }
export interface Frame { position:V3; right:V3; up:V3; forward:V3; }
export interface MeshGeometry {positions:number[];indices:number[];uvs?:number[];normals?:number[];}
export interface DeformOptions {
    axis:MeshAxis;repeats:number;start:number;end:number;
    crossScale:number;depthScale:number;
    uvMode:UVMode;uvTilesPerUnit:number;length:number;
    /** User override to invert both triangle winding and recomputed normals. */
    flipFaces?:boolean;
}
export interface DeformResult {positions:number[];normals:number[];uvs:number[];tangents:number[];indices:number[];}
const v=(x=0,y=0,z=0):V3=>({x,y,z});
const add=(a:V3,b:V3):V3=>v(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a:V3,b:V3):V3=>v(a.x-b.x,a.y-b.y,a.z-b.z);
const mul=(a:V3,n:number):V3=>v(a.x*n,a.y*n,a.z*n);
const cross=(a:V3,b:V3):V3=>v(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const norm=(a:V3):V3=>{const d=Math.hypot(a.x,a.y,a.z);return d>1e-10?mul(a,1/d):v(0,1,0);};
const clamp=(x:number)=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
/** Vertex normal accumulator, respecting input triangle winding. */
export function recomputeNormals(positions:number[],indices:number[]):number[] {
    const normals=new Array<number>(positions.length).fill(0);
    for(let i=0;i+2<indices.length;i+=3){
        const a=indices[i],b=indices[i+1],c=indices[i+2];
        if(a<0||b<0||c<0||a*3+2>=positions.length||b*3+2>=positions.length||c*3+2>=positions.length)continue;
        const p=(n:number)=>v(positions[3*n],positions[3*n+1],positions[3*n+2]);
        const n=cross(sub(p(b),p(a)),sub(p(c),p(a)));
        for(const index of [a,b,c]){const o=index*3;normals[o]+=n.x;normals[o+1]+=n.y;normals[o+2]+=n.z;}
    }
    for(let i=0;i<normals.length;i+=3){const n=norm(v(normals[i],normals[i+1],normals[i+2]));normals[i]=n.x;normals[i+1]=n.y;normals[i+2]=n.z;}
    return normals;
}
/** Builds a valid 4-component per-vertex tangent for tangent-space normal maps.
 * Using final deformed positions AND UVs matters when UV V is replaced by
 * physical spline distance: importing source tangents unchanged is incorrect.
 * Degenerate end-cap UVs have a stable perpendicular fallback.
 */
export function computeTangents(positions:number[],normals:number[],uvs:number[],indices:number[]):number[] {
    const count=positions.length/3;
    const tan1=new Array<number>(count*3).fill(0),tan2=new Array<number>(count*3).fill(0);
    for(let i=0;i+2<indices.length;i+=3){
        const ia=indices[i],ib=indices[i+1],ic=indices[i+2];
        const a=ia*3,b=ib*3,c=ic*3,ua=ia*2,ub=ib*2,uc=ic*2;
        const e1=v(positions[b]-positions[a],positions[b+1]-positions[a+1],positions[b+2]-positions[a+2]);
        const e2=v(positions[c]-positions[a],positions[c+1]-positions[a+1],positions[c+2]-positions[a+2]);
        const du1=uvs[ub]-uvs[ua],dv1=uvs[ub+1]-uvs[ua+1];
        const du2=uvs[uc]-uvs[ua],dv2=uvs[uc+1]-uvs[ua+1];
        const den=du1*dv2-du2*dv1;
        if(!Number.isFinite(den)||Math.abs(den)<1e-12)continue;
        const r=1/den;
        const t=mul(sub(mul(e1,dv2),mul(e2,dv1)),r);
        const bit=mul(sub(mul(e2,du1),mul(e1,du2)),r);
        for(const index of [ia,ib,ic]){
            const o=index*3;
            tan1[o]+=t.x;tan1[o+1]+=t.y;tan1[o+2]+=t.z;
            tan2[o]+=bit.x;tan2[o+1]+=bit.y;tan2[o+2]+=bit.z;
        }
    }
    const out:number[]=[];
    for(let i=0;i<count;i++){
        const o=i*3,n=norm(v(normals[o],normals[o+1],normals[o+2]));
        let t=v(tan1[o],tan1[o+1],tan1[o+2]);
        t=sub(t,mul(n,n.x*t.x+n.y*t.y+n.z*t.z));
        if(Math.hypot(t.x,t.y,t.z)<1e-8){
            // The reference axis must not be parallel to the vertex normal.
            t=cross(Math.abs(n.y)<0.9?v(0,1,0):v(1,0,0),n);
        }
        t=norm(t);
        const b=v(tan2[o],tan2[o+1],tan2[o+2]);
        const crossNT=cross(n,t);
        const handedness=(crossNT.x*b.x+crossNT.y*b.y+crossNT.z*b.z)<0?-1:1;
        out.push(t.x,t.y,t.z,handedness);
    }
    return out;
}

/**
 * Deform a mesh with its +axis along the path. Repeat mode duplicates ORIGINAL geometry
 * in successive sections; the mesh should have open ends for seam-free ropes.
 * UV mode 2 writes physical spline distance to V. This is independent of shader choice.
 */
export function deformMesh(input:MeshGeometry,frameAt:(progress:number)=>Frame,o:DeformOptions):DeformResult {
    const positions=input.positions||[],uvs=input.uvs||[],indices=input.indices||[];
    const originalNormals=input.normals&&input.normals.length===positions.length?input.normals:null;
    if(positions.length<9||positions.length%3!==0)throw Error('Input mesh needs valid triangle positions.');
    if(indices.length<3||indices.length%3!==0)throw Error('Input mesh needs triangle indices.');
    if(![0,1,2].includes(o.axis))throw Error('Invalid axis');
    if(!Number.isFinite(o.length)||o.length<0)throw Error('Invalid spline length');
    const count=positions.length/3,repeat=Math.min(256,Math.max(1,Math.floor(o.repeats)));
    const start=clamp(o.start),end=clamp(o.end);
    if(end-start<1e-6)throw Error('Start must be smaller than End.');
    const idx=[o.axis,(o.axis+1)%3,(o.axis+2)%3];
    const axisValue=(i:number)=>positions[3*i+idx[0]];
    let min=Infinity,max=-Infinity;
    for(let i=0;i<count;i++){const a=axisValue(i);if(!Number.isFinite(a))throw Error('Non-finite source vertex');min=Math.min(min,a);max=Math.max(max,a);}
    if(max-min<1e-7)throw Error('Source mesh is flat on longitudinal axis.');
    const out:DeformResult={positions:[],normals:[],uvs:[],tangents:[],indices:[]};
    // The source-axis mapping is a reflection for X and Y:
    //   X source -> [forward, up, right] (det < 0)
    //   Y source -> [right, forward, up] (det < 0)
    //   Z source -> [right, up, forward] (det > 0)
    // This changes triangle front faces if original indices are copied verbatim.
    // Correct the index winding *before* recomputing normals; changing only
    // normals cannot fix back-face culling. flipFaces allows an explicit user
    // override for unusual imported meshes, without altering vertex positions.
    const reverseWinding=(o.axis!==2)!==!!o.flipFaces;
    const frameCache=new Map<number,Frame>();
    for(let section=0;section<repeat;section++){
        for(let i=0;i<count;i++){
            const k=i*3;
            const f=clamp((axisValue(i)-min)/(max-min));
            const u=(section+f)/repeat;
            const t=start+(end-start)*u;
            let frame=frameCache.get(t);
            if(!frame){frame=frameAt(t);frameCache.set(t,frame);}
            // Axis semantics: Z longitudinal: X=right,Y=up. X longitudinal:
            // Z=right,Y=up. Y longitudinal: X=right,Z=up.
            const sideways=o.axis===0?positions[k+2]:positions[k];
            const upwards=o.axis===1?positions[k+2]:positions[k+1];
            const p=add(frame.position,add(mul(frame.right,sideways*o.crossScale),mul(frame.up,upwards*o.depthScale)));
            out.positions.push(p.x,p.y,p.z);
            if(originalNormals){
                // Source shading normals retain authored smoothness and UV seam
                // smoothing. Face-normal accumulation would make a capsule appear
                // faceted/dark at imported UV seams. Transform by inverse scale.
                const sn=v(originalNormals[k],originalNormals[k+1],originalNormals[k+2]);
                const forward=norm(frame.forward);
                const a=o.axis===0?forward:frame.right;
                const b=o.axis===1?forward:frame.up;
                const c=o.axis===2?forward:(o.axis===1?frame.up:frame.right);
                const na=o.axis===0?1:1/o.crossScale;
                const nb=o.axis===1?1:1/o.depthScale;
                const nc=o.axis===2?1:1/(o.axis===1?o.depthScale:o.crossScale);
                let n=norm(add(add(mul(a,sn.x*na),mul(b,sn.y*nb)),mul(c,sn.z*nc)));
                if(o.flipFaces)n=mul(n,-1);
                out.normals.push(n.x,n.y,n.z);
            }
            const oldU=uvs.length===count*2?uvs[i*2]:sideways;
            const oldV=uvs.length===count*2?uvs[i*2+1]:f;
            const uvV=o.uvMode===2 ? (t-start)*o.length*o.uvTilesPerUnit : o.uvMode===1 ? oldV+section : oldV;
            out.uvs.push(oldU,uvV);
        }
        for(let n=0;n<indices.length;n+=3){
            const a=indices[n],b=indices[n+1],c=indices[n+2];
            for(const index of [a,b,c]){
                if(index<0||index>=count||!Number.isInteger(index))throw Error('Invalid source index');
            }
            const base=section*count;
            out.indices.push(base+a,base+(reverseWinding?c:b),base+(reverseWinding?b:c));
        }
    }
    if(!originalNormals)out.normals=recomputeNormals(out.positions,out.indices);
    out.tangents=computeTangents(out.positions,out.normals,out.uvs,out.indices);
    return out;
}
