/** Explicit lane layout in the spline's rotated frame X-axis.
 * This shifts actual follower world positions, not the road mesh or lane ID.
 * No implicit lane setting is applied to existing scenes.
 */
export interface LaneLayout {
    enabled:boolean;
    laneId:number;
    laneCount:number;
    laneWidth:number;
}
export function laneLateralOffset(layout:LaneLayout):number{
    if(!layout.enabled)return 0;
    const {laneId,laneCount,laneWidth}=layout;
    if(!Number.isInteger(laneCount)||laneCount<1||laneCount>32||
       !Number.isInteger(laneId)||laneId<0||laneId>=laneCount||
       !Number.isFinite(laneWidth)||laneWidth<=0||laneWidth>100)
        throw Error('Invalid spline physical lane layout.');
    // Lane 0 is -frame-X; lane N-1 is +frame-X.
    return (laneId-(laneCount-1)/2)*laneWidth;
}
