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
    parent:any;
}
const point=(v:Vec3)=>[v.x,v.y,v.z].every(Number.isFinite);
const alive=(node:any)=>!!node&&node.isValid!==false;
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
    /** Public Editor Selection only. If absent, allow the stock single-Knot port. */
    private selectedNodeIds():Set<string>|null {
        const editor=(globalThis as any).Editor||(globalThis as any).window?.Editor;
        const selection=editor?.Selection;
        if(typeof selection?.getSelected!=='function')return null;
        try{
            const uuids:unknown=selection.getSelected('node');
            return Array.isArray(uuids)?
                new Set(uuids.filter((v):v is string=>typeof v==='string')):null;
        }catch{return null;}
    }
    private selectedGroup():SplineKnot[] {
        const spline=this.spline();
        if(!spline||spline.dimension!==0)return [];
        const ids=this.selectedNodeIds();
        if(!ids)return [];
        return spline.node.children.map(node=>(node as any).getComponent('Splines.SplineKnot') as SplineKnot|null)
            .filter((k):k is SplineKnot=>!!k&&k.enabled&&
                alive(k)&&alive(k.node)&&ids.has(k.node.uuid));
    }
    /** Do not keep a gesture alive when a redraw observes stale Scene state. */
    private validateGesture():boolean {
        if(!this.edits.property)return false;
        return this.edits.validateActive();
    }
    onGizmoSettings(){
        this.validateGesture();
        return {display:'always' as const};
    }
    onGizmoHandles():any[] {
        this.validateGesture();
        const spline=this.spline();
        if(!alive(this.component)||!this.component.enabled||
           !alive(this.component.node)||!spline||spline.count<2)return [];
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
        this.validateGesture();
        const knot=this.component,spline=this.spline();
        if(!alive(knot)||!alive(knot.node)||!knot.enabled)return;
        if(spline&&knot.editTangentHandles&&knot.hasTangentHandles)
            drawSplineKnot(spline,knot,true);
    }
    onDrawGizmosSelected():void {
        this.validateGesture();
        const spline=this.spline();
        if(!alive(this.component)||!alive(this.component.node)||!this.component.enabled||!spline)return;
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
            worldRotation:k.node.worldRotation.clone(),parent:k.node.parent,
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
            // A deleted or reparented Knot belongs to another operation now.
            // Restore only surviving Nodes still under their original spline.
            const originalParent=b.parent;
            for(const entry of b.group)
                if(alive(entry.knot.node)&&entry.knot.node.parent===originalParent)
                    entry.knot.node.setWorldPosition(entry.position);
        }else if(property==='editorWorldEuler'){
            if(alive(k.node)&&k.node.parent===b.parent)k.node.setWorldRotation(b.worldRotation);
        }else if(property==='editorTangentIn'||property==='editorTangentOut'){
            if(alive(k.node)&&k.node.parent===b.parent){
                k.mode=b.mode;k.tangentIn=b.inTangent.clone();k.tangentOut=b.outTangent.clone();
                if(b.inHandle&&k.tangentInHandle?.isValid)
                    k.tangentInHandle.setPosition(b.inHandle);
                if(b.outHandle&&k.tangentOutHandle?.isValid)
                    k.tangentOutHandle.setPosition(b.outHandle);
            }
        }
        this.spline()?.refresh();
    }
    onGizmoChanged(property:string,phase:string):void {
        const k=this.component;
        if(phase==='begin'){
            const spline=this.spline(),root=k.node?.parent;
            if(!alive(k)||!k.enabled||!alive(k.node)||!alive(root)||!spline||
               spline.enabled===false||(root as any)?.activeInHierarchy===false)return;
            const group=property==='editorGroupWorldPosition'?this.selectedGroup():[];
            if(property==='editorGroupWorldPosition'&&
                (group.length<2||group[0]!==k))return;
            const selectedAtBegin=this.selectedNodeIds();
            // The Editor may show a custom Knot handle even when node selection
            // is supplied through a component. Only require continued owner
            // selection if the owner was selected at the beginning.
            const ownerSelected=selectedAtBegin?.has(k.node.uuid)===true;
            const inputHandle=k.tangentInHandle?.isValid?k.tangentInHandle:null;
            const outputHandle=k.tangentOutHandle?.isValid?k.tangentOutHandle:null;
            const valid=()=>{
                if(!alive(k)||!k.enabled||!alive(k.node)||!alive(root)||
                   (root as any)?.activeInHierarchy===false||spline.enabled===false||
                   k.node.parent!==root||this.spline()!==spline)return false;
                const currentIds=this.selectedNodeIds();
                if(ownerSelected&&(!currentIds||!currentIds.has(k.node.uuid)))
                    return false;
                if(property==='editorGroupWorldPosition'){
                    if(spline.dimension!==0)return false;
                    const current=this.selectedGroup();
                    if(current.length!==group.length||current.some((member,i)=>member!==group[i]))
                        return false;
                    if(group.some(member=>!alive(member)||!member.enabled||
                        !alive(member.node)||member.node.parent!==root))return false;
                }
                if(property==='editorTangentIn'&&inputHandle&&
                   (!alive(inputHandle)||k.tangentInHandle!==inputHandle))return false;
                if(property==='editorTangentOut'&&outputHandle&&
                   (!alive(outputHandle)||k.tangentOutHandle!==outputHandle))return false;
                return true;
            };
            this.edits.begin(property,{
                capture:()=>this.read(group),
                restore:before=>this.restore(property,before),
                changed:(before,after)=>this.changed(property,before,after),
                valid,
            });
        }
        if(phase==='update'){
            if(!this.validateGesture())return;
            if(property==='editorGroupWorldPosition'&&this.edits.property===property){
                const before=this.edits.baseline;
                const origin=before?.group.find(entry=>entry.knot===k);
                const owner=k.node.worldPosition;
                if(origin&&point(owner)){
                    const delta=Vec3.subtract(new Vec3(),owner,origin.position);
                    for(const entry of before!.group){
                        if(entry.knot===k||!alive(entry.knot.node)||entry.knot.node.parent!==k.node.parent)
                            continue;
                        entry.knot.node.setWorldPosition(Vec3.add(new Vec3(),entry.position,delta));
                    }
                }
            }
        }
        if(phase==='cancel')this.edits.cancel(property);
        if(phase==='end')this.edits.end(property);
        this.spline()?.refresh();
    }
}
