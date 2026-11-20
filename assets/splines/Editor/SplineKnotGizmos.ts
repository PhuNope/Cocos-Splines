import { Vec3, Quat } from 'cc';
import type { SplineKnot } from '../Core/SplineKnot';
import type { SplineContainer } from '../Core/SplineContainer';
import { drawSplineCurve, drawSplineKnot } from './SplineContainerGizmos';

interface Before {
    mode:number;
    inTangent:Vec3;outTangent:Vec3;
    inHandle:Vec3|null;outHandle:Vec3|null;
    worldRotation:Quat;
}
interface GroupMember {knot:SplineKnot;position:Vec3;}
const point=(v:Vec3)=>[v.x,v.y,v.z].every(Number.isFinite);
const different=(a:Vec3,b:Vec3)=>Math.abs(a.x-b.x)>1e-7||
    Math.abs(a.y-b.y)>1e-7||Math.abs(a.z-b.z)>1e-7;
const quaternionChanged=(a:Quat,b:Quat)=>Math.abs(a.x-b.x)>1e-7||
    Math.abs(a.y-b.y)>1e-7||Math.abs(a.z-b.z)>1e-7||
    Math.abs(a.w-b.w)>1e-7;

/**
 * Official Cocos-Gizmos v3 drawer, one instance per Knot.
 * No private native editor APIs or extra serialized components are needed.
 */
export class SplineKnotGizmos {
    private before:Before|null=null;
    private group:GroupMember[]|null=null;
    constructor(public readonly component:SplineKnot){}
    private spline():SplineContainer|null {
        return (this.component.node.parent as any)?.getComponent('Splines.SplineContainer')||null;
    }
    /**
     * The Gizmos Editor Scene process exposes the same public Selection query
     * that Cocos-Gizmos itself uses. If unavailable, simply do not show a
     * group tool; the Inspector's numeric batch editor remains available.
     */
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
        // Always use natural hierarchy order even when user clicked B then A.
        return spline.node.children.map(node=>node.getComponent('Splines.SplineKnot') as SplineKnot|null)
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
    private recordSnapshot():void {
        const editor=(globalThis as any).Editor||(globalThis as any).window?.Editor;
        const request=editor?.Message?.request;
        if(typeof request!=='function') {
            console.warn('[cocos-splines] Scene snapshot API unavailable; verify Undo/Redo in Creator.');
            return;
        }
        try {
            Promise.resolve(request.call(editor.Message,'scene','snapshot')).catch((error:unknown)=>
                console.warn('[cocos-splines] Could not create Scene edit snapshot:',error));
        } catch(error) {
            console.warn('[cocos-splines] Scene snapshot failed:',error);
        }
    }
    private tangentsChanged(k:SplineKnot,b:Before):boolean {
        const a=k.tangentIn,c=k.tangentOut;
        const changed=(one:Vec3,two:Vec3)=>different(one,two);
        return k.mode!==b.mode||changed(a,b.inTangent)||changed(c,b.outTangent)||
            (b.inHandle!==null && !!k.tangentInHandle?.isValid &&
                changed(k.tangentInHandle.position,b.inHandle))||
            (b.outHandle!==null && !!k.tangentOutHandle?.isValid &&
                changed(k.tangentOutHandle.position,b.outHandle));
    }
    onGizmoChanged(property:string,phase:string):void {
        const k=this.component;
        if(phase==='begin') {
            this.before={
                mode:k.mode,inTangent:k.tangentIn.clone(),outTangent:k.tangentOut.clone(),
                inHandle:k.tangentInHandle?.isValid?k.tangentInHandle.position.clone():null,
                outHandle:k.tangentOutHandle?.isValid?k.tangentOutHandle.position.clone():null,
                worldRotation:k.node.worldRotation.clone(),
            };
            if(property==='editorGroupWorldPosition') {
                const selected=this.selectedGroup();
                this.group=selected.length>=2 && selected[0]===k
                    ?selected.map(knot=>({knot,position:knot.node.worldPosition.clone()})):null;
            }
        }
        if(property==='editorGroupWorldPosition' && phase==='update' && this.group) {
            const original=this.group.find(entry=>entry.knot===k);
            const ownerWorld=k.node.worldPosition;
            if(original && point(ownerWorld)) {
                const delta=Vec3.subtract(new Vec3(),ownerWorld,original.position);
                for(const entry of this.group) {
                    if(entry.knot===k || !entry.knot.node.isValid)continue;
                    const next=Vec3.add(new Vec3(),entry.position,delta);
                    entry.knot.node.setWorldPosition(next);
                }
            }
        }
        if(phase==='cancel') {
            if(this.before){
                const previous=this.before;
                k.mode=previous.mode;k.tangentIn=previous.inTangent;
                k.tangentOut=previous.outTangent;
                if(previous.inHandle&&k.tangentInHandle?.isValid)
                    k.tangentInHandle.setPosition(previous.inHandle);
                if(previous.outHandle&&k.tangentOutHandle?.isValid)
                    k.tangentOutHandle.setPosition(previous.outHandle);
                k.node.setWorldRotation(previous.worldRotation);
            }
            if(this.group)for(const entry of this.group)
                if(entry.knot.node.isValid)entry.knot.node.setWorldPosition(entry.position);
        }
        if(phase==='end') {
            if(property==='editorGroupWorldPosition' && this.group){
                const changed=this.group.some(entry=>
                    entry.knot.node.isValid && different(entry.knot.node.worldPosition,entry.position));
                if(changed)this.recordSnapshot();
            }else if(this.before && (
                property==='editorWorldEuler'?
                    quaternionChanged(k.node.worldRotation,this.before.worldRotation):
                    this.tangentsChanged(k,this.before))) {
                // Computed Euler/tangent ports do not have native serialized
                // backing fields: save one snapshot after the resulting Node
                // or serialized tangent has actually changed.
                this.recordSnapshot();
            }
        }
        if(phase==='end'||phase==='cancel'){
            this.before=null;
            this.group=null;
        }
        this.spline()?.refresh();
    }
}
