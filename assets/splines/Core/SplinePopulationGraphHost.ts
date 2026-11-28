/** Native adapter for Population Graph. Uses the shared stable world-frame
 * sampler and Object Controller's generated-root ownership convention.
 */
import {Node,Prefab,Vec3,Quat,instantiate} from 'cc';
import {SplineContainer} from './SplineContainer';
import {createWorldFrameField} from './SplineWorldFrames';
import type {PopulationGraphSource,PopulationGraphInstance} from './SplinePopulationGraph';
export function samplePopulationGraphSource(source:SplineContainer,samples:number):PopulationGraphSource{
    if(!Number.isInteger(samples)||samples<2||samples>64||!Number.isInteger(source.segmentCount)||source.segmentCount<1)
        throw Error('Population Graph requires 2–64 samples per curve and a valid spline.');
    const steps=Math.min(1024,Math.max(2,source.segmentCount*samples));
    const field=createWorldFrameField(source,0,1,steps);
    let previous:typeof field.frames[number]|null=null,distance=0;
    const frames=field.frames.map(f=>{
        if(previous)distance+=Math.hypot(f.position.x-previous.position.x,f.position.y-previous.position.y,f.position.z-previous.position.z);
        previous=f;
        return {position:{...f.position},forward:{...f.tangent},up:{...f.up},distance};
    });
    // Controller runs a fresh evaluator for each explicit snapshot.
    return {frames,closed:source.closed,revision:'fresh-source'};
}
export function stagePopulationGraphInstances(previous:Node|null,parent:Node,prefabs:ReadonlyArray<Prefab>,
    instances:ReadonlyArray<PopulationGraphInstance>):{root:Node;nodes:Node[]}{
    if(!parent||parent.isValid===false)throw Error('Population Graph requires a valid generated parent.');
    if(previous&&(previous===parent||previous.isValid===false))throw Error('Population Graph invalid generated root.');
    // Never make an ancestor of the chosen parent its generated root.
    let depth=0;
    for(let p:Node|null=parent;p;p=p.parent){
        if(p===previous||++depth>128)throw Error('Population Graph generated parent overlaps its old root.');
    }
    const root=previous||new Node('Spline Objects (Generated)');
    const old=previous?[...previous.children]:[];
    const staged:{node:Node;active:boolean}[]=[];
    try{
        if(!previous){root.active=false;root.setParent(parent);}
        for(const p of instances){
            const prefab=prefabs[p.prefabSlot];
            if(!prefab)throw Error('Population Graph references a missing Prefab slot.');
            const node=instantiate(prefab);
            staged.push({node,active:node.active!==false});
            node.active=false;
            node.name='Spline Object '+String(p.index).padStart(3,'0');
            node.setParent(root);
            node.setWorldPosition(new Vec3(p.position.x,p.position.y,p.position.z));
            const forward=new Vec3(p.forward.x,p.forward.y,p.forward.z),up=new Vec3(p.up.x,p.up.y,p.up.z);
            const right=new Vec3(p.up.y*p.forward.z-p.up.z*p.forward.y,p.up.z*p.forward.x-p.up.x*p.forward.z,p.up.x*p.forward.y-p.up.y*p.forward.x);
            const q=Quat.fromAxes(new Quat(),right,up,forward);
            node.setWorldRotation(q);
            const s=node.scale.clone(),factor=p.scale??1;
            s.x*=factor;s.y*=factor;s.z*=factor;
            if(![s.x,s.y,s.z].every(v=>Number.isFinite(v)))throw Error('Population Graph produced invalid prefab scale.');
            node.setScale(s);
        }
        // Only activate when every transform/instantiate has succeeded.
        for(const item of staged)item.node.active=item.active;
        if(!previous)root.active=true;
    }catch(error){
        for(const {node} of staged){node.active=false;node.removeFromParent();node.destroy();}
        if(!previous){root.removeFromParent();root.destroy();}
        throw error;
    }
    // Native component callbacks can have external side effects; this is an
    // ownership transaction, not a general Scene/Physics Undo transaction.
    for(const node of old){node.removeFromParent();node.destroy();}
    return {root,nodes:staged.map(e=>e.node)};
}
