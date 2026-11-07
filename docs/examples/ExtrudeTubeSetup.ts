import { _decorator, Component } from 'cc';
import { SplineExtrude } from 'db://cocos-splines/splines/Components/SplineExtrude';
import { SplinePositionMode } from 'db://cocos-splines/splines/Core/SplinePosition';

const { ccclass, property } = _decorator;
@ccclass('ExtrudeTubeSetup')
export class ExtrudeTubeSetup extends Component {
    @property({ type: SplineExtrude }) extrude: SplineExtrude | null = null;

    start(): void {
        if (!this.extrude) return;
        this.extrude.radius = 0.2;
        this.extrude.endRadius = 0.08;
        this.extrude.sides = 16;
        this.extrude.uvTiling = 0.25;
        this.extrude.rangeMode = SplinePositionMode.NormalizedDistance;
        this.extrude.startProgress = 0;
        this.extrude.endProgress = 1;
        this.extrude.rebuild();
    }
}
