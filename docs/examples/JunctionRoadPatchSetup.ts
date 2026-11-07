import { _decorator, Component, Material } from 'cc';
import { SplineJunction, SplineJunctionLink } from 'db://cocos-splines/splines/Components/SplineJunction';
import { SplineJunctionMesh } from 'db://cocos-splines/splines/Components/SplineJunctionMesh';
import { SplineContainer } from 'db://cocos-splines/splines/Core/SplineContainer';
import { SplinePositionMode } from 'db://cocos-splines/splines/Core/SplinePosition';

const { ccclass, property } = _decorator;

/** Example of three flat roads that meet at the same world-space endpoint.
 * Assign the SplineContainer and Junction/JunctionMesh references in Inspector.
 * Each SplineContainer must already have a Road mesh on itself or a direct child.
 * Call configure() explicitly (e.g. from another script) after setting references.
 */
@ccclass('JunctionRoadPatchSetup')
export class JunctionRoadPatchSetup extends Component {
    @property({ type: SplineJunction }) junction: SplineJunction | null = null;
    @property({ type: SplineJunctionMesh }) patch: SplineJunctionMesh | null = null;
    @property({ type: SplineContainer }) incoming: SplineContainer | null = null;
    @property({ type: SplineContainer }) outgoingLeft: SplineContainer | null = null;
    @property({ type: SplineContainer }) outgoingRight: SplineContainer | null = null;
    @property({ type: Material }) asphalt: Material | null = null;

    /** Sets A's END (1) and B/C's START (0). Does not move knots. */
    public configure(): void {
        if (!this.junction || !this.patch || !this.incoming || !this.outgoingLeft || !this.outgoingRight) return;
        const link = (spline: SplineContainer, progress: number): SplineJunctionLink => {
            const entry = new SplineJunctionLink();
            entry.spline = spline;
            entry.positionMode = SplinePositionMode.NormalizedDistance;
            entry.progress = progress;
            return entry;
        };
        this.junction.connections = [
            link(this.incoming, 1),
            link(this.outgoingLeft, 0),
            link(this.outgoingRight, 0),
        ];
        this.patch.junction = this.junction;
        this.patch.material = this.asphalt;
        this.patch.setback = 3;
        this.patch.defaultWidth = 6;
        this.patch.surfaceLift = 0.015;
        this.patch.tolerance = 0.15;
        this.patch.rebuild();
    }
}
