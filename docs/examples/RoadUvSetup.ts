import { _decorator, Component } from 'cc';
import { SplineRoad } from 'db://cocos-splines/splines/Components/SplineRoad';
import { RoadUvDirection } from 'db://cocos-splines/splines/Core/SplineRoadMath';

const { ccclass, property } = _decorator;
@ccclass('RoadUvSetup')
export class RoadUvSetup extends Component {
    @property({ type: SplineRoad }) road: SplineRoad | null = null;

    start(): void {
        if (!this.road) return;
        this.road.width = 7;
        this.road.uvDirection = RoadUvDirection.LengthAlongU;
        this.road.uvMetersPerRepeat = 5;
        this.road.uvWidthTiles = 1;
        this.road.rebuild();
    }
}
