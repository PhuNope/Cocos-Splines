/** Pure candidate transforms. All positions are world-space. Local axes use
 * X=right, Y=up, Z=forward. No engine quaternion/Euler dependency.
 */
import type {PopulationGraphPoint} from './SplinePopulationGraph';
import type {PopulationVector} from './SplinePopulationMath';
import {populationGate} from './SplinePopulationMath';
import {surfaceBasis} from './SplinePopulationSurfaceMath';
const add=(a:PopulationVector,b:PopulationVector):PopulationVector=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul=(a:PopulationVector,k:number):PopulationVector=>({x:a.x*k,y:a.y*k,z:a.z*k});
const dot=(a:PopulationVector,b:PopulationVector)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:PopulationVector,b:PopulationVector):PopulationVector=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const unit=(a:PopulationVector):PopulationVector=>{const l=Math.hypot(a.x,a.y,a.z);if(!Number.isFinite(l)||l<1e-8)throw Error('Degenerate population transform basis.');return mul(a,1/l);};
const axes=(p:PopulationGraphPoint)=>{
    const forward=unit(p.forward),up=unit(add(p.up,mul(forward,-dot(p.up,forward))));
    return {forward,up,right:unit(cross(up,forward))};
};
function gate(seed:number,index:number,salt:number):number{
    if(!Number.isInteger(seed)||Math.abs(seed)>2147483647)throw Error('Invalid population transform seed.');
    const mixed=(seed^salt)|0;return populationGate(mixed===-2147483648?2147483647:mixed,index);
}
export function offsetPopulationPoint(p:PopulationGraphPoint,offset:PopulationVector,space:'frame'|'world'):PopulationGraphPoint{
    if(!offset||![offset.x,offset.y,offset.z].every(x=>Number.isFinite(x)&&Math.abs(x)<=10000)||
       (space!=='frame'&&space!=='world'))throw Error('Invalid population offset.');
    let delta=offset;
    if(space==='frame'){
        const b=axes(p);
        delta=add(add(mul(b.right,offset.x),mul(b.up,offset.y)),mul(b.forward,offset.z));
    }
    const position=add(p.position,delta);
    if(![position.x,position.y,position.z].every(x=>Number.isFinite(x)&&Math.abs(x)<=1e7))throw Error('Population offset exceeds world bounds.');
    // surfaceNormal describes the previous projection, not a new hit.
    return {...p,position};
}
function rotate(v:PopulationVector,axis:PopulationVector,radians:number):PopulationVector{
    const c=Math.cos(radians),s=Math.sin(radians);
    return add(add(mul(v,c),mul(cross(axis,v),s)),mul(axis,dot(axis,v)*(1-c)));
}
export function rotatePopulationPoint(p:PopulationGraphPoint,min:PopulationVector,max:PopulationVector,seed:number):PopulationGraphPoint{
    if(!min||!max||!(['x','y','z'] as const).every(k=>Number.isFinite(min[k])&&Number.isFinite(max[k])&&min[k]>=-360&&max[k]<=360&&min[k]<=max[k]))
        throw Error('Invalid population rotation ranges.');
    const b=axes(p);
    // Intrinsic local X, then updated Y, then updated Z. Right-handed degrees.
    const angle=(k:'x'|'y'|'z',salt:number)=>(min[k]+(max[k]-min[k])*gate(seed,p.index,salt))*Math.PI/180;
    const x=angle('x',0x3812af31),y=angle('y',0x51234ab7),z=angle('z',0x7214b931);
    let forward=rotate(b.forward,b.right,x),up=rotate(b.up,b.right,x);
    forward=rotate(forward,up,y);
    up=rotate(up,forward,z);
    const corrected=axes({...p,forward,up});
    return {...p,forward:corrected.forward,up:corrected.up};
}
export function scalePopulationPoint(p:PopulationGraphPoint,min:number,max:number,seed:number):PopulationGraphPoint{
    if(!Number.isFinite(min)||!Number.isFinite(max)||min<.001||max>100||min>max)throw Error('Invalid population scale range.');
    const scale=(p.scale??1)*(min+(max-min)*gate(seed,p.index,0x19bf6327));
    if(!Number.isFinite(scale)||scale<.000001||scale>1000)throw Error('Population cumulative scale exceeds bounds.');
    return {...p,scale};
}
export function alignPopulationPoint(p:PopulationGraphPoint,alignment:'upright'|'surface'|'world'):PopulationGraphPoint{
    if(alignment==='world')return {...p,forward:{x:0,y:0,z:1},up:{x:0,y:1,z:0}};
    if(alignment==='surface'&&!p.surfaceNormal)return p; // unprojected or missed hit
    if(alignment!=='surface'&&alignment!=='upright')throw Error('Invalid population alignment.');
    const b=surfaceBasis(alignment==='surface'?p.surfaceNormal!:{x:0,y:1,z:0},p.forward);
    return {...p,forward:b.forward,up:b.up};
}
