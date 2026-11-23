/** Lightweight snapshot API for opted-in gameplay traffic systems.
 * No Cocos scene traversal, no player/owner IDs, and no persistent history.
 */
import {splineTrafficGate} from './SplineTrafficGate';
import {splineHeadwayRegistry} from './SplineHeadway';
import {splineProximityRegistry} from './SplineProximity';

export function getSplineTrafficTelemetry(){
    return {
        junction:splineTrafficGate.getTelemetry(),
        headwayFollowers:splineHeadwayRegistry.size,
        proximity:splineProximityRegistry.getTelemetry(),
    };
}
