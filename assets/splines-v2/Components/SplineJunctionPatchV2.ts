import {_decorator,Enum,MeshRenderer,Vec3,Mat4} from 'cc';
import {buildJunctionPatchV2,type JunctionRoadBranchV2,type JunctionPatchReportV2} from '../geometry/JunctionPatchV2';
import {SplineRoadV2} from './SplineRoadV2';
import {buildJunctionMarkingsV2,type JunctionMarkingReportV2} from '../geometry/JunctionMarkingsV2';
import {appendRoadMarkingsV2} from '../geometry/RoadMarkings';
const {ccclass,property,menu,executeInEditMode,requireComponent}=_decorator;

@ccclass('SplinesV2.JunctionRoadLink')
export class JunctionRoadLinkV2 {
    @property({type:SplineRoadV2,tooltip:'An open, flat ConstantWidth SplineRoadV2 with junction trim on its connected endpoint.'})
    road:SplineRoadV2|null=null;
    @property({tooltip:'When true use the end of Road. When false use the start.'})
    atEnd=false;
    @property({tooltip:'Include a white stop bar on this approach when Stop Bars is enabled.'})
    stopBarEnabled=true;
    @property({tooltip:'Include a zebra crossing on this approach when Crosswalks is enabled.'})
    crosswalkEnabled=true;
}
@ccclass('SplinesV2.JunctionTurnGuide')
export class JunctionTurnGuideV2 {
    @property({min:0,max:3,step:1,tooltip:'Index of entry Road in Branches (0-based).'})
    fromBranch=0;
    @property({min:0,max:3,step:1,tooltip:'Index of exit Road in Branches (0-based), different from entry.'})
    toBranch=1;
}
export enum JunctionUVModeV2 {MatchedRepeat=0,WorldProjected=1}
/**
 * Flat 3- or 4-way junction bridging genuine trimmed Road endpoints.
 * Inherits the v2 Manual/Baked/Dynamic lifecycle, glTF Bake and UV2 handling.
 * Never automatically changes another Road's serialization or its trim.
 */
@ccclass('SplinesV2.JunctionPatch')
@menu('Cocos Splines V2/Junction Patch')
@requireComponent(MeshRenderer)
@executeInEditMode(true)
export class SplineJunctionPatchV2 extends SplineRoadV2 {
    @property({type:[JunctionRoadLinkV2],tooltip:'Three or four Road links sharing one junction center.'})
    branches:JunctionRoadLinkV2[]=[];
    @property({type:Enum(JunctionUVModeV2),tooltip:'Matched Repeat uses original trimmed Road edge UV0 modulo whole tiles; projected uses world XZ UV.'})
    junctionUVMode=JunctionUVModeV2.MatchedRepeat;
    @property({min:.05,max:.95,step:.05,tooltip:'Inner transition radius for the central shared UV patch.'})
    junctionUVBlend=.55;
    @property({min:.01,max:1,step:.01,tooltip:'Maximum gap between the original (untrimmed) Road endpoints, in local units.'})
    endpointTolerance=.25;
    @property({min:.01,max:1,step:.01,tooltip:'Maximum flat-plane height difference in local units.'})
    flatTolerance=.1;
    @property({min:-.2,max:.2,step:.001,tooltip:'Optional small lift in local Y; normally 0 because Roads have already been trimmed.'})
    patchLift=0;
    @property({min:.01,max:2,step:.01,tooltip:'Maximum curb lip height above flat asphalt supported by the radial shoulder/curb transition.'})
    maxCurbHeight=.6;
    @property({tooltip:'Add standalone road-paint geometry (white slot 3, turn guides slot 4). Asphalt slot 0 should be unpainted.'})
    generateJunctionMarkings=false;
    @property({tooltip:'White stop bars on enabled Junction branches. Requires Generate Junction Markings.'})
    generateStopBars=true;
    @property({tooltip:'White zebra stripes near enabled Junction branches. Requires Generate Junction Markings.'})
    generateCrosswalks=false;
    @property({min:.005,max:.1,step:.005,tooltip:'Lift painted geometry above the Junction surface to prevent Z fighting.'})
    markingLift=.015;
    @property({min:.04,max:.5,step:.01}) stopBarWidth=.14;
    @property({min:.05,max:2,step:.05}) stopBarSetback=.22;
    @property({min:.05,max:2,step:.01}) zebraStripeLength=.26;
    @property({min:0,max:2,step:.01}) zebraGap=.18;
    @property({min:.05,max:5,step:.05}) zebraStartSetback=.65;
    @property({min:1,max:20,step:1}) zebraStripeCount=3;
    @property({min:0,max:1,step:.01}) markingLateralInset=.13;
    @property({type:[JunctionTurnGuideV2],tooltip:'Explicit branch pairs for curved yellow guide lines. Leave empty to omit guides.'})
    turnGuides:JunctionTurnGuideV2[]=[];
    @property({min:.02,max:.6,step:.01}) guideLineWidth=.10;
    private _lastJunctionReport:(JunctionPatchReportV2&{markings?:JunctionMarkingReportV2})|null=null;
    public inspectCornerRisk():null{return null;}
    public inspectJunction():(JunctionPatchReportV2&{markings?:JunctionMarkingReportV2})|null{return this._lastJunctionReport;}
    protected generate(){
        if(this.branches.length!==3&&this.branches.length!==4)
            throw new Error('Junction V2 needs exactly 3 or 4 Road branches');
        const seen=new Set<SplineRoadV2>();
        const inverse=Mat4.invert(new Mat4(),this.node.worldMatrix);
        const local=(p:{x:number;y:number;z:number})=>{
            const at=Vec3.transformMat4(new Vec3(),new Vec3(p.x,p.y,p.z),inverse);
            return {x:at.x,y:at.y,z:at.z};
        };
        const entries:JunctionRoadBranchV2[]=this.branches.map((link,index)=>{
            const road=link?.road;
            if(!road||!road.node?.isValid)throw new Error('Junction V2 Road link '+index+' is missing');
            if(road===this||seen.has(road))throw new Error('Junction V2 cannot link a Road twice');
            seen.add(road);
            const edge=road.sampleJunctionEndV2(!!link.atEnd);
            return {endpoint:local(edge.endpoint),
                left:{position:local(edge.left.position),uv0:edge.left.uv0},
                middle:{position:local(edge.middle.position),uv0:edge.middle.uv0},
                right:{position:local(edge.right.position),uv0:edge.right.uv0},
                ...(edge.profile?{profile:{
                    vertices:edge.profile.vertices.map(v=>({
                        position:local(v.position),uv0:v.uv0
                    })),
                    edgeMaterials:edge.profile.edgeMaterials
                }}:{})};
        });
        const result=buildJunctionPatchV2(entries,{
            uvMode:this.junctionUVMode===JunctionUVModeV2.WorldProjected?'projected':'matched',
            uvMetersPerRepeat:this.uvMetersPerRepeat,
            uvBlendStart:this.junctionUVBlend,endpointTolerance:this.endpointTolerance,
            flatTolerance:this.flatTolerance,surfaceLift:this.patchLift,materialSlot:0,
            maxCurbHeight:this.maxCurbHeight
        });
        if(!this.generateJunctionMarkings){
            this._lastJunctionReport=result.report;
            return {geometry:result.mesh};
        }
        const paint=buildJunctionMarkingsV2(entries,{
            stopBars:this.generateStopBars,crosswalks:this.generateCrosswalks,
            stopBarBranches:this.branches.map(link=>link.stopBarEnabled),
            crosswalkBranches:this.branches.map(link=>link.crosswalkEnabled),
            guideRoutes:this.turnGuides.map(route=>({fromBranch:route.fromBranch,toBranch:route.toBranch})),
            surfaceLift:this.patchLift,paintHeight:this.markingLift,
            stopBarWidth:this.stopBarWidth,stopBarSetback:this.stopBarSetback,
            zebraStripeLength:this.zebraStripeLength,zebraGap:this.zebraGap,
            zebraStartSetback:this.zebraStartSetback,zebraStripeCount:this.zebraStripeCount,
            lateralInset:this.markingLateralInset,guideWidth:this.guideLineWidth,
            uvMetersPerRepeat:this.uvMetersPerRepeat
        });
        this._lastJunctionReport={...result.report,markings:paint.report};
        return {geometry:appendRoadMarkingsV2(result.mesh,paint.mesh)};
    }
}
