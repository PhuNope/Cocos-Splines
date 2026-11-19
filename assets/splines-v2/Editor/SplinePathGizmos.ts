import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import type {IDrawGizmos} from 'db://cocos-gizmos/RegisterGizmos';
import {type SplinePath,RotationMode,SplineSpace} from '../Components/SplinePath';
import {splineGizmos,type SplineHandleDescriptor} from './SplineGizmoHandler';

/** Editor-only Drawer registered by the official Cocos-Gizmos decorator.
 * Does not serialize state or create a second Component/Node. Each SplinePath
 * instance receives one cached drawer from @registerGizmos's WeakMap. */
export class SplinePathGizmos implements IDrawGizmos<SplinePath> {
    constructor(public readonly component:SplinePath) {}

    public onGizmoHandles():SplineHandleDescriptor[] {
        const c=this.component;
        if(!EDITOR_NOT_IN_PREVIEW||!c.node?.isValid)return [];
        const mode=c.gizmoRotationMode===RotationMode.Planar2D?'2d':
            c.gizmoRotationMode===RotationMode.Spatial3D?'3d':'knots';
        return splineGizmos.handles({
            mode,
            positionSpace:c.gizmoPositionSpace===SplineSpace.World?'world':'local',
            rotationSpace:c.gizmoRotationSpace===SplineSpace.World?'world':'local',
            positionSnap:c.gizmoPositionSnap,rotationSnap:c.gizmoRotationSnap,
            activeIndex:c.gizmoKnotIndex,knotCount:c.knots.length,
            showKnots:c.gizmoEditKnots,multiPoints:c.gizmoMultiKnotPoints,
            pointLimit:c.gizmoPointLimit,
            selectedIndices:c.selectedGroupIndices(),
            manualTangents:c.hasManualTangentHandles(),
            editTangents:c.gizmoEditTangents,rotateTangents:c.gizmoRotateKnotTangents
        });
    }

    public onGizmoHUD():GizmoHudDefinition {
        const c=this.component;
        if(!EDITOR_NOT_IN_PREVIEW||!c.node?.isValid||
           !c.gizmoEditKnots||c.knots.length<2)return null as unknown as GizmoHudDefinition;
        if(!c.knots[c.gizmoKnotIndex])return null as unknown as GizmoHudDefinition;
        const world=c.gizmoPositionSpace===SplineSpace.World;
        const position=world?c.pathGizmoKnotPositionWorld:
            c.pathGizmoKnotPosition;
        const hud=splineGizmos.hud({
            activeIndex:c.gizmoKnotIndex,knotCount:c.knots.length,
            position,positionSpace:world?'world':'local',
            selectedIndices:c.selectedGroupIndices(),
            manualTangents:c.hasManualTangentHandles(),
            onToggleGroup:()=>c.toggleGroupKnot(c.gizmoKnotIndex),
            onClearGroup:()=>c.clearGroupKnots()
        });
        return hud as unknown as GizmoHudDefinition;
    }

    public onDrawGizmosSelected():void {
        const c=this.component;
        if(!EDITOR_NOT_IN_PREVIEW||!c.node?.isValid)return;
        const guide=c.createSceneGizmoGuide();
        if(guide)splineGizmos.drawGuide(c.node,guide);
    }

    public onGizmoChanged(name:string,
        phase:'begin'|'update'|'end'|'cancel',index?:number):void {
        this.component.applyGizmoGesture(name,phase,index);
    }
    public onGizmoHudChanged(name:string,
        phase:'begin'|'update'|'end'|'cancel',value:number|boolean):void {
        this.component.applyGizmoHudGesture(name,phase,value);
    }
}
