/** Phase 4.3c — bounded preset-mesh deformation over a typed path.
 * Reuses the existing SplineMeshDeformMath CPU kernel; unlike the standalone
 * SplineMeshDeform component, graph v1 supplies one path input and therefore
 * uses generated presets or an explicitly connected, bounded readable Mesh asset.
 *
 * 0 = segmented surface strip; 1 = open-ended rectangular box shell.
 * A source longitudinal segment is subdivided before bending, so curves are
 * approximated smoothly without mutating source frames or Mesh assets.
 */
import {RoadFrame,RoadGeometry,V3} from './SplineRoadMath';
import {deformMesh,MeshGeometry,Frame} from './SplineMeshDeformMath';

export interface GraphMeshDeformFrame extends RoadFrame {widthFactor:number}
export interface GraphMeshDeformSettings {
    width:number;height:number;
    deformShape:number; // 0 strip, 1 box shell
    axis?:number; // 0 X, 1 Y, 2 Z (default) for imported + preset meshes
    segments:number; // subdivisions per source repeat
    repeats:number; // count of source modules along full path
    uvMetersPerRepeat:number;
}
const finite=(n:number)=>Number.isFinite(n);
const dot=(a:V3,b:V3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:V3,b:V3):V3=>({
    x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x,
});
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const lerp3=(a:V3,b:V3,t:number):V3=>({
    x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t),
});
const scaled=(a:V3,s:number):V3=>({x:a.x*s,y:a.y*s,z:a.z*s});
const valid3=(v:V3)=>!!v&&[v.x,v.y,v.z].every(finite);

/** Each source edge owns its vertices; hard corners stay discontinuous. */
export function createDeformPresetMesh(settings:GraphMeshDeformSettings):MeshGeometry {
    const {width,height,deformShape,segments}=settings;
    if(!finite(width)||width<.05||width>100||
       !finite(height)||height<.05||height>100||
       !Number.isInteger(deformShape)||![0,1].includes(deformShape)||
       !Number.isInteger(segments)||segments<2||segments>64)
        throw Error('Geometry Graph Mesh Deform preset geometry is invalid.');
    const profile=deformShape===0?
        [{x:-width/2,y:0},{x:width/2,y:0}]:
        [{x:-width/2,y:-height/2},{x:width/2,y:-height/2},
            {x:width/2,y:height/2},{x:-width/2,y:height/2}];
    const mesh:MeshGeometry={positions:[],indices:[],uvs:[]};
    const edgeCount=deformShape===0?1:4;
    let perimeter=0;
    const lengths:number[]=[];
    for(let edge=0;edge<edgeCount;edge++){
        const a=profile[edge],b=profile[(edge+1)%profile.length];
        const len=Math.hypot(b.x-a.x,b.y-a.y);
        lengths.push(len);perimeter+=len;
    }
    let offset=0;
    for(let edge=0;edge<edgeCount;edge++){
        const a=profile[edge],b=profile[(edge+1)%profile.length];
        const first=mesh.positions.length/3;
        for(let i=0;i<=segments;i++){
            const z=i/segments;
            mesh.positions.push(a.x,a.y,z,b.x,b.y,z);
            mesh.uvs!.push(offset/perimeter,z,(offset+lengths[edge])/perimeter,z);
        }
        offset+=lengths[edge];
        for(let i=0;i<segments;i++){
            const v=first+i*2,n=v+2;
            if(deformShape===0)
                mesh.indices.push(v,n,v+1,v+1,n,n+1); // +up face
            else mesh.indices.push(v,v+1,n,v+1,n+1,n); // outward box face
        }
    }
    return mesh;
}

/** Validate once and interpolate the source frame field in distance space
 * rather than treating frame samples as equally spaced.
 */
export function buildGraphMeshDeformGeometry(
    frames:ReadonlyArray<GraphMeshDeformFrame>,
    settings:GraphMeshDeformSettings,closed:boolean,
    imported?:Readonly<MeshGeometry>):RoadGeometry {
    const {width,height,deformShape,segments,repeats,uvMetersPerRepeat}=settings;
    const axis=settings.axis??2;
    if(!Number.isInteger(axis)||axis<0||axis>2)
        throw Error('Geometry Graph Mesh Deform axis must be X, Y, or Z.');
    if(!Number.isInteger(repeats)||repeats<1||repeats>16||
       !finite(uvMetersPerRepeat)||uvMetersPerRepeat<.01||uvMetersPerRepeat>10000||
       !Array.isArray(frames)||frames.length<2||frames.length>1025||
       typeof closed!=='boolean')
        throw Error('Geometry Graph Mesh Deform settings or frame count invalid.');
    // Imported asset vertices are already subdivided by the author. A pure
    // deformer never mutates them, and no automatic profile triangulation occurs.
    const source=imported?
        {positions:imported.positions.slice(),indices:imported.indices.slice(),
            uvs:imported.uvs?.slice(),normals:imported.normals?.slice()}:
        createDeformPresetMesh({width,height,deformShape,segments,repeats,uvMetersPerRepeat});
    if(!imported&&axis!==2){
        // Source presets are authored along Z. Swap the longitudinal
        // coordinate into the chosen axis before the shared deformation
        // kernel applies its X/Y handedness correction.
        for(let i=0;i<source.positions.length;i+=3){
            const z=source.positions[i+2];
            if(axis===0){source.positions[i+2]=source.positions[i];source.positions[i]=z;}
            else{source.positions[i+2]=source.positions[i+1];source.positions[i+1]=z;}
        }
        // The kernel automatically reverses X/Y-axis source winding.
        // Presets are authored for Z, so counter-reverse the copied
        // triangles to preserve their +Y/top and outward surface normals.
        for(let i=0;i<source.indices.length;i+=3){
            const b=source.indices[i+1];
            source.indices[i+1]=source.indices[i+2];
            source.indices[i+2]=b;
        }
    }
    if(imported){
        const count=source.positions.length/3;
        if(count<3||count>4096||source.indices.length<3||
           source.indices.length>24576||source.indices.length%3!==0||
           source.positions.some(v=>!finite(v)||Math.abs(v)>1e6)||
           source.indices.some(i=>!Number.isInteger(i)||i<0||i>=count)||
           (source.uvs!==undefined&&(source.uvs.length!==count*2||
             source.uvs.some(v=>!finite(v))))||
           (source.normals!==undefined&&(source.normals.length!==count*3||
             source.normals.some(v=>!finite(v)))))
            throw Error('Geometry Graph imported Mesh exceeds safety limits.');
    }
    const origin=frames[0].distance,length=frames[frames.length-1].distance-origin;
    if(!finite(length)||length<=1e-7)
        throw Error('Geometry Graph Mesh Deform requires a positive source arc length.');
    let sign=0;
    for(const f of frames){
        if(!finite(f.distance)||f.distance<origin||f.distance>origin+length||
           !finite(f.widthFactor)||f.widthFactor<.0001||f.widthFactor>1000||
           ![f.position,f.forward,f.right,f.up].every(valid3))
            throw Error('Geometry Graph Mesh Deform contains invalid frames.');
        const orientation=dot(cross(f.right,f.up),f.forward);
        if(!finite(orientation)||Math.abs(orientation)<1e-10)
            throw Error('Geometry Graph Mesh Deform requires nondegenerate frame directions.');
        const next=orientation>0?1:-1;
        if(sign&&sign!==next)
            throw Error('Geometry Graph Mesh Deform frame handedness changed.');
        sign=next;
    }
    const interpolate=(progress:number):Frame=>{
        const target=origin+Math.max(0,Math.min(1,progress))*length;
        // First upper-bound distance; repeated source distances are safe.
        let lo=0,hi=frames.length-1;
        while(lo<hi){
            const mid=Math.floor((lo+hi)/2);
            if(frames[mid].distance<target)lo=mid+1;
            else hi=mid;
        }
        const index=Math.min(frames.length-1,Math.max(1,lo));
        const a=frames[index-1],b=frames[index];
        const delta=b.distance-a.distance;
        const t=delta>1e-9?Math.max(0,Math.min(1,(target-a.distance)/delta)):1;
        const widthFactor=lerp(a.widthFactor,b.widthFactor,t);
        return {
            position:lerp3(a.position,b.position,t),
            right:scaled(lerp3(a.right,b.right,t),widthFactor),
            up:scaled(lerp3(a.up,b.up,t),widthFactor),
            forward:lerp3(a.forward,b.forward,t),
        };
    };
    // The downstream CPU kernel reads source mesh arrays only. It returns
    // freshly allocated positions, normals, UVs and indices.
    const output=deformMesh(source,interpolate,{
        axis:axis as 0|1|2,repeats,start:0,end:1,
        crossScale:imported?width:1,depthScale:imported?height:1,length,
        uvMode:2,uvTilesPerUnit:1/uvMetersPerRepeat,
        flipFaces:sign<0,
    });
    return {
        positions:output.positions,normals:output.normals,
        uvs:output.uvs,indices:output.indices,
        bands:imported?1:deformShape===0?1:4,
        ringCount:imported?source.positions.length/3*repeats:(segments+1)*repeats,
    };
}
