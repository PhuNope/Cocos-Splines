import {_decorator,Component,Node,Mat4,Quat,Vec3,Enum} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {type SplineDataV2,type CurveTypeV2,type V3} from '../core/SplineCurves';
import {buildSplineCacheV2} from '../core/SplineCache';
import {buildSplineFramesV2,frameAtDistanceV2} from '../core/SplineFrames';
import {buildRoadSceneGuideV2} from '../geometry/SceneGizmoGuideV2';
import {availableGizmoBackend,buildSplineKnotMoveGizmos,
    buildSplineKnotPointGizmos,buildSplinePathRotateGizmos,drawSplineSceneGizmos,
    type SplineGizmoHandle} from './SplineGizmoBridge';

const {ccclass,property,executeInEditMode,menu}=_decorator;

export enum CurveMode {Linear=0,Bezier=1,CatmullRom=2,Centripetal=3}
export enum TangentMode {Auto=0,Free=1,Aligned=2,Mirrored=3}
export enum RotationMode {Knots=0,Planar2D=1,Spatial3D=2}
/** Coordinates used by consuming mesh generators; authored Path Knots always remain local. */
export enum SplineSpace {Local=0,World=1}

/**
 * A pure, serialized value object. No Node is created for each Knot.
 * position/handleIn/handleOut are Path-local Vec3, not world coordinates.
 * The record object itself is a stable identity during reorder and Gizmos drag.
 */
@ccclass('Spline.Knot')
export class SplineKnot {
    @property({type:Vec3,tooltip:'Knot position, relative to the SplinePath Node.'})
    position:Vec3=new Vec3();
    @property({type:Enum(TangentMode)})
    mode=TangentMode.Auto;
    @property({type:Vec3,tooltip:'Incoming Bezier offset relative to Knot, in Path-local units.'})
    handleIn:Vec3=new Vec3(-1,0,0);
    @property({type:Vec3,tooltip:'Outgoing Bezier offset relative to Knot, in Path-local units.'})
    handleOut:Vec3=new Vec3(1,0,0);
    @property({min:0,max:1,step:.01,tooltip:'Catmull-Rom tension: 0=smooth, 1=flat.'})
    tension=0;
    @property({min:-180,max:180,step:1,
        tooltip:'Rotation of mesh cross-section about travel tangent in degrees. Positive raises the right side.'})
    rollDegrees=0;
}
type TangentSide='in'|'out';
type PathGizmoProperty=
    'pathGizmoKnotPosition'|'pathGizmoKnotPositions'|
    'pathGizmoTangentIn'|'pathGizmoTangentOut';
type DragSnapshot={
    knot:SplineKnot;
    position:Vec3;mode:TangentMode;
    handleIn:Vec3;handleOut:Vec3;rollDegrees:number;
};
interface PreviewConsumer {
    onSharedSplinePathEdited(force:boolean):void;
    onSharedSplinePathEditBegin?():void;
}
const vec=(p:V3):Vec3=>new Vec3(p.x,p.y,p.z);
const add=(a:V3,b:V3):V3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a:V3,b:V3):V3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const scale=(p:V3,k:number):V3=>({x:p.x*k,y:p.y*k,z:p.z*k});
const length=(p:V3):number=>Math.hypot(p.x,p.y,p.z);
const finite=(p:V3):boolean=>p!=null&&[p.x,p.y,p.z].every(Number.isFinite);

@ccclass('Spline.Path')
@menu('Cocos Splines/Path')
@executeInEditMode(true)
export class SplinePath extends Component {
    @property({type:[SplineKnot],
        tooltip:'Ordered Path-local Vec3 Knot records. No child Knot Nodes required.'})
    knots:SplineKnot[]=[];
    @property({type:Enum(CurveMode)})
    interpolation=CurveMode.Centripetal;
    @property({tooltip:'Connect the last Knot to the first Knot.'})
    closed=false;
    @property() gizmoShowPath=true;
    @property() gizmoEditKnots=true;
    @property({min:0,max:127,step:1}) gizmoKnotIndex=0;
    @property() gizmoMultiKnotPoints=true;
    @property({min:2,max:32,step:1}) gizmoPointLimit=16;
    @property() gizmoEditTangents=true;
    @property({tooltip:'Show the selected Knot bank cross-section and up vector in the Scene.'})
    gizmoShowRollGuide=true;
    @property({min:.1,max:20,step:.1,
        tooltip:'Half-width of the selected Knot roll guide in Path-local units.'})
    gizmoRollGuideSize=2;
    @property({type:Enum(RotationMode),
        tooltip:'Knots: edit points. Planar2D: rotate the Path Node around Z. Spatial3D: rotate the Path Node around XYZ.'})
    gizmoRotationMode=RotationMode.Knots;
    @property({min:0,max:90,step:1,
        tooltip:'Rotation snap in degrees; 0 is continuous.'})
    gizmoRotationSnap=0;
    @property({type:Enum(SplineSpace),tooltip:'Move Gizmos axes and numeric position in Path Local or World coordinates.'})
    gizmoPositionSpace=SplineSpace.Local;
    @property({min:0,max:20,step:.05,
        tooltip:'Position snap for Knot Move and Bézier tangent point handles. 0 = continuous; units follow Position Local/World.'})
    gizmoPositionSnap=0;
    @property({type:Enum(SplineSpace),tooltip:'Rotate Gizmos axes and Euler edit in Path Local or World coordinates.'})
    gizmoRotationSpace=SplineSpace.Local;

    private _consumers=new Set<PreviewConsumer>();
    private _dragKnot:SplineKnot|null=null;
    private _dragProperty:PathGizmoProperty|null=null;
    private _dragIndex=-1;
    private _dragSnapshot:DragSnapshot|null=null;
    /** Transient editor-only group; Knot object identity survives reordering. */
    private _selectedGroup=new Set<SplineKnot>();
    private _dragGroupPositions:Array<{knot:SplineKnot;position:Vec3}>=[];
    private _rotationDragging=false;
    private _rotationStart:Vec3|null=null;
    private _hudRollKnot:SplineKnot|null=null;
    private _hudRollStart=0;
    private _observed:string|null=null;
    private _lastScan=Number.NEGATIVE_INFINITY;
    private _lastChange=Number.NEGATIVE_INFINITY;
    private _needsFinal=false;

    /** Inspector actions; operate on records without ever creating Nodes. */
    public editKnot(operation:'add'|'insert'|'duplicate'|'remove'|'up'|'down',
                    index:number):number {
        if(!EDITOR_NOT_IN_PREVIEW)throw new Error('Knot editing is Editor-only');
        if(!Number.isSafeInteger(index)||index<0||index>Math.max(0,this.knots.length))
            throw new Error('Invalid Knot index');
        if(this._dragKnot||this._hudRollKnot||this._rotationDragging)
            throw new Error('Cannot change Knot topology during a Gizmos drag');
        // Topology changes invalidate any previous multi-Knot selection.
        this._selectedGroup.clear();
        const count=this.knots.length;
        if(operation==='add'||operation==='insert'||operation==='duplicate'){
            if(count>=128)throw new Error('SplinePath supports at most 128 Knots');
            const next=new SplineKnot();
            if(operation==='duplicate'&&count){
                const k=this.knots[Math.min(index,count-1)];
                Object.assign(next,{
                    position:vec(k.position),mode:k.mode,handleIn:vec(k.handleIn),
                    handleOut:vec(k.handleOut),tension:k.tension,
                    rollDegrees:k.rollDegrees
                });
                // Avoid an identical zero-length adjacent segment.
                next.position=vec(add(next.position,{x:1,y:0,z:0}));
            }else if(operation==='insert'&&index<count-1){
                // Inserting inside an existing segment creates a real
                // midpoint, not a displaced Knot at the far end of the Path.
                next.position=vec(scale(add(this.knots[index].position,
                    this.knots[index+1].position),.5));
            }else if(count){
                const last=this.knots[count-1].position;
                const prev=this.knots[Math.max(0,count-2)].position;
                const displacement=count===1?{x:0,y:0,z:5}:sub(last,prev);
                next.position=vec(add(last,length(displacement)>1e-6?
                    displacement:{x:0,y:0,z:5}));
            }
            const place=operation==='add'?count:Math.min(index+1,count);
            this.knots.splice(place,0,next);
            this.gizmoKnotIndex=place;
        }else if(operation==='remove'){
            if(count<=2)throw new Error('Spline requires at least two Knots');
            if(index>=count)throw new Error('Knot does not exist');
            this.knots.splice(index,1);
            this.gizmoKnotIndex=Math.min(index,this.knots.length-1);
        }else if(operation==='up'||operation==='down'){
            if(index>=count)throw new Error('Knot does not exist');
            const to=index+(operation==='up'?-1:1);
            if(to<0||to>=count)return this.gizmoKnotIndex;
            [this.knots[index],this.knots[to]]=[this.knots[to],this.knots[index]];
            this.gizmoKnotIndex=to;
        }else throw new Error('Unknown Path edit operation');
        this.onRestore();
        return this.gizmoKnotIndex;
    }
    public getKnotPositions():ReadonlyArray<Vec3> {
        return this.knots.map(k=>vec(k.position));
    }
    /** For Road/Junction: exact authored endpoint in WORLD space. */
    public getKnotWorldPosition(index:number):Vec3 {
        const k=this.knots[index];
        if(!this.node?.isValid||!k||!finite(k.position))
            throw new Error('Invalid SplinePath endpoint');
        return Vec3.transformMat4(new Vec3(),k.position,this.node.worldMatrix);
    }
    private signature():string {
        const matrix=this.node?.worldMatrix as unknown as Record<string,number>|undefined;
        const transform=matrix?[
            matrix.m00,matrix.m01,matrix.m02,matrix.m04,matrix.m05,matrix.m06,
            matrix.m08,matrix.m09,matrix.m10,matrix.m12,matrix.m13,matrix.m14
        ].join(','):'';
        const point=(p:V3|undefined)=>p?
            [p.x,p.y,p.z].join(','):'invalid';
        return [this.interpolation,Number(this.closed),transform,
            ...this.knots.map(k=>k?
                [point(k.position),k.mode,point(k.handleIn),
                    point(k.handleOut),k.tension,k.rollDegrees].join(':'):'invalid')
        ].join('|');
    }
    protected update(_dt:number):void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.node?.isValid||this._consumers.size===0)return;
        const now=Date.now();
        if(now-this._lastScan<50)return;
        this._lastScan=now;
        const signature=this.signature();
        if(this._observed===null){this._observed=signature;return;}
        if(signature!==this._observed){
            const first=!this._needsFinal;
            this._observed=signature;this._needsFinal=true;this._lastChange=now;
            if(!this._dragKnot&&!this._hudRollKnot&&!this._rotationDragging){
                if(first)for(const consumer of this._consumers)
                    consumer.onSharedSplinePathEditBegin?.();
                this.notifyPreviewConsumers(this,false);
            }
        }else if(this._needsFinal&&!this._dragKnot&&!this._hudRollKnot&&
                  !this._rotationDragging&&now-this._lastChange>=180){
            this._needsFinal=false;
            this.notifyPreviewConsumers(this,true);
        }
    }
    public registerPreviewConsumer(consumer:PreviewConsumer):void {
        if(this._consumers.size===0){this._observed=this.signature();this._lastScan=-Infinity;}
        this._consumers.add(consumer);
    }
    public unregisterPreviewConsumer(consumer:PreviewConsumer):void {
        this._consumers.delete(consumer);
    }
    public notifyPreviewConsumers(origin:unknown,force:boolean):void {
        if(!EDITOR_NOT_IN_PREVIEW)return;
        for(const consumer of this._consumers)
            if(consumer!==origin)consumer.onSharedSplinePathEdited(force);
    }
    protected onDisable():void {
        this._dragKnot=null;this._dragProperty=null;this._dragSnapshot=null;
        this._dragGroupPositions=[];this._selectedGroup.clear();
        this._rotationDragging=false;this._rotationStart=null;
        this._hudRollKnot=null;this._hudRollStart=0;
        this._observed=null;this._needsFinal=false;
    }
    protected onDestroy():void {
        this.onDisable();this._consumers.clear();
    }
    private knotAt(index:number,property:PathGizmoProperty):SplineKnot|null {
        if(this._dragKnot&&property===this._dragProperty)
            return property!=='pathGizmoKnotPositions'||this._dragIndex===index?
                this._dragKnot:null;
        return Number.isSafeInteger(index)&&index>=0?this.knots[index]??null:null;
    }
    private tangentOffset(knot:SplineKnot,side:TangentSide):V3 {
        if(knot.mode!==TangentMode.Auto)
            return side==='in'?knot.handleIn:knot.handleOut;
        const i=this.knots.indexOf(knot),n=this.knots.length;
        if(i<0||n<2)return {x:0,y:0,z:0};
        let target:number,sign=1;
        if(side==='out'){
            if(this.closed||i<n-1)target=(i+1)%n;
            else {target=i-1;sign=-1;}
        }else{
            if(this.closed||i>0)target=(i+n-1)%n;
            else {target=i+1;sign=-1;}
        }
        return scale(sub(this.knots[target].position,knot.position),sign/3);
    }
    public setBezierTangentMode(index:number,mode:TangentMode):void {
        const k=this.knots[index];
        if(!k||!Number.isInteger(mode)||mode<0||mode>3)
            throw new Error('Invalid Bezier Knot index or tangent mode');
        const hin=vec(this.tangentOffset(k,'in'));
        const hout=vec(this.tangentOffset(k,'out'));
        k.mode=mode;k.handleIn=hin;k.handleOut=hout;
        if(mode===TangentMode.Mirrored)
            k.handleIn=vec(scale(hout,-1));
        else if(mode===TangentMode.Aligned){
            const l=length(hout);
            if(l>1e-9)k.handleIn=vec(scale(hout,-length(hin)/l));
        }
        this.notifyPreviewConsumers(this,true);
    }
    /** UI proxies change coordinate space; serialized Knot fields stay local. */
    private toGizmoPoint(p:V3,world:boolean):Vec3 {
        return world&&this.node?.isValid?
            Vec3.transformMat4(new Vec3(),vec(p),this.node.worldMatrix):vec(p);
    }
    private fromGizmoPoint(p:V3,world:boolean):Vec3 {
        if(!world||!this.node?.isValid)return vec(p);
        const inverse=Mat4.invert(new Mat4(),this.node.worldMatrix);
        return Vec3.transformMat4(new Vec3(),vec(p),inverse);
    }
    private readTangent(side:TangentSide,world=false):Vec3 {
        const field=side==='in'?'pathGizmoTangentIn':'pathGizmoTangentOut';
        const knot=this.knotAt(this.gizmoKnotIndex,field);
        if(!EDITOR_NOT_IN_PREVIEW||!knot)return new Vec3();
        return this.toGizmoPoint(add(knot.position,this.tangentOffset(knot,side)),world);
    }
    private writeTangent(side:TangentSide,point:Vec3,world=false):void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.gizmoEditKnots||!this.gizmoEditTangents||
            this.interpolation!==CurveMode.Bezier||!finite(point))return;
        const field=side==='in'?'pathGizmoTangentIn':'pathGizmoTangentOut';
        const k=this.knotAt(this.gizmoKnotIndex,field);
        if(!k)return;
        const localPoint=this.fromGizmoPoint(point,world);
        if(!finite(localPoint))return;
        if(k.mode===TangentMode.Auto){
            k.handleIn=vec(this.tangentOffset(k,'in'));
            k.handleOut=vec(this.tangentOffset(k,'out'));
            k.mode=TangentMode.Free;
        }
        const picked=side==='in'?'handleIn':'handleOut';
        const other=side==='in'?'handleOut':'handleIn';
        const oppositeLength=length(k[other]);
        k[picked]=vec(sub(localPoint,k.position));
        if(k.mode===TangentMode.Mirrored||
           k.mode===TangentMode.Aligned){
            const l=length(k[picked]);
            const newLength=k.mode===TangentMode.Mirrored?l:oppositeLength;
            k[other]=l>1e-9?vec(scale(k[picked],-newLength/l)):new Vec3();
        }
    }
    public get pathGizmoTangentIn():Vec3{return this.readTangent('in');}
    public set pathGizmoTangentIn(v:Vec3){this.writeTangent('in',v);}
    public get pathGizmoTangentOut():Vec3{return this.readTangent('out');}
    public set pathGizmoTangentOut(v:Vec3){this.writeTangent('out',v);}
    public get pathGizmoTangentInWorld():Vec3{return this.readTangent('in',true);}
    public set pathGizmoTangentInWorld(v:Vec3){this.writeTangent('in',v,true);}
    public get pathGizmoTangentOutWorld():Vec3{return this.readTangent('out',true);}
    public set pathGizmoTangentOutWorld(v:Vec3){this.writeTangent('out',v,true);}

    public getSplineData(consumer:Node,space:SplineSpace=SplineSpace.Local):SplineDataV2 {
        if(!consumer?.isValid||!this.node?.isValid)
            throw new Error('SplinePath and consumer require valid Nodes');
        if(this.knots.length<2||this.knots.some(k=>!k||!finite(k.position)))
            throw new Error('SplinePath needs at least two finite Vec3 Knots');
        if(new Set(this.knots).size!==this.knots.length)
            throw new Error('SplinePath Knot records must not be reused twice');
        const types:CurveTypeV2[]=[
            'linear','bezier','catmull-rom','catmull-rom-centripetal'
        ];
        const type=types[this.interpolation];
        if(!type)throw new Error('SplinePath interpolation is invalid');
        // Local generation copies authored Path-local coordinates verbatim.
        // World mode preserves the previous Path.world -> Generator.local behavior.
        // Compute the inverse only when World mapping is explicitly requested.
        const inverse=space===SplineSpace.World?
            Mat4.invert(new Mat4(),consumer.worldMatrix):null;
        return {type,closed:this.closed,knots:this.knots.map(k=>{
            if(!Number.isInteger(k.mode)||k.mode<0||k.mode>3||
                !finite(k.handleIn)||!finite(k.handleOut)||
                !Number.isFinite(k.tension)||
                !Number.isFinite(k.rollDegrees)||Math.abs(k.rollDegrees)>180)
                throw new Error('SplinePath has invalid Knot handles or tension');
            const local=inverse?
                Vec3.transformMat4(new Vec3(),
                    Vec3.transformMat4(new Vec3(),k.position,this.node.worldMatrix),
                    inverse):k.position;
            const position={x:local.x,y:local.y,z:local.z};
            const tension=k.tension,rollDegrees=k.rollDegrees;
            if(type!=='bezier')return {position,tension,rollDegrees};
            if(k.mode===TangentMode.Auto)return {position,tension,rollDegrees};
            const toRelative=(offset:V3):V3=>{
                if(!inverse)return {x:offset.x,y:offset.y,z:offset.z};
                const control=Vec3.transformMat4(new Vec3(),
                    vec(add(k.position,offset)),this.node.worldMatrix);
                const target=Vec3.transformMat4(new Vec3(),control,inverse);
                return sub(target,position);
            };
            return {position,tension,rollDegrees,
                handleIn:toRelative(k.handleIn),handleOut:toRelative(k.handleOut)};
        })};
    }
    /** Rotate SDK rings are centered at the Path Node origin; the Euler
     * proxy is therefore the Path Node orientation, never a fake Knot pivot. */
    public get pathGizmoRotationEuler():Vec3 {
        if(!this.node?.isValid)return new Vec3();
        return this.gizmoRotationSpace===SplineSpace.World?
            Quat.toEuler(new Vec3(),this.node.worldRotation):
            vec(this.node.eulerAngles);
    }
    public set pathGizmoRotationEuler(value:Vec3) {
        if(!EDITOR_NOT_IN_PREVIEW||!this.node?.isValid||
           this.gizmoRotationMode===RotationMode.Knots||
           !finite(value))return;
        const world=this.gizmoRotationSpace===SplineSpace.World;
        if(this.gizmoRotationMode===RotationMode.Planar2D){
            const original=this.pathGizmoRotationEuler;
            const next=new Vec3(original.x,original.y,value.z);
            if(world)this.node.setWorldRotationFromEuler(next.x,next.y,next.z);
            else this.node.setRotationFromEuler(next);
        }else if(world)this.node.setWorldRotationFromEuler(value.x,value.y,value.z);
        else this.node.setRotationFromEuler(vec(value));
    }
    private read(index:number,field:PathGizmoProperty,world=false):Vec3 {
        const k=this.knotAt(index,field);
        if(!EDITOR_NOT_IN_PREVIEW||!k||!finite(k.position))return new Vec3();
        return this.toGizmoPoint(k.position,world);
    }
    private write(index:number,field:PathGizmoProperty,value:Vec3,world=false):void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.gizmoEditKnots||!finite(value))return;
        const k=this.knotAt(index,field);
        if(k){
            const local=this.fromGizmoPoint(value,world);
            if(!finite(local))return;
            const frozen=this._dragKnot===k&&this._dragProperty===field?
                this._dragGroupPositions.map(entry=>entry.knot):null;
            const group=frozen??this.selectedGroupKnots();
            // Only moving an INCLUDED Knot translates the group. Other
            // active handles remain ordinary independent single-Knot edits.
            if(group.length>1&&group.includes(k)){
                const delta=sub(local,k.position);
                if(!finite(delta))return;
                const next=group.map(member=>({
                    knot:member,position:add(member.position,delta)
                }));
                if(next.every(item=>finite(item.position)))
                    for(const item of next)item.knot.position=vec(item.position);
            }else k.position=local;
        }
    }
    /** In-memory edit selection: no extra CCClass or serialized Knot indices. */
    private selectedGroupKnots():SplineKnot[] {
        const existing=new Set(this.knots);
        for(const knot of this._selectedGroup)
            if(!existing.has(knot))this._selectedGroup.delete(knot);
        return this.knots.filter(knot=>this._selectedGroup.has(knot)).slice(0,32);
    }
    public selectedGroupIndices():number[] {
        const selected=new Set(this.selectedGroupKnots());
        return this.knots.flatMap((k,i)=>selected.has(k)?[i]:[]);
    }
    /** Plan-only helper for one recordable Inspector group nudge. */
    public planGroupNudge(axis:string):{
        knotCount:number;indices:number[];
        expectedPositions:V3[];deltaLocal:V3
    } {
        if(!EDITOR_NOT_IN_PREVIEW||!this.node?.isValid||!this.gizmoEditKnots||
           this._dragKnot||this._rotationDragging||this._hudRollKnot)
            throw new Error('Group Nudge is unavailable during Play or an active drag');
        if(!/^[xyz][+-]$/.test(axis))
            throw new Error('Invalid Group Nudge axis');
        const indices=this.selectedGroupIndices();
        if(indices.length<2||indices.length>32)
            throw new Error('Select at least two Knots using the HUD group buttons');
        const raw=this.gizmoPositionSnap;
        if(!Number.isFinite(raw)||raw<0||raw>20)
            throw new Error('Invalid Path Position Snap');
        const step=raw>0?raw:1;
        const vector:V3={x:0,y:0,z:0};
        vector[axis[0] as keyof V3]=axis[1]==='+'?step:-step;
        const world=this.gizmoPositionSpace===SplineSpace.World;
        const origin=this.fromGizmoPoint({x:0,y:0,z:0},world);
        const destination=this.fromGizmoPoint(vector,world);
        const deltaLocal=sub(destination,origin);
        if(!finite(deltaLocal)||length(deltaLocal)<=1e-9)
            throw new Error('Group Nudge requires an invertible Path transform');
        const expectedPositions=indices.map(index=>{
            const point=this.knots[index].position;
            if(!finite(point))throw new Error('Group contains invalid Knot Vec3');
            return {x:point.x,y:point.y,z:point.z};
        });
        return {knotCount:this.knots.length,indices,
            expectedPositions,deltaLocal};
    }
    /** Rebind transient selection after Creator replaces serialized Knot data. */
    public restoreGroupSelection(indices:ReadonlyArray<number>):void {
        this._selectedGroup.clear();
        if(!EDITOR_NOT_IN_PREVIEW||!Array.isArray(indices)||
           indices.length<2||indices.length>32)return;
        const unique=new Set(indices);
        if(unique.size!==indices.length||indices.some(i=>
            !Number.isSafeInteger(i)||i<0||i>=this.knots.length))return;
        for(const index of indices)this._selectedGroup.add(this.knots[index]);
    }
    public onGizmoHudAction(id:string):void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.node?.isValid||
           !this.gizmoEditKnots||this._dragKnot||
           this._rotationDragging||this._hudRollKnot)return;
        if(id==='path-group-clear'){
            this._selectedGroup.clear();
            return;
        }
        if(id!=='path-group-toggle')return;
        const active=this.knots[this.gizmoKnotIndex];
        if(!active)return;
        if(this._selectedGroup.has(active)){
            this._selectedGroup.delete(active);
        }else if(this.selectedGroupKnots().length<32){
            this._selectedGroup.add(active);
        }
    }
    public get pathGizmoKnotPosition():Vec3 {
        return this.read(this.gizmoKnotIndex,'pathGizmoKnotPosition');
    }
    public set pathGizmoKnotPosition(value:Vec3) {
        this.write(this.gizmoKnotIndex,'pathGizmoKnotPosition',value);
    }
    public get pathGizmoKnotPositionWorld():Vec3 {
        return this.read(this.gizmoKnotIndex,'pathGizmoKnotPosition',true);
    }
    public set pathGizmoKnotPositionWorld(value:Vec3) {
        this.write(this.gizmoKnotIndex,'pathGizmoKnotPosition',value,true);
    }
    /** Indexed Gizmos proxies write back to the same local Knot record. */
    private knotPositionsProxy(world:boolean):Vec3[] {
        const limit=Number.isFinite(this.gizmoPointLimit)?
            Math.max(2,Math.min(32,Math.floor(this.gizmoPointLimit))):16;
        const count=Math.min(this.knots.length,limit),result=new Array<Vec3>(count);
        const toIndex=(p:string|symbol)=>{
            if(typeof p!=='string'||!/^(0|[1-9][0-9]*)$/.test(p))return -1;
            const n=Number(p);return Number.isSafeInteger(n)&&n<count?n:-1;
        };
        return new Proxy(result,{
            get:(target,p,receiver)=>{
                const i=toIndex(p);
                return i>=0?this.read(i,'pathGizmoKnotPositions',world):Reflect.get(target,p,receiver);
            },
            set:(target,p,value,receiver)=>{
                const i=toIndex(p);
                if(i>=0){this.write(i,'pathGizmoKnotPositions',value,world);return true;}
                if(typeof p==='string'&&/^(0|[1-9][0-9]*)$/.test(p))return false;
                return Reflect.set(target,p,value,receiver);
            }
        });
    }
    public get pathGizmoKnotPositions():Vec3[] {
        return this.knotPositionsProxy(false);
    }
    public get pathGizmoKnotPositionsWorld():Vec3[] {
        return this.knotPositionsProxy(true);
    }
    /** Each HUD pair is mutually exclusive and always has one active space. */
    public get pathHudPositionLocal():boolean {return this.gizmoPositionSpace===SplineSpace.Local;}
    public set pathHudPositionLocal(v:boolean) {if(v)this.switchHudSpace('position',SplineSpace.Local);}
    public get pathHudPositionWorld():boolean {return this.gizmoPositionSpace===SplineSpace.World;}
    public set pathHudPositionWorld(v:boolean) {if(v)this.switchHudSpace('position',SplineSpace.World);}
    public get pathHudRotationLocal():boolean {return this.gizmoRotationSpace===SplineSpace.Local;}
    public set pathHudRotationLocal(v:boolean) {if(v)this.switchHudSpace('rotation',SplineSpace.Local);}
    public get pathHudRotationWorld():boolean {return this.gizmoRotationSpace===SplineSpace.World;}
    public set pathHudRotationWorld(v:boolean) {if(v)this.switchHudSpace('rotation',SplineSpace.World);}
    private switchHudSpace(kind:'position'|'rotation',space:SplineSpace):void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.node?.isValid||
           this._dragKnot||this._rotationDragging||this._hudRollKnot)return;
        if(kind==='position')this.gizmoPositionSpace=space;
        else this.gizmoRotationSpace=space;
    }
    public onGizmoHandles():SplineGizmoHandle[] {
        if(!EDITOR_NOT_IN_PREVIEW||!this.node?.isValid)return [];
        if(this.gizmoRotationMode!==RotationMode.Knots){
            const mode=this.gizmoRotationMode===RotationMode.Planar2D?
                '2d':this.gizmoRotationMode===RotationMode.Spatial3D?
                '3d':null;
            return mode?buildSplinePathRotateGizmos('pathGizmoRotationEuler',
                mode,this.gizmoRotationSnap,
                this.gizmoRotationSpace===SplineSpace.World?'world':'local'):[];
        }
        if(!this.gizmoEditKnots||!this.knots[this.gizmoKnotIndex])return [];
        const world=this.gizmoPositionSpace===SplineSpace.World;
        const space=world?'world':'local';
        const snap=Number.isFinite(this.gizmoPositionSnap)&&
            this.gizmoPositionSnap>=0&&this.gizmoPositionSnap<=20?
            this.gizmoPositionSnap:0;
        const active=buildSplineKnotMoveGizmos(
            world?'pathGizmoKnotPositionWorld':'pathGizmoKnotPosition',space,snap);
        if(!active.length)return [];
        const handles=[...active];
        if(this.gizmoMultiKnotPoints){
            const limit=Number.isFinite(this.gizmoPointLimit)?
                Math.max(2,Math.min(32,Math.floor(this.gizmoPointLimit))):16;
            const indices=Array.from({length:Math.min(this.knots.length,limit)},(_,i)=>i)
                .filter(i=>i!==this.gizmoKnotIndex);
            handles.push(...buildSplineKnotPointGizmos(
                world?'pathGizmoKnotPositionsWorld':'pathGizmoKnotPositions',
                indices,space,snap,this.selectedGroupIndices()));
        }
        if(this.interpolation===CurveMode.Bezier&&this.gizmoEditTangents){
            handles.push(
                {id:'path-tangent-in',property:world?'pathGizmoTangentInWorld':'pathGizmoTangentIn',
                    visual:'point',plane:'view',space,...(snap>0?{snap}:{}),
                    color:'#b58cff',hoverColor:'#fff269',pickSize:24},
                {id:'path-tangent-out',property:world?'pathGizmoTangentOutWorld':'pathGizmoTangentOut',
                    visual:'point',plane:'view',space,...(snap>0?{snap}:{}),
                    color:'#48d8e6',hoverColor:'#fff269',pickSize:24});
        }
        return handles;
    }
    /**
     * SDK HUD sliders require a scalar property on the Component. This
     * computed proxy targets the selected, serialized Vec3 Knot record.
     * During a gesture, the record identity stays pinned even if the
     * user changes gizmoKnotIndex elsewhere in the Inspector.
     */
    public get pathGizmoActiveRoll():number {
        const knot=this._hudRollKnot??this.knots[this.gizmoKnotIndex];
        return knot&&Number.isFinite(knot.rollDegrees)?knot.rollDegrees:0;
    }
    public set pathGizmoActiveRoll(value:number) {
        if(!EDITOR_NOT_IN_PREVIEW||!this.gizmoEditKnots||
           !Number.isFinite(value)||value< -180||value>180||
           ((this._dragKnot||this._rotationDragging)&&!this._hudRollKnot))return;
        const knot=this._hudRollKnot??this.knots[this.gizmoKnotIndex];
        if(!knot)return;
        knot.rollDegrees=value;
    }
    public onGizmoHudChanged(
        name:string,phase:'begin'|'update'|'end'|'cancel',_value:number|boolean
    ):void {
        if(!EDITOR_NOT_IN_PREVIEW||name!=='pathGizmoActiveRoll')return;
        if(phase==='begin'){
            if(this._hudRollKnot||this._dragKnot||this._rotationDragging)return;
            const knot=this.knots[this.gizmoKnotIndex];
            if(!knot)return;
            this._hudRollKnot=knot;
            this._hudRollStart=knot.rollDegrees;
            for(const consumer of this._consumers)
                consumer.onSharedSplinePathEditBegin?.();
        }else if(phase==='update'&&this._hudRollKnot){
            this.notifyPreviewConsumers(this,false);
        }else if((phase==='end'||phase==='cancel')&&this._hudRollKnot){
            try{
                if(phase==='cancel')
                    this._hudRollKnot.rollDegrees=this._hudRollStart;
                this.notifyPreviewConsumers(this,true);
            }finally{
                this._hudRollKnot=null;
                this._observed=this.signature();
                this._needsFinal=false;
            }
        }
    }
    /**
     * Read-only Scene HUD coordinate readout. It shows the editing space,
     * never serialized CCClass/Vec3 dump data or a second Inspector panel.
     */
    public onGizmoHud():Array<{
        id:string;text:string;order:number;fontSize:number;color:string
    }> {
        if(!EDITOR_NOT_IN_PREVIEW||!this.node?.isValid||
           !this.gizmoEditKnots||this.knots.length<2||
           !availableGizmoBackend())return [];
        const index=this.gizmoKnotIndex,knot=this.knots[index];
        if(!knot||!finite(knot.position))return [];
        const world=this.gizmoPositionSpace===SplineSpace.World;
        const p=this.toGizmoPoint(knot.position,world);
        if(!finite(p))return [];
        const f=(n:number)=>n.toFixed(2);
        const selected=this.selectedGroupIndices();
        const group=selected.length>0?' · Group '+selected.length+': '+
            selected.join(', '):'';
        return [{id:'path-active-position',
            text:'Knot '+index+' · '+(world?'World':'Local')+
                 '  X '+f(p.x)+'  Y '+f(p.y)+'  Z '+f(p.z)+group,
            order:0,fontSize:12,color:'#a3e2ff'}];
    }
    public onGizmoHudControls():Array<{
        type:'slider'|'toggle'|'button';id:string;text:string;property?:string;
        min?:number;max?:number;step?:number;order?:number;group?:string;
    }> {
        if(!EDITOR_NOT_IN_PREVIEW||!this.gizmoEditKnots||
            this.knots.length<2||!availableGizmoBackend())return [];
        return [
            {type:'toggle',id:'position-local',text:'Position · Local',
                property:'pathHudPositionLocal',group:'position-space',order:-4},
            {type:'toggle',id:'position-world',text:'Position · World',
                property:'pathHudPositionWorld',group:'position-space',order:-3},
            {type:'toggle',id:'rotation-local',text:'Rotation · Local',
                property:'pathHudRotationLocal',group:'rotation-space',order:-2},
            {type:'toggle',id:'rotation-world',text:'Rotation · World',
                property:'pathHudRotationWorld',group:'rotation-space',order:-1},
            {type:'slider',id:'path-position-snap',text:'Position Snap',
                property:'gizmoPositionSnap',min:0,max:5,step:.05,order:0},
            {type:'slider',id:'path-active-knot',text:'Active Knot',
                property:'gizmoKnotIndex',min:0,
                max:Math.min(this.knots.length-1,127),step:1,order:1},
            {type:'toggle',id:'path-other-knots',text:'Other Knots',
                property:'gizmoMultiKnotPoints',order:2},
            ...(this.interpolation===CurveMode.Bezier?
                [{type:'toggle' as const,id:'path-tangent-handles',
                    text:'Tangents',property:'gizmoEditTangents',order:3}]:[]),
            {type:'slider',id:'path-knot-roll',text:'Knot Roll (deg)',
                property:'pathGizmoActiveRoll',min:-180,max:180,step:1,order:4},
            {type:'toggle',id:'path-roll-guide',text:'Roll Guide',
                property:'gizmoShowRollGuide',order:5},
            {type:'button',id:'path-group-toggle',text:'Toggle Active Group',order:6},
            {type:'button',id:'path-group-clear',text:'Clear Group',order:7}
        ];
    }
    public onGizmoChanged(name:string,phase:'begin'|'update'|'end'|'cancel',
                          index?:number):void {
        if(!EDITOR_NOT_IN_PREVIEW)return;
        if(name==='pathGizmoRotationEuler'){
            if(phase==='begin'){
                if(this._rotationDragging||this._dragKnot||this._hudRollKnot)return;
                this._rotationDragging=true;
                // Always store the LOCAL node Euler for lossless Escape,
                // even when the tool is editing a world orientation.
                this._rotationStart=vec(this.node.eulerAngles);
                for(const consumer of this._consumers)
                    consumer.onSharedSplinePathEditBegin?.();
            }else if(phase==='update'&&this._rotationDragging){
                this.notifyPreviewConsumers(this,false);
            }else if((phase==='end'||phase==='cancel')&&this._rotationDragging){
                try{
                    if(phase==='cancel'&&this._rotationStart&&this.node?.isValid)
                        this.node.setRotationFromEuler(vec(this._rotationStart));
                    this.notifyPreviewConsumers(this,true);
                }finally{
                    this._rotationDragging=false;this._rotationStart=null;
                    this._observed=this.signature();this._needsFinal=false;
                }
            }
            return;
        }
        const proxy={
            pathGizmoKnotPosition:'pathGizmoKnotPosition',
            pathGizmoKnotPositionWorld:'pathGizmoKnotPosition',
            pathGizmoKnotPositions:'pathGizmoKnotPositions',
            pathGizmoKnotPositionsWorld:'pathGizmoKnotPositions',
            pathGizmoTangentIn:'pathGizmoTangentIn',
            pathGizmoTangentInWorld:'pathGizmoTangentIn',
            pathGizmoTangentOut:'pathGizmoTangentOut',
            pathGizmoTangentOutWorld:'pathGizmoTangentOut'
        } as const;
        if(!(name in proxy))return;
        const field=proxy[name as keyof typeof proxy] as PathGizmoProperty;
        if(phase==='begin'){
            if(this._dragKnot||this._rotationDragging||this._hudRollKnot)return;
            const i=field==='pathGizmoKnotPositions'?index:this.gizmoKnotIndex;
            if(!Number.isSafeInteger(i)||i===undefined||i<0)return;
            const knot=this.knots[i];
            if(!knot)return;
            this._dragKnot=knot;this._dragProperty=field;this._dragIndex=i;
            this._dragSnapshot={
                knot,position:vec(knot.position),mode:knot.mode,
                handleIn:vec(knot.handleIn),handleOut:vec(knot.handleOut),
                rollDegrees:knot.rollDegrees
            };
            // Pin group by record identity for the lifetime of this gesture.
            // An Inspector active-index change cannot retarget or resize it.
            this._dragGroupPositions=field==='pathGizmoKnotPosition'||
                field==='pathGizmoKnotPositions'?
                this.selectedGroupKnots()
                    .filter(member=>this._selectedGroup.has(knot))
                    .map(member=>({knot:member,position:vec(member.position)})):[];
            for(const consumer of this._consumers)
                consumer.onSharedSplinePathEditBegin?.();
        }else if(phase==='update'&&this._dragProperty===field){
            this.notifyPreviewConsumers(this,false);
        }else if((phase==='end'||phase==='cancel')&&this._dragProperty===field){
            try{
                if(phase==='cancel'&&this._dragSnapshot){
                    for(const item of this._dragGroupPositions)
                        item.knot.position=vec(item.position);
                    const snap=this._dragSnapshot;
                    snap.knot.position=vec(snap.position);
                    snap.knot.mode=snap.mode;
                    snap.knot.handleIn=vec(snap.handleIn);
                    snap.knot.handleOut=vec(snap.handleOut);
                    snap.knot.rollDegrees=snap.rollDegrees;
                }
                this.notifyPreviewConsumers(this,true);
            }finally{
                this._observed=this.signature();this._needsFinal=false;
                this._dragKnot=null;this._dragProperty=null;
                this._dragSnapshot=null;this._dragGroupPositions=[];
                this._dragIndex=-1;
            }
        }
    }
    public onDrawGizmosSelected():void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.gizmoShowPath||
            !this.node?.isValid||!availableGizmoBackend()||this.knots.length<2)return;
        try{
            const source=this.getSplineData(this.node);
            const cache=buildSplineCacheV2(source);
            const frames=buildSplineFramesV2(cache,{maxStep:Math.max(.2,cache.length/64)});
            const guide=buildRoadSceneGuideV2(frames.frames,
                source.knots.map(k=>k.position),0,{
                    maxSteps:64,showEdges:false,showKnots:true});
            const knot=this.knots[this.gizmoKnotIndex];
            const k=knot;
            const lines=[...guide.lines],dots=[...guide.dots];
            if(this.interpolation===CurveMode.Bezier&&
                this.gizmoEditTangents&&k){
                const tangentIn=add(k.position,this.tangentOffset(k,'in'));
                const tangentOut=add(k.position,this.tangentOffset(k,'out'));
                lines.push(
                    {a:k.position,b:tangentIn,group:'tangent-in'},
                    {a:k.position,b:tangentOut,group:'tangent-out'});
                dots.push(
                    {at:tangentIn,radius:.13,group:'tangent-in'},
                    {at:tangentOut,radius:.13,group:'tangent-out'});
            }
            if(this.gizmoShowRollGuide&&k&&
                Number.isFinite(this.gizmoRollGuideSize)&&
                this.gizmoRollGuideSize>=.1&&this.gizmoRollGuideSize<=20){
                // The knot distance is an ORIGINAL segment boundary, not
                // the nearest sampled frame index. frameAtDistance correctly
                // samples the banked frame at the exact authored Knot.
                const distance=this.gizmoKnotIndex<cache.segments.length?
                    cache.segments[this.gizmoKnotIndex].startDistance:cache.length;
                const f=frameAtDistanceV2(cache,frames,distance);
                const half=this.gizmoRollGuideSize;
                const left=sub(f.position,scale(f.right,half));
                const right=add(f.position,scale(f.right,half));
                const up=add(f.position,scale(f.up,half*.65));
                lines.push(
                    {a:left,b:right,group:'bank-right'},
                    {a:f.position,b:up,group:'bank-up'});
                dots.push(
                    {at:left,radius:.11,group:'bank-right'},
                    {at:right,radius:.11,group:'bank-right'},
                    {at:up,radius:.12,group:'bank-up'});
            }
            drawSplineSceneGizmos(this.node,{lines,dots});
        }catch{
            // Incomplete Path is normal while authoring. Never spam logs.
        }
    }
    /**
     * Creator Undo/Redo and serialized Scene reload may replace CCClass Knot
     * record objects. Discard any stale in-flight proxy targets before
     * rebuilding temporary meshes from the restored serialized Path.
     */
    public onRestore():void {
        if(!EDITOR_NOT_IN_PREVIEW)return;
        this._dragKnot=null;this._dragProperty=null;
        this._dragSnapshot=null;this._dragIndex=-1;
        this._dragGroupPositions=[];this._selectedGroup.clear();
        this._rotationDragging=false;this._rotationStart=null;
        this._hudRollKnot=null;this._hudRollStart=0;
        this._lastScan=Number.NEGATIVE_INFINITY;
        this._lastChange=Number.NEGATIVE_INFINITY;
        this._observed=this.signature();
        this._needsFinal=false;
        this.notifyPreviewConsumers(this,true);
    }
}
