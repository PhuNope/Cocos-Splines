import { _decorator, Component } from 'cc';
import { SplineAnimate } from 'db://cocos-splines/splines/Components/SplineAnimate';
import { SplinePositioner } from 'db://cocos-splines/splines/Components/SplinePositioner';
import { SplinePositionMode } from 'db://cocos-splines/splines/Core/SplinePosition';

const { ccclass, property } = _decorator;

/** One spline only. The locomotive owns playback; wagons have Positioners. */
@ccclass('TrainSingleSpline')
export class TrainSingleSpline extends Component {
    @property({ type: SplineAnimate }) locomotive: SplineAnimate | null = null;
    @property({ type: [SplinePositioner] }) wagons: SplinePositioner[] = [];
    @property({ min: 0.01 }) centerSpacing = 3;
    @property() wrapClosed = false;

    start(): void {
        for (const wagon of this.wagons) {
            wagon.followOnUpdate = false; // This controller is the sole writer.
            wagon.followTarget = null;
            wagon.positionMode = SplinePositionMode.Distance;
        }
    }

    lateUpdate(): void {
        const engine = this.locomotive;
        const spline = engine?.currentSpline;
        if (!engine || !spline || spline.length <= 0) return;
        const headDistance = engine.currentDistance;
        this.wagons.forEach((wagon, index) => {
            if (!wagon) return;
            let d = headDistance - (index + 1) * this.centerSpacing;
            if (this.wrapClosed && spline.closed) {
                d = ((d % spline.length) + spline.length) % spline.length;
            } else if (d < 0) {
                return; // Engine must start far enough ahead to fit the train.
            } else {
                d = Math.min(spline.length, d);
            }
            wagon.spline = spline;
            wagon.distance = d;
            wagon.applyPosition();
        });
    }
}
