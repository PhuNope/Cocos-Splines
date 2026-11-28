import {_decorator,Component,Prefab,JsonAsset,Collider} from 'cc';
import {SplineContainer} from 'db://cocos-splines/splines/Core/SplineContainer';
import {SplineObjectController} from 'db://cocos-splines/splines/Components/SplineObjectController';
const {ccclass,property}=_decorator;
/** Project-owned setup for installed Population Graph JSON examples.
 * Set Object Controller Spawn On Start=false in Inspector before Play.
 * Assign graph, spline and exact prefab slots; optional explicit colliders.
 */
@ccclass('CocosSplinesPopulationGraphExampleV2')
export class CocosSplinesPopulationGraphExampleV2 extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:SplineObjectController}) controller:SplineObjectController|null=null;
    @property({type:JsonAsset}) graph:JsonAsset|null=null;
    @property({type:[Prefab]}) prefabs:Prefab[]=[];
    @property({type:[Collider]}) surfaces:Collider[]=[];
    @property({type:[Collider]}) obstacles:Collider[]=[];
    @property applyOnStart=true;
    start():void{if(this.applyOnStart)this.configure();}
    public configure():number{
        if(!this.spline||!this.controller||!this.graph||!this.prefabs.length||this.prefabs.some(p=>!p))
            throw Error('Assign Spline, Controller, Graph and every Prefab slot.');
        const c=this.controller;
        c.spawnOnStart=false;
        c.spline=this.spline;c.prefabs=this.prefabs.slice();
        c.usePopulationGraph=true;c.populationGraphAsset=this.graph;
        c.surfaceColliders=this.surfaces.slice();c.obstacleColliders=this.obstacles.slice();
        return c.respawn();
    }
}
