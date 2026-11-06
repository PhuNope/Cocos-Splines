import { _decorator, Component, Node, Quat } from 'cc';
import { SplineContainer } from 'db://cocos-splines/splines/Core/SplineContainer';

const { ccclass, property } = _decorator;

/** One leg of a preplanned, continuous train route. */
@ccclass('TrainRouteLeg')
export class TrainRouteLeg {
    @property({ type: SplineContainer }) spline: SplineContainer | null = null;
    @property() backwards = false;
}

/** Route spans several splines: every wagon samples the same route history. */
@ccclass('TrainRouteConsist')
export class TrainRouteConsist extends Component {
    @property({ type: [TrainRouteLeg] }) legs: TrainRouteLeg[] = [];
    @property({ type: [Node] }) cars: Node[] = []; // [locomotive, wagon 1, ...]
    @property({ min: 0.01 }) centerSpacing = 3;
    @property({ min: 0 }) speed = 4;
    @property({ min: 0 }) startDistance = 12;
    @property() loopRoute = false;
    @property() playOnStart = true;

    private headDistance = 0;
    private playing = false;
    private readonly turnAround = Quat.fromEuler(new Quat(), 0, 180, 0);

    start(): void {
        this.headDistance = this.startDistance;
        this.playing = this.playOnStart;
        this.placeCars();
    }

    update(dt: number): void {
        if (this.playing && Number.isFinite(dt) && dt > 0) {
            this.headDistance += this.speed * dt;
        }
        this.placeCars();
    }

    public play(): void { this.playing = true; }
    public pause(): void { this.playing = false; }
    public seekRouteDistance(distance: number): void {
        this.headDistance = Math.max(0, distance);
        this.placeCars();
    }

    private placeCars(): void {
        const usable = this.legs.filter(
            (leg) => !!leg && !!leg.spline && leg.spline.count >= 2 && leg.spline.length > 0,
        );
        const total = usable.reduce((sum, leg) => sum + leg.spline!.length, 0);
        if (total <= 0) return;

        this.cars.forEach((car, index) => {
            if (!car || !car.isValid) return;
            let routeDistance = this.headDistance - index * this.centerSpacing;
            if (this.loopRoute) {
                routeDistance = ((routeDistance % total) + total) % total;
            } else {
                // Avoid stacking wagons at route start: choose startDistance
                // >= (cars.length - 1) * centerSpacing in the Inspector.
                if (routeDistance < 0) return;
                routeDistance = Math.min(routeDistance, total);
            }

            for (let i = 0; i < usable.length; i++) {
                const leg = usable[i];
                const spline = leg.spline!;
                const length = spline.length;
                const last = i === usable.length - 1;
                if (routeDistance > length && !last) {
                    routeDistance -= length;
                    continue;
                }
                const localDistance = Math.max(0, Math.min(length, routeDistance));
                const splineDistance = leg.backwards ? length - localDistance : localDistance;
                const progress = splineDistance / length;
                car.setWorldPosition(spline.evaluateWorldPositionAtDistance(splineDistance));
                const rot = Quat.multiply(
                    new Quat(), spline.node.worldRotation, spline.evaluateRotation(progress),
                );
                if (leg.backwards) Quat.multiply(rot, rot, this.turnAround);
                car.setWorldRotation(rot);
                break;
            }
        });
    }
}
