import {_decorator,Component,Enum} from 'cc';
import {SplineContainer} from '../Core/SplineContainer';
import {SpeedProfileInterpolation,compileSpeedProfile,sampleSpeedProfile,lookaheadSpeedZoneLimit,MAX_SPEED_PROFILE_KEYS,MAX_SPEED_PROFILE_ZONES} from '../Core/SplineSpeedProfileMath';
import {worldArcDistanceAt,type WorldArcSample} from '../Core/SplineWorldArcLength';
import type {CompiledSpeedProfile} from '../Core/SplineSpeedProfileMath';
const {ccclass,property,menu}=_decorator;
Enum(SpeedProfileInterpolation);
@ccclass('Splines.SplineSpeedProfileKey')
export class SplineSpeedProfileKey{
    @property({range:[0,1,.001],slide:true}) progress=0;
    @property({min:.01,max:10}) multiplier=1;
}
@ccclass('Splines.SplineSpeedProfileZone')
export class SplineSpeedProfileZone{
    @property({range:[0,1,.001],slide:true}) start=0;
    @property({range:[0,1,.001],slide:true}) end=1;
    @property({min:.01,max:10}) maxMultiplier=1;
}
/** Reusable runtime rate curve. A null source applies to any current spline;
 * assign a source to restrict the profile to that spline. */
@ccclass('Splines.SplineSpeedProfile')
@menu('Splines/Spline Speed Profile')
export class SplineSpeedProfile extends Component{
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:Enum(SpeedProfileInterpolation)}) interpolation=SpeedProfileInterpolation.SmoothStep;
    @property({type:[SplineSpeedProfileKey]}) keys:SplineSpeedProfileKey[]=[];
    @property({type:[SplineSpeedProfileZone]}) zones:SplineSpeedProfileZone[]=[];
    @property({min:0,max:10000,tooltip:'Increase in combined playback rate per second. 0 = immediate.'}) acceleration=0;
    @property({min:0,max:10000,tooltip:'Decrease in combined playback rate per second. 0 = immediate.'}) deceleration=0;
    @property({min:0,max:100000,tooltip:'World centerline distance to slow before a zone. 0 = disabled.'}) zoneLookaheadDistance=0;
    private cache:CompiledSpeedProfile|null=null;
    private signature='';
    public appliesTo(spline:SplineContainer):boolean{
        return this.enabled!==false&&this.node?.isValid!==false&&this.node?.activeInHierarchy!==false&&(!this.spline||this.spline===spline);
    }
    public sample(progress:number,closed:boolean):{multiplier:number;limit:number}{
        if(!Array.isArray(this.keys)||this.keys.length>MAX_SPEED_PROFILE_KEYS||!Array.isArray(this.zones)||this.zones.length>MAX_SPEED_PROFILE_ZONES||
           ![this.acceleration,this.deceleration].every(n=>Number.isFinite(n)&&n>=0&&n<=10000)||
           !Number.isFinite(this.zoneLookaheadDistance)||this.zoneLookaheadDistance<0||this.zoneLookaheadDistance>100000)throw Error('Invalid speed profile settings.');
        const signature=JSON.stringify([this.interpolation,Array.from(this.keys,k=>k?[k.progress,k.multiplier]:null),Array.from(this.zones,z=>z?[z.start,z.end,z.maxMultiplier]:null)]);
        if(!this.cache||signature!==this.signature){
            this.cache=compileSpeedProfile(this.keys,this.zones,this.interpolation);this.signature=signature;
        }
        return sampleSpeedProfile(this.cache,progress,closed);
    }
    /** Sample the profile and upcoming entry caps together from the same compiled data. */
    public samplePlayback(progress:number,closed:boolean,base:number,direction:1|-1,
        wrap:boolean,arc:readonly WorldArcSample[]|null):{multiplier:number;limit:number;approachLimit:number}{
        const sample=this.sample(progress,closed);
        const zones=this.cache!.zones;
        const approachLimit=this.zoneLookaheadDistance>0&&zones.length&&arc?
            lookaheadSpeedZoneLimit(zones,progress,direction,closed&&wrap,this.zoneLookaheadDistance,
                Math.min(10000,base*sample.multiplier),arc[arc.length-1].distance,
                p=>worldArcDistanceAt(arc,p)):Infinity;
        return {...sample,approachLimit};
    }
}
