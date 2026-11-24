import {_decorator,Component,Prefab,Vec3} from 'cc';
import {SplineContainer} from 'db://cocos-splines/splines/Core/SplineContainer';
import {SplineObjectController}
    from 'db://cocos-splines/splines/Components/SplineObjectController';
const {ccclass,property}= _decorator;
/** Project-owned Prefab population example.
 * Drag one or more .prefab assets into Prefabs; then press Play.
 * Spawns runtime children only; never overwrites serialized prefab data.
 */
@ccclass('CocosSplinesPrefabSpawningExampleV2')
export class CocosSplinesPrefabSpawningExampleV2 extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:SplineObjectController}) controller:SplineObjectController|null=null;
    @property({type:[Prefab]}) prefabs:Prefab[]=[];
    @property({min:1,max:256,step:1}) count=12;
    @property seed=2026;
    @property({tooltip:'Spawn at Play after references have been assigned.'}) applyOnStart=true;
    start():void{if(this.applyOnStart)this.configure();}
    public configure():number{
        if(!this.spline||!this.controller||!this.prefabs.some(p=>!!p)){
            console.warn('[Cocos Splines Example] Assign Spline, Object Controller and one or more Prefab assets.');
            return 0;
        }
        this.controller.spline=this.spline;
        this.controller.prefabs=this.prefabs.filter(p=>!!p);
        this.controller.count=this.count;
        this.controller.seed=this.seed;
        this.controller.randomPosition=new Vec3(.25,.05,.25);
        this.controller.randomRotation=new Vec3(0,15,0);
        this.controller.randomScale=.15;
        this.controller.spawnOnStart=false;
        return this.controller.respawn();
    }
}
