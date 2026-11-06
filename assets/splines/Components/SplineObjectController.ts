import { _decorator, Component, Prefab, Node, instantiate, Vec3, Quat, Enum } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer } from '../Core/SplineContainer';
import { SplineModifiers } from './SplineModifiers';
import { InstantiateMethod } from './SplineInstantiate';
const {ccclass,property,menu}=_decorator;

/** Distribute multiple prefab variants over arc distance with deterministic jitter,
 * lane offsets and keyframed modifiers. Runtime-only generated children are destroyed
 * on disable and never saved into editor scenes.
 */
@ccclass('Splines.SplineObjectController')
@menu('Splines/Spline Object Controller')
export class SplineObjectController extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:[Prefab],tooltip:'Prefab variations. Selection is deterministic for the seed.'}) prefabs:Prefab[]=[];
    @property({type:Node,tooltip:'Generated children parent; defaults to this Node.'}) parentNode:Node|null=null;
    @property({type:SplineModifiers}) modifiers:SplineModifiers|null=null;
    @property({type:Enum(InstantiateMethod)}) method:InstantiateMethod=InstantiateMethod.Count;
    @property({min:1,max:2048,step:1}) count=12;
    @property({min:0.001}) spacing=2;
    @property({range:[0,1,0.001],slide:true}) startProgress=0;
    @property({range:[0,1,0.001],slide:true}) endProgress=1;
    @property({type:Vec3,tooltip:'Right/Up/Forward offset in spline frame.'}) offset=new Vec3();
    @property({type:Vec3}) randomPosition=new Vec3();
    @property({type:Vec3,tooltip:'Euler jitter in degrees.'}) randomRotation=new Vec3();
    @property({min:0,max:1,tooltip:'Uniform scale variation (+/- fraction).'}) randomScale=0;
    @property({min:0.01}) scaleMultiplier=1;
    @property({tooltip:'Seed for prefab choice and all jitter axes.'}) seed=12345;
    @property alignToSpline=true;
    @property includeEndPoint=true;
    @property rebuildOnChange=false;
    private _generated:Node[]=[];
    private _signature='';
    private rand(index:number,channel:number):number{
        let v=(this.seed|0)^Math.imul(index+13,0x9e3779b9)^Math.imul(channel+7,0x85ebca6b);
        v=Math.imul(v^(v>>>16),0x7feb352d);v=Math.imul(v^(v>>>15),0x846ca68b);
        return ((v^(v>>>16))>>>0)/4294967296;
    }
    private signature():string{
        const spline=this.spline||this.node.parent?.getComponent(SplineContainer)||null;
        return JSON.stringify([spline?.getRevision(),spline?.node.worldMatrix,this.prefabs.map(p=>p?.uuid),this.parentNode?.uuid,
            this.modifiers?.getRevision(),this.method,this.count,this.spacing,this.startProgress,this.endProgress,this.offset,
            this.randomPosition,this.randomRotation,this.randomScale,this.scaleMultiplier,this.seed,this.alignToSpline,this.includeEndPoint]);
    }
    onEnable():void{if(!EDITOR_NOT_IN_PREVIEW)this.rebuild();}
    update():void{if(!EDITOR_NOT_IN_PREVIEW&&this.rebuildOnChange&&this.signature()!==this._signature)this.rebuild();}
    public clear():void{for(const n of this._generated){if(n.isValid)n.destroy();}this._generated=[];}
    public rebuild():void{
        this.clear();
        const spline=this.spline||this.node.parent?.getComponent(SplineContainer)||null;
        const variants=this.prefabs.filter((p):p is Prefab=>!!p);
        if(!spline||spline.count<2||!variants.length){this._signature=this.signature();return;}
        const start=Math.max(0,Math.min(1,this.startProgress)),end=Math.max(0,Math.min(1,this.endProgress));
        if(end<start){this._signature=this.signature();return;}
        const range=end-start;
        const closedLoop=spline.closed&&range>=1-1e-6;
        const span=spline.length*range;
        const steps=Math.max(0.001,this.spacing);
        const total=this.method===InstantiateMethod.Distance
            ? Math.min(2048,Math.max(1,Math.floor(span/steps)+1))
            : Math.min(2048,Math.max(1,Math.floor(this.count)));
        for(let i=0;i<total;i++){
            const d=this.method===InstantiateMethod.Distance?Math.min(span,i*steps):
                (total>1?span*i/((closedLoop||!this.includeEndPoint)?total:total-1):0);
            if(closedLoop&&d>=span-1e-6&&i>0)break;
            const progress=start+(spline.length>1e-8?d/spline.length:0);
            const modifier=this.modifiers?.sample(progress);
            const template=variants[Math.min(variants.length-1,Math.floor(this.rand(i,0)*variants.length))];
            const node=instantiate(template);node.name=`Spline Object ${String(i).padStart(3,'0')}`;
            node.setParent(this.parentNode||this.node);
            const frame=new Quat();Quat.multiply(frame,spline.node.worldRotation,spline.evaluateRotation(progress));
            const jitter=(axis:number,range:number)=>(this.rand(i,axis)*2-1)*range;
            const delta=new Vec3(this.offset.x+(modifier?.offset.x||0)+jitter(1,this.randomPosition.x),
                this.offset.y+(modifier?.offset.y||0)+jitter(2,this.randomPosition.y),
                this.offset.z+(modifier?.offset.z||0)+jitter(3,this.randomPosition.z));
            Vec3.transformQuat(delta,delta,frame);
            const pos=spline.evaluateWorldPosition(progress);Vec3.add(pos,pos,delta);node.setWorldPosition(pos);
            if(this.alignToSpline){
                const r=Quat.fromEuler(new Quat(),jitter(4,this.randomRotation.x),jitter(5,this.randomRotation.y),
                    jitter(6,this.randomRotation.z)+(modifier?.roll||0));
                Quat.multiply(frame,frame,r);node.setWorldRotation(frame);
            }
            const s=node.scale.clone();const f=this.scaleMultiplier*(1+jitter(7,this.randomScale));
            s.x*=f*(modifier?.scale.x||1);s.y*=f*(modifier?.scale.y||1);s.z*=f*(modifier?.scale.z||1);
            node.setScale(s);
            this._generated.push(node);
        }
        this._signature=this.signature();
    }
    onDisable():void{this.clear();}
    onDestroy():void{this.clear();}
}
