import { _decorator, Component, MeshRenderer, Mesh, Vec3, Mat4, Quat, Color, gfx, utils, Enum } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer } from '../Core/SplineContainer';
import { createWorldFrameField } from '../Core/SplineWorldFrames';
import { SplinePositionMode, toNormalizedRange } from '../Core/SplinePosition';
import { DeformAxis } from './SplineMeshDeform';
import { findStoredAttributeFormat, resolveAttributeFormatName, readPositionTriples, readUVPairs, VertexFormat } from '../Core/SplineMeshRead';
import { recomputeNormals, computeTangents } from '../Core/SplineMeshDeformMath';
import { bendHierarchyPositions, layoutSequentialMeshParts, BendFrame } from '../Core/SplineHierarchyBendMath';
import { buildMeshGizmoLines, drawMeshGizmoLines, MeshGizmoLines } from '../Core/SplineMeshGizmos';
const {ccclass,property,menu,executeInEditMode}=_decorator;
Enum(SplinePositionMode);
export enum BenderLayout { KeepHierarchy=0, SequentialMeshes=1 }
Enum(BenderLayout);
interface Original {renderer:MeshRenderer; mesh:Mesh;positions:number[];indices:number[];uvs:number[];rootPositions:number[];generated:Mesh|null}

/** Bend all readable mesh renderers in a hierarchy, preserving individual materials.
 * Imported mesh assets are NEVER edited; each child receives a transient deformed mesh.
 * Keep this node OUTSIDE the source spline hierarchy (do not bend knot handles).
 */
@ccclass('Splines.SplineObjectBender')
@menu('Splines/Spline Object Bender')
@executeInEditMode(true)
export class SplineObjectBender extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:Enum(BenderLayout),tooltip:'Keep Hierarchy uses each child transform; Sequential Meshes lays mesh parts end-to-end along Axis, without changing child Nodes.'}) layout:BenderLayout=BenderLayout.KeepHierarchy;
    @property({min:0,tooltip:'Distance between consecutive mesh parts when Sequential Meshes layout is selected.'}) partGap=0;
    @property({type:Enum(DeformAxis),tooltip:'Longitudinal axis of the original object hierarchy.'}) axis:DeformAxis=DeformAxis.Z;
    @property({type:Enum(SplinePositionMode)}) rangeMode:SplinePositionMode=SplinePositionMode.NormalizedDistance;
    @property({range:[0,1,0.001],slide:true}) startProgress=0;
    @property({range:[0,1,0.001],slide:true}) endProgress=1;
    @property({min:0}) startDistance=0;
    @property({min:0}) endDistance=10;
    @property({min:0.001}) widthScale=1;
    @property({min:0.001}) heightScale=1;
    @property({min:1,max:256,step:1,tooltip:'Limits work on large hierarchies.'}) maxMeshes=64;
    @property({tooltip:'Editor preview is opt-in and restored when disabled.'}) previewInEditor=false;
    @property({tooltip:'Automatically rebuild when spline/parameters change.'}) rebuildOnChange=false;
    @property({tooltip:'Show sampled wireframes for all generated child meshes when selected (requires Cocos-Gizmos).'}) showMeshGizmos=true;
    @property({min:24,max:1200,step:1,tooltip:'Total edge budget shared between bent meshes.'}) gizmoEdgeLimit=360;
    private _meshGizmos:Array<{node:import('cc').Node;geometry:MeshGizmoLines}>=[];
    public onDrawGizmosSelected():void {
        if(!this.showMeshGizmos)return;
        const color=new Color(255,137,213,255);
        for(const sample of this._meshGizmos)drawMeshGizmoLines(this.node,sample.node,sample.geometry,color);
    }
    private originals:Original[]=[];
    private signature='';
    private _applied=false;
    private holdRestore=false;
    private descendants():MeshRenderer[]{
        const out:MeshRenderer[]=[];
        const visit=(n:import('cc').Node):void=>{
            const renderer=n.getComponent(MeshRenderer);
            if(renderer&&renderer.mesh)out.push(renderer);
            if(out.length>=this.maxMeshes)return;
            for(const child of n.children)if(out.length<this.maxMeshes)visit(child);
        };visit(this.node);return out;
    }
    private capture():void{
        if(this.originals.length)return;
        const rootInverse=Mat4.invert(new Mat4(),this.node.worldMatrix);
        for(const renderer of this.descendants()){
            const mesh=renderer.mesh;
            if(!mesh||!mesh.allowDataAccess||mesh.struct.primitives.length!==1)continue;
            const attr=gfx.AttributeName.ATTR_POSITION;
            const data=mesh.readAttribute(0,attr),indices=mesh.readIndices(0);
            if(!data||!indices)continue;
            const fmt=resolveAttributeFormatName(mesh.readAttributeFormat(0,attr),gfx.Format as any,findStoredAttributeFormat(mesh,0,attr)) as VertexFormat;
            let positions:number[],uvs:number[]=[];
            try{positions=readPositionTriples(data,fmt);}catch(error){console.warn('[SplineObjectBender] unsupported mesh',renderer.node.name,error);continue;}
            const texName=gfx.AttributeName.ATTR_TEX_COORD,tex=mesh.readAttribute(0,texName);
            if(tex){const tf=resolveAttributeFormatName(mesh.readAttributeFormat(0,texName),gfx.Format as any,findStoredAttributeFormat(mesh,0,texName)) as VertexFormat;
                try{uvs=readUVPairs(tex,tf);}catch(error){console.warn('[SplineObjectBender] unsupported UV; using 0',error);}}
            const mat=renderer.node.worldMatrix,rootPositions:number[]=[];
            for(let i=0;i<positions.length;i+=3){
                const world=Vec3.transformMat4(new Vec3(),new Vec3(positions[i],positions[i+1],positions[i+2]),mat);
                const p=Vec3.transformMat4(world,world,rootInverse);rootPositions.push(p.x,p.y,p.z);
            }
            this.originals.push({renderer,mesh,positions,indices:Array.from(indices),uvs,rootPositions,generated:null});
        }
    }
    private key():string {return JSON.stringify([this.spline?.getRevision(),this.spline?.node.worldMatrix,this.node.worldMatrix,
        this.axis,this.layout,this.partGap,this.rangeMode,this.startProgress,this.endProgress,this.startDistance,this.endDistance,this.widthScale,this.heightScale,this.originals.length,this.gizmoEdgeLimit]);}
    onEnable():void{if(!EDITOR_NOT_IN_PREVIEW||this.previewInEditor)this.rebuild();}
    update():void{
        if(EDITOR_NOT_IN_PREVIEW&&!this.previewInEditor){if(this._applied)this.restore();this.holdRestore=false;return;}
        if(this.holdRestore)return;
        if(this.rebuildOnChange&&this.key()!==this.signature)this.rebuild();
    }
    /** Restore all source Mesh references, and destroy only generated transient Meshes. */
    public restore():void{
        for(const item of this.originals){
            if(item.renderer.node.isValid&&item.renderer.mesh===item.generated)item.renderer.mesh=item.mesh;
            item.generated?.destroy();item.generated=null;
        }
        this._meshGizmos=[];this.originals=[];this._applied=false;this.signature='';this.holdRestore=true;
    }
    public rebuild():void{
        this.holdRestore=false;
        const spline=this.spline;
        if(!spline||spline.count<2)return;
        for(let n:import('cc').Node|null=spline.node;n;n=n.parent){
            if(n===this.node){console.warn('[SplineObjectBender] The source spline must be outside the model hierarchy.');return;}
        }
        this.capture();if(!this.originals.length)return;
        const axis=this.axis;
        const partPositions=this.layout===BenderLayout.SequentialMeshes
            ?layoutSequentialMeshParts(this.originals.map(item=>item.rootPositions),axis,this.partGap)
            :this.originals.map(item=>item.rootPositions);
        let min=Infinity,max=-Infinity;
        for(const verts of partPositions){
            for(let i=axis;i<verts.length;i+=3){min=Math.min(min,verts[i]);max=Math.max(max,verts[i]);}}
        if(max-min<1e-7){console.warn('[SplineObjectBender] Hierarchy has zero extent along selected axis.');return;}
        const [start,end]=toNormalizedRange(spline,this.rangeMode,this.startProgress,this.endProgress,this.startDistance,this.endDistance);
        if(end<=start)return;
        const stableFrames=(typeof spline.evaluateUp==='function'&&typeof spline.evaluateTangent==='function'&&typeof spline.evaluatePosition==='function')
            ?createWorldFrameField(spline,start,end,Math.min(1024,Math.max(128,spline.segmentCount*24))):null;
        this._meshGizmos=[];
        for(let itemIndex=0;itemIndex<this.originals.length;itemIndex++){
            const item=this.originals[itemIndex];
            const childInverse=Mat4.invert(new Mat4(),item.renderer.node.worldMatrix);
            const localFrame2=(t:number):BendFrame=>{
                const world=spline.evaluateWorldPosition(t);
                let right:Vec3,up:Vec3;
                if(stableFrames){
                    const frame=stableFrames.at(t);
                    right=new Vec3(frame.right.x,frame.right.y,frame.right.z);
                    up=new Vec3(frame.up.x,frame.up.y,frame.up.z);
                }else{
                    // Compatibility for minimal custom SplineContainer shims.
                    const quat=spline.evaluateRotation(t);
                    const composed=new Quat();Quat.multiply(composed,spline.node.worldRotation,quat);
                    right=Vec3.transformQuat(new Vec3(),new Vec3(1,0,0),composed);
                    up=Vec3.transformQuat(new Vec3(),new Vec3(0,1,0),composed);
                }
                const p=Vec3.transformMat4(new Vec3(),world,childInverse);
                const x=Vec3.transformMat4(new Vec3(),Vec3.add(new Vec3(),world,right),childInverse);
                const y=Vec3.transformMat4(new Vec3(),Vec3.add(new Vec3(),world,up),childInverse);
                Vec3.subtract(x,x,p);Vec3.subtract(y,y,p);
                return {position:p,right:x,up:y};
            };
            const rootCoordinates=partPositions[itemIndex];
            const bent=bendHierarchyPositions(rootCoordinates,localFrame2,{axis,min,max,start,end,widthScale:this.widthScale,heightScale:this.heightScale});
            const indices=item.indices.slice();
            if(axis!==DeformAxis.Z){for(let i=0;i+2<indices.length;i+=3){const tmp=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=tmp;}}
            const uvs=item.uvs.length===bent.length/3*2?item.uvs:new Array(bent.length/3*2).fill(0);
            const normals=recomputeNormals(bent,indices);
            const tangents=computeTangents(bent,normals,uvs,indices);
            const budget=Math.max(24,Math.floor(this.gizmoEdgeLimit/this.originals.length));
            this._meshGizmos.push({node:item.renderer.node,geometry:buildMeshGizmoLines(bent,indices,budget)});
            const mesh=utils.createMesh({positions:bent,indices,uvs,normals,tangents});
            const old=item.generated;item.renderer.mesh=mesh;item.generated=mesh;if(old&&old!==mesh)old.destroy();
        }
        this._applied=true;this.signature=this.key();
    }
    onDisable():void{this.restore();}
    onDestroy():void{this.restore();}
}
