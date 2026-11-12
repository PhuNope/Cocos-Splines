import {_decorator,Enum,Mesh,MeshRenderer,gfx} from 'cc';
import {buildSplineCacheV2} from '../core/SplineCache';
import {buildRoadFilletCacheV2} from '../geometry/RoadFillet';
import {readSourceMeshV2} from '../geometry/SourceMeshRead';
import {deformSourceMeshV2,type MeshDeformReportV2} from '../geometry/SourceMeshDeform';
import {SplineRoadV2,SplineV2SurfaceMode} from './SplineRoadV2';

const {ccclass,property,menu,requireComponent,executeInEditMode}=_decorator;
export enum SplineV2DeformSourceAxis {Z=0,X=1}
export enum SplineV2DeformUVTileMode {Preserve=0,Advance=1}
export enum SplineV2DeformUVAxis {V=0,U=1}
/**
 * Engine source Mesh -> immutable MeshData -> deform along the v2 spline.
 *
 * Only Dynamic Play or Editor Rebuild/Bake creates geometry. Manual/Baked Play
 * uses the already-imported Baked mesh and never reads a source asset.
 * Source mesh must be CPU-readable in Cocos 3.8.2+.
 */
@ccclass('SplinesV2.SplineMeshDeform')
@menu('Cocos Splines V2/Mesh Source Deformer')
@requireComponent(MeshRenderer)
@executeInEditMode(true)
export class SplineMeshDeformV2 extends SplineRoadV2 {
    @property({type:Mesh,tooltip:'Imported Mesh with authored UV0 (and optional UV2). Source asset is never modified.'})
    sourceMesh:Mesh|null=null;
    @property({type:Enum(SplineV2DeformSourceAxis),tooltip:'Local axis along the authored source mesh length: Z or X.'})
    sourceLongitudinalAxis=SplineV2DeformSourceAxis.Z;
    @property({type:Enum(SplineV2DeformUVAxis),tooltip:'Which original UV0 axis advances between mesh copies.'})
    sourceLongitudinalUVAxis=SplineV2DeformUVAxis.V;
    @property({min:1,max:128,step:1,tooltip:'Number of copies along the entire spline. 1 stretches the authored mesh across the path.'})
    repeatCount=1;
    @property({type:Enum(SplineV2DeformUVTileMode),tooltip:'Preserve authored UV0 exactly, or Advance UV0 by the original tile span for each repeat.'})
    uvTileMode=SplineV2DeformUVTileMode.Preserve;
    @property({tooltip:'Align lateral midpoint of source mesh to spline centre.'})
    centerSourceLateral=true;
    @property({tooltip:'Vertical offset of source vertices along transported spline up.'})
    deformVerticalOffset=0;
    private _lastDeformReport:MeshDeformReportV2|null=null;

    public inspectCornerRisk():null{return null;}
    public inspectDeform():MeshDeformReportV2|null {
        return this._lastDeformReport;
    }
    protected generate(){
        if(!this.sourceMesh||!this.sourceMesh.isValid)
            throw new Error('Mesh Source Deformer: assign a readable Source Mesh asset in Inspector');
        const mesh=this.sourceMesh;
        const source=readSourceMeshV2({
            subMeshCount:mesh.subMeshCount,
            readAttribute:(i,name)=>mesh.readAttribute(i,name),
            readIndices:i=>mesh.readIndices(i)
        },{
            position:gfx.AttributeName.ATTR_POSITION,
            uv0:gfx.AttributeName.ATTR_TEX_COORD,
            uv2:gfx.AttributeName.ATTR_TEX_COORD1,
            normal:gfx.AttributeName.ATTR_NORMAL,
            tangent:gfx.AttributeName.ATTR_TANGENT
        });
        let cache=buildSplineCacheV2(this.source());
        if(this.surfaceMode===SplineV2SurfaceMode.ConstantWidth){
            const halfWidth=this.sourceLongitudinalAxis===SplineV2DeformSourceAxis.Z
                ?(source.max.x-source.min.x)*.5
                :(source.max.z-source.min.z)*.5;
            if(halfWidth<=1e-5)throw new Error('Source Mesh has zero lateral width for ConstantWidth Fillet');
            cache=buildRoadFilletCacheV2(cache,halfWidth,{
                minimumRadiusScale:this.filletRadiusScale,
                maxArcAngleDegrees:this.filletArcAngleDegrees,
                maxArcChordError:this.filletChordError,
                maxArcStep:this.sampleStep
            }).cache;
        }
        const output=deformSourceMeshV2(cache,source,{
            longitudinalAxis:this.sourceLongitudinalAxis===SplineV2DeformSourceAxis.X?'x':'z',
            longitudinalUVAxis:this.sourceLongitudinalUVAxis===SplineV2DeformUVAxis.U?'u':'v',
            repeatCount:this.repeatCount,
            uvTileMode:this.uvTileMode===SplineV2DeformUVTileMode.Advance?'advance':'preserve',
            centerLateral:this.centerSourceLateral,
            verticalOffset:this.deformVerticalOffset,
            maxFrameStep:this.sampleStep,
            ...(this.adaptiveSampling&&this.surfaceMode!==SplineV2SurfaceMode.ConstantWidth?{
                maxAngleDegrees:this.maxTurnAngleDegrees,
                maxChordError:this.maxChordError
            }:{})
        });
        this._lastDeformReport=output.report;
        return {geometry:output.mesh};
    }
}
