/** Phase 4.3a — bounded tubular mesh along cached spline frames.
 * Pure geometry: never mutate source frames and never allocate Cocos Mesh.
 * Ring winding faces outward for right(+X), up(+Y), forward(+Z) frames.
 */
import {RoadFrame,RoadGeometry,V3} from './SplineRoadMath';
export interface TubeFrame extends RoadFrame {widthFactor:number}
export interface TubeSettings {
    radius:number;
    radialSegments:number;
    uvMetersPerRepeat:number;
    capEnds:boolean;
}
const scale=(v:V3,s:number):V3=>({x:v.x*s,y:v.y*s,z:v.z*s});
const add=(a:V3,b:V3):V3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const cross=(a:V3,b:V3):V3=>({
    x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x,
});
const length=(v:V3):number=>Math.hypot(v.x,v.y,v.z);
const dot=(a:V3,b:V3):number=>a.x*b.x+a.y*b.y+a.z*b.z;
function unit(v:V3):V3{
    const magnitude=length(v);
    if(!Number.isFinite(magnitude)||magnitude<1e-8)
        throw Error('Geometry Graph Tube requires nondegenerate frame directions.');
    return scale(v,1/magnitude);
}
/** Cap + side UVs use independent vertices so cap normals stay sharp. */
export function buildTubeGeometry(frames:ReadonlyArray<TubeFrame>,
    settings:TubeSettings,closed:boolean):RoadGeometry{
    const {radius,radialSegments,uvMetersPerRepeat,capEnds}=settings;
    if(!Number.isFinite(radius)||radius<.025||radius>50||
       !Number.isInteger(radialSegments)||radialSegments<3||radialSegments>32||
       !Number.isFinite(uvMetersPerRepeat)||uvMetersPerRepeat<.01||uvMetersPerRepeat>10000||
       typeof capEnds!=='boolean'||typeof closed!=='boolean'||
       frames.length<2||frames.length>1025)
        throw Error('Geometry Graph Tube settings or frame count are invalid.');
    const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
    const result:RoadGeometry={positions,normals,uvs,indices,
        bands:radialSegments,ringCount:frames.length};
    const push=(p:V3,n:V3,u:number,v:number):number=>{
        const index=positions.length/3;
        positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);uvs.push(u,v);
        return index;
    };
    const stride=radialSegments+1;
    const twoPi=2*Math.PI;
    let handedness=0;
    for(const frame of frames){
        if(!Number.isFinite(frame.widthFactor)||frame.widthFactor<.0001||
           frame.widthFactor>1000||!Number.isFinite(frame.distance)||
           ![frame.position,frame.forward,frame.right,frame.up].every(v=>
               !!v&&[v.x,v.y,v.z].every(Number.isFinite)))
            throw Error('Geometry Graph Tube contains an invalid frame.');
        const crossSectionNormal=cross(frame.right,frame.up);
        const orientation=dot(crossSectionNormal,frame.forward);
        if(!Number.isFinite(orientation)||Math.abs(orientation)<1e-10)
            throw Error('Geometry Graph Tube frame basis is degenerate.');
        const sign=orientation>0?1:-1;
        if(handedness!==0&&handedness!==sign)
            throw Error('Geometry Graph Tube frame handedness changed along the path.');
        handedness=sign;
        const r=radius*frame.widthFactor;
        for(let j=0;j<=radialSegments;j++){
            const theta=twoPi*j/radialSegments,c=Math.cos(theta),s=Math.sin(theta);
            const radial=add(scale(frame.right,c),scale(frame.up,s));
            const angular=add(scale(frame.right,-s),scale(frame.up,c));
            // Differential normal accounts for non-unit basis vectors after
            // world-to-renderer-local conversion (nonuniform renderer scale).
            const n=unit(scale(cross(angular,frame.forward),handedness));
            push(add(frame.position,scale(radial,r)),n,
                j/radialSegments,frame.distance/uvMetersPerRepeat);
        }
    }
    for(let i=0;i<frames.length-1;i++){
        for(let j=0;j<radialSegments;j++){
            const a=i*stride+j,b=a+stride,c=a+1,d=b+1;
            if(handedness===1)indices.push(a,c,b,c,d,b);
            else indices.push(a,b,c,c,b,d);
        }
    }
    if(capEnds&&!closed){
        for(let end=0;end<2;end++){
            const frame=frames[end===0?0:frames.length-1];
            const direction=unit(scale(cross(frame.right,frame.up),
                handedness*(end===0?-1:1)));
            const center=push(frame.position,direction,.5,.5);
            const ring:number[]=[];
            for(let j=0;j<radialSegments;j++){
                const theta=twoPi*j/radialSegments,c=Math.cos(theta),s=Math.sin(theta);
                const p=add(frame.position,scale(add(scale(frame.right,c),
                    scale(frame.up,s)),radius*frame.widthFactor));
                ring.push(push(p,direction,.5+.5*c,.5+.5*s));
            }
            for(let j=0;j<radialSegments;j++){
                const a=ring[j],b=ring[(j+1)%radialSegments];
                if((end===1)===(handedness===1))indices.push(center,a,b);
                else indices.push(center,b,a);
            }
        }
    }
    return result;
}
