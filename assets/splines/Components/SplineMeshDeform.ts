import { _decorator, Component, MeshRenderer, Mesh, Material, Vec3, Mat4, gfx, utils, Enum } from 'cc';
import { SplineContainer } from '../Core/SplineContainer';
import { SplinePositionMode, toNormalizedRange } from '../Core/SplinePosition';
Enum(SplinePositionMode);
import { deformMesh, MeshGeometry, Frame, MeshAxis, UVMode } from '../Core/SplineMeshDeformMath';
import { readPositionTriples, readUVPairs, resolveAttributeFormatName, findStoredAttributeFormat, readNormalTriples, VertexFormat } from '../Core/SplineMeshRead';
const {ccclass,property,menu,executeInEditMode,requireComponent}=_decorator;
/** Cocos readAttribute() returns raw Uint16 bits for half-float formats. */
export { decodeHalfFloat } from '../Core/SplineMeshRead';
export enum DeformAxis { X=0,Y=1,Z=2 }
export enum DeformMode { Stretch=0,Repeat=1 }
export enum DeformUV { KeepOriginal=0,ContinuousRepeat=1,Distance=2 }
Enum(DeformAxis);Enum(DeformMode);Enum(DeformUV);
/** Deforms a READABLE imported mesh along a spline. Does not edit source mesh.
 * Designed for ropes, pipes, chains, vines and strips (non-skinned single submesh).
 * Mesh must have sufficient longitudinal subdivisions for curved bends.
 */
@ccclass('Splines.SplineMeshDeform')
@menu('Splines/Spline Mesh Deform')
@executeInEditMode(true)
@requireComponent(MeshRenderer)
export class SplineMeshDeform extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:Mesh,tooltip:'Readable mesh asset, e.g. subdivided rope segment. Enable Allow Data Access in its import settings.'}) sourceMesh:Mesh|null=null;
    @property({type:Material,tooltip:'Optional material; use tiled rope texture material here.'}) material:Material|null=null;
    @property({type:Enum(DeformAxis),tooltip:'Longitudinal axis of the source mesh; Z is default.'}) axis:DeformAxis=DeformAxis.Z;
    @property({type:Enum(DeformMode),tooltip:'Stretch deforms one source mesh; Repeat duplicates the source mesh along the curve.'}) mode:DeformMode=DeformMode.Stretch;
    @property({min:1,max:256,step:1,tooltip:'Copies used in Repeat mode (1 to 256); each segment mesh is stretched to its route section.'}) repeatCount=8;
    @property({tooltip:'Reverse triangle front faces AND normals for meshes with opposite winding. X/Y axes are already corrected automatically; normally leave OFF.'}) flipFaces=false;
    @property({min:0.001,tooltip:'Cross-sectional width multiplier.'}) widthScale=1;
    @property({min:0.001,tooltip:'Cross-sectional height multiplier.'}) heightScale=1;
    @property({range:[0,1,0.001],slide:true}) startProgress=0;
    @property({range:[0,1,0.001],slide:true}) endProgress=1;
    @property({type:Enum(SplinePositionMode),tooltip:'Normalized Distance (legacy), Distance in local units, or geometric Spline t.'})
    rangeMode:SplinePositionMode=SplinePositionMode.NormalizedDistance;
    @property({min:0,tooltip:'Start distance when Range Mode = Distance.'}) startDistance=0;
    @property({min:0,tooltip:'End distance when Range Mode = Distance. The interval is clamped to current spline length.'}) endDistance=10;
    @property({type:Enum(DeformUV),tooltip:'Keep original mesh UV, continuous source UV across repeat segments, or path distance in V.'}) uvMode:DeformUV=DeformUV.Distance;
    @property({min:0.001,tooltip:'UV V cycles per world unit (Distance mode only). Shader/material is external to this library.'}) uvTilesPerUnit=1;
    @property({tooltip:'Auto regenerate when curve or inspector properties change.'}) rebuildOnChange=true;
    private _generated:Mesh|null=null;
    private _revision='';
    private _failedSignature='';
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
    private source():SplineContainer|null{return this.spline||this.getComponent(SplineContainer)||this.node.parent?.getComponent(SplineContainer)||null;}
    private signature():string{
        const s=this.source();
        const m=(a:any)=>a?[a.m00,a.m01,a.m02,a.m04,a.m05,a.m06,a.m08,a.m09,a.m10,a.m12,a.m13,a.m14]:[];
        return JSON.stringify([s?.getRevision(),m(s?.node.worldMatrix),m(this.node.worldMatrix),this.sourceMesh?.uuid,this.sourceMesh?.data?.byteLength,this.axis,this.mode,this.repeatCount,this.flipFaces,this.widthScale,this.heightScale,this.startProgress,this.endProgress,this.rangeMode,this.startDistance,this.endDistance,this.uvMode,this.uvTilesPerUnit]);
    }
    onEnable():void{this.rebuild();}
    update():void{
        this.syncMaterial(this.getComponent(MeshRenderer));
        if(this.rebuildOnChange&&this.signature()!==this._revision&&this.signature()!==this._failedSignature)this.rebuild();
    }
    private clear():void {
        const renderer=this.getComponent(MeshRenderer);
        if(renderer&&renderer.mesh===this._generated)renderer.mesh=null;
        this._generated?.destroy();this._generated=null;
    }
    public rebuild():void{
        const source=this.source(),mesh=this.sourceMesh,renderer=this.getComponent(MeshRenderer);
        this.syncMaterial(renderer);
        this._revision='';
        if(!renderer||!source||!mesh||source.count<2){this.clear();this._revision=this.signature();return;}
        const signature=this.signature();
        try {
            if(!mesh.allowDataAccess)throw Error('Enable Allow Data Access on the imported Source Mesh.');
            if(mesh.struct.primitives.length!==1)throw Error('Only a single-submesh mesh is supported. Merge materials/submeshes before import.');
            const position=mesh.readAttribute(0,gfx.AttributeName.ATTR_POSITION);
            const uvs=mesh.readAttribute(0,gfx.AttributeName.ATTR_TEX_COORD);
            const originalNormals=mesh.readAttribute(0,gfx.AttributeName.ATTR_NORMAL);
            const indices=mesh.readIndices(0);
            const uvFormat=mesh.readAttributeFormat(0,gfx.AttributeName.ATTR_TEX_COORD);
            const normalFormat=mesh.readAttributeFormat(0,gfx.AttributeName.ATTR_NORMAL);
            const format=mesh.readAttributeFormat(0,gfx.AttributeName.ATTR_POSITION);
            if(!position||!indices)throw Error('Cannot read source mesh positions/indices. Enable Allow Data Access.');
            // FormatInfo from Cocos 3.8.8 is resolved below; integer formats
            // are already numeric, while RGB16F contains IEEE754 half bits.
            // Cocos Creator v3.8.8 readAttributeFormat() returns FormatInfo
            // ({name:'RGB32F',...}), NOT the numeric gfx.Format enum.
            // Fallback to the primitive's actual vertex bundle for older/custom
            // engine builds; a primitive can reference multiple vertex bundles.
            const formatTable=gfx.Format as unknown as Readonly<Record<string,number|string>>;
            const positionType=resolveAttributeFormatName(
                format, formatTable,
                findStoredAttributeFormat(mesh,0,gfx.AttributeName.ATTR_POSITION)
            ) as VertexFormat;
            const pos=readPositionTriples(position,positionType);
            const uvType=resolveAttributeFormatName(
                uvFormat, formatTable,
                findStoredAttributeFormat(mesh,0,gfx.AttributeName.ATTR_TEX_COORD)
            ) as VertexFormat;
            // UV0 is optional; source meshes without UVs use generated UVs.
            const tex=uvs?readUVPairs(uvs,uvType):undefined;
            const normalType=resolveAttributeFormatName(
                normalFormat,formatTable,
                findStoredAttributeFormat(mesh,0,gfx.AttributeName.ATTR_NORMAL)
            );
            const smoothNormals=readNormalTriples(originalNormals,normalType);
            const data:MeshGeometry={positions:pos,indices:Array.from(indices),uvs:tex,
                normals:smoothNormals&&smoothNormals.length===pos.length?smoothNormals:undefined};
            if(data.uvs&&data.uvs.length!==data.positions.length/3*2)throw Error('Source UV0 must be 2-component FLOAT32; disable compressed UVs.');
            const inverse=Mat4.invert(new Mat4(),this.node.worldMatrix);
            const frameAt=(t:number):Frame=>{
                const position=source.evaluateWorldPosition(t);
                const before=source.evaluateWorldPosition(Math.max(0,t-0.0003));
                const after=source.evaluateWorldPosition(Math.min(1,t+0.0003));
                const tangent=Vec3.subtract(new Vec3(),after,before);
                if(tangent.lengthSqr()<1e-8)Vec3.transformQuat(tangent,source.evaluateTangent(t),source.node.worldRotation);
                Vec3.normalize(tangent,tangent);
                let up=source.evaluateUp(t);Vec3.transformQuat(up,up,source.node.worldRotation);
                let right=Vec3.cross(new Vec3(),up,tangent);
                if(right.lengthSqr()<1e-8)right.set(1,0,0);
                Vec3.normalize(right,right);Vec3.cross(up,tangent,right);Vec3.normalize(up,up);
                const center=Vec3.transformMat4(new Vec3(),position,inverse);
                const side=Vec3.transformMat4(new Vec3(),Vec3.add(new Vec3(),position,right),inverse);
                const height=Vec3.transformMat4(new Vec3(),Vec3.add(new Vec3(),position,up),inverse);
                const to=(v:Vec3)=>({x:v.x,y:v.y,z:v.z});
                const localRight=Vec3.subtract(side,side,center);
                const localUp=Vec3.subtract(height,height,center);
                const localForward=Vec3.cross(new Vec3(),localRight,localUp);
                Vec3.normalize(localForward,localForward);
                return {position:to(center),right:to(localRight),up:to(localUp),forward:to(localForward)};
            };
            // Approximate world-space length; accounts for scale applied to source transform.
            let worldLength=0,prev=source.evaluateWorldPosition(0);
            for(let i=1;i<=64;i++){
                const next=source.evaluateWorldPosition(i/64);
                worldLength+=Vec3.subtract(new Vec3(),next,prev).length();
                prev=next;
            }
            const [start,end]=toNormalizedRange(source,this.rangeMode,this.startProgress,this.endProgress,this.startDistance,this.endDistance);
            if(end<=start)throw Error('Range End must be greater than Start.');
            const output=deformMesh(data,frameAt,{
                axis:this.axis as MeshAxis,repeats:this.mode===DeformMode.Repeat?this.repeatCount:1,
                start,end,crossScale:this.widthScale,depthScale:this.heightScale,
                uvMode:this.uvMode as UVMode,uvTilesPerUnit:this.uvTilesPerUnit,length:worldLength,
                flipFaces:this.flipFaces,
            });
            const next=utils.createMesh(output);
            const previous=this._generated;
            renderer.mesh=next;this._generated=next;
            if(previous&&previous!==next)previous.destroy();
            // Reapply the shared asset after swapping the generated mesh. A
            // flipped winding changes geometry, not the Material asset itself;
            // PBR normal-map shading additionally needs generated UV tangents.
            this.syncMaterial(renderer);
            this._revision=signature;this._failedSignature='';
        }catch(error){
            this._failedSignature=signature;
            console.warn('[SplineMeshDeform] '+this.node.name+': '+String(error));
        }
    }
    onDestroy():void{
        this.clear();
        const renderer=this.getComponent(MeshRenderer);
        if(renderer && this._fallback && renderer.getSharedMaterial(0)===this._fallback)renderer.setSharedMaterial(null,0);
        this._fallback?.destroy();this._fallback=null;this._boundMaterial=null;
    }
}
