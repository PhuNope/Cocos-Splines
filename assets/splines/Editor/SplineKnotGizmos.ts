import { Vec3, Quat } from 'cc';
import type { SplineKnot } from '../Core/SplineKnot';
import type { SplineContainer } from '../Core/SplineContainer';
import { drawSplineCurve, drawSplineKnot } from './SplineContainerGizmos';
import { SplineGizmoEditTransaction } from './SplineGizmoEditTransaction';
import { planarMovePositions } from './SplineGroupMoveMath';
import { commitGroupPositions } from './SplineGizmoGroupHistory';
import { commitKnotSerializedGesture } from './SplineGizmoKnotHistory';

interface GroupMember {knot:SplineKnot;position:Vec3;localPosition:Vec3;}
interface Before {
    mode:number;
    inTangent:Vec3;outTangent:Vec3;
    inHandle:Vec3|null;outHandle:Vec3|null;
    worldRotation:Quat;
    localRotation:Quat;
    inHandleNode:any|null;
    outHandleNode:any|null;
    inHandleParent:any|null;
    outHandleParent:any|null;
    group:GroupMember[];
    parent:any;
    dimension:number;
}
const point=(v:Vec3)=>[v.x,v.y,v.z].every(Number.isFinite);
const alive=(node:any)=>!!node&&node.isValid!==false;
const GROUP_WORLD='editorGroupWorldPosition';
const GROUP_LOCAL='editorGroupLocalPosition';
const groupProperty=(property:string)=>
    property===GROUP_WORLD||property===GROUP_LOCAL;
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
    private static warnedFrameDependency=false;
    private readonly edits=new SplineGizmoEditTransaction<Before>(
        (before,after,property)=>{
            const editor=(globalThis as any).Editor||(globalThis as any).window?.Editor;
            const request=editor?.Message?.request;
            if(typeof request!=='function')throw new Error('Scene snapshot API unavailable');
            const message=(channel:string,method:string,payload?:unknown)=>
                request.call(editor.Message,channel,method,payload);
            if(groupProperty(property)){
                if(before.group.length!==after.group.length||
                   before.group.some((entry,i)=>entry.knot!==after.group[i]?.knot))
                    throw new Error('Group selection changed before serialized commit.');
                return commitGroupPositions(before.group.map((entry,i)=>({
                    node:entry.knot.node,
                    before:entry.localPosition,after:after.group[i].localPosition,
                    parent:before.parent,
                })),message);
            }
            if(property==='editorTangentIn'||property==='editorTangentOut'||
               property==='editorWorldEuler')
                return commitKnotSerializedGesture(property,this.component,before,after,message);
            throw new Error('Unsupported Gizmo history field '+property);
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
        if(!spline||![0,1,2].includes(spline.dimension))return [];
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
        // All Knot handles are computed editor-only ports. Do not allow old
        // native-history fallback to create bogus Undo entries for them.
        if(!g?.move||g3?.supportsExternalHistory!==true)return [];
        const handles=[
            ...g.move('editorTangentIn',{space:'local',pickSize:25,history:'external'}),
            ...g.move('editorTangentOut',{space:'local',pickSize:25,history:'external'}),
        ];
        if(g.rotate)handles.push(...g.rotate('editorWorldEuler',{
            space:'world',ringSize:70,pickSize:14,history:'external',
        }));
        const group=this.selectedGroup();
        if(group.length>=2&&group[0]===this.component &&
           g3?.supportsExternalHistory===true){
            const opts={axisSize:60,planeSize:18,pickSize:25,
                showPositionLabel:true,history:'external'};
            if(spline.dimension===0&&g3?.move){
                handles.push(...g3.move(GROUP_WORLD,{...opts,space:'world'}));
            }else if(spline.dimension!==0&&g3?.supportsMoveFrameNode===true){
                // The reference-frame Gizmos v3 adapter transforms both
                // visible axis geometry and the editable Vec3 through the
                // SplineContainer. No temporary Node or rotation overrides.
                const frameOpts={...opts,space:'local',frameNode:spline.node};
                const all=g3.move(GROUP_LOCAL,frameOpts);
                if(spline.dimension===1){
                    const xy=g2?.move?g2.move(GROUP_LOCAL,frameOpts):
                        all.filter((h:any)=>h.axis==='x'||h.axis==='y'||h.plane==='xy');
                    handles.push(...xy);
                }else if(spline.dimension===2){
                    handles.push(...all.filter((h:any)=>
                        h.axis==='x'||h.axis==='z'||h.plane==='xz'));
                }
            }else if(spline.dimension!==0&&!SplineKnotGizmos.warnedFrameDependency){
                SplineKnotGizmos.warnedFrameDependency=true;
                console.warn('[cocos-splines] 2D Group Move requires a Cocos-Gizmos v3 development build with supportsMoveFrameNode.');
            }
        }else if(group.length>=2&&group[0]===this.component&&
                 !SplineKnotGizmos.warnedFrameDependency){
            SplineKnotGizmos.warnedFrameDependency=true;
            console.warn('[cocos-splines] Multi-Knot Group Move requires matching Cocos-Gizmos v3 preview (supportsExternalHistory).');
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
            worldRotation:k.node.worldRotation.clone(),
            localRotation:k.node.rotation.clone(),
            inHandleNode:k.tangentInHandle?.isValid?k.tangentInHandle:null,
            outHandleNode:k.tangentOutHandle?.isValid?k.tangentOutHandle:null,
            inHandleParent:k.tangentInHandle?.isValid?k.tangentInHandle.parent:null,
            outHandleParent:k.tangentOutHandle?.isValid?k.tangentOutHandle.parent:null,
            parent:k.node.parent,dimension:this.spline()?.dimension??0,
            group:group.map(knot=>{
                if(!knot.node.isValid)throw new Error('Group Knot deleted during Gizmo drag');
                return {knot,position:knot.node.worldPosition.clone(),
                    localPosition:knot.node.position.clone()};
            }),
        };
    }
    private changed(property:string,a:Before,b:Before):boolean {
        if(groupProperty(property)) {
            if(a.group.length!==b.group.length)return true;
            return a.group.some((entry,i)=>entry.knot!==b.group[i].knot||
                (a.dimension===0?different(entry.position,b.group[i].position):
                    different(entry.localPosition,b.group[i].localPosition)));
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
        if(groupProperty(property)) {
            // A deleted or reparented Knot belongs to another operation now.
            // Restore only surviving Nodes still under their original spline.
            const originalParent=b.parent;
            for(const entry of b.group)
                if(alive(entry.knot.node)&&entry.knot.node.parent===originalParent){
                    if(b.dimension===0)entry.knot.node.setWorldPosition(entry.position);
                    else entry.knot.node.setPosition(entry.localPosition);
                }
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
    /** Apply a common, baseline-derived delta. 2D always edits the
     * Container's LOCAL plane; no world-axis translation can add hidden Y/Z.
     */
    private updateGroupMove():void {
        const before=this.edits.baseline,k=this.component;
        if(!before||!before.group.length||!alive(k.node))return;
        const anchor=before.group.find(entry=>entry.knot===k);
        if(!anchor)return;
        if(before.dimension===0){
            const world=k.node.worldPosition;
            if(!point(world))throw new Error('Group Move world point is invalid.');
            const delta=Vec3.subtract(new Vec3(),world,anchor.position);
            for(const entry of before.group){
                if(entry.knot===k||!alive(entry.knot.node)||
                   entry.knot.node.parent!==before.parent)continue;
                entry.knot.node.setWorldPosition(Vec3.add(new Vec3(),entry.position,delta));
            }
        }else{
            const root=before.parent;
            // The Gizmos v3 reference frame has already converted the mouse
            // position to Container-local. Do not apply inverseTransform twice.
            const target=k.node.position;
            const positions=planarMovePositions(before.dimension as 1|2,
                anchor.localPosition,target,before.group.map(entry=>entry.localPosition));
            for(let i=0;i<before.group.length;i++){
                const node=before.group[i].knot.node;
                if(!alive(node)||node.parent!==root)continue;
                const desired=positions[i];
                node.setPosition(new Vec3(desired.x,desired.y,desired.z));
            }
        }
    }

    onGizmoChanged(property:string,phase:string):void {
        const k=this.component;
        if(phase==='begin'){
            const spline=this.spline(),root=k.node?.parent;
            if(!alive(k)||!k.enabled||!alive(k.node)||!alive(root)||!spline||
               spline.enabled===false||(root as any)?.activeInHierarchy===false)return;
            if(property===GROUP_LOCAL&&
               (spline.dimension===0||(globalThis as any).Gizmos3D?.supportsMoveFrameNode!==true))return;
            if(property===GROUP_WORLD&&spline.dimension!==0)return;
            if((property==='editorTangentIn'||property==='editorTangentOut'||
                property==='editorWorldEuler')&&
                (globalThis as any).Gizmos3D?.supportsExternalHistory!==true)return;
            if(groupProperty(property)&&
                (globalThis as any).Gizmos3D?.supportsExternalHistory!==true)return;
            const group=groupProperty(property)?this.selectedGroup():[];
            const startDimension=spline.dimension;
            if(groupProperty(property)&&
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
                if(groupProperty(property)){
                    if(spline.dimension!==startDimension)return false;
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
        if(phase==='update'||phase==='end'){
            if(!this.validateGesture())return;
            if(groupProperty(property)&&this.edits.property===property){
                try{this.updateGroupMove();}
                catch(error){
                    this.edits.cancelActive();
                    console.warn('[cocos-splines] Group Move cancelled:',error);
                    return;
                }
            }
        }
        if(phase==='cancel')this.edits.cancel(property);
        if(phase==='end')this.edits.end(property);
        this.spline()?.refresh();
    }
}
