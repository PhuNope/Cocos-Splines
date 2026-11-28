import {_decorator,Component} from 'cc';
import {SplineGroupController} from 'db://cocos-splines/splines/Components/SplineGroupController';
const {ccclass,property}=_decorator;
@ccclass('CocosSplinesGroupControllerExampleV2')
export class CocosSplinesGroupControllerExampleV2 extends Component{
    @property({type:SplineGroupController}) group:SplineGroupController|null=null;
    @property({min:.01,max:10}) playbackRate=1.5;
    public arrangeGroup():boolean{return this.group?.initializeFormation()??false;}
    public playGroup():boolean{return this.group?.startGroup()??false;}
    public pauseGroup():boolean{return this.group?.pauseGroup()??false;}
    public resumeGroup():boolean{return this.group?.resumeGroup()??false;}
    public changeRate():boolean{return this.group?.setSpeedMultiplier(this.playbackRate)??false;}
    public stopGroup():void{this.group?.stopGroup();}
}
