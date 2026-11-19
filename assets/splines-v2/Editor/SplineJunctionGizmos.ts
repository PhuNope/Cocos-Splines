import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import type {IDrawGizmos} from 'db://cocos-gizmos/RegisterGizmos';
import type {JunctionPatch} from '../Components/JunctionPatch';
import {splineGizmos} from './SplineGizmoHandler';

/** Junction renders immutable trim/curb guides and never moves Road Knots. */
export class SplineJunctionGizmos implements IDrawGizmos<JunctionPatch> {
    constructor(public readonly component:JunctionPatch) {}
    public onDrawGizmosSelected():void {
        const junction=this.component;
        if(!EDITOR_NOT_IN_PREVIEW||!junction.node?.isValid)return;
        const guide=junction.createSceneGizmoGuide();
        if(guide)splineGizmos.drawGuide(junction.node,guide);
    }
}
