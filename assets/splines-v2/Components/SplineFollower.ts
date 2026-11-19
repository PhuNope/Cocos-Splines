import {_decorator,Component,Enum,Node,Quat,Vec3} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {SplinePath,SplineSpace} from './SplinePath';
import {buildSplineCacheV2,parameterAtCachedDistanceV2,
    type SplineCacheV2} from '../core/SplineCache';
import {buildSplineFramesV2,frameAtDistanceV2,type SplineFramesV2}
    from '../core/SplineFrames';
import {advanceSplineDistanceV2,normalizedSplineDistanceV2,
    type SplineWrapModeV2} from '../core/SplineTraversal';

const {ccclass,property,menu}=_decorator;
export enum FollowerTravelMode {Speed=0,Duration=1}
export enum FollowerWrapMode {Clamp=0,Loop=1,PingPong=2}
const wrapModes:ReadonlyArray<SplineWrapModeV2>=
    ['clamp','loop','pingpong'];

/** Independent path consumer: no child Knot nodes, no Road inheritance,
 * no collision/physics side effects, no Gizmos or Editor callbacks.
 * Speeds and distances are in Path-local spline length units.
 */
@ccclass('Spline.Follower')
@menu('Cocos Splines/Follower')
export class SplineFollower extends Component {
    @property({type:SplinePath,tooltip:'Shared authored Spline.Path data source.'})
    path:SplinePath|null=null;
    @property({type:Node,tooltip:'Object to move; empty means this Node.'})
    target:Node|null=null;
    @property({type:Enum(FollowerTravelMode)})
    travelMode=FollowerTravelMode.Speed;
    @property({min:0,tooltip:'Path-local spline units per second.'})
    speed=3;
    @property({min:.01,tooltip:'Seconds for one full spline traversal.'})
    duration=5;
    @property({type:Enum(FollowerWrapMode)})
    wrapMode=FollowerWrapMode.Loop;
    @property({tooltip:'Start automatically in Play.'})
    playOnEnable=false;
    @property({tooltip:'Permit movement in Scene edit mode; off by default.'})
    previewInEditor=false;
    @property({tooltip:'Rotate target to its spline frame; forward is its local +Z.'})
    alignRotation=false;
    @property({tooltip:'Right offset in the banked spline frame (Path units).'})
    offsetRight=0;
    @property({tooltip:'Up offset in the banked spline frame (Path units).'})
    offsetUp=0;
    @property({min:0,tooltip:'Starting distance along Path-local arc length.'})
    distance=0;
    @property({tooltip:'Initial travel direction for PingPong or reverse playback.'})
    backwards=false;
    public playing=false;

    private _cache:SplineCacheV2|null=null;
    private _frames:SplineFramesV2|null=null;
    private _sourceKey='';
    private _boundPath:SplinePath|null=null;
    private _direction:1|-1=1;

    protected onEnable():void {
        this._direction=this.backwards?-1:1;
        this.playing=this.playOnEnable;
    }
    protected onDisable():void {
        this.playing=false;
        this._cache=null;this._frames=null;
        this._sourceKey='';this._boundPath=null;
    }
    /** No stale geometry after any Path Knot/tangent/roll change. */
    private resolve():{cache:SplineCacheV2;frames:SplineFramesV2}|null {
        const path=this.path;
        if(!path?.node?.isValid||!this.node?.isValid)return null;
        const data=path.getSplineData(path.node,SplineSpace.Local);
        const signature=JSON.stringify(data);
        if(this._boundPath!==path||this._sourceKey!==signature||
           !this._cache||!this._frames){
            const cache=buildSplineCacheV2(data);
            const frames=buildSplineFramesV2(cache,{
                maxStep:Math.max(.2,cache.length/128)
            });
            this._cache=cache;this._frames=frames;
            this._sourceKey=signature;this._boundPath=path;
        }
        return {cache:this._cache,frames:this._frames};
    }
    public get progress():number {
        return this._cache?
            normalizedSplineDistanceV2(this._cache.length,this.distance):0;
    }
    public get direction():1|-1 {return this._direction;}
    public play():void {this.playing=true;}
    public pause():void {this.playing=false;}
    public restart(fromEnd=false):void {
        const state=this.resolve();
        this.distance=fromEnd?(state?.cache.length??0):0;
        this._direction=fromEnd?-1:1;
        this.playing=true;
        this.applyCurrent();
    }
    public seek(distance:number):void {
        if(!Number.isFinite(distance))throw new Error('Seek distance must be finite');
        const state=this.resolve();
        const length=state?.cache.length??0;
        this.distance=Math.max(0,Math.min(length,distance));
        this.applyCurrent();
    }
    private applyCurrent():void {
        const state=this.resolve(),path=this.path,target=this.target??this.node;
        if(!state||!path||!target?.isValid)return;
        const f=frameAtDistanceV2(state.cache,state.frames,this.distance,
            this.wrapMode===FollowerWrapMode.Loop);
        const matrix=path.node.worldMatrix;
        const local=new Vec3(
            f.position.x+f.right.x*this.offsetRight+f.up.x*this.offsetUp,
            f.position.y+f.right.y*this.offsetRight+f.up.y*this.offsetUp,
            f.position.z+f.right.z*this.offsetRight+f.up.z*this.offsetUp
        );
        const position=Vec3.transformMat4(new Vec3(),local,matrix);
        target.setWorldPosition(position);
        if(this.alignRotation){
            const origin=Vec3.transformMat4(new Vec3(),new Vec3(),matrix);
            const tangentWorld=Vec3.transformMat4(new Vec3(),
                new Vec3(f.tangent.x,f.tangent.y,f.tangent.z),matrix);
            const upWorld=Vec3.transformMat4(new Vec3(),
                new Vec3(f.up.x,f.up.y,f.up.z),matrix);
            const tangent=Vec3.normalize(new Vec3(),
                Vec3.subtract(new Vec3(),tangentWorld,origin));
            let right=Vec3.cross(new Vec3(),
                Vec3.subtract(new Vec3(),upWorld,origin),tangent);
            right=Vec3.normalize(right,right);
            const up=Vec3.normalize(new Vec3(),Vec3.cross(new Vec3(),tangent,right));
            // The component uses +Z as the authored forward axis.
            target.setWorldRotation(Quat.fromAxes(new Quat(),right,up,tangent));
        }
    }
    public sampleCurrent():void {this.applyCurrent();}
    protected update(dt:number):void {
        if(!this.playing||(EDITOR_NOT_IN_PREVIEW&&!this.previewInEditor)||
            !Number.isFinite(dt)||dt<=0)return;
        const state=this.resolve();
        if(!state)return;
        const speed=this.travelMode===FollowerTravelMode.Duration?
            state.cache.length/Math.max(.01,this.duration):Math.max(0,this.speed);
        const moved=advanceSplineDistanceV2(state.cache.length,{
            distance:this.distance,direction:this._direction
        },Math.min(dt,10)*speed,wrapModes[this.wrapMode]??'clamp');
        this.distance=moved.distance;this._direction=moved.direction;
        this.applyCurrent();
        if(this.wrapMode===FollowerWrapMode.Clamp&&
           (moved.reachedStart||moved.reachedEnd))this.playing=false;
    }
}
