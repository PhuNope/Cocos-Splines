import { _decorator, Component, MeshRenderer, Mesh, Material, Vec3, Quat, Mat4, Color, utils, Enum } from 'cc';
import { SplineContainer } from '../Core/SplineContainer';
import { SplinePositionMode, toNormalizedRange } from '../Core/SplinePosition';
Enum(SplinePositionMode);
Enum(SplinePositionMode);
import { buildMeshGizmoLines, drawMeshGizmoLines, MeshGizmoLines } from '../Core/SplineMeshGizmos';
const {ccclass,property,menu,executeInEditMode,requireComponent}= _decorator;
/** Generate a UV-mapped tube. Renderer resides on THIS node, which may be distinct
 * from the SplineContainer. Generated meshes are transient, not serialized assets.
 */
@ccclass('Splines.SplineExtrude')
@menu('Splines/Spline Extrude')
@executeInEditMode(true)
@requireComponent(MeshRenderer)
export class SplineExtrude extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({min:0.001}) radius=0.08;
    @property({min:3,max:64,step:1}) sides=10;
    @property({min:3,max:128,step:1,tooltip:'Samples per cubic segment'}) segmentsPerCurve=12;
    @property({tooltip:'Ending radius. Negative value uses Radius for a constant-width tube.'}) endRadius=-1;
    @property({range:[0,1,0.001],slide:true,tooltip:'Normalized distance where extrusion begins.'}) startProgress=0;
    @property({range:[0,1,0.001],slide:true,tooltip:'Normalized distance where extrusion ends.'}) endProgress=1;
    @property({type:Enum(SplinePositionMode),tooltip:'Normalized Distance (legacy), Distance in local units, or geometric Spline t.'})
    rangeMode:SplinePositionMode=SplinePositionMode.NormalizedDistance;
    @property({min:0,tooltip:'Start distance when Range Mode = Distance.'}) startDistance=0;
    @property({min:0,tooltip:'End distance when Range Mode = Distance. The interval is clamped to current spline length.'}) endDistance=10;
    @property capEnds=true;
    @property({tooltip:'Reverse triangle winding and normals, useful for tunnels viewed from inside.'}) flipNormals=false;
    @property({min:.001,tooltip:'UV V units per Cocos unit'}) uvTiling=1;
    @property({type:Material,tooltip:'Optional override; otherwise uses a builtin unlit material'}) material:Material|null=null;
    @property({tooltip:'Rebuild on curve/parameter changes, including in Editor'}) rebuildOnChange=true;
    private _revision='';
    @property({tooltip:'Draw a bounded preview wireframe when this mesh component is selected. Requires Cocos-Gizmos extension.'}) showMeshGizmos=true;
    @property({min:24,max:1200,step:1,tooltip:'Maximum preview edges. High values can slow down Scene Editor.'}) gizmoEdgeLimit=240;
    private _mesh:Mesh|null=null;
    private _meshGizmo:MeshGizmoLines|null=null;
    private _fallback:Material|null=null;
    // Assigned asset is shared. Never use getMaterialInstance() or renderer.material.
    // Track only explicit component bindings so users can also assign a Material
    // directly to MeshRenderer when this component's Material slot is empty.
    private _boundMaterial:Material|null=null;
    private syncMaterial(renderer:MeshRenderer|null):void{
        if(!renderer)return;
        const selected=this.material;
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
                
                if(current!==this._fallback)renderer.setSharedMaterial(this._fallback,0);
            }
            this._boundMaterial=null;
        }
    }
    private source():SplineContainer|null{return this.spline||this.getComponent(SplineContainer);}
    onEnable():void{this.rebuild();}
    update():void{
        this.syncMaterial(this.getComponent(MeshRenderer));
        if(!this.rebuildOnChange||!this.source())return;
        const rev=this.signature();if(rev!==this._revision)this.rebuild();
    }
    private signature():string{return JSON.stringify([this.source()?.getRevision(),this.source()?.node.worldMatrix.m00,this.source()?.node.worldMatrix.m01,this.source()?.node.worldMatrix.m04,this.source()?.node.worldMatrix.m05,this.source()?.node.worldMatrix.m08,this.source()?.node.worldMatrix.m09,this.source()?.node.worldMatrix.m12,this.source()?.node.worldMatrix.m13,this.source()?.node.worldMatrix.m14,this.node.worldMatrix.m00,this.node.worldMatrix.m05,this.node.worldMatrix.m10,this.node.worldMatrix.m12,this.node.worldMatrix.m13,this.node.worldMatrix.m14,this.radius,this.endRadius,this.startProgress,this.endProgress,this.rangeMode,this.startDistance,this.endDistance,this.sides,this.segmentsPerCurve,this.capEnds,this.flipNormals,this.uvTiling,this.gizmoEdgeLimit]);}
    public rebuild():void{
        const source=this.source(),renderer=this.getComponent(MeshRenderer);
        this.syncMaterial(renderer);
        if(!renderer||!source||source.count<2){
            if(renderer&&this._mesh&&renderer.mesh===this._mesh)renderer.mesh=null;
            this._mesh?.destroy();this._mesh=null;this._meshGizmo=null;this._revision='';return;
        }
        const [start,end]=toNormalizedRange(source,this.rangeMode,this.startProgress,this.endProgress,this.startDistance,this.endDistance);
        const span=end-start;
        if(span<1e-6){
            if(this._mesh&&renderer.mesh===this._mesh)renderer.mesh=null;
            this._mesh?.destroy();this._mesh=null;this._meshGizmo=null;this._revision=this.signature();return;
        }
        const rings=Math.max(1,Math.ceil(span*source.segmentCount*Math.min(128,Math.max(3,Math.floor(this.segmentsPerCurve)))));
        const sides=Math.max(3,Math.min(64,Math.floor(this.sides)));
        const radius=Math.max(.001,this.radius),endRadius=this.endRadius<0?radius:Math.max(.001,this.endRadius);
        const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
        const inverse=Mat4.invert(new Mat4(),this.node.worldMatrix);
        const closed=source.closed&&span>=1-1e-6,ringCount=rings+1;
        const append=(p:Vec3,n:Vec3,u:number,w:number):void=>{
            positions.push(p.x,p.y,p.z);normals.push(this.flipNormals?-n.x:n.x,this.flipNormals?-n.y:n.y,this.flipNormals?-n.z:n.z);uvs.push(u,w);
        };
        for(let i=0;i<ringCount;i++) {
            const t=start+(i/rings)*span,worldPos=source.evaluateWorldPosition(t),tangent=source.evaluateTangent(t),up=source.evaluateUp(t);
            const ringRadius=radius+(endRadius-radius)*(i/rings);
            Vec3.transformQuat(tangent,tangent,source.node.worldRotation);
            Vec3.transformQuat(up,up,source.node.worldRotation);
            const right=Vec3.cross(new Vec3(),up,tangent);
            if(right.lengthSqr()<1e-8)right.set(1,0,0);
            Vec3.normalize(right,right);Vec3.cross(up,tangent,right);Vec3.normalize(up,up);
            for(let j=0;j<=sides;j++){
                const angle=j/sides*Math.PI*2;
                const normal=Vec3.add(new Vec3(),Vec3.multiplyScalar(new Vec3(),right,Math.cos(angle)),Vec3.multiplyScalar(new Vec3(),up,Math.sin(angle)));
                const vertex=Vec3.add(new Vec3(),worldPos,Vec3.multiplyScalar(new Vec3(),normal,ringRadius));
                Vec3.transformMat4(vertex,vertex,inverse);
                // Convert a world normal to mesh-local. Correct for non-uniform node scale.
                const localNormal=Vec3.subtract(new Vec3(),vertex,Vec3.transformMat4(new Vec3(),worldPos,inverse));
                Vec3.normalize(localNormal,localNormal);
                append(vertex,localNormal,j/sides,(t-start)*source.length*Math.max(.001,this.uvTiling));
            }
        }
        const stride=sides+1;
        for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){
            const a=i*stride+j,b=a+stride;
            if(this.flipNormals)indices.push(a,b,a+1,a+1,b,b+1);
            else indices.push(a,a+1,b,a+1,b+1,b);
        }
        if(!closed&&this.capEnds){
            for(let side=0;side<2;side++){
                const t=side===0?start:end,center=source.evaluateWorldPosition(t),norm=source.evaluateTangent(t);
                Vec3.transformQuat(norm,norm,source.node.worldRotation);
                if(side===0)Vec3.multiplyScalar(norm,norm,-1);
                const centerLocal=Vec3.transformMat4(new Vec3(),center,inverse);
                const inverseRotation=Quat.invert(new Quat(),this.node.worldRotation);
                const faceNorm=Vec3.transformQuat(new Vec3(),norm,inverseRotation);
                Vec3.normalize(faceNorm,faceNorm);
                const centerIndex=positions.length/3;append(centerLocal,faceNorm,0.5,0.5);
                const beginIndex=positions.length/3,originalStart=side===0?0:rings*stride;
                for(let j=0;j<=sides;j++){
                    const offset=(originalStart+j)*3;
                    append(new Vec3(positions[offset],positions[offset+1],positions[offset+2]),faceNorm,.5+.5*Math.cos(j/sides*Math.PI*2),.5+.5*Math.sin(j/sides*Math.PI*2));
                }
                for(let j=0;j<sides;j++){
                    const front=side===0;
                    if(front!==this.flipNormals)indices.push(centerIndex,beginIndex+j+1,beginIndex+j);
                    else indices.push(centerIndex,beginIndex+j,beginIndex+j+1);
                }
            }
        }
        this._meshGizmo=buildMeshGizmoLines(positions,indices,this.gizmoEdgeLimit);
        const mesh=utils.createMesh({positions,normals,uvs,indices});
        renderer.mesh=mesh;
        if(this._mesh&&this._mesh!==mesh)this._mesh.destroy();
        this._mesh=mesh;
        this.syncMaterial(renderer);
        this._revision=this.signature();
    }
    public onDrawGizmosSelected():void {
        if(!this.showMeshGizmos)return;
        drawMeshGizmoLines(this.node,this.node,this._meshGizmo,new Color(255,163,75,255));
    }
    onDestroy():void{
        this._meshGizmo=null;
        this._meshGizmo=null;
        if(this._mesh){const renderer=this.getComponent(MeshRenderer);if(renderer?.mesh===this._mesh)renderer.mesh=null;this._mesh.destroy();this._mesh=null;}
        const renderer=this.getComponent(MeshRenderer);
        if(renderer && this._fallback && renderer.getSharedMaterial(0)===this._fallback)renderer.setSharedMaterial(null,0);
        this._fallback?.destroy();this._fallback=null;this._boundMaterial=null;
    }
}
