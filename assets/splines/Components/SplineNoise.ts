import { _decorator, Component, Vec3, Enum } from 'cc';
import { SplineContainer } from '../Core/SplineContainer';
import { NoiseLayerConfig, sampleNoiseLayers } from '../Core/SplineNoiseMath';
const {ccclass,property,menu,executeInEditMode}=_decorator;

/** A bounded, serialized noise layer along normalized arc progress.
 * Amplitude is in the spline's evaluated Right/Up/Forward frame, NOT World axes.
 */
@ccclass('Splines.SplineNoiseLayer')
export class SplineNoiseLayer implements NoiseLayerConfig {
    @property enabled=true;
    @property({min:1,max:64,step:1,tooltip:'Integer cycles per spline; periodic on closed loops.'})
    frequency=4;
    @property({min:1,max:6,step:1}) octaves=3;
    @property({range:[0,1,0.01],slide:true}) persistence=.5;
    @property({min:-1000,max:1000,tooltip:'Phase shift in lattice coordinates.'}) phase=0;
    @property({tooltip:'Additional integer seed for this layer.'}) seed=0;
    @property({type:Vec3,tooltip:'Right/Up/Forward maximum displacement in spline frame.'})
    amplitude=new Vec3();
    @property({range:[0,.5,.01],slide:true,tooltip:'For OPEN splines only: smoothly fade to zero at both endpoints.'})
    fadeEnds=.1;
}

/** Non-destructive noise field; never modifies Knot positions or source Meshes.
 * Consumers explicitly opt in, initially SplineObjectController.
 */
@ccclass('Splines.SplineNoise')
@menu('Splines/Spline Noise Layers')
@executeInEditMode(true)
export class SplineNoise extends Component {
    @property({type:SplineContainer,tooltip:'Optional source spline for closed-loop seam detection.'})
    spline:SplineContainer|null=null;
    @property({tooltip:'Global integer noise seed, repeatable after save/reload.'}) seed=12345;
    @property({type:[SplineNoiseLayer],tooltip:'Add up to 16 layers. Empty layers = no change.'})
    layers:SplineNoiseLayer[]=[];

    public getSpline():SplineContainer|null {
        return this.spline||this.node.getComponent(SplineContainer)||
            this.node.parent?.getComponent(SplineContainer)||null;
    }
    /** Returns Right/Up/Forward offsets. Caller applies the spline rotation. */
    public sample(progress:number):Vec3 {
        if(!this.enabled||this.layers.length===0)return new Vec3();
        const v=sampleNoiseLayers(this.layers,progress,this.seed,this.getSpline()?.closed===true);
        return new Vec3(v.x,v.y,v.z);
    }
    public getRevision():string {
        return JSON.stringify([this.enabled,this.seed,this.spline?.uuid,
            this.getSpline()?.closed,this.layers.map(layer=>[
                layer.enabled,layer.frequency,layer.octaves,layer.persistence,
                layer.phase,layer.seed,layer.amplitude.x,layer.amplitude.y,
                layer.amplitude.z,layer.fadeEnds])]);
    }
}
