import {_decorator,Component} from 'cc';
import {SplineRouteController} from 'db://cocos-splines/splines/Components/SplineRouteController';
const {ccclass,property}=_decorator;
@ccclass('CocosSplinesRouteControllerExampleV2')
export class CocosSplinesRouteControllerExampleV2 extends Component{
    @property({type:SplineRouteController}) route:SplineRouteController|null=null;
    public startItinerary():boolean{return this.route?.startRoute()??false;}
    public pauseItinerary():boolean{return this.route?.pauseRoute()??false;}
    public resumeItinerary():boolean{return this.route?.resumeRoute()??false;}
    public replanItinerary():boolean{return this.route?.replanCurrentWaypoint()??false;}
    public stopItinerary():void{this.route?.stopRoute();}
}
