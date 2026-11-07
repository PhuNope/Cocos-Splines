import { _decorator, Component, MeshRenderer, Mesh, Material, Vec3, Mat4, Color, utils, Enum } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineJunction } from './SplineJunction';
import { SplineRoad } from './SplineRoad';
import { buildJunctionPatch, buildRoadMatchedJunctionPatch, MatchedRoadPatchBranch } from '../Core/SplineJunctionPatchMath';
import { buildMeshGizmoLines, drawMeshGizmoLines, MeshGizmoLines } from '../Core/SplineMeshGizmos';
const {ccclass,property,menu,executeInEditMode,requireComponent}=_decorator;
/** Legacy preserves the old XZ projected UVs. RoadMatched uses actual Road
 * mesh edge vertices and UVs with a shared blended center. */
export enum JunctionUVMode {WorldProjected=0,RoadMatched=1}
Enum(JunctionUVMode);

/** Road junction XZ patch for approximately coincident connection points.
 * Creates a surface overlay, NOT a watertight union. It does not trim Road mesh ends.
 * Keep it as a separate MeshRenderer Node; use the same SHARED road Material asset.
 */
@ccclass('Splines.SplineJunctionMesh')
@menu('Splines/Spline Junction Mesh')
@executeInEditMode(true)
@requireComponent(MeshRenderer)
export class SplineJunctionMesh extends Component {
    @property({type:SplineJunction}) junction:SplineJunction|null=null;
    @property({type:Material}) material:Material|null=null;
    @property({min:0.01,tooltip:'Extent of patch along each outbound road.'}) setback=3;
    @property({min:0.05,tooltip:'Fallback when no SplineRoad is found under branch container.'}) defaultWidth=6;
    @property({min:0.0001,tooltip:'Lift patch slightly to avoid z-fighting with road ends.'}) surfaceLift=0.015;
    @property({min:0.001,tooltip:'World units per texture repeat (World Projected mode only).'}) uvMetersPerRepeat=5;
    @property({type:Enum(JunctionUVMode),tooltip:'World Projected: original XZ UV; Road Matched: copy UV from actual Road asphalt vertices at both patch rings and blend only near the junction center.'})
    uvMode:JunctionUVMode=JunctionUVMode.WorldProjected;
    @property({range:[.1,.9,.05],slide:true,tooltip:'Road Matched: fraction of patch radius with Road UV preserved at the inner ring. Lower value means a smaller central blending region.'})
    uvBlendStart=.55;
    @property({min:0.01,tooltip:'All connection points must lie close to same location.'}) tolerance=0.5;
    @property rebuildOnChange=true;
    @property({tooltip:'Draw a bounded preview wireframe when this mesh component is selected. Requires Cocos-Gizmos extension.'}) showMeshGizmos=true;
    @property({min:24,max:1200,step:1,tooltip:'Maximum preview edges. High values can slow down Scene Editor.'}) gizmoEdgeLimit=240;
    private generated:Mesh|null=null;
    private _meshGizmo:MeshGizmoLines|null=null;
    private fallback:Material|null=null;
    private bound:Material|null=null;
    private signature='';
    private currentKey():string {return JSON.stringify([(this.junction||this.node.parent?.getComponent(SplineJunction))?.connections.map(c=>[
        c.spline?.getRevision(),c.spline?.node.worldMatrix,c.positionMode,c.progress,c.distance,
        c.spline?this.roadOf(c.spline)?.getJunctionUVRevision():null]),
        this.setback,this.defaultWidth,this.surfaceLift,this.uvMetersPerRepeat,this.uvMode,this.uvBlendStart,this.tolerance,this.gizmoEdgeLimit]);}
    private roadOf(spline:import('../Core/SplineContainer').SplineContainer):SplineRoad|null {
        const own=spline.node.getComponent(SplineRoad);if(own)return own;
        for(const child of spline.node.children){const found=child.getComponent(SplineRoad);if(found)return found;}
        return null;
    }
    onEnable():void{this.rebuild();}
    update():void{this.syncMaterial();if(this.rebuildOnChange&&this.currentKey()!==this.signature)this.rebuild();}
    private syncMaterial():void{
        const r=this.getComponent(MeshRenderer);if(!r)return;
        const selected=this.material;
        if(selected){if(r.getSharedMaterial(0)!==selected)r.setSharedMaterial(selected,0);this.bound=selected;}
        else if(!r.getSharedMaterial(0)||(this.bound!==null&&r.getSharedMaterial(0)===this.bound)){
            if(!this.fallback){this.fallback=new Material();this.fallback.initialize({effectName:'builtin-unlit'});
                this.fallback.setProperty('mainColor',new Color(56,59,61,255));}
            r.setSharedMaterial(this.fallback,0);
        }
        if(!selected)this.bound=null;
    }
    public onDrawGizmosSelected():void {
        if(!this.showMeshGizmos)return;
        drawMeshGizmoLines(this.node,this.node,this._meshGizmo,new Color(190,132,255,255));
    }
    public clear():void {
        this._meshGizmo=null;
        const r=this.getComponent(MeshRenderer);
        if(r&&r.mesh===this.generated)r.mesh=null;
        this.generated?.destroy();this.generated=null;
    }
    public rebuild():void {
        const j=this.junction||this.node.parent?.getComponent(SplineJunction),renderer=this.getComponent(MeshRenderer);
        this.syncMaterial();
        if(!j||!renderer){this.clear();return;}
        const links=j.entries();if(links.length<2){this.clear();return;}
        const entries: {center:Vec3;outward:Vec3;width:number}[]=[];
        const matches:MatchedRoadPatchBranch[]=[];
        let canMatch=true;
        for(const {link} of links){
            const spline=link.spline;if(!spline)continue;
            const p=link.getProgress();
            if(p>0.05&&p<0.95){if(EDITOR_NOT_IN_PREVIEW)console.warn('[SplineJunctionMesh] Patch supports links at spline endpoints only (0/1).');continue;}
            const at=spline.evaluateWorldPosition(p);
            const other=p<=0.5?Math.min(1,p+0.005):Math.max(0,p-0.005);
            const next=spline.evaluateWorldPosition(other);
            const dir=Vec3.subtract(new Vec3(),next,at);
            dir.y=0;if(dir.lengthSqr()<1e-7)continue;Vec3.normalize(dir,dir);
            const road=this.roadOf(spline);
            entries.push({center:at,outward:dir,width:road?.width||this.defaultWidth});
            if(this.uvMode===JunctionUVMode.RoadMatched){
                // Only strict endpoints can match the Road's exact mesh edge.
                const atStart=p<=1e-4,atEnd=p>=1-1e-4;
                const sample=(atStart||atEnd)?road?.sampleJunctionUV(atStart,this.setback,this.uvBlendStart):null;
                if(!sample)canMatch=false;
                else matches.push({center:at,outer:sample.outer,inner:sample.inner});
            }
        }
        if(entries.length<2){this.clear();return;}
        const first=entries[0].center;
        if(entries.some(x=>Vec3.subtract(new Vec3(),x.center,first).length()>this.tolerance)){
            if(EDITOR_NOT_IN_PREVIEW)console.warn('[SplineJunctionMesh] Connection points are not co-located within tolerance.');
            this.clear();this.signature=this.currentKey();return;
        }
        const matched=this.uvMode===JunctionUVMode.RoadMatched&&canMatch&&matches.length===entries.length;
        if(EDITOR_NOT_IN_PREVIEW&&this.uvMode===JunctionUVMode.RoadMatched&&!matched){
            console.warn('[SplineJunctionMesh] Road Matched UV needs a SplineRoad covering each endpoint and a valid Road mesh. Falling back to World Projected UV.');
        }
        const world=matched?buildRoadMatchedJunctionPatch(matches,this.surfaceLift,this.uvBlendStart)
            :buildJunctionPatch(entries,this.setback,this.surfaceLift,this.uvMetersPerRepeat);
        if(!world.indices.length){this.clear();this.signature=this.currentKey();return;}
        const inverse=Mat4.invert(new Mat4(),this.node.worldMatrix),positions:number[]=[];
        for(let i=0;i<world.positions.length;i+=3){const p=Vec3.transformMat4(new Vec3(),new Vec3(world.positions[i],world.positions[i+1],world.positions[i+2]),inverse);
            positions.push(p.x,p.y,p.z);}
        // Compute local normals from local positions; supports parent transforms.
        const normals:number[]=[];
        for(let i=0;i<positions.length;i+=3){const a=Vec3.transformMat4(new Vec3(),new Vec3(
            world.positions[i]+world.normals[i],world.positions[i+1]+world.normals[i+1],world.positions[i+2]+world.normals[i+2]),inverse);
            const n=Vec3.subtract(new Vec3(),a,new Vec3(positions[i],positions[i+1],positions[i+2]));
            Vec3.normalize(n,n);normals.push(n.x,n.y,n.z);}
        this._meshGizmo=buildMeshGizmoLines(positions,world.indices,this.gizmoEdgeLimit);
        const mesh=utils.createMesh({positions,normals,uvs:world.uvs,indices:world.indices});
        const previous=this.generated;renderer.mesh=mesh;this.generated=mesh;
        if(previous&&previous!==mesh)previous.destroy();
        this.signature=this.currentKey();
    }
    onDestroy():void{this.clear();const r=this.getComponent(MeshRenderer);
        if(r&&r.getSharedMaterial(0)===this.fallback)r.setSharedMaterial(null,0);
        this.fallback?.destroy();this.fallback=null;}
}
