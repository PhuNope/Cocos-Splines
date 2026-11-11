import {_decorator,Enum,MeshRenderer} from 'cc';
import {buildSplineCacheV2} from '../core/SplineCache';
import {buildTubeV2} from '../geometry/ProfileSweep';
import {SplineRoadV2,SplineV2UVAxis} from './SplineRoadV2';
const {ccclass,property,menu,requireComponent,executeInEditMode}=_decorator;
/**
 * Tube from the same spline, frames, mesh allocator and Bake adapter as Road V2.
 * CW closed profile makes normals outward, even on steep/helical splines.
 * For two-sided camera inspection choose flipFaces to reverse the surface.
 */
@ccclass('SplinesV2.SplineExtrude')
@menu('Cocos Splines V2/Extrude')
@requireComponent(MeshRenderer)
@executeInEditMode(true)
export class SplineExtrudeV2 extends SplineRoadV2 {
    @property({min:0.01}) radius=.5;
    @property({min:3,max:256,step:1}) sides=12;
    @property() capEnds=true;
    @property() flipFaces=false;
    protected generate(){
        const cache=buildSplineCacheV2(this.source());
        const geometry=buildTubeV2(cache,{
            radius:this.radius,sides:this.sides,capEnds:this.capEnds&&!this.closed,
            flipFaces:this.flipFaces,step:this.sampleStep,uvMetersPerRepeat:this.uvMetersPerRepeat,
            uvLongitudinalAxis:this.uvLongitudinalAxis===SplineV2UVAxis.U?'u':'v'
        });
        return {geometry};
    }
}
