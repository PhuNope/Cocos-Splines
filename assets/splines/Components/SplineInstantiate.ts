import { _decorator, Component, Prefab, Node, instantiate, Vec3, Quat, Enum } from 'cc';
import { SplineContainer } from '../Core/SplineContainer';
import { SplinePositionMode, toNormalizedRange } from '../Core/SplinePosition';
Enum(SplinePositionMode);
const {ccclass,property,menu}= _decorator;
export enum InstantiateMethod { Count=0, Distance=1 }
Enum(InstantiateMethod);
/** Spawn prefab instances at equal arc distances. No hidden editor mutations.
 * Invoke rebuild() or enable rebuildOnChange to regenerate at runtime.
 */
@ccclass('Splines.SplineInstantiate')
@menu('Splines/Spline Instantiate')
export class SplineInstantiate extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:Prefab}) prefab:Prefab|null=null;
    @property({type:Node,tooltip:'Defaults to this node'}) parentNode:Node|null=null;
    @property({min:1,max:2048,step:1}) count=12;
    @property({type:Enum(InstantiateMethod),tooltip:'Count: evenly spaced instances. Distance: fixed gap measured in spline-local units.'})
    method:InstantiateMethod=InstantiateMethod.Count;
    @property({min:0.001,tooltip:'Spacing for Distance mode, in spline-local units.'}) spacing=2;
    @property({range:[0,1,0.001],slide:true}) startProgress=0;
    @property({range:[0,1,0.001],slide:true}) endProgress=1;
    @property({type:Enum(SplinePositionMode),tooltip:'Normalized Distance (legacy), Distance in local units, or geometric Spline t.'})
    rangeMode:SplinePositionMode=SplinePositionMode.NormalizedDistance;
    @property({min:0,tooltip:'Start distance when Range Mode = Distance.'}) startDistance=0;
    @property({min:0,tooltip:'End distance when Range Mode = Distance. The interval is clamped to current spline length.'}) endDistance=10;
    @property({type:Vec3,tooltip:'Offset in spline orientation space (right/up/forward), applied in world.'}) positionOffset=new Vec3();
    @property({type:Vec3,tooltip:'Euler orientation offset, degrees.'}) rotationOffset=new Vec3();
    @property({type:Vec3,tooltip:'Deterministic random local position offsets, symmetric about zero.'}) randomOffset=new Vec3();
    @property({tooltip:'Seed used to vary random offsets, stable across rebuilds.'}) seed=12345;
    @property({min:0.01,tooltip:'Scale each generated prefab uniformly by this factor.'}) scaleMultiplier=1;
    @property alignToSpline=true;
    @property({tooltip:'Automatically regenerate when the spline changes during gameplay'}) rebuildOnChange=false;
    @property({tooltip:'Closed curves do not duplicate the endpoint'}) includeEndPoint=true;
    private _generated:Node[]=[];
    private _signature='';
    onEnable():void{this.rebuild();}
    update():void{if(this.rebuildOnChange&&this.signature()!==this._signature)this.rebuild();}
    private signature():string{
        const matrix=this.spline?.node.worldMatrix;
        return JSON.stringify([this.spline?.getRevision(),matrix&&[matrix.m00,matrix.m01,matrix.m02,matrix.m04,matrix.m05,matrix.m06,matrix.m08,matrix.m09,matrix.m10,matrix.m12,matrix.m13,matrix.m14],
            this.count,this.method,this.spacing,this.startProgress,this.endProgress,this.rangeMode,this.startDistance,this.endDistance,this.positionOffset,this.rotationOffset,
            this.randomOffset,this.seed,this.scaleMultiplier,this.alignToSpline,this.includeEndPoint,this.prefab?.uuid,this.parentNode?.uuid]);
    }
    private random(index:number,axis:number):number {
        // Stateless deterministic 32-bit hash: rebuilding does not shuffle instances.
        let x=(this.seed|0)^Math.imul(index+1,0x9e3779b9)^Math.imul(axis+1,0x85ebca6b);
        x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);x=(x^(x>>>16))>>>0;
        return x/4294967295*2-1;
    }
    public rebuild():void{
        this.clear();
        if(!this.prefab||!this.spline||this.spline.count<2){this._signature=this.signature();return;}
        const [start,end]=toNormalizedRange(this.spline,this.rangeMode,this.startProgress,this.endProgress,this.startDistance,this.endDistance);
        if(end<start){this._signature=this.signature();return;}
        const span=end-start,fullClosed=this.spline.closed&&span>=1-1e-6;
        const length=this.spline.length;
        const parent=this.parentNode||this.node;
        const count=Math.max(1,Math.min(2048,Math.floor(this.count)));
        const step=Math.max(0.001,this.spacing);
        // For Distance mode, do not create overlapping endpoints of full closed loops.
        const maxByDistance=Math.max(1,Math.min(2048,Math.floor(span*length/step)+1));
        const sampleCount=this.method===InstantiateMethod.Distance ? maxByDistance : count;
        for(let i=0;i<sampleCount;i++){
            const normalized=this.method===InstantiateMethod.Distance
                ? (length>1e-8?Math.min(span,i*step/length):0)
                : (count<=1?0:span*i/(fullClosed||!this.includeEndPoint?count:count-1));
            if(this.method===InstantiateMethod.Distance && fullClosed && i>0 && normalized>=span-1e-7)break;
            const t=start+normalized;
            const n=instantiate(this.prefab);n.name=`Spline Instance ${String(i).padStart(3,'0')}`;n.setParent(parent);
            const q=new Quat();Quat.multiply(q,this.spline.node.worldRotation,this.spline.evaluateRotation(t));
            const delta=new Vec3(this.positionOffset.x+this.random(i,0)*this.randomOffset.x,
                this.positionOffset.y+this.random(i,1)*this.randomOffset.y,
                this.positionOffset.z+this.random(i,2)*this.randomOffset.z);
            Vec3.transformQuat(delta,delta,q);
            const worldPosition=this.spline.evaluateWorldPosition(t);
            Vec3.add(worldPosition,worldPosition,delta);
            n.setWorldPosition(worldPosition);
            if(this.alignToSpline){
                const rot=Quat.fromEuler(new Quat(),this.rotationOffset.x,this.rotationOffset.y,this.rotationOffset.z);
                Quat.multiply(q,q,rot);n.setWorldRotation(q);
            }
            const multiplier=Math.max(0.01,this.scaleMultiplier);
            if(multiplier!==1){const size=n.scale.clone();Vec3.multiplyScalar(size,size,multiplier);n.setScale(size);}
            this._generated.push(n);
        }
        this._signature=this.signature();
    }
    public clear():void{for(const n of this._generated)if(n.isValid)n.destroy();this._generated=[];}
    onDisable():void{this.clear();}
    onDestroy():void{this.clear();}
}
