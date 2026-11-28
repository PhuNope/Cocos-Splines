import {_decorator,Component} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {SplineAnimate} from './SplineAnimate';
import {claimFollowerController,releaseFollowerController,followerControllerOwner,setFollowerControllerRate,validFollowerRate} from '../Core/SplineFollowerControlRegistry';
const {ccclass,property,menu}=_decorator;
export type SplineGroupState='idle'|'playing'|'paused'|'completed'|'failed';
export interface SplineGroupStatus {total:number;playing:number;stopped:number;trafficWaiting:number;headwayBlocked:number;proximityBlocked:number}
interface Member {follower:SplineAnimate;target:SplineAnimate['node'];resume:boolean}
/** Independent followers, one playback owner. No shared transform writer,
 * teleports, forced junction choices, or direct traffic gate mutation. */
@ccclass('Splines.SplineGroupController')
@menu('Splines/Spline Group Controller')
export class SplineGroupController extends Component{
    @property({type:[SplineAnimate],tooltip:'1–128 independent followers. Disable their Play On Start when the group owns startup.'})
    followers:SplineAnimate[]=[];
    @property({tooltip:'Start the group after follower enable callbacks.'}) playOnStart=true;
    @property({min:.01,max:10,tooltip:'Runtime playback rate multiplier; does not change follower Speed or Duration.'}) speedMultiplier=1;
    private members:Member[]=[];
    private stateValue:SplineGroupState='idle';
    private error='';
    private pendingStart=false;
    public get state():SplineGroupState{return this.stateValue;}
    public get lastError():string{return this.error;}
    private live(f:SplineAnimate|null|undefined):f is SplineAnimate{
        return !!f&&f.enabled!==false&&f.node?.isValid!==false&&f.node?.activeInHierarchy!==false;
    }
    private validateMembers():Member[]{
        if(!Array.isArray(this.followers)||this.followers.length<1||this.followers.length>128||!validFollowerRate(this.speedMultiplier))
            throw Error('Group requires 1–128 followers and a rate .01–10.');
        const seen=new Set<SplineAnimate>(),targets=new Set<SplineAnimate['node']>(),result:Member[]=[];
        for(const f of this.followers){
            if(!this.live(f)||seen.has(f)||followerControllerOwner(f)!==undefined||
               !f.currentSpline||f.currentSpline.enabled===false||f.currentSpline.node?.isValid===false||
               f.currentSpline.node?.activeInHierarchy===false||f.currentSpline.count<2)
                throw Error('Group requires unique, active, unowned followers with valid splines.');
            const target=f.target||f.node;
            if(!target||target.isValid===false||targets.has(target))throw Error('Group requires unique valid follower targets.');
            for(const other of targets){
                let n:typeof target|null=target,depth=0;
                while(n){if(n===other||++depth>256)throw Error('Group target hierarchies overlap or are too deep.');n=n.parent;}
                n=other;depth=0;
                while(n){if(n===target||++depth>256)throw Error('Group target hierarchies overlap or are too deep.');n=n.parent;}
            }
            seen.add(f);targets.add(target);result.push({follower:f,target,resume:false});
        }
        return result;
    }
    private verify():void{
        if(!validFollowerRate(this.speedMultiplier)||!Array.isArray(this.followers)||this.members.length!==this.followers.length||
           this.members.some((m,i)=>!this.live(m.follower)||m.follower!==this.followers[i]||followerControllerOwner(m.follower)!==this||
               (m.follower.target||m.follower.node)!==m.target||m.target.isValid===false||
               !m.follower.currentSpline||m.follower.currentSpline.enabled===false||m.follower.currentSpline.node?.isValid===false||
               m.follower.currentSpline.node?.activeInHierarchy===false||m.follower.currentSpline.count<2))
            throw Error('Group membership, target, source or control lease changed. Stop and start again.');
    }
    private release(stop:boolean):void{
        for(const m of this.members){
            const f=m.follower;
            if(followerControllerOwner(f)!==this)continue;
            try{if(stop&&this.live(f))f.suspendRouteNavigation();}
            finally{releaseFollowerController(f,this);}
        }
        this.members=[];
    }
    private fail(error:unknown):false{
        this.release(true);this.stateValue='failed';this.error=String(error);return false;
    }
    public getStatus():SplineGroupStatus{
        const status:SplineGroupStatus={total:this.members.length,playing:0,stopped:0,trafficWaiting:0,headwayBlocked:0,proximityBlocked:0};
        for(const {follower:f} of this.members){
            if(this.live(f)&&f.isPlaying)status.playing++;else status.stopped++;
            if(this.live(f)&&f.isWaitingForTraffic)status.trafficWaiting++;
            if(this.live(f)&&f.isHeadwayBlocked)status.headwayBlocked++;
            if(this.live(f)&&f.isProximityBlocked)status.proximityBlocked++;
        }
        return status;
    }
    public startGroup():boolean{
        if(EDITOR_NOT_IN_PREVIEW)return false;
        this.pendingStart=false;
        if(this.members.length)return false;
        try{
            const members=this.validateMembers();
            // Preflight all members before touching any playback state.
            for(const m of members){
                if(!claimFollowerController(m.follower,this))throw Error('Follower already controlled.');
                this.members.push(m);
            }
            for(const {follower:f} of members)setFollowerControllerRate(f,this,this.speedMultiplier);
            for(const {follower:f} of members)f.play();
            this.stateValue='playing';this.error='';return true;
        }catch(error){return this.fail(error);}
    }
    public pauseGroup():boolean{
        if(EDITOR_NOT_IN_PREVIEW||this.stateValue!=='playing')return false;
        try{
            this.verify();
            for(const m of this.members){m.resume=m.follower.isPlaying;if(m.resume)m.follower.pause();}
            this.stateValue='paused';return true;
        }catch(error){return this.fail(error);}
    }
    public resumeGroup():boolean{
        if(EDITOR_NOT_IN_PREVIEW||this.stateValue!=='paused')return false;
        try{
            this.verify();
            for(const m of this.members)setFollowerControllerRate(m.follower,this,this.speedMultiplier);
            for(const m of this.members){if(m.resume)m.follower.play();m.resume=false;}
            this.stateValue='playing';return true;
        }catch(error){return this.fail(error);}
    }
    /** Does not edit authored follower settings or restart finished members. */
    public setSpeedMultiplier(rate:number):boolean{
        if(EDITOR_NOT_IN_PREVIEW||!validFollowerRate(rate))return false;
        try{
            if(this.members.length)this.verify();
            for(const m of this.members)setFollowerControllerRate(m.follower,this,rate);
            this.speedMultiplier=rate;return true;
        }catch(error){return this.fail(error);}
    }
    public stopGroup():void{
        this.pendingStart=false;this.release(!EDITOR_NOT_IN_PREVIEW);this.stateValue='idle';this.error='';
    }
    onEnable():void{if(!EDITOR_NOT_IN_PREVIEW)this.pendingStart=this.playOnStart;}
    onDisable():void{this.stopGroup();}
    onDestroy():void{this.stopGroup();}
    lateUpdate():void{
        if(EDITOR_NOT_IN_PREVIEW)return;
        if(this.pendingStart){this.pendingStart=false;this.startGroup();return;}
        if(!this.members.length)return;
        try{
            this.verify();
            for(const m of this.members)setFollowerControllerRate(m.follower,this,this.speedMultiplier);
            if(this.stateValue==='paused'){
                if(this.members.some(m=>m.follower.isPlaying))throw Error('Follower resumed externally while group paused.');
                return;
            }
            if(this.stateValue==='playing'&&this.members.every(m=>!m.follower.isPlaying)){
                this.release(true);this.stateValue='completed';
            }
        }catch(error){this.fail(error);}
    }
}
