import { _decorator, Component, MeshRenderer, Mesh, Material, Vec3, Mat4, Color, utils, Enum } from 'cc';
import { SplineContainer } from '../Core/SplineContainer';
import { SplinePositionMode, toNormalizedRange } from '../Core/SplinePosition';
import { buildRoadGeometry, RoadFrame, RoadUvDirection, RoadCornerMode } from '../Core/SplineRoadMath';
import { SplineModifiers } from './SplineModifiers';
import { createWorldFrameField } from '../Core/SplineWorldFrames';
import { estimateMinimumBendRadius } from '../Core/SplineStableFrames';
Enum(SplinePositionMode);
Enum(RoadUvDirection);
Enum(RoadCornerMode);
import { buildMeshGizmoLines, drawMeshGizmoLines, MeshGizmoLines } from '../Core/SplineMeshGizmos';
const {ccclass,property,menu,executeInEditMode,requireComponent}=_decorator;
/** Live editable roadway, inspired by a road surface generator. Generates transient Mesh,
 * not a serialized Mesh asset. Geometry is created in this node's local space,
 * supports knot roll/bank and source/renderer transforms. No standalone Editor panel.
 *
 * Recommended: child node "Road" under the SplineContainer, with MeshRenderer.
 * This prevents conflicting with SplineExtrude's MeshRenderer on legacy nodes.
 */
@ccclass('Splines.SplineRoad')
@menu('Splines/Spline Road')
@executeInEditMode(true)
@requireComponent(MeshRenderer)
export class SplineRoad extends Component {
    @property({type:SplineContainer,tooltip:'Optional if the Road node is a child of a SplineContainer.'}) spline:SplineContainer|null=null;
    @property({type:SplineModifiers,tooltip:'Optional keyframed width multiplier along the road.'}) modifiers:SplineModifiers|null=null;
    @property({min:0.05,tooltip:'Total asphalt width, in world units.'}) width=6;
    @property({tooltip:'Road width at the end; <= 0 keeps Width constant.'}) endWidth=-1;
    @property({min:0,tooltip:'Shoulder width on EACH side of the asphalt.'}) shoulderWidth=0.6;
    @property({min:0,tooltip:'Lower outer edge of the shoulder by this amount.'}) shoulderDrop=0.035;
    @property({min:0,tooltip:'Curb top width on each side, 0 disables curb geometry.'}) curbWidth=0.2;
    @property({min:0,tooltip:'Curb height above the road surface; 0 disables curbs.'}) curbHeight=0.15;
    @property({min:0,tooltip:'Road volume depth; 0 makes an open road surface.'}) thickness=0.25;
    @property({min:2,max:128,step:1,tooltip:'How many longitudinal mesh samples per Bezier segment.'}) samplesPerCurve=16;
    @property({type:Enum(RoadCornerMode),tooltip:'Legacy: original ribbon mesh. Join And Trim: miter corners to close outside gaps, smoothly trim inner overlap when width exceeds bend radius. Not a full mesh Boolean for hairpins/crossings.'})
    cornerMode:RoadCornerMode=RoadCornerMode.Legacy;
    @property({range:[.5,.99,.01],slide:true,tooltip:'How close inner road edges may approach the center of a tight turn (0.5–0.99). Lower values trim more and reduce overlap; default 0.93.'})
    cornerTrimSafety=.93;
    @property({range:[0,1,.001],slide:true}) startProgress=0;
    @property({range:[0,1,.001],slide:true}) endProgress=1;
    @property({type:Enum(SplinePositionMode),tooltip:'Normalized Distance (legacy), Distance in local units, or geometric Spline t.'})
    rangeMode:SplinePositionMode=SplinePositionMode.NormalizedDistance;
    @property({min:0,tooltip:'Start distance when Range Mode = Distance.'}) startDistance=0;
    @property({min:0,tooltip:'End distance when Range Mode = Distance. The interval is clamped to current spline length.'}) endDistance=10;
    @property({min:.001,tooltip:'World-space road distance per texture repetition along the selected Length UV axis (U or V).'}) uvMetersPerRepeat=5;
    @property({type:Enum(RoadUvDirection),tooltip:'Length Along V: texture is vertical (legacy); Length Along U: texture is horizontal. UV axis for spline direction.'})
    uvDirection:RoadUvDirection=RoadUvDirection.LengthAlongV;
    @property({min:.001,tooltip:'Number of texture repeats across the complete road width (default 1). Does not affect longitudinal repeat distance.'})
    uvWidthTiles=1;
    @property({tooltip:'Reverse texture direction across the width of the road.'}) uvReverseAcross=false;
    @property({tooltip:'Reverse texture direction along the spline. Requires Repeat wrapping for negative UV values.'}) uvReverseLength=false;
    @property({tooltip:'Offset the final texture U coordinate.'}) uvOffsetU=0;
    @property({tooltip:'Offset the final texture V coordinate.'}) uvOffsetV=0;
    @property({type:Material,tooltip:'Assign asphalt / road material with tiled texture. Uses default dark asphalt color when empty.'}) roadMaterial:Material|null=null;
    @property({type:Color,tooltip:'Fallback unlit asphalt color when no custom material is supplied.'}) asphaltColor:Color=new Color(48,53,60,255);
    @property({tooltip:'Close the start/end edges for open road slabs.'}) capEnds=true;
    @property({tooltip:'Recreate visual mesh on knot edits or changes to the properties, even in Scene Editor.'}) rebuildOnChange=true;
    @property({tooltip:'Draw a bounded preview wireframe when this mesh component is selected. Requires Cocos-Gizmos extension.'}) showMeshGizmos=true;
    @property({min:24,max:1200,step:1,tooltip:'Maximum preview edges. High values can slow down Scene Editor.'}) gizmoEdgeLimit=240;
    private _mesh:Mesh|null=null;
    private _meshGizmo:MeshGizmoLines|null=null;
    private _fallback:Material|null=null;
    // Assigned asset is shared. Never use getMaterialInstance() or renderer.material.
    // Track only explicit component bindings so users can also assign a Material
    // directly to MeshRenderer when this component's Material slot is empty.
    private _boundMaterial:Material|null=null;
    private _fallbackColorSignature='';
    private syncMaterial(renderer:MeshRenderer|null):void{
        if(!renderer)return;
        const selected=this.roadMaterial;
        const current=renderer.getSharedMaterial(0);
        if(selected){
            if(current!==selected)renderer.setSharedMaterial(selected,0);
            this._boundMaterial=selected;
        }else{
            // Respect manual MeshRenderer materials, but release a previous
            // component Material when its Inspector field is cleared.
            if(!current || (this._boundMaterial!==null && current===this._boundMaterial)){
                if(!this._fallback){
                    this._fallback=new Material();
                    this._fallback.initialize({effectName:'builtin-unlit'});
                }
                const color=this.asphaltColor;
                const colorSignature=`${color.r}:${color.g}:${color.b}:${color.a}`;
                if(this._fallbackColorSignature!==colorSignature){
                    this._fallback.setProperty('mainColor',color);
                    this._fallbackColorSignature=colorSignature;
                }
                if(current!==this._fallback)renderer.setSharedMaterial(this._fallback,0);
            }
            this._boundMaterial=null;
        }
    }
    private _revision='';

    public getSpline():SplineContainer|null{
        if(this.spline)return this.spline;
        let n:import('cc').Node|null=this.node;
        while(n){const c=n.getComponent(SplineContainer);if(c)return c;n=n.parent;}
        return null;
    }
    onEnable():void{this.rebuild();}
    update():void{
        this.syncMaterial(this.getComponent(MeshRenderer));
        if(!this.rebuildOnChange)return;
        const s=this.getSpline();
        if(!s)return;
        if(this.signature()!==this._revision)this.rebuild();
    }
    private signature():string{
        const s=this.getSpline(),a=s?.node.worldMatrix,b=this.node.worldMatrix;
        const matrix=(m:Mat4|undefined)=>m?[m.m00,m.m01,m.m02,m.m04,m.m05,m.m06,m.m08,m.m09,m.m10,m.m12,m.m13,m.m14]:[];
        return JSON.stringify([s?.getRevision(),matrix(a),matrix(b),this.width,this.endWidth,this.shoulderWidth,this.shoulderDrop,
            this.curbWidth,this.curbHeight,this.thickness,this.modifiers?.getRevision(),this.samplesPerCurve,this.cornerMode,this.cornerTrimSafety,this.startProgress,
            this.endProgress,this.rangeMode,this.startDistance,this.endDistance,this.uvMetersPerRepeat,this.uvDirection,
            this.uvWidthTiles,this.uvReverseAcross,this.uvReverseLength,this.uvOffsetU,this.uvOffsetV,this.capEnds,this.gizmoEdgeLimit]);
    }
    public onDrawGizmosSelected():void {
        if(!this.showMeshGizmos)return;
        drawMeshGizmoLines(this.node,this.node,this._meshGizmo,new Color(68,190,255,255));
    }
    private clearMesh():void{
        this._meshGizmo=null;
        const renderer=this.getComponent(MeshRenderer);
        if(renderer&&this._mesh&&renderer.mesh===this._mesh)renderer.mesh=null;
        if(this._mesh){this._mesh.destroy();this._mesh=null;}
    }
    /** Rebuild immediately. Can also be called from the Inspector's Refresh button. */
    public rebuild():void{
        const source=this.getSpline(),renderer=this.getComponent(MeshRenderer);
        this.syncMaterial(renderer);
        if(!source||!renderer||source.count<2||source.segmentCount<1){this.clearMesh();this._revision='';return;}
        const [begin,end]=toNormalizedRange(source,this.rangeMode,this.startProgress,this.endProgress,this.startDistance,this.endDistance);
        if(end-begin<1e-5){this.clearMesh();this._revision=this.signature();return;}
        // Keep a complete road below 65k vertices in 16-bit-index-only render backends.
        const count=Math.min(3000,Math.max(1,Math.ceil((end-begin)*source.segmentCount*Math.max(2,Math.min(128,Math.floor(this.samplesPerCurve))))));
        const inv=Mat4.invert(new Mat4(),this.node.worldMatrix);
        const frames:RoadFrame[]=[];
        const transformBasis=(origin:Vec3,vec:Vec3,local:Vec3):Vec3=>{
            const offset=Vec3.add(new Vec3(),origin,vec);
            Vec3.transformMat4(offset,offset,inv);return Vec3.subtract(new Vec3(),offset,local);
        };
        const worldFrames=createWorldFrameField(source,begin,end,count);
        const minRadius=estimateMinimumBendRadius(worldFrames.frames);
        const maxWidthMultiplier=this.modifiers?Math.max(1,...worldFrames.frames.map(f=>
            Math.max(.01,this.modifiers!.sample(f.t).width))):1;
        const halfExtent=Math.max(.05,this.width,this.endWidth>0?this.endWidth:0)*maxWidthMultiplier*.5
            +Math.max(0,this.shoulderWidth)+Math.max(0,this.curbWidth);
        if(minRadius<halfExtent){
            console.warn('[SplineRoad] Very tight bend: road half-width exceeds the bend radius. '
                +(this.cornerMode===RoadCornerMode.JoinAndTrim
                    ? 'Join And Trim compresses the inner edge, but extreme hairpins or 3D self-intersections may still require a custom mesh.'
                    : 'Enable Corner Mode = Join And Trim, widen the bend or reduce road width.'));
        }
        let previousWorld:Vec3|null=null,worldDistance=0;
        for(let i=0;i<=count;i++){
            const f=worldFrames.frames[i],world=new Vec3(f.position.x,f.position.y,f.position.z);
            const local=Vec3.transformMat4(new Vec3(),world,inv);
            if(previousWorld)worldDistance+=Vec3.subtract(new Vec3(),world,previousWorld).length();
            previousWorld=world;
            const forwardLocal=transformBasis(world,new Vec3(f.tangent.x,f.tangent.y,f.tangent.z),local);
            const rightLocal=transformBasis(world,new Vec3(f.right.x,f.right.y,f.right.z),local);
            const upLocal=transformBasis(world,new Vec3(f.up.x,f.up.y,f.up.z),local);
            frames.push({position:local,forward:forwardLocal,right:rightLocal,up:upLocal,distance:worldDistance});
        }
        const geometry=buildRoadGeometry(frames,{
            width:this.width,endWidth:this.endWidth,shoulderWidth:this.shoulderWidth,shoulderDrop:this.shoulderDrop,
            curbWidth:this.curbWidth,curbHeight:this.curbHeight,thickness:this.thickness,
            widthAt:this.modifiers?(i,n)=>this.modifiers!.sample(begin+(end-begin)*(n<=1?0:i/(n-1))).width:undefined,
            cornerMode:this.cornerMode,cornerTrimSafety:this.cornerTrimSafety,
            capEnds:this.capEnds,uvLength:this.uvMetersPerRepeat,startProgress:begin,endProgress:end,
            uvDirection:this.uvDirection,uvWidthTiles:this.uvWidthTiles,uvReverseAcross:this.uvReverseAcross,
            uvReverseLength:this.uvReverseLength,uvOffsetU:this.uvOffsetU,uvOffsetV:this.uvOffsetV
        },source.closed&&begin===0&&end===1);
        if(!geometry.indices.length){this.clearMesh();this._revision=this.signature();return;}
        this._meshGizmo=buildMeshGizmoLines(geometry.positions,geometry.indices,this.gizmoEdgeLimit);
        const mesh=utils.createMesh({positions:geometry.positions,normals:geometry.normals,uvs:geometry.uvs,indices:geometry.indices});
        const old=this._mesh;
        renderer.mesh=mesh;this._mesh=mesh;
        if(old&&old!==mesh)old.destroy();
        this.syncMaterial(renderer);
        this._revision=this.signature();
    }
    onDestroy():void {
        this.clearMesh();
        const renderer=this.getComponent(MeshRenderer);
        if(renderer && this._fallback && renderer.getSharedMaterial(0)===this._fallback)renderer.setSharedMaterial(null,0);
        this._fallback?.destroy();this._fallback=null;this._boundMaterial=null;
    }
}
