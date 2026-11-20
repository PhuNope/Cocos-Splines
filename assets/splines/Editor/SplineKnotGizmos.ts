import { Vec3, Quat } from 'cc';
import type { SplineKnot } from '../Core/SplineKnot';
import type { SplineContainer } from '../Core/SplineContainer';
import { drawSplineCurve, drawSplineKnot } from './SplineContainerGizmos';
import { SplineGizmoEditTransaction } from './SplineGizmoEditTransaction';

interface GroupMember {knot:SplineKnot;position:Vec3;}
interface Before {
    mode:number;
    inTangent:Vec3;outTangent:Vec3;
    inHandle:Vec3|null;outHandle:Vec3|null;
    worldRotation:Quat;
    group:GroupMember[];
}
const point=(v:Vec3)=>[v.x,v.y,v.z].every(Number.isFinite);
const different=(a:Vec3,b:Vec3)=>Math.abs(a.x-b.x)>1e-7||
    Math.abs(a.y-b.y)>1e-7||Math.abs(a.z-b.z)>1e-7;
const maybeDifferent=(a:Vec3|null,b:Vec3|null)=>
    (a===null)!==(b===null)||!!(a&&b&&different(a,b));
const quaternionChanged=(a:Quat,b:Quat)=>{
    const normA=Math.hypot(a.x,a.y,a.z,a.w),normB=Math.hypot(b.x,b.y,b.z,b.w);
    if(normA<1e-9||normB<1e-9)return true;
    return 1-Math.abs((a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)/(normA*normB))>1e-9;
};

/**
 * Cocos-Gizmos v3 editor drawer. Group Move / Rotation / Tangent use a
 * shared gesture transaction, not independent snapshot callbacks.
 */
export class SplineKnotGizmos {
    private readonly edits=new SplineGizmoEditTransaction<Before>(
        ()=>{
            const editor=(globalThis as any).Editor||(globalThis as any).window?.Editor;
            const request=editor?.Message?.request;
            if(typeof request!=='function')throw new Error('Scene snapshot API unavailable');
            return request.call(editor.Message,'scene','snapshot');
        },
        error=>console.warn('[cocos-splines] Gizmo snapshot/rollback failed:',error),
    );
    constructor(public readonly component:SplineKnot){}
    private spline():SplineContainer|null {
        return (this.component.node.parent as any)?.getComponent('Splines.SplineContainer')||null;
    }
    private selectedGroup():SplineKnot[] {
        const spline=this.spline();
        if(!spline || spline.dimension!==0)return [];
        const editor=(globalThis as any).Editor||(globalThis as any).window?.Editor;
        const selection=editor?.Selection;
        if(typeof selection?.getSelected!=='function')return [];
        let uuids:unknown;
        try{uuids=selection.getSelected('node');}catch{return [];}
        if(!Array.isArray(uuids))return [];
        const ids=new Set(uuids.filter((v):v is string=>typeof v==='string'));
        return spline.node.children.map(node=>(node as any).getComponent('Splines.SplineKnot') as SplineKnot|null)
            .filter((k):k is SplineKnot=>!!k && k.enabled && ids.has(k.node.uuid));
    }
    onGizmoSettings(){return {display:'always' as const};}
    onGizmoHandles():any[] {
        const spline=this.spline();
        if(!spline||spline.count<2)return [];
        const g2=(globalThis as any).Gizmos2D,g3=(globalThis as any).Gizmos3D;
        const g=spline.dimension===1&&g2?g2:g3;
        if(!g?.move)return [];
        const handles=[
            ...g.move('editorTangentIn',{space:'local',pickSize:25}),
            ...g.move('editorTangentOut',{space:'local',pickSize:25}),
        ];
        if(g.rotate)handles.push(...g.rotate('editorWorldEuler',{space:'world',ringSize:70,pickSize:14}));
        const group=this.selectedGroup();
        if(group.length>=2 && group[0]===this.component && g3?.move) {
            handles.push(...g3.move('editorGroupWorldPosition',{
                space:'world',axisSize:60,planeSize:18,pickSize:25,
                showPositionLabel:true,
            }));
        }
        return handles;
    }
    onDrawGizmos():void {
        const knot=this.component,spline=this.spline();
        if(spline&&knot.editTangentHandles&&knot.hasTangentHandles)
            drawSplineKnot(spline,knot,true);
    }
    onDrawGizmosSelected():void {
        const spline=this.spline();if(!spline)return;
        if(!spline.showGizmosAlways&&!spline.knots.some(k=>k.editTangentHandles&&k.hasTangentHandles))
            drawSplineCurve(spline,true);
        drawSplineKnot(spline,this.component,true);
    }
    private read(group:SplineKnot[]):Before {
        const k=this.component;
        return {
            mode:k.mode,inTangent:k.tangentIn.clone(),outTangent:k.tangentOut.clone(),
            inHandle:k.tangentInHandle?.isValid?k.tangentInHandle.position.clone():null,
            outHandle:k.tangentOutHandle?.isValid?k.tangentOutHandle.position.clone():null,
            worldRotation:k.node.worldRotation.clone(),
            group:group.map(knot=>{
                if(!knot.node.isValid)throw new Error('Group Knot deleted during Gizmo drag');
                return {knot,position:knot.node.worldPosition.clone()};
            }),
        };
    }
    private changed(property:string,a:Before,b:Before):boolean {
        if(property==='editorGroupWorldPosition') {
            if(a.group.length!==b.group.length)return true;
            return a.group.some((entry,i)=>entry.knot!==b.group[i].knot||
                different(entry.position,b.group[i].position));
        }
        if(property==='editorWorldEuler')
            return quaternionChanged(a.worldRotation,b.worldRotation);
        if(property==='editorTangentIn'||property==='editorTangentOut')
            return a.mode!==b.mode||different(a.inTangent,b.inTangent)||
                different(a.outTangent,b.outTangent)||
                maybeDifferent(a.inHandle,b.inHandle)||maybeDifferent(a.outHandle,b.outHandle);
        return false;
    }
    private restore(property:string,b:Before):void {
        const k=this.component;
        if(property==='editorGroupWorldPosition') {
            for(const entry of b.group)
                if(entry.knot.node.isValid)entry.knot.node.setWorldPosition(entry.position);
        }else if(property==='editorWorldEuler'){
            if(k.node.isValid)k.node.setWorldRotation(b.worldRotation);
        }else if(property==='editorTangentIn'||property==='editorTangentOut'){
            k.mode=b.mode;k.tangentIn=b.inTangent.clone();k.tangentOut=b.outTangent.clone();
            if(b.inHandle&&k.tangentInHandle?.isValid)
                k.tangentInHandle.setPosition(b.inHandle);
            if(b.outHandle&&k.tangentOutHandle?.isValid)
                k.tangentOutHandle.setPosition(b.outHandle);
        }
        this.spline()?.refresh();
    }
    onGizmoChanged(property:string,phase:string):void {
        const k=this.component;
        if(phase==='begin'){
            const group=property==='editorGroupWorldPosition'?this.selectedGroup():[];
            if(property==='editorGroupWorldPosition'&&
                (group.length<2||group[0]!==k))return;
            this.edits.begin(property,{
                capture:()=>this.read(group),
                restore:before=>this.restore(property,before),
                changed:(before,after)=>this.changed(property,before,after),
            });
        }
        if(phase==='update'&&property==='editorGroupWorldPosition'&&
            this.edits.property===property){
            const before=this.edits.baseline;
            const origin=before?.group.find(entry=>entry.knot===k);
            const owner=k.node.worldPosition;
            if(origin&&point(owner)) {
                const delta=Vec3.subtract(new Vec3(),owner,origin.position);
                for(const entry of before!.group){
                    if(entry.knot===k||!entry.knot.node.isValid)continue;
                    entry.knot.node.setWorldPosition(Vec3.add(new Vec3(),entry.position,delta));
                }
            }
        }
        if(phase==='cancel')this.edits.cancel(property);
        if(phase==='end')this.edits.end(property);
        this.spline()?.refresh();
    }
}
