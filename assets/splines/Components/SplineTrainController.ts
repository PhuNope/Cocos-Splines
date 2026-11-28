import {_decorator,Component,Node,Vec3,Quat,CCBoolean,CCInteger} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {SplineContainer} from '../Core/SplineContainer';
import {headwayWorldArc} from '../Core/SplineHeadwayWorldArc';
import {createWorldFrameField} from '../Core/SplineWorldFrames';
import {compileTrainRoute,locateTrainCars,normalizeTrainHead,advanceTrainHead,MAX_TRAIN_CARS,MAX_TRAIN_LEGS} from '../Core/SplineTrainMath';
import type {TrainRouteMetric,TrainCarLocation} from '../Core/SplineTrainMath';
import {trainTailOffset} from '../Core/SplineTrainMath';
import {SplineJunction,JunctionExitDirection,JunctionTrafficSignal} from './SplineJunction';
import {SplineTrainTrafficBinding} from '../Core/SplineTrainTrafficBinding';
import type {TrainTrafficTransition} from '../Core/SplineTrainTrafficBinding';
const {ccclass,property,menu}=_decorator;
@ccclass('Splines.SplineTrainLeg')
export class SplineTrainLeg {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:CCBoolean}) backwards=false;
    @property({type:SplineJunction,tooltip:'For traffic mode: junction from previous leg into this leg. Leave empty on first leg.'}) entryJunction:SplineJunction|null=null;
    @property({type:CCInteger,min:0,tooltip:'Link index on the previous leg at its travel endpoint.'}) junctionEntryIndex=0;
    @property({type:CCInteger,min:0,tooltip:'Destination link index at this leg start.'}) junctionExitIndex=1;
}
type FrameField=ReturnType<typeof createWorldFrameField>;
interface PreparedLeg {spline:SplineContainer;backwards:boolean;arc:ReturnType<typeof headwayWorldArc>;field:FrameField}
interface PreparedRoute {legs:PreparedLeg[];metric:TrainRouteMetric;gap:number;angle:number}
interface Pose {node:Node;position:Vec3;rotation:Quat}
export interface TrainHistoryLeg {spline:SplineContainer;backwards:boolean;start:number;end:number;entryJunction:SplineJunction|null;junctionEntryIndex:number;junctionExitIndex:number}
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
    @property({type:CCBoolean,tooltip:'Open fixed routes only. Every internal join requires a junction and explicit link indexes.'}) enableTraffic=false;
    @property({min:.001,max:1,tooltip:'Stop this far before a blocked junction (head center). Add vehicle front length if needed.'}) trafficStopGap=.05;
    @property({min:0,max:10000,tooltip:'Extra world arc beyond tail center before releasing a passed junction.'}) trafficTailClearance=.5;
    @property({type:CCBoolean,tooltip:'Manual endpoint junction branching; exactly one initial leg, open route and traffic required.'}) dynamicRouting=false;
    private dynamicLegs:SplineTrainLeg[]=[];
    private pendingLeg:SplineTrainLeg|null=null;
    private dynamicFinished=false;
    private readonly traffic=new SplineTrainTrafficBinding();
    private trafficRoute:PreparedRoute|null=null;
    private trafficLayout:TrainTrafficTransition[]=[];
    private trafficCars:Node[]=[];
    private trafficSpacing=0;
    private trafficClearance=0;
    private trafficStopMargin=0;
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
    public get trafficWaiting():boolean{return this.traffic.waitingIndex>=0;}
    public get trafficReservations():number{return this.traffic.reservedCount;}
    public getCarLocations():TrainCarLocation[]{return this.locations.map(p=>({...p}));}
    public get awaitingRouteChoice():boolean{return this.dynamicLegs.length>0&&!this.dynamicFinished&&!this.pendingLeg&&!!this.route&&this.head>=this.route.metric.length-this.trafficStopGap;}
    public getRouteHistory():TrainHistoryLeg[]{
        const config=this.dynamicLegs.length?this.dynamicLegs:this.legs;
        return (this.route?.legs??[]).map((l,i)=>({spline:l.spline,backwards:l.backwards,start:this.route!.metric.legs[i].start,end:this.route!.metric.legs[i].end,
            entryJunction:config[i]?.entryJunction??null,junctionEntryIndex:config[i]?.junctionEntryIndex??0,junctionExitIndex:config[i]?.junctionExitIndex??1}));
    }
    private prepare(config:ReadonlyArray<SplineTrainLeg>=this.legs):PreparedRoute{
        if(!Array.isArray(config)||config.length<1||config.length>MAX_TRAIN_LEGS||
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
        for(const leg of config){
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
    private trafficTransitions(route:PreparedRoute,configs:ReadonlyArray<SplineTrainLeg>=this.legs,committedCount=0):TrainTrafficTransition[]{
        if(route.metric.loop)throw Error('Train traffic currently requires an open route.');
        if(!Number.isFinite(this.trafficStopGap)||this.trafficStopGap<.001||this.trafficStopGap>1||
           !Number.isFinite(this.trafficTailClearance)||this.trafficTailClearance<0||this.trafficTailClearance>10000)
            throw Error('Invalid train traffic clearances.');
        const transitions:TrainTrafficTransition[]=[];
        for(let i=1;i<route.legs.length;i++){
            const config=configs[i],junction=config.entryJunction,a=config.junctionEntryIndex,b=config.junctionExitIndex;
            if(!junction||junction.enabled===false||junction.node?.isValid===false||
               !SplineJunction.active.has(junction)||!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a===b)
                throw Error('Train traffic requires an active junction and distinct link indexes at leg '+(i+1)+'.');
            const entry=junction.connections[a],exit=junction.connections[b],previous=route.legs[i-1],next=route.legs[i];
            const from=previous.backwards?0:1,to=next.backwards?1:0;
            if(!entry||!exit||entry.spline!==previous.spline||exit.spline!==next.spline||
               Math.abs(entry.getProgress()-from)>1e-6||Math.abs(exit.getProgress()-to)>1e-6)
                throw Error('Train traffic junction links must match the route leg endpoints.');
            const dir=exit.exitDirection===JunctionExitDirection.Forward?false:exit.exitDirection===JunctionExitDirection.Backward?true:previous.backwards;
            if(i>=committedCount&&dir!==next.backwards)throw Error('Train traffic junction exit direction conflicts with route.');
            if(!Number.isInteger(exit.maxFollowers)||exit.maxFollowers<0||exit.maxFollowers>4096||
               ![JunctionTrafficSignal.Green,JunctionTrafficSignal.Red,JunctionTrafficSignal.Yellow].includes(exit.trafficSignal))
                throw Error('Invalid train traffic exit capacity or signal.');
            if(transitions.some(t=>t.junction===junction&&t.exitIndex===b))throw Error('Train traffic route cannot repeat a reserved exit.');
            const distance=route.metric.legs[i].start;
            if(route.metric.legs[i].length<=this.trafficStopGap)throw Error('Train traffic leg is shorter than the stop margin.');
            // A blocked train must fit before its first junction. Leave a
            // strictly positive route distance between head and the gate.
            if(i===1&&distance-this.trafficStopGap<trainTailOffset(this.cars.length,this.centerSpacing))
                throw Error('Train does not fit before first traffic junction.');
            transitions.push({distance,junction,exitIndex:b,capacity:exit.maxFollowers,green:exit.trafficSignal===JunctionTrafficSignal.Green});
        }
        return transitions;
    }
    private verifyTrafficLayout(route:PreparedRoute,transitions:TrainTrafficTransition[]):void{
        if(route!==this.trafficRoute||this.centerSpacing!==this.trafficSpacing||
           this.trafficTailClearance!==this.trafficClearance||this.trafficStopGap!==this.trafficStopMargin||this.cars.length!==this.trafficCars.length||
           this.cars.some((c,i)=>c!==this.trafficCars[i])||transitions.length!==this.trafficLayout.length||
           transitions.some((t,i)=>{const old=this.trafficLayout[i];return t.distance!==old.distance||t.junction!==old.junction||t.exitIndex!==old.exitIndex;}))
            throw Error('Train traffic route or consist changed; disable and reinitialize safely.');
    }
    private validateDynamicConfig():void{
        if(!this.enableTraffic||this.loopRoute||this.legs.length!==1||!this.legs[0]?.spline||
           this.legs[0].spline.closed||this.legs[0].entryJunction)
            throw Error('Dynamic train requires traffic, one open initial leg without junction, and no loop.');
        const first=this.dynamicLegs[0];
        if(first&&(first.spline!==this.legs[0].spline||first.backwards!==this.legs[0].backwards))
            throw Error('Dynamic train initial leg changed; reinitialize safely.');
    }
    private candidateLeg(junction:SplineJunction,entryIndex:number,exitIndex:number):SplineTrainLeg{
        const from=this.dynamicLegs[this.dynamicLegs.length-1];
        if(!from||!junction||!SplineJunction.active.has(junction)||junction.enabled===false||
           !Number.isInteger(entryIndex)||!Number.isInteger(exitIndex)||entryIndex<0||exitIndex<0||entryIndex===exitIndex)
            throw Error('Invalid dynamic train junction selection.');
        const entry=junction.connections[entryIndex],exit=junction.connections[exitIndex];
        if(!entry||entry.spline!==from.spline||Math.abs(entry.getProgress()-(from.backwards?0:1))>1e-6||!exit?.spline)
            throw Error('Dynamic train selection must join the current route endpoint.');
        if(![JunctionExitDirection.Preserve,JunctionExitDirection.Forward,JunctionExitDirection.Backward].includes(exit.exitDirection))
            throw Error('Invalid dynamic train exit direction.');
        const backwards=exit.exitDirection===JunctionExitDirection.Backward||
            (exit.exitDirection===JunctionExitDirection.Preserve&&from.backwards);
        if(exit.spline.closed||this.dynamicLegs.some(l=>l.spline===exit.spline))
            throw Error('Dynamic train history cannot revisit a spline or enter a closed spline.');
        if(Math.abs(exit.getProgress()-(backwards?1:0))>1e-6)
            throw Error('Dynamic train exit must be a full spline endpoint.');
        const leg=new SplineTrainLeg();leg.spline=exit.spline;leg.backwards=backwards;
        leg.entryJunction=junction;leg.junctionEntryIndex=entryIndex;leg.junctionExitIndex=exitIndex;
        return leg;
    }
    /** Explicit branch selection. Only the next uncommitted endpoint can
     * change. Replacing a blocked choice cancels its FIFO token. */
    public requestJunctionExit(junction:SplineJunction,entryIndex:number,exitIndex:number):boolean{
        if(EDITOR_NOT_IN_PREVIEW||!this.dynamicRouting||!this.initialized||this.dynamicFinished||!this.dynamicLegs.length)return false;
        try{
            this.validateDynamicConfig();
            const leg=this.candidateLeg(junction,entryIndex,exitIndex);
            const current=this.prepare(this.dynamicLegs);
            this.verifyTrafficLayout(current,this.trafficTransitions(current,this.dynamicLegs,this.dynamicLegs.length));
            const configs=[...this.dynamicLegs,leg],route=this.prepare(configs);
            this.trafficTransitions(route,configs,this.dynamicLegs.length);
            const prior=this.pendingLeg;
            if(!prior||prior.entryJunction!==junction||prior.junctionEntryIndex!==entryIndex||prior.junctionExitIndex!==exitIndex||
               prior.spline!==leg.spline||prior.backwards!==leg.backwards)this.traffic.cancelWait();
            this.pendingLeg=leg;this.error='';return true;
        }catch(error){this.error=String(error);return false;}
    }
    /** Declare the current endpoint the destination. No further branch
     * requests until the next safe initialization. Existing slots remain. */
    public finishDynamicRoute():boolean{
        if(EDITOR_NOT_IN_PREVIEW||!this.dynamicRouting||!this.initialized||!this.dynamicLegs.length)return false;
        this.pendingLeg=null;this.traffic.cancelWait();this.dynamicFinished=true;return true;
    }
    private advanceDynamic(dt:number):void{
        this.validateDynamicConfig();
        const history=this.dynamicLegs,current=this.prepare(history),transitions=this.trafficTransitions(current,history,history.length);
        this.verifyTrafficLayout(current,transitions);
        const next=advanceTrainHead(current.metric,this.head,this.speed,dt,this.cars.length,this.centerSpacing);
        const limit=current.metric.length-this.trafficStopGap;
        let configs=history,route=current,layout=transitions;
        let target=this.dynamicFinished?next.distance:Math.min(next.distance,limit);
        if(this.pendingLeg&&next.distance>=limit){
            const pending=this.pendingLeg;
            // Validate the requested exit again, but never silently choose a
            // different branch if its direction or link changed while waiting.
            const checked=this.candidateLeg(pending.entryJunction!,pending.junctionEntryIndex,pending.junctionExitIndex);
            if(checked.spline!==pending.spline||checked.backwards!==pending.backwards)
                throw Error('Pending dynamic train exit changed; choose again.');
            configs=[...history,pending];route=this.prepare(configs);layout=this.trafficTransitions(route,configs,history.length);
            const extended=advanceTrainHead(route.metric,this.head,this.speed,dt,this.cars.length,this.centerSpacing);
            // One new decision per tick. Never overshoot an undecided endpoint.
            target=Math.min(extended.distance,route.metric.length-this.trafficStopGap);
        }
        const move=this.traffic.prepare(layout,this.head,target,trainTailOffset(this.cars.length,this.centerSpacing),this.trafficTailClearance,this.trafficStopGap);
        try{
            const appended=configs!==history&&!move.blocked;
            this.place(appended?route:current,move.distance);move.commit();
            if(appended){
                this.dynamicLegs=configs;this.trafficRoute=route;this.trafficLayout=layout;this.pendingLeg=null;
            }
            if(this.dynamicFinished&&next.arrived&&!move.blocked)this.pause();
        }catch(error){move.rollback();throw error;}
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
        try{
            if(this.trafficRoute)throw Error('Train traffic forbids seeking after initialization; use pause/play, or safely disable and reinitialize.');
            if(this.dynamicRouting)this.validateDynamicConfig();
            const route=this.prepare();
            if(this.enableTraffic){
                const transitions=this.trafficTransitions(route),head=normalizeTrainHead(route.metric,distance,this.cars.length,this.centerSpacing);
                if(this.dynamicRouting&&head>route.metric.length-this.trafficStopGap)throw Error('Dynamic train must fit before initial endpoint stop margin.');
                if(transitions.length&&head>transitions[0].distance-this.trafficStopGap)
                    throw Error('Train traffic must initialize before the first junction.');
                this.place(route,head);
                this.trafficRoute=route;this.trafficLayout=transitions;this.trafficCars=this.cars.slice();this.trafficSpacing=this.centerSpacing;this.trafficClearance=this.trafficTailClearance;this.trafficStopMargin=this.trafficStopGap;
                if(this.dynamicRouting){
                    const first=new SplineTrainLeg();first.spline=this.legs[0].spline;first.backwards=this.legs[0].backwards;this.dynamicLegs=[first];
                }
            }else this.place(route,distance);
            this.initialized=true;return true;
        }
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
    public pause():void{this.playing=false;this.traffic.cancelWait();}
    onEnable():void{if(!EDITOR_NOT_IN_PREVIEW)this.restart();}
    lateUpdate(dt:number):void{
        if(EDITOR_NOT_IN_PREVIEW||!this.playing||!Number.isFinite(dt)||dt<=0)return;
        try{
            if((this.dynamicLegs.length>0)!==this.dynamicRouting)throw Error('Dynamic train mode changed; disable and reinitialize safely.');
            if(this.dynamicRouting){this.advanceDynamic(dt);return;}
            const route=this.prepare(),next=advanceTrainHead(route.metric,this.head,this.speed,dt,this.cars.length,this.centerSpacing);
            if(!!this.trafficRoute!==this.enableTraffic)throw Error('Train traffic mode changed; disable and reinitialize safely.');
            if(this.enableTraffic){
                const transitions=this.trafficTransitions(route);this.verifyTrafficLayout(route,transitions);
                const move=this.traffic.prepare(transitions,this.head,next.distance,trainTailOffset(this.cars.length,this.centerSpacing),this.trafficTailClearance,this.trafficStopGap);
                try{this.place(route,move.distance);move.commit();}catch(error){move.rollback();throw error;}
                if(!move.blocked&&next.arrived)this.pause();
            }else{this.place(route,next.distance);if(next.arrived)this.pause();}
        }catch(error){this.error=String(error);this.pause();}
    }
    private resetTraffic():void{this.traffic.clear();this.trafficRoute=null;this.trafficLayout=[];this.trafficCars=[];this.dynamicLegs=[];this.pendingLeg=null;this.dynamicFinished=false;this.initialized=false;}
    onDisable():void{this.pause();this.resetTraffic();}
    onDestroy():void{this.pause();this.resetTraffic();this.route=null;this.locations=[];}
}
