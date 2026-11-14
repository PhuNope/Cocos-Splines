import {_decorator,Enum,MeshRenderer} from 'cc';
import {buildSplineCacheV2} from '../core/SplineCache';
import {buildTubeV2} from '../geometry/ProfileSweep';
import {SplineMeshGeneratorV2} from './SplineMeshGeneratorV2';
import {SplineV2UVAxis} from './SplineGeometrySettingsV2';

const {ccclass,property,menu,requireComponent,executeInEditMode}=_decorator;

/**
 * Dedicated tube generator; NOT a Road subclass.
 * SplinePath supplies all knot data and shared rebuild notifications.
 * Radius/profile/caps are independent of road width, curb and Junction.
 */
@ccclass('SplinesV2.SplineExtrude')
@menu('Cocos Splines V2/Extrude')
@requireComponent(MeshRenderer)
@executeInEditMode(true)
export class SplineExtrudeV2 extends SplineMeshGeneratorV2 {
    @property({min:0.01}) radius=.5;
    @property({min:3,max:256,step:1}) sides=12;
    @property() capEnds=true;
    @property() flipFaces=false;
    @property({type:Enum(SplineV2UVAxis),tooltip:'Texture longitudinal axis: U (image X), V (image Y).'})
    uvLongitudinalAxis=SplineV2UVAxis.V;

    /** Tube mesh does not inherit Road fillet or junction diagnostics. */
    public inspectCornerRisk():null{return null;}

    protected generate(){
        const source=this.source();
        const cache=buildSplineCacheV2(source);
        const geometry=buildTubeV2(cache,{
            radius:this.radius,sides:this.sides,
            capEnds:this.capEnds&&!source.closed,
            flipFaces:this.flipFaces,step:this.sampleStep,
            uvMetersPerRepeat:this.uvMetersPerRepeat,
            uvLongitudinalAxis:this.uvLongitudinalAxis===SplineV2UVAxis.U?'u':'v'
        });
        return {geometry};
    }
}
