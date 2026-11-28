import {_decorator,Component,Enum} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {SplineContainer} from '../Core/SplineContainer';
import {SplinePositionMode,toNormalizedDistance} from '../Core/SplinePosition';
import {SplineAnimate,JunctionMode} from './SplineAnimate';
import type {SplineRouteDiagnosis} from '../Core/SplineNetwork';
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
export type RouteControllerState='idle'|'traveling'|'dwelling'|'paused'|'completed'|'failed';
interface Waypoint {spline:SplineContainer;progress:number;dwellSeconds:number}
const owners=new WeakMap<SplineAnimate,SplineRouteController>();
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
    private pendingStart=false;
    private driven:SplineAnimate|null=null;
    private itinerary:Waypoint[]=[];
    private index=-1;
    private stateValue:RouteControllerState='idle';
    private pausedFrom:'traveling'|'dwelling'='traveling';
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
    private ownsCommand():boolean{
        const f=this.driven,w=this.itinerary[this.index];
        return !!f&&!!w&&owners.get(f)===this&&f.junctionMode===JunctionMode.ShortestRoute&&
            f.routeDestination===w.spline&&f.routeDestinationProgress===w.progress&&f.stopOnRouteArrival;
    }
    private release(cancel:boolean):void{
        const f=this.driven;
        if(f&&owners.get(f)===this){
            if(cancel&&this.live(f)&&this.ownsCommand())f.cancelRouteNavigation();
            owners.delete(f);
        }
        this.driven=null;
    }
    private fail(error:unknown,cancel=true):false{
        this.release(cancel);this.error=String(error);this.stateValue='failed';this.remaining=0;return false;
    }
    private activate(index:number):void{
        const f=this.driven,w=this.itinerary[index];
        if(!this.live(f)||owners.get(f)!==this||!w||!active(w.spline))
            throw Error('Route follower or waypoint no longer available.');
        const diagnosis=f.inspectRouteTo(w.spline,w.progress);
        if(diagnosis.status!=='reachable'||!diagnosis.route)throw Error(diagnosis.message||'Waypoint unreachable.');
        // Set index only after preflight, so a failed next waypoint still
        // allows cleanup of the previously owned follower command.
        this.index=index;f.followRouteTo(w.spline,w.progress,true);f.play();
        this.stateValue='traveling';this.error='';this.remaining=0;
    }
    public startRoute(startIndex=0):boolean{
        if(EDITOR_NOT_IN_PREVIEW)return false;
        this.pendingStart=false;
        if(this.driven)return false; // use stopRoute first; no implicit takeover
        try{
            const f=this.follower;
            if(!this.live(f)||!active(f.currentSpline)||owners.has(f))
                throw Error('Route requires an active, unowned follower with a valid source.');
            if(!Array.isArray(this.waypoints)||this.waypoints.length<1||this.waypoints.length>128||
               !Number.isInteger(startIndex)||startIndex<0||startIndex>=this.waypoints.length||typeof this.repeat!=='boolean')
                throw Error('Route requires 1–128 waypoints and a valid start index.');
            const itinerary=this.waypoints.map(w=>this.readWaypoint(w));
            this.itinerary=itinerary;this.index=-1;this.visited=0;this.repeatSnapshot=this.repeat;
            owners.set(f,this);this.driven=f;this.activate(startIndex);return true;
        }catch(error){return this.fail(error);}
    }
    public pauseRoute():boolean{
        if(EDITOR_NOT_IN_PREVIEW||!this.driven||!['traveling','dwelling'].includes(this.stateValue))return false;
        if(!this.ownsCommand())return this.fail('Follower route changed externally.',false);
        this.pausedFrom=this.stateValue as 'traveling'|'dwelling';this.driven.pause();this.stateValue='paused';return true;
    }
    public resumeRoute():boolean{
        if(EDITOR_NOT_IN_PREVIEW||this.stateValue!=='paused'||!this.live(this.driven))return false;
        if(!this.ownsCommand())return this.fail('Follower route changed externally.',false);
        this.stateValue=this.pausedFrom;
        if(this.stateValue==='traveling'&&!this.driven.routeArrived)this.driven.play();
        return true;
    }
    public stopRoute():void{
        this.pendingStart=false;this.release(!EDITOR_NOT_IN_PREVIEW);this.stateValue='idle';this.index=-1;this.remaining=0;this.error='';this.itinerary=[];this.visited=0;
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
                }else if(!f.isPlaying)this.fail('Follower stopped before waypoint arrival.');
                return;
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
