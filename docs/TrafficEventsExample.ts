/** Copy this to YOUR project under assets/scripts/TrafficEventsExample.ts.
 * Attach to a Node and pick its methods in SplineTrigger.onCross or
 * SplineJunction.onReach Cocos EventHandler controls.
 * The EventHandler calls receive one payload (not just the target Node).
 */
import { _decorator, Component } from 'cc';
import { SplineAnimate } from 'db://cocos-splines/splines/Components/SplineAnimate';
import { SplineTrigger } from 'db://cocos-splines/splines/Components/SplineTrigger';
import { SplineJunction } from 'db://cocos-splines/splines/Components/SplineJunction';
const { ccclass } = _decorator;

@ccclass('TrafficEventsExample')
export class TrafficEventsExample extends Component {
    /** Bind this to SplineTrigger → On Cross (EventHandler) in Inspector. */
    onCheckpoint(payload: { trigger:SplineTrigger; follower:SplineAnimate; progress:number; distance:number; t:number; direction:1|-1 }):void {
        console.log('Checkpoint:', payload.distance, 'units; t:', payload.t, 'direction:', payload.direction);
    }

    /** Bind to SplineJunction → On Reach; set SplineAnimate.Junction Mode = Manual. */
    chooseRoad(payload: { junction:SplineJunction; follower:SplineAnimate; entryIndex:number }):void {
        // Example: choose the first valid alternative; change as needed for traffic logic.
        const other=payload.junction.entries().find(entry=>entry.index!==payload.entryIndex);
        if(other)payload.follower.requestJunctionExit(other.index);
    }

    onRoadChanged(payload: { follower:SplineAnimate; entryIndex:number; exitIndex:number }):void {
        console.log('Routed from entry',payload.entryIndex,'to exit',payload.exitIndex);
    }
}
