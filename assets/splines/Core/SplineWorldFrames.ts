import { Vec3 } from 'cc';
import { SplineContainer } from './SplineContainer';
import { buildStableFrames, FrameInput, StableFrame, interpolateStableFrame } from './SplineStableFrames';

/** World-space frame field shared by mesh generating components. Handles
 * non-uniform SplineContainer transforms via transforming vector endpoints,
 * rather than relying only on a rotation quaternion.
 */
export function createWorldFrameField(source:SplineContainer,begin=0,end=1,steps=128):{
    frames:StableFrame[];
    at:(t:number)=>StableFrame;
}{
    const inputs:FrameInput[]=[];
    const count=Math.max(1,Math.min(2048,Math.floor(steps)));
    const sample=(t:number):FrameInput=>{
        const position=source.evaluateWorldPosition(t);
        // Sample the derivative in world space; valid for arbitrary node scale.
        const delta=Math.min(0.0005,Math.max(0.00001,(end-begin)/Math.max(32,count*4)));
        const ta=Math.max(0,t-delta),tb=Math.min(1,t+delta);
        const before=source.evaluateWorldPosition(ta),after=source.evaluateWorldPosition(tb);
        const tangent=Vec3.subtract(new Vec3(),after,before);
        const hasLocalPosition=typeof source.evaluatePosition==='function';
        if(tangent.lengthSqr()<1e-12){
            const dir=source.evaluateTangent(t);
            if(hasLocalPosition){
                const p=source.evaluatePosition(t);
                const tip=Vec3.transformMat4(new Vec3(),Vec3.add(new Vec3(),p,dir),source.node.worldMatrix);
                Vec3.subtract(tangent,tip,position);
            }else Vec3.transformQuat(tangent,dir,source.node.worldRotation);
        }
        Vec3.normalize(tangent,tangent);
        const localUp=source.evaluateUp(t),up=new Vec3();
        if(hasLocalPosition){
            const p=source.evaluatePosition(t);
            const upTip=Vec3.transformMat4(new Vec3(),Vec3.add(new Vec3(),p,localUp),source.node.worldMatrix);
            Vec3.subtract(up,upTip,position);
        }else Vec3.transformQuat(up,localUp,source.node.worldRotation);
        const plain=(v:Vec3)=>({x:v.x,y:v.y,z:v.z});
        return {t,position:plain(position),tangent:plain(tangent),up:plain(up)};
    };
    for(let i=0;i<=count;i++)inputs.push(sample(begin+(end-begin)*i/count));
    const frames=buildStableFrames(inputs,!!source.closed&&begin<=1e-9&&end>=1-1e-9);
    const at=(t:number):StableFrame=>{
        const exact=sample(t);
        const frame=interpolateStableFrame(frames,t,exact.tangent);
        return {...frame,position:exact.position};
    };
    return {frames,at};
}
