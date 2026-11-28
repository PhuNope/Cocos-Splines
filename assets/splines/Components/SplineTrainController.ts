import {_decorator,Component,Node,Vec3,Quat,CCBoolean} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {SplineContainer} from '../Core/SplineContainer';
import {headwayWorldArc} from '../Core/SplineHeadwayWorldArc';
import {createWorldFrameField} from '../Core/SplineWorldFrames';
import {compileTrainRoute,locateTrainCars,normalizeTrainHead,advanceTrainHead,MAX_TRAIN_CARS,MAX_TRAIN_LEGS} from '../Core/SplineTrainMath';
import type {TrainRouteMetric,TrainCarLocation} from '../Core/SplineTrainMath';
const {ccclass,property,menu}=_decorator;
@ccclass('Splines.SplineTrainLeg')
export class SplineTrainLeg {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:CCBoolean}) backwards=false;
}
type FrameField=ReturnType<typeof createWorldFrameField>;
interface PreparedLeg {spline:SplineContainer;backwards:boolean;arc:ReturnType<typeof headwayWorldArc>;field:FrameField}
interface PreparedRoute {legs:PreparedLeg[];metric:TrainRouteMetric;gap:number;angle:number}
interface Pose {node:Node;position:Vec3;rotation:Quat}
const v=(p:{x:number;y:number;z:number},sign=1)=>new Vec3(p.x*sign,p.y*sign,p.z*sign);
const finite=(p:{x:number;y:number;z:number})=>[p.x,p.y,p.z].every(Number.isFinite);
const ancestor=(a:Node,b:Node):boolean=>{
    let depth=0;
    for(let n:Node|null=b;n;n=n.parent){if(n===a)return true;if(++depth>256)throw Error('Train node hierarchy too deep.');}
    return false;
};
/** Runtime fixed-route consist. All car Nodes must be independent transforms,
 * without a competing Animate/Positioner/physics writer. No Editor mutation.
 */
@ccclass('Splines.SplineTrainController')
@menu('Splines/Spline Train Controller')
export class SplineTrainController extends Component {
    @property({type:[SplineTrainLeg],tooltip:'Ordered continuous full spline legs. Backwards reverses travel orientation.'})
    legs:SplineTrainLeg[]=[];
    @property({type:[Node],tooltip:'Locomotive followed by wagons. Assign independent Nodes; no competing transform writer.'})
    cars:Node[]=[];
    @property({min:.01,max:10000,tooltip:'Distance between car centers along world arc length.'}) centerSpacing=3;
    @property({min:0,max:10000,tooltip:'World arc units per second.'}) speed=4;
    @property({min:0,tooltip:'Initial head route distance. Open route clamps to fit the complete train.'}) startDistance=12;
    @property({type:CCBoolean,tooltip:'Only continuous closed routes can loop.'}) loopRoute=false;
    @property({type:CCBoolean}) playOnStart=true;
    @property({type:CCBoolean}) alignToRoute=true;
    @property({tooltip:'Additional local Euler rotation applied to every car.'}) rotationOffset=new Vec3();
    @property({min:0,max:1,tooltip:'Maximum world gap between consecutive route leg endpoints.'}) maxJoinGap=.01;
    @property({min:0,max:180,tooltip:'Maximum travel tangent angle between route legs.'}) maxJoinAngle=30;
    private route:PreparedRoute|null=null;
    private head=0;
    private playing=false;
    private initialized=false;
    private error='';
    private locations:TrainCarLocation[]=[];
    public get currentDistance():number{return this.head;}
    public get routeLength():number{return this.route?.metric.length??0;}
    public get isPlaying():boolean{return this.playing;}
    public get lastError():string{return this.error;}
    public getCarLocations():TrainCarLocation[]{return this.locations.map(p=>({...p}));}
    private prepare():PreparedRoute{
        if(!Array.isArray(this.legs)||this.legs.length<1||this.legs.length>MAX_TRAIN_LEGS||
           !Array.isArray(this.cars)||this.cars.length<1||this.cars.length>MAX_TRAIN_CARS||
           !Number.isFinite(this.maxJoinGap)||this.maxJoinGap<0||this.maxJoinGap>1||
           !Number.isFinite(this.maxJoinAngle)||this.maxJoinAngle<0||this.maxJoinAngle>180)
            throw Error('Invalid train route/car/continuity settings.');
        const carSet=new Set<Node>();
        for(const car of this.cars){
            if(!car||car.isValid===false||carSet.has(car))throw Error('Train requires unique valid car Nodes.');
            for(const other of carSet)if(ancestor(car,other)||ancestor(other,car))throw Error('Train cars must not be ancestors of each other.');
            carSet.add(car);
        }
        const cached=this.route,old=new Map<SplineContainer,PreparedLeg>();
        for(const l of cached?.legs??[])old.set(l.spline,l);
        const prepared:PreparedLeg[]=[];
        for(const leg of this.legs){
            const spline=leg?.spline;
            if(!spline||spline.count<2||spline.node.isValid===false||spline.enabled===false||spline.node.activeInHierarchy===false||typeof leg.backwards!=='boolean')
                throw Error('Train requires active spline legs, no missing slots.');
            for(const car of carSet)if(ancestor(car,spline.node))throw Error('Train car cannot contain a route source.');
            const arc=headwayWorldArc(spline),prior=old.get(spline);
            const field=prior?.arc===arc?prior.field:createWorldFrameField(spline,0,1,Math.min(1024,arc.length-1));
            const entry={spline,backwards:leg.backwards,arc,field};prepared.push(entry);old.set(spline,entry);
        }
        if(cached&&cached.metric.loop===this.loopRoute&&cached.gap===this.maxJoinGap&&cached.angle===this.maxJoinAngle&&
           cached.legs.length===prepared.length&&prepared.every((l,i)=>l.spline===cached.legs[i].spline&&l.arc===cached.legs[i].arc&&l.backwards===cached.legs[i].backwards))
            return cached;
        const endpoint=(leg:PreparedLeg,end:boolean)=>{
            const p=(end!==leg.backwards)?1:0;
            const f=leg.field.at(p),sign=leg.backwards?-1:1;
            return {p:f.position,t:v(f.tangent,sign)};
        };
        const joins=this.loopRoute?prepared.length:prepared.length-1;
        for(let i=0;i<joins;i++){
            const a=endpoint(prepared[i],true),b=endpoint(prepared[(i+1)%prepared.length],false);
            const gap=Math.hypot(a.p.x-b.p.x,a.p.y-b.p.y,a.p.z-b.p.z);
            const dot=Vec3.dot(a.t,b.t);
            const angle=Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
            if(!Number.isFinite(gap)||!Number.isFinite(angle)||gap>this.maxJoinGap||angle>this.maxJoinAngle+1e-6)
                throw Error('Train route discontinuity at leg '+(i+1)+': gap or tangent angle exceeds limit.');
        }
        return {legs:prepared,metric:compileTrainRoute(prepared,this.loopRoute),gap:this.maxJoinGap,angle:this.maxJoinAngle};
    }
    private place(route:PreparedRoute,distance:number):void{
        const head=normalizeTrainHead(route.metric,distance,this.cars.length,this.centerSpacing);
        const locations=locateTrainCars(route.metric,head,this.cars.length,this.centerSpacing);
        if(!finite(this.rotationOffset))throw Error('Invalid train rotation offset.');
        const delta=Quat.fromEuler(new Quat(),this.rotationOffset.x,this.rotationOffset.y,this.rotationOffset.z);
        const poses:Pose[]=locations.map((p,i)=>{
            const leg=route.legs[p.legIndex],f=leg.field.at(p.progress),sign=leg.backwards?-1:1;
            if(!finite(f.position)||!finite(f.right)||!finite(f.up)||!finite(f.tangent))throw Error('Invalid train pose.');
            const q=Quat.fromAxes(new Quat(),v(f.right,sign),v(f.up),v(f.tangent,sign));
            const rotation=this.alignToRoute?Quat.multiply(new Quat(),q,delta):this.cars[i].worldRotation.clone();
            if(![rotation.x,rotation.y,rotation.z,rotation.w].every(Number.isFinite))throw Error('Invalid train rotation.');
            return {node:this.cars[i],position:v(f.position),rotation};
        });
        const before=poses.map(p=>({node:p.node,position:p.node.worldPosition.clone(),rotation:p.node.worldRotation.clone()}));
        let touched=0;
        try{
            for(const pose of poses){touched++;pose.node.setWorldPosition(pose.position);if(this.alignToRoute)pose.node.setWorldRotation(pose.rotation);}
        }catch(error){
            for(let i=touched-1;i>=0;i--){const p=before[i];try{p.node.setWorldPosition(p.position);p.node.setWorldRotation(p.rotation);}catch{}}
            throw error;
        }
        this.route=route;this.head=head;this.locations=locations;this.error='';
    }
    /** Explicit runtime seek; no writes in Edit Mode. */
    public seekRouteDistance(distance:number):boolean{
        if(EDITOR_NOT_IN_PREVIEW)return false;
        try{this.place(this.prepare(),distance);this.initialized=true;return true;}
        catch(error){this.error=String(error);this.playing=false;return false;}
    }
    public restart():boolean{
        if(!this.seekRouteDistance(this.startDistance))return false;
        this.playing=this.playOnStart;return true;
    }
    public play():boolean{
        if(EDITOR_NOT_IN_PREVIEW)return false;
        if(!this.initialized&&!this.seekRouteDistance(this.startDistance))return false;
        this.playing=true;return true;
    }
    public pause():void{this.playing=false;}
    onEnable():void{if(!EDITOR_NOT_IN_PREVIEW)this.restart();}
    lateUpdate(dt:number):void{
        if(EDITOR_NOT_IN_PREVIEW||!this.playing||!Number.isFinite(dt)||dt<=0)return;
        try{
            const route=this.prepare(),next=advanceTrainHead(route.metric,this.head,this.speed,dt,this.cars.length,this.centerSpacing);
            this.place(route,next.distance);
            if(next.arrived)this.playing=false;
        }catch(error){this.error=String(error);this.playing=false;}
    }
    onDisable():void{this.pause();}
    onDestroy():void{this.pause();this.route=null;this.locations=[];this.initialized=false;}
}
