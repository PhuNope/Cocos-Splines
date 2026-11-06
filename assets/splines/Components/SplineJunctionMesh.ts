import { _decorator, Component, MeshRenderer, Mesh, Material, Vec3, Mat4, Color, utils } from 'cc';
import { SplineJunction } from './SplineJunction';
import { SplineRoad } from './SplineRoad';
import { buildJunctionPatch } from '../Core/SplineJunctionPatchMath';
const {ccclass,property,menu,executeInEditMode,requireComponent}=_decorator;

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
    @property({min:0.001,tooltip:'World units per texture repeat.'}) uvMetersPerRepeat=5;
    @property({min:0.01,tooltip:'All connection points must lie close to same location.'}) tolerance=0.5;
    @property rebuildOnChange=true;
    private generated:Mesh|null=null;
    private fallback:Material|null=null;
    private bound:Material|null=null;
    private signature='';
    private currentKey():string {return JSON.stringify([(this.junction||this.node.parent?.getComponent(SplineJunction))?.connections.map(c=>[c.spline?.getRevision(),c.spline?.node.worldMatrix,c.positionMode,c.progress,c.distance]),
        this.setback,this.defaultWidth,this.surfaceLift,this.uvMetersPerRepeat,this.tolerance]);}
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
    public clear():void {
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
        for(const {link} of links){
            const spline=link.spline;if(!spline)continue;
            const p=link.getProgress();
            if(p>0.05&&p<0.95){console.warn('[SplineJunctionMesh] Patch supports links at spline endpoints only (0/1).');continue;}
            const at=spline.evaluateWorldPosition(p);
            const other=p<=0.5?Math.min(1,p+0.005):Math.max(0,p-0.005);
            const next=spline.evaluateWorldPosition(other);
            const dir=Vec3.subtract(new Vec3(),next,at);
            dir.y=0;if(dir.lengthSqr()<1e-7)continue;Vec3.normalize(dir,dir);
            const road=this.roadOf(spline);
            entries.push({center:at,outward:dir,width:road?.width||this.defaultWidth});
        }
        if(entries.length<2){this.clear();return;}
        const first=entries[0].center;
        if(entries.some(x=>Vec3.subtract(new Vec3(),x.center,first).length()>this.tolerance)){
            console.warn('[SplineJunctionMesh] Connection points are not co-located within tolerance.');
            this.clear();this.signature=this.currentKey();return;
        }
        const world=buildJunctionPatch(entries,this.setback,this.surfaceLift,this.uvMetersPerRepeat);
        if(!world.indices.length){this.clear();this.signature=this.currentKey();return;}
        const inverse=Mat4.invert(new Mat4(),this.node.worldMatrix),positions:number[]=[];
        for(let i=0;i<world.positions.length;i+=3){const p=Vec3.transformMat4(new Vec3(),new Vec3(world.positions[i],world.positions[i+1],world.positions[i+2]),inverse);
            positions.push(p.x,p.y,p.z);}
        // Compute local normals from local positions; supports parent transforms.
        const normals:number[]=[];
        for(let i=0;i<positions.length;i+=3){const a=Vec3.transformMat4(new Vec3(),new Vec3(world.positions[i],world.positions[i+1]+1,world.positions[i+2]),inverse);
            const n=Vec3.subtract(new Vec3(),a,new Vec3(positions[i],positions[i+1],positions[i+2]));
            Vec3.normalize(n,n);normals.push(n.x,n.y,n.z);}
        const mesh=utils.createMesh({positions,normals,uvs:world.uvs,indices:world.indices});
        const previous=this.generated;renderer.mesh=mesh;this.generated=mesh;
        if(previous&&previous!==mesh)previous.destroy();
        this.signature=this.currentKey();
    }
    onDestroy():void{this.clear();const r=this.getComponent(MeshRenderer);
        if(r&&r.getSharedMaterial(0)===this.fallback)r.setSharedMaterial(null,0);
        this.fallback?.destroy();this.fallback=null;}
}
