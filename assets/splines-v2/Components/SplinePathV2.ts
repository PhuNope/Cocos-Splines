import {_decorator,Component,Node,Mat4,Vec3,Enum} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {type SplineDataV2,type CurveTypeV2,type V3} from '../core/SplineCurves';
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
/**
 * Knot-relative handle offsets live in Path-local units. Authored entries
 * refer to Knot Nodes rather than indices, so reordering never swaps
 * tangent controls between unrelated Knots.
 */
export enum SplineBezierTangentModeV2 {
    Auto=0,Free=1,Aligned=2,Mirrored=3
}
@ccclass('SplinesV2.BezierTangent')
export class SplineBezierTangentV2 {
    @property({type:Node}) knot:Node|null=null;
    @property({type:Enum(SplineBezierTangentModeV2)})
    mode=SplineBezierTangentModeV2.Auto;
    @property({type:Vec3,tooltip:'Incoming relative handle offset in Path-local units.'})
    handleIn=new Vec3(-1,0,0);
    @property({type:Vec3,tooltip:'Outgoing relative handle offset in Path-local units.'})
    handleOut=new Vec3(1,0,0);
}
type TangentSide='in'|'out';
type TangentSnapshot={
    knot:Node;hadEntry:boolean;
    originalMode:SplineBezierTangentModeV2;
    originalIn:Vec3;originalOut:Vec3;
};
const sub=(a:V3,b:V3):V3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const add=(a:V3,b:V3):V3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const scale=(a:V3,k:number):V3=>({x:a.x*k,y:a.y*k,z:a.z*k});
const len=(a:V3):number=>Math.hypot(a.x,a.y,a.z);
const finite=(a:V3):boolean=>[a.x,a.y,a.z].every(Number.isFinite);
const vec=(a:V3):Vec3=>new Vec3(a.x,a.y,a.z);

interface SplinePreviewConsumerV2 {
    onSharedSplinePathEdited(force:boolean):void;
    onSharedSplinePathEditBegin?():void;
}
type PathGizmoProperty=
    'pathGizmoKnotPosition'|'pathGizmoKnotPositions'|
    'pathGizmoTangentIn'|'pathGizmoTangentOut';

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
    @property({type:[SplineBezierTangentV2],
        tooltip:'Optional per-Knot Bezier tangents keyed to Knot Nodes (not array indices). Auto uses default chord controls.'})
    bezierTangents:SplineBezierTangentV2[]=[];

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
    @property({tooltip:'Show editable incoming/outgoing Bezier tangent handles for the active Knot.'})
    gizmoEditTangents=true;

    // Editor-only and NEVER serialized, no redundant Knot coordinates.
    private _previewConsumers=new Set<SplinePreviewConsumerV2>();
    private _dragNode:Node|null=null;
    private _dragIndex=-1;
    private _dragProperty:PathGizmoProperty|null=null;
    private _tangentDragSnapshot:TangentSnapshot|null=null;
    // Editor Transform Tool / Inspector edits do not invoke Gizmos callbacks.
    // Watch the source Knot world transforms and notify consumers with a
    // lightweight, bounded signature (no mesh generation on Path itself).
    private _observedSource:string|null=null;
    private _lastSourceScanAt=Number.NEGATIVE_INFINITY;
    private _lastSourceChangeAt=Number.NEGATIVE_INFINITY;
    private _needsFinalPreview=false;
    private _knotIds=new WeakMap<Node,number>();
    private _nextKnotId=1;

    private sourceSignature():string {
        const nodes=this.knots.map(node=>{
            if(!node?.isValid)return 'invalid';
            let identity=this._knotIds.get(node);
            if(!identity){
                identity=this._nextKnotId++;
                this._knotIds.set(node,identity);
            }
            const p=node.worldPosition;
            return identity+':'+p.x+','+p.y+','+p.z;
        });
        const tangents=this.bezierTangents.map(t=>{
            if(!t)return 'missing';
            const k=t.knot;
            const id=k?this._knotIds.get(k)??'unknown':'none';
            return id+':'+t.mode+':'+
                [t.handleIn?.x,t.handleIn?.y,t.handleIn?.z,
                 t.handleOut?.x,t.handleOut?.y,t.handleOut?.z].join(',');
        });
        return this.interpolation+'|'+Number(this.closed)+'|'+nodes.join(';')+
            '|tan:'+tangents.join(';');
    }

    /**
     * Runs only with @executeInEditMode and an active Scene Editor.
     * Native Transform handles, Inspector edits, Knot reordering, and Undo
     * can change the Path without firing onGizmoChanged.
     * An idle reconciliation forces the final mesh after drag stops, even
     * when earlier preview updates were throttled.
     */
    protected update(_dt:number):void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.node?.isValid||
           this._previewConsumers.size===0)return;
        const now=Date.now();
        if(now-this._lastSourceScanAt<50)return;
        this._lastSourceScanAt=now;
        const signature=this.sourceSignature();
        if(this._observedSource===null){
            this._observedSource=signature;
            return;
        }
        if(signature!==this._observedSource){
            const firstChange=!this._needsFinalPreview;
            this._observedSource=signature;
            this._lastSourceChangeAt=now;
            this._needsFinalPreview=true;
            // A Path-owned drag already publishes its own update callback.
            if(!this._dragNode){
                if(firstChange)
                    for(const consumer of this._previewConsumers)
                        consumer.onSharedSplinePathEditBegin?.();
                this.notifyPreviewConsumers(this,false);
            }
        }else if(this._needsFinalPreview&&!this._dragNode&&
                 now-this._lastSourceChangeAt>=180){
            this._needsFinalPreview=false;
            this.notifyPreviewConsumers(this,true);
        }
    }

    public getKnotNodes():ReadonlyArray<Node>{return this.knots;}
    public registerPreviewConsumer(consumer:SplinePreviewConsumerV2):void {
        if(this._previewConsumers.size===0){
            this._observedSource=this.sourceSignature();
            this._lastSourceScanAt=Number.NEGATIVE_INFINITY;
            this._needsFinalPreview=false;
        }
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
        this._tangentDragSnapshot=null;
        this._observedSource=null;
        this._needsFinalPreview=false;
    }
    protected onDestroy():void {
        this._dragNode=null;this._dragProperty=null;
        this._tangentDragSnapshot=null;
        this._previewConsumers.clear();
    }

    private tangentEntry(knot:Node):SplineBezierTangentV2|null {
        let found:SplineBezierTangentV2|null=null;
        for(const entry of this.bezierTangents){
            if(entry?.knot!==knot)continue;
            if(found)throw new Error('SplinePath has multiple Bezier tangent records for the same Knot');
            found=entry;
        }
        return found;
    }
    private knotPathPosition(knot:Node):Vec3 {
        const inv=Mat4.invert(new Mat4(),this.node.worldMatrix);
        return Vec3.transformMat4(new Vec3(),knot.worldPosition,inv);
    }
    private defaultTangent(knot:Node,side:TangentSide):Vec3 {
        const index=this.knots.indexOf(knot),count=this.knots.length;
        if(index<0||count<2)return new Vec3();
        const point=this.knotPathPosition(knot);
        const next=(index+1)%count,prev=(index+count-1)%count;
        // The unused first incoming and last outgoing endpoint handles
        // follow the adjacent chord for a predictable Editor display.
        let neighbor:Node|undefined;
        let sign=1;
        if(side==='out'){
            if(this.closed||index<count-1)neighbor=this.knots[next];
            else {neighbor=this.knots[prev];sign=-1;}
        }else{
            if(this.closed||index>0)neighbor=this.knots[prev];
            else {neighbor=this.knots[next];sign=-1;}
        }
        if(!neighbor?.isValid)return new Vec3();
        return vec(scale(sub(this.knotPathPosition(neighbor),point),sign/3));
    }
    private tangentOffset(knot:Node,side:TangentSide):Vec3 {
        const entry=this.tangentEntry(knot);
        if(!entry||entry.mode===SplineBezierTangentModeV2.Auto)
            return this.defaultTangent(knot,side);
        return entry[side==='in'?'handleIn':'handleOut'];
    }
    private tangentLocalPosition(knot:Node,side:TangentSide):Vec3 {
        return vec(add(this.knotPathPosition(knot),this.tangentOffset(knot,side)));
    }
    /** Change tangent mode while keeping the currently displayed controls. */
    public setBezierTangentMode(index:number,mode:SplineBezierTangentModeV2):void {
        if(!Number.isSafeInteger(index)||index<0||index>=this.knots.length||
            !Object.values(SplineBezierTangentModeV2).includes(mode)||
            !this.knots[index]?.isValid)
            throw new Error('Invalid Bezier tangent Knot index or mode');
        const knot=this.knots[index];
        const inOffset=vec(this.tangentOffset(knot,'in'));
        const outOffset=vec(this.tangentOffset(knot,'out'));
        let entry=this.tangentEntry(knot);
        if(!entry){
            entry=new SplineBezierTangentV2();
            entry.knot=knot;
            this.bezierTangents.push(entry);
        }
        entry.mode=mode;
        entry.handleIn=inOffset;
        entry.handleOut=outOffset;
        if(mode===SplineBezierTangentModeV2.Mirrored)
            entry.handleIn=vec(scale(outOffset,-1));
        else if(mode===SplineBezierTangentModeV2.Aligned){
            const n=len(outOffset),other=len(inOffset);
            if(n>1e-9)entry.handleIn=vec(scale(outOffset,-other/n));
        }
        this.notifyPreviewConsumers(this,true);
    }
    private readTangent(side:TangentSide):Vec3 {
        const field:PathGizmoProperty=side==='in'?'pathGizmoTangentIn':'pathGizmoTangentOut';
        const knot=this.knotAt(this.gizmoKnotIndex,field);
        if(!EDITOR_NOT_IN_PREVIEW||!this.node?.isValid||!knot?.isValid)
            return new Vec3();
        return this.tangentLocalPosition(knot,side);
    }
    private writeTangent(side:TangentSide,point:Vec3):void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.gizmoEditKnots||!this.gizmoEditTangents||
           this.interpolation!==SplinePathCurveModeV2.Bezier||
           !this.node?.isValid||!point||!finite(point))return;
        const field:PathGizmoProperty=side==='in'?'pathGizmoTangentIn':'pathGizmoTangentOut';
        const knot=this.knotAt(this.gizmoKnotIndex,field);
        if(!knot?.isValid)return;
        let entry=this.tangentEntry(knot);
        if(!entry){
            entry=new SplineBezierTangentV2();
            entry.knot=knot;
            this.bezierTangents.push(entry);
        }
        if(entry.mode===SplineBezierTangentModeV2.Auto){
            entry.handleIn=this.defaultTangent(knot,'in');
            entry.handleOut=this.defaultTangent(knot,'out');
            entry.mode=SplineBezierTangentModeV2.Free;
        }
        const newOffset=vec(sub(point,this.knotPathPosition(knot)));
        const opposite=side==='in'?'handleOut':'handleIn';
        const selected=side==='in'?'handleIn':'handleOut';
        const oppositeLength=len(entry[opposite]);
        entry[selected]=newOffset;
        if(entry.mode===SplineBezierTangentModeV2.Aligned||
           entry.mode===SplineBezierTangentModeV2.Mirrored){
            const d=len(newOffset);
            const linkedLength=entry.mode===SplineBezierTangentModeV2.Mirrored?
                d:oppositeLength;
            entry[opposite]=d>1e-9?
                vec(scale(newOffset,-linkedLength/d)):new Vec3();
        }
    }
    public get pathGizmoTangentIn():Vec3 {return this.readTangent('in');}
    public set pathGizmoTangentIn(v:Vec3){this.writeTangent('in',v);}
    public get pathGizmoTangentOut():Vec3 {return this.readTangent('out');}
    public set pathGizmoTangentOut(v:Vec3){this.writeTangent('out',v);}

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
        const used=new Set<Node>();
        for(const entry of this.bezierTangents){
            if(!entry?.knot||!this.knots.includes(entry.knot))continue;
            if(used.has(entry.knot))
                throw new Error('SplinePath has duplicate Bezier tangent records for one Knot');
            used.add(entry.knot);
            if(!Number.isInteger(entry.mode)||
               entry.mode<SplineBezierTangentModeV2.Auto||
               entry.mode>SplineBezierTangentModeV2.Mirrored||
               (entry.mode!==SplineBezierTangentModeV2.Auto&&
                (!entry.handleIn||!entry.handleOut||
                 !finite(entry.handleIn)||!finite(entry.handleOut))))
                throw new Error('SplinePath contains invalid Bezier tangents');
        }
        return {type,closed:this.closed,knots:this.knots.map(k=>{
            const p=Vec3.transformMat4(new Vec3(),k.worldPosition,inverse);
            const position={x:p.x,y:p.y,z:p.z};
            if(type!=='bezier')return {position};
            const entry=this.tangentEntry(k);
            if(!entry||entry.mode===SplineBezierTangentModeV2.Auto)
                return {position};
            const control=(side:TangentSide):V3=>{
                // Offsets are authored in Path-local meters and transformed
                // as POINTS through Path world into consumer local space.
                // This handles translated/rotated/scaled Path and consumer
                // nodes without treating relative vectors as positions.
                const pathPoint=this.tangentLocalPosition(k,side);
                const world=Vec3.transformMat4(new Vec3(),pathPoint,this.node.worldMatrix);
                const local=Vec3.transformMat4(new Vec3(),world,inverse);
                return sub(local,p);
            };
            return {position,handleIn:control('in'),handleOut:control('out')};
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
    /** Gizmos accepts indexed Vec3[]; proxy writes directly to the source Node. */
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
            // Gizmos writes the final or rolled-back Knot BEFORE this callback.
            try{this.notifyPreviewConsumers(this,true);}
            finally{
                this._observedSource=this.sourceSignature();
                this._needsFinalPreview=false;
                this._dragNode=null;this._dragProperty=null;this._dragIndex=-1;
            }
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
        if(!EDITOR_NOT_IN_PREVIEW)return;
        this._observedSource=this.sourceSignature();
        this._needsFinalPreview=false;
        this.notifyPreviewConsumers(this,true);
    }
}
