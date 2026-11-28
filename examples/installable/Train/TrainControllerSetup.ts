import {_decorator,Component} from 'cc';
import {SplineTrainController} from 'db://cocos-splines/splines/Components/SplineTrainController';
const {ccclass,property}=_decorator;
/** Assign a configured Spline Train Controller. Optional runtime control API
 * example: restart on demand, pause, resume, or seek a world-arc coordinate.
 */
@ccclass('CocosSplinesTrainControllerExampleV2')
export class CocosSplinesTrainControllerExampleV2 extends Component {
    @property({type:SplineTrainController}) train:SplineTrainController|null=null;
    @property({min:0}) seekDistance=12;
    public restartTrain():boolean{return this.train?.restart()??false;}
    public pauseTrain():void{this.train?.pause();}
    public resumeTrain():boolean{return this.train?.play()??false;}
    public seekTrain():boolean{return this.train?.seekRouteDistance(this.seekDistance)??false;}
}
