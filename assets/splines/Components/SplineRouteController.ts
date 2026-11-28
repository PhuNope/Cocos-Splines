import {_decorator,Component,Enum} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {SplineContainer} from '../Core/SplineContainer';
import {SplinePositionMode,toNormalizedDistance} from '../Core/SplinePosition';
import {SplineAnimate,JunctionMode,RouteCostSpace} from './SplineAnimate';
import type {SplineRouteDiagnosis} from '../Core/SplineNetwork';
import {previewSplineItinerary} from '../Core/SplineRouteItineraryMath';
import type {ItineraryPreview} from '../Core/SplineRouteItineraryMath';
const {ccclass,property,menu}=_decorator;
Enum(SplinePositionMode);
@ccclass('Splines.SplineRouteWaypoint')
export class SplineRouteWaypoint {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:Enum(SplinePositionMode)}) positionMode=SplinePositionMode.NormalizedDistance;
    @property({range:[0,1,.001],slide:true}) progress=1;
    @property({min:0}) distance=0;
    @property({min:0,max:3600,tooltip:'Seconds to wait after arrival.'}) dwellSeconds=0;
}
export type RouteControllerState='idle'|'traveling'|'dwelling'|'retrying'|'paused'|'completed'|'failed';
interface Waypoint {spline:SplineContainer;progress:number;dwellSeconds:number}
import {followerControllerOwner,claimFollowerController,releaseFollowerController} from '../Core/SplineFollowerControlRegistry';
const active=(s:SplineContainer|null|undefined):s is SplineContainer=>!!s&&s.enabled!==false&&s.node?.isValid!==false&&s.node?.activeInHierarchy!==false&&s.count>=2&&Number.isFinite(s.length)&&s.length>1e-8;
/** Itinerary orchestration only: SplineAnimate owns movement, junction
 * selection, traffic, spatial avoidance and exact arrival placement.
 * Advance at most one itinerary stage per lateUpdate, outside follower callbacks.
 */
@ccclass('Splines.SplineRouteController')
@menu('Splines/Spline Route Controller')
export class SplineRouteController extends Component {
    @property({type:SplineAnimate,tooltip:'Existing follower. Disable its Play On Start when the itinerary owns startup.'}) follower:SplineAnimate|null=null;
    @property({type:[SplineRouteWaypoint]}) waypoints:SplineRouteWaypoint[]=[];
    @property({tooltip:'Start after all onEnable callbacks have run.'}) playOnStart=true;
    @property({tooltip:'Repeat itinerary from current arrival, without teleporting.'}) repeat=false;
    @property({tooltip:'Validate the complete greedy itinerary before starting (including repeat return).'} ) requireReachableItinerary=false;
    @property({min:0,max:32,step:1,tooltip:'Automatic retries per waypoint after unreachable route or owned follower stop; 0 disables.'}) maxRouteRetries=0;
    @property({min:.05,max:60,tooltip:'Seconds between retry attempts.'}) retryDelay=1;
    private retryCount=0;
    private retryBudget=0;
    private retryInterval=1;
    private retryRemaining=0;
    private pendingStart=false;
    private driven:SplineAnimate|null=null;
    private itinerary:Waypoint[]=[];
    private index=-1;
    private stateValue:RouteControllerState='idle';
    private pausedFrom:'traveling'|'dwelling'|'retrying'='traveling';
    private remaining=0;
    private error='';
    private repeatSnapshot=false;
    private visited=0;
    public get state():RouteControllerState{return this.stateValue;}
    public get waypointIndex():number{return this.index;}
    public get completedWaypoints():number{return this.visited;}
    public get dwellRemaining():number{return this.remaining;}
    public get lastError():string{return this.error;}
    public get isWaitingForTraffic():boolean{return this.stateValue==='traveling'&&!!this.driven?.isWaitingForTraffic;}
    private live(f:SplineAnimate|null):f is SplineAnimate{
        return !!f&&f.enabled!==false&&f.node?.isValid!==false&&f.node?.activeInHierarchy!==false;
    }
    private readWaypoint(w:SplineRouteWaypoint):Waypoint{
        if(!w||!active(w.spline)||![SplinePositionMode.NormalizedDistance,SplinePositionMode.Distance,SplinePositionMode.SplineT].includes(w.positionMode)||
           !Number.isFinite(w.progress)||w.progress<0||w.progress>1||!Number.isFinite(w.distance)||w.distance<0||
           (w.positionMode===SplinePositionMode.Distance&&w.distance>w.spline.length)||
           !Number.isFinite(w.dwellSeconds)||w.dwellSeconds<0||w.dwellSeconds>3600)
            throw Error('Invalid route waypoint or coordinate.');
        const progress=toNormalizedDistance(w.spline,w.positionMode,w.progress,w.distance);
        if(!Number.isFinite(progress)||progress<0||progress>1)throw Error('Invalid normalized route waypoint.');
        return {spline:w.spline,progress,dwellSeconds:w.dwellSeconds};
    }
    /** Read-only diagnosis from the follower's current position/direction.
     * It does not simulate previous waypoints or traffic admission. */
    public inspectWaypoint(index:number):SplineRouteDiagnosis|null{
        if(!this.live(this.follower)||!Number.isInteger(index)||index<0||index>=this.waypoints.length)return null;
        const w=this.readWaypoint(this.waypoints[index]);
        return this.follower.inspectRouteTo(w.spline,w.progress);
    }
    public get routeRetryCount():number{return this.retryCount;}
    public get routeRetryRemaining():number{return this.retryRemaining;}
    /** Read-only sequential preview, using current serialized waypoint settings. */
    public previewItinerary(startIndex=0):ItineraryPreview<SplineContainer>{
        const f=this.follower;if(!this.live(f)||!active(f.currentSpline))throw Error('Route preview requires an active follower source.');
        return this.preview(f,Array.from(this.waypoints,w=>this.readWaypoint(w)),startIndex,this.repeat);
    }
    private preview(f:SplineAnimate,itinerary:Waypoint[],index:number,repeat:boolean):ItineraryPreview<SplineContainer>{
        return previewSplineItinerary({spline:f.currentSpline!,progress:f.currentProgress},f.travelDirection,itinerary,index,repeat,
            f.routeCostSpace===RouteCostSpace.World?'world':'local',
            (from,dir,to)=>f.inspectRouteFrom(from.spline,from.progress,dir,to.spline,to.progress));
    }
    private ownsCommand():boolean{
        const f=this.driven,w=this.itinerary[this.index];
        return !!f&&!!w&&followerControllerOwner(f)===this&&f.junctionMode===JunctionMode.ShortestRoute&&
            f.routeDestination===w.spline&&f.routeDestinationProgress===w.progress&&f.stopOnRouteArrival;
    }
    private release(cancel:boolean):void{
        const f=this.driven;
        if(f&&followerControllerOwner(f)===this){
            if(cancel&&this.live(f)&&this.ownsCommand())f.cancelRouteNavigation();
            releaseFollowerController(f,this);
        }
        this.driven=null;
    }
    private fail(error:unknown,cancel=true):false{
        this.release(cancel);this.error=String(error);this.stateValue='failed';this.remaining=0;this.retryRemaining=0;return false;
    }
    private scheduleRetry(message:string):void{
        if(this.retryCount>=this.retryBudget)throw Error(message);
        this.driven!.suspendRouteNavigation();
        this.stateValue='retrying';this.error=message;this.retryRemaining=this.retryInterval;this.remaining=0;
    }
    private activate(index:number,resetRetries=true):void{
        const f=this.driven,w=this.itinerary[index];
        if(!this.live(f)||followerControllerOwner(f)!==this||!w||!active(w.spline))
            throw Error('Route follower or waypoint no longer available.');
        const diagnosis=f.inspectRouteTo(w.spline,w.progress);
        if(resetRetries)this.retryCount=0;
        if(diagnosis.status!=='reachable'||!diagnosis.route){
            const message=diagnosis.message||'Waypoint unreachable.';
            if(diagnosis.status!=='unreachable'||this.retryCount>=this.retryBudget)throw Error(message);
            // Own a paused command for the pending waypoint. This cancels the
            // previous pending admission but never releases the occupied exit.
            this.index=index;f.followRouteTo(w.spline,w.progress,true);this.scheduleRetry(message);return;
        }
        this.index=index;f.followRouteTo(w.spline,w.progress,true);f.play();
        this.stateValue='traveling';this.error='';this.remaining=0;this.retryRemaining=0;
    }
    public startRoute(startIndex=0):boolean{
        if(EDITOR_NOT_IN_PREVIEW)return false;
        this.pendingStart=false;
        if(this.driven)return false; // use stopRoute first; no implicit takeover
        try{
            const f=this.follower;
            if(!this.live(f)||!active(f.currentSpline)||followerControllerOwner(f)!==undefined)
                throw Error('Route requires an active, unowned follower with a valid source.');
            if(!Array.isArray(this.waypoints)||this.waypoints.length<1||this.waypoints.length>128||
               !Number.isInteger(startIndex)||startIndex<0||startIndex>=this.waypoints.length||typeof this.repeat!=='boolean')
                throw Error('Route requires 1–128 waypoints and a valid start index.');
            if(!Number.isInteger(this.maxRouteRetries)||this.maxRouteRetries<0||this.maxRouteRetries>32||
               !Number.isFinite(this.retryDelay)||this.retryDelay<.05||this.retryDelay>60)throw Error('Invalid route retry policy.');
            const itinerary=Array.from(this.waypoints,w=>this.readWaypoint(w));
            if(this.requireReachableItinerary){const report=this.preview(f,itinerary,startIndex,this.repeat);if(report.status!=='reachable')throw Error(report.message);}
            this.retryBudget=this.maxRouteRetries;this.retryInterval=this.retryDelay;this.retryCount=0;this.retryRemaining=0;
            this.itinerary=itinerary;this.index=-1;this.visited=0;this.repeatSnapshot=this.repeat;
            if(!claimFollowerController(f,this))throw Error('Follower already controlled.');this.driven=f;this.activate(startIndex);return true;
        }catch(error){return this.fail(error);}
    }
    public pauseRoute():boolean{
        if(EDITOR_NOT_IN_PREVIEW||!this.driven||!['traveling','dwelling','retrying'].includes(this.stateValue))return false;
        if(!this.ownsCommand())return this.fail('Follower route changed externally.',false);
        this.pausedFrom=this.stateValue as 'traveling'|'dwelling'|'retrying';this.driven.pause();this.stateValue='paused';return true;
    }
    public resumeRoute():boolean{
        if(EDITOR_NOT_IN_PREVIEW||this.stateValue!=='paused'||!this.live(this.driven))return false;
        if(!this.ownsCommand())return this.fail('Follower route changed externally.',false);
        this.stateValue=this.pausedFrom;
        if(this.stateValue==='traveling'&&!this.driven.routeArrived)this.driven.play();
        return true;
    }
    /** Explicit replan while traveling or retrying. Never cancel a live
     * traffic wait; the follower already recalculates on admission retry. */
    public replanCurrentWaypoint():boolean{
        if(EDITOR_NOT_IN_PREVIEW||!this.live(this.driven)||!['traveling','retrying'].includes(this.stateValue))return false;
        if(!this.ownsCommand())return this.fail('Follower route changed externally.',false);
        if(this.driven.routeArrived||this.driven.isWaitingForTraffic)return false;
        try{this.activate(this.index,false);return this.stateValue==='traveling';}
        catch(error){return this.fail(error);}
    }
    public stopRoute():void{
        this.pendingStart=false;this.release(!EDITOR_NOT_IN_PREVIEW);this.stateValue='idle';this.index=-1;this.remaining=0;this.error='';this.itinerary=[];this.visited=0;this.retryCount=0;this.retryRemaining=0;
    }
    onEnable():void{if(!EDITOR_NOT_IN_PREVIEW)this.pendingStart=this.playOnStart;}
    onDisable():void{this.stopRoute();}
    onDestroy():void{this.stopRoute();}
    lateUpdate(dt:number):void{
        if(EDITOR_NOT_IN_PREVIEW)return;
        if(this.pendingStart){this.pendingStart=false;this.startRoute();return;}
        if(!this.driven)return;
        const f=this.driven;
        try{
            if(!this.live(f)||this.follower!==f||!this.ownsCommand()){
                this.fail('Follower disabled, replaced or route changed externally.',this.ownsCommand());return;
            }
            if(this.stateValue==='paused')return;
            if(!active(this.itinerary[this.index]?.spline)){this.fail('Active waypoint became invalid.');return;}
            if(this.stateValue==='traveling'){
                if(f.routeArrived){
                    f.pause();this.visited++;this.remaining=this.itinerary[this.index].dwellSeconds;this.stateValue='dwelling';
                }else if(!f.isPlaying)this.scheduleRetry('Follower stopped before waypoint arrival.');
                return;
            }
            if(this.stateValue==='retrying'){
                if(f.isPlaying){this.fail('Follower resumed externally during route retry.');return;}
                if(!Number.isFinite(dt)||dt<0)return;
                this.retryRemaining=Math.max(0,this.retryRemaining-dt);
                if(this.retryRemaining>0)return;
                this.retryCount++;this.activate(this.index,false);return;
            }
            if(this.stateValue!=='dwelling')return;
            if(f.isPlaying){this.fail('Follower resumed externally during waypoint dwell.');return;}
            if(!Number.isFinite(dt)||dt<0)return;
            this.remaining=Math.max(0,this.remaining-dt);
            if(this.remaining>0)return;
            const next=this.index+1;
            if(next<this.itinerary.length)this.activate(next);
            else if(this.repeatSnapshot)this.activate(0);
            else {this.release(true);this.stateValue='completed';}
        }catch(error){this.fail(error);}
    }
}
