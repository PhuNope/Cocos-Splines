import {_decorator,Component} from 'cc';
import {SplineAnimate} from 'db://cocos-splines/splines/Components/SplineAnimate';
import {SplineSpeedProfile,SplineSpeedProfileKey,SplineSpeedProfileZone} from 'db://cocos-splines/splines/Components/SplineSpeedProfile';
const {ccclass,property}=_decorator;
@ccclass('CocosSplinesSpeedProfileExampleV2')
export class CocosSplinesSpeedProfileExampleV2 extends Component{
    @property({type:SplineAnimate}) follower:SplineAnimate|null=null;
    @property({type:SplineSpeedProfile}) profile:SplineSpeedProfile|null=null;
    /** Explicit runtime demo configuration; does not overwrite assets on install. */
    public applyDemo():boolean{
        if(!this.follower||!this.profile)return false;
        this.profile.keys=[[0,.5],[.25,1],[.65,1.5],[1,.5]].map(([progress,multiplier])=>{const k=new SplineSpeedProfileKey();k.progress=progress;k.multiplier=multiplier;return k;});
        const z=new SplineSpeedProfileZone();z.start=.4;z.end=.6;z.maxMultiplier=.7;
        this.profile.zones=[z];this.profile.acceleration=2;this.profile.deceleration=2;this.follower.speedProfile=this.profile;return true;
    }
}
