import {_decorator,Component} from 'cc';
import {SplineJunction} from 'db://cocos-splines/splines/Components/SplineJunction';
import {SplineTrainController} from 'db://cocos-splines/splines/Components/SplineTrainController';
const {ccclass,property}=_decorator;
/** Assign a configured Spline Train Controller. Optional runtime control API
 * example: restart on demand, pause, resume, or seek a world-arc coordinate.
 */
@ccclass('CocosSplinesTrainControllerExampleV2')
export class CocosSplinesTrainControllerExampleV2 extends Component {
    @property({type:SplineTrainController}) train:SplineTrainController|null=null;
    @property({min:0}) seekDistance=12;
    @property({type:SplineJunction}) junction:SplineJunction|null=null;
    @property({min:0,step:1}) entryIndex=0;
    @property({min:0,step:1}) exitIndex=1;
    public chooseBranch():boolean{return !!this.junction&&(this.train?.requestJunctionExit(this.junction,this.entryIndex,this.exitIndex)??false);}
    public finishRoute():boolean{return this.train?.finishDynamicRoute()??false;}
    public restartTrain():boolean{return this.train?.restart()??false;}
    public pauseTrain():void{this.train?.pause();}
    public resumeTrain():boolean{return this.train?.play()??false;}
    public seekTrain():boolean{return this.train?.seekRouteDistance(this.seekDistance)??false;}
}
