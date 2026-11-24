import {_decorator,Component} from 'cc';
import {SplineJunction} from 'db://cocos-splines/splines/Components/SplineJunction';
import {SplineTrafficController,SplineTrafficPhase,SplineTrafficConflict}
    from 'db://cocos-splines/splines/Components/SplineTrafficController';
const {ccclass,property}= _decorator;
/** Two-phase traffic signal example: one entry (0) and two exits (1,2).
 * Configured at Play only; does not mutate source knot positions.
 */
@ccclass('CocosSplinesTrafficSignalsExampleV2')
export class CocosSplinesTrafficSignalsExampleV2 extends Component {
    @property({type:SplineJunction}) junction:SplineJunction|null=null;
    @property({type:SplineTrafficController}) controller:SplineTrafficController|null=null;
    @property({tooltip:'Configure two mutually exclusive exits at Play.'}) applyOnStart=true;
    start():void{if(this.applyOnStart)this.configure();}
    public configure():boolean{
        if(!this.junction||!this.controller||this.junction.connections.length<3){
            console.warn('[Cocos Splines Example] Assign Junction with three links and Traffic Controller.');
            return false;
        }
        const phase=(exit:number):SplineTrafficPhase=>{
            const p=new SplineTrafficPhase();
            p.greenExits=[exit];p.greenSeconds=6;p.yellowSeconds=2;return p;
        };
        const conflict=new SplineTrafficConflict();
        conflict.firstExit=1;conflict.secondExit=2;
        this.controller.junction=this.junction;
        this.controller.phases=[phase(1),phase(2)];
        this.controller.conflicts=[conflict];
        this.controller.allRedSeconds=1;
        this.controller.adaptiveTraffic=false;
        this.controller.restartCycle();
        return true;
    }
}
