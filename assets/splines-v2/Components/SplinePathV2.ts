import {_decorator,Component,Node,Mat4,Vec3,Enum} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {type SplineDataV2,type CurveTypeV2} from '../core/SplineCurves';
import {buildSplineCacheV2} from '../core/SplineCache';
import {buildSplineFramesV2} from '../core/SplineFrames';
import {buildRoadSceneGuideV2} from '../geometry/SceneGizmoGuideV2';
import {availableGizmoBackend,buildSplineKnotMoveGizmos,
    buildSplineKnotPointGizmos,drawSplineSceneGizmos,
    type SplineGizmoHandle} from './SplineGizmoBridge';

const {ccclass,property,executeInEditMode,menu}=_decorator;

/** Rebuilt source of truth for a path. No legacy Container or Knot component. */
export enum SplinePathCurveModeV2 {
    Linear=0,Bezier=1,CatmullRom=2,Centripetal=3
}
interface SplinePreviewConsumerV2 {
    onSharedSplinePathEdited(force:boolean):void;
    onSharedSplinePathEditBegin?():void;
}
type PathGizmoProperty='pathGizmoKnotPosition'|'pathGizmoKnotPositions';

@ccclass('SplinesV2.SplinePath')
@menu('Cocos Splines V2/Path')
@executeInEditMode(true)
export class SplinePathV2 extends Component {
    @property({type:[Node],tooltip:'Ordered authored Knot Nodes; this Path alone owns the source Knot sequence.'})
    knots:Node[]=[];
    @property({type:Enum(SplinePathCurveModeV2)})
    interpolation=SplinePathCurveModeV2.Centripetal;
    @property({tooltip:'Connect the last Knot to the first Knot.'})
    closed=false;

    @property({tooltip:'Draw spline curve and Knot markers when Path is selected (Gizmos installed).'})
    gizmoShowPath=true;
    @property({tooltip:'Own the Cocos-Gizmos Move handles on the Path, not on individual Road consumers.'})
    gizmoEditKnots=true;
    @property({min:0,max:127,step:1})
    gizmoKnotIndex=0;
    @property({tooltip:'Show camera-plane point handles for the other Knot Nodes.'})
    gizmoMultiKnotPoints=true;
    @property({min:2,max:32,step:1})
    gizmoPointLimit=16;

    // Editor-only and NEVER serialized, no redundant Knot coordinates.
    private _previewConsumers=new Set<SplinePreviewConsumerV2>();
    private _dragNode:Node|null=null;
    private _dragIndex=-1;
    private _dragProperty:PathGizmoProperty|null=null;

    public getKnotNodes():ReadonlyArray<Node>{return this.knots;}
    public registerPreviewConsumer(consumer:SplinePreviewConsumerV2):void {
        this._previewConsumers.add(consumer);
    }
    public unregisterPreviewConsumer(consumer:SplinePreviewConsumerV2):void {
        this._previewConsumers.delete(consumer);
    }
    public notifyPreviewConsumers(origin:unknown,force:boolean):void {
        if(!EDITOR_NOT_IN_PREVIEW)return;
        for(const consumer of this._previewConsumers)
            if(consumer!==origin)consumer.onSharedSplinePathEdited(force);
    }
    protected onDisable():void {
        this._dragNode=null;this._dragProperty=null;
    }
    protected onDestroy():void {
        this._dragNode=null;this._dragProperty=null;
        this._previewConsumers.clear();
    }

    /** Consumer-relative immutable-data snapshot; not saved as another list. */
    public getSplineDataV2(consumer:Node):SplineDataV2 {
        if(!consumer?.isValid||!this.node?.isValid)
            throw new Error('SplinePathV2 requires valid source/consumer Nodes');
        if(this.knots.length<2||this.knots.some(k=>!k||!k.isValid))
            throw new Error('SplinePathV2 needs at least two valid Knot Nodes');
        const map:CurveTypeV2[]=[
            'linear','bezier','catmull-rom','catmull-rom-centripetal'
        ];
        const type=map[this.interpolation];
        if(!type)throw new Error('SplinePathV2 interpolation is invalid');
        const inverse=Mat4.invert(new Mat4(),consumer.worldMatrix);
        return {type,closed:this.closed,knots:this.knots.map(k=>{
            const p=Vec3.transformMat4(new Vec3(),k.worldPosition,inverse);
            return {position:{x:p.x,y:p.y,z:p.z}};
        })};
    }

    private knotAt(index:number,field:PathGizmoProperty):Node|null {
        if(this._dragNode&&this._dragProperty===field)
            return field==='pathGizmoKnotPosition'||index===this._dragIndex?
                this._dragNode:null;
        return Number.isSafeInteger(index)&&index>=0?this.knots[index]??null:null;
    }
    private read(index:number,field:PathGizmoProperty):Vec3 {
        const knot=this.knotAt(index,field);
        if(!EDITOR_NOT_IN_PREVIEW||!this.node?.isValid||!knot?.isValid)
            return new Vec3();
        const inverse=Mat4.invert(new Mat4(),this.node.worldMatrix);
        return Vec3.transformMat4(new Vec3(),knot.worldPosition,inverse);
    }
    private write(index:number,field:PathGizmoProperty,value:Vec3):void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.gizmoEditKnots||
            !this.node?.isValid||!value||
            ![value.x,value.y,value.z].every(Number.isFinite))return;
        const knot=this.knotAt(index,field);
        if(!knot?.isValid)return;
        const world=Vec3.transformMat4(new Vec3(),value,this.node.worldMatrix);
        knot.setWorldPosition(world);
    }
    public get pathGizmoKnotPosition():Vec3 {
        return this.read(this.gizmoKnotIndex,'pathGizmoKnotPosition');
    }
    public set pathGizmoKnotPosition(value:Vec3) {
        this.write(this.gizmoKnotIndex,'pathGizmoKnotPosition',value);
    }
    /** v3 accepts indexed Vec3[]; proxy writes directly to the source Node. */
    public get pathGizmoKnotPositions():Vec3[] {
        const limit=Number.isFinite(this.gizmoPointLimit)?
            Math.max(2,Math.min(32,Math.floor(this.gizmoPointLimit))):16;
        const count=Math.min(this.knots.length,limit),values=new Array<Vec3>(count);
        const indexOf=(p:string|symbol):number=>{
            if(typeof p!=='string'||!/^(0|[1-9][0-9]*)$/.test(p))return -1;
            const i=Number(p);
            return Number.isSafeInteger(i)&&i<count?i:-1;
        };
        return new Proxy(values,{
            get:(target,p,receiver)=>{
                const i=indexOf(p);
                return i>=0?this.read(i,'pathGizmoKnotPositions'):
                    Reflect.get(target,p,receiver);
            },
            set:(target,p,value,receiver)=>{
                const i=indexOf(p);
                if(i>=0){
                    this.write(i,'pathGizmoKnotPositions',value);
                    return true;
                }
                if(typeof p==='string'&&/^(0|[1-9][0-9]*)$/.test(p))
                    return false;
                return Reflect.set(target,p,value,receiver);
            }
        });
    }
    public onGizmoHandles():SplineGizmoHandle[] {
        if(!EDITOR_NOT_IN_PREVIEW||!this.gizmoEditKnots||
            !this.node?.isValid||!this.knots[this.gizmoKnotIndex]?.isValid)return [];
        const active=buildSplineKnotMoveGizmos('pathGizmoKnotPosition');
        if(!active.length||!this.gizmoMultiKnotPoints)return active;
        const limit=Number.isFinite(this.gizmoPointLimit)?
            Math.max(2,Math.min(32,Math.floor(this.gizmoPointLimit))):16;
        const indices=Array.from({length:Math.min(this.knots.length,limit)},(_,i)=>i)
            .filter(i=>i!==this.gizmoKnotIndex&&this.knots[i]?.isValid);
        return active.concat(buildSplineKnotPointGizmos('pathGizmoKnotPositions',indices));
    }
    public onGizmoHudControls():Array<{
        type:'slider'|'toggle';id:string;text:string;property:string;
        min?:number;max?:number;step?:number;order?:number;
    }> {
        if(!EDITOR_NOT_IN_PREVIEW||!this.gizmoEditKnots||
            this.knots.length<2||!availableGizmoBackend())return [];
        return [
            {type:'slider',id:'path-active-knot',text:'Active Knot',
                property:'gizmoKnotIndex',min:0,
                max:Math.min(this.knots.length-1,127),step:1,order:1},
            {type:'toggle',id:'path-other-knots',text:'Other Knots',
                property:'gizmoMultiKnotPoints',order:2}
        ];
    }
    public onGizmoChanged(
        name:string,phase:'begin'|'update'|'end'|'cancel',index?:number
    ):void {
        if(!EDITOR_NOT_IN_PREVIEW||
           (name!=='pathGizmoKnotPosition'&&name!=='pathGizmoKnotPositions'))
            return;
        const field=name as PathGizmoProperty;
        if(phase==='begin'){
            if(this._dragNode)return;
            const i=field==='pathGizmoKnotPositions'?index:this.gizmoKnotIndex;
            if(!Number.isSafeInteger(i)||i===undefined||i<0)return;
            const knot=this.knots[i];
            if(!knot?.isValid)return;
            this._dragNode=knot;this._dragProperty=field;this._dragIndex=i;
            // Start a new gesture with a fresh preview throttle budget for
            // every consumer, even if another Road drag just ended.
            for(const consumer of this._previewConsumers)
                consumer.onSharedSplinePathEditBegin?.();
        }else if(phase==='update'&&this._dragProperty===field){
            this.notifyPreviewConsumers(this,false);
        }else if((phase==='end'||phase==='cancel')&&
            this._dragProperty===field){
            // v3 writes the final or rolled-back Knot BEFORE this callback.
            try{this.notifyPreviewConsumers(this,true);}
            finally{this._dragNode=null;this._dragProperty=null;this._dragIndex=-1;}
        }
    }
    public onDrawGizmosSelected():void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.gizmoShowPath||
           !this.node?.isValid||!availableGizmoBackend()||
           this.knots.length<2)return;
        try{
            const source=this.getSplineDataV2(this.node);
            const cache=buildSplineCacheV2(source);
            const table=buildSplineFramesV2(cache,{
                maxStep:Math.max(.2,cache.length/64)
            });
            const guide=buildRoadSceneGuideV2(
                table.frames,source.knots.map(k=>k.position),0,{
                    maxSteps:64,showEdges:false,showKnots:true
                });
            drawSplineSceneGizmos(this.node,guide);
        }catch{
            // Incomplete Path is normal while authoring; do not log per frame.
        }
    }
    public onRestore():void {
        if(EDITOR_NOT_IN_PREVIEW)this.notifyPreviewConsumers(this,true);
    }
}
