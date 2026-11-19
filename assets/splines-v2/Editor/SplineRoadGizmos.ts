import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import type {IDrawGizmos} from 'db://cocos-gizmos/RegisterGizmos';
import type {SplineRoad} from '../Components/SplineRoad';
import {splineGizmos} from './SplineGizmoHandler';

/** Road has only read-only Scene guides; all Knot editing belongs to Path. */
export class SplineRoadGizmos implements IDrawGizmos<SplineRoad> {
    constructor(public readonly component:SplineRoad) {}
    public onDrawGizmosSelected():void {
        const road=this.component;
        if(!EDITOR_NOT_IN_PREVIEW||!road.node?.isValid)return;
        const guide=road.createSceneGizmoGuide();
        if(guide)splineGizmos.drawGuide(road.node,guide);
    }
}
