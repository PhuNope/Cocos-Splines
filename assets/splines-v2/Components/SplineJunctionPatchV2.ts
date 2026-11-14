import {_decorator,Enum,MeshRenderer,Vec3,Mat4,Terrain,director} from 'cc';
import {buildJunctionPatchV2,type JunctionRoadBranchV2,type JunctionPatchReportV2} from '../geometry/JunctionPatchV2';
import {SplineRoadV2} from './SplineRoadV2';
import {planJunctionAutoTrimV2} from '../geometry/JunctionAutoTrimV2';
import {planJunctionEndpointSnapV2,buildSplineRoadNetworkV2,type RoadNetworkCandidateV2} from '../geometry/SplineRoadNetworkV2';
import {SplineMeshGeneratorV2} from './SplineMeshGeneratorV2';
import {buildJunctionMarkingsV2,type JunctionMarkingReportV2} from '../geometry/JunctionMarkingsV2';
import {appendRoadMarkingsV2} from '../geometry/RoadMarkings';
import {buildJunctionSceneGuideV2} from '../geometry/SceneGizmoGuideV2';
import {availableGizmoBackend,drawSplineSceneGizmos} from './SplineGizmoBridge';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
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
@ccclass('SplinesV2.JunctionCurbRampLink')
export class JunctionCurbRampLinkV2 {
    @property({min:0,max:3,step:1,tooltip:'Index of the first Road from the Branches array (0-based).'})
    fromBranch=0;
    @property({min:0,max:3,step:1,tooltip:'Index of its adjacent Road from the Branches array. Order does not matter.'})
    toBranch=1;
}
export enum JunctionUVModeV2 {MatchedRepeat=0,WorldProjected=1}
export enum JunctionGradeModeV2 {Flat=0,Gentle=1}
export enum JunctionCurbCornerModeV2 {RadialLegacy=0,RoundedContinuous=1}
export enum JunctionTerrainEdgeModeV2 {FlatHeight=0,SampleTerrain=1}
/**
 * Flat 3- or 4-way junction bridging genuine trimmed Road endpoints.
 * Independent Junction mesh generator, not a Road subclass.
 * Shares the MeshGenerator preview/Bake lifecycle without Road width,
 * Knot, surface mode, fillet, sidewalk or Gizmo editing properties.
 * Reads only explicitly linked Road end rings; never changes Road data.
 */
@ccclass('SplinesV2.JunctionPatch')
@menu('Cocos Splines V2/Junction Patch')
@requireComponent(MeshRenderer)
@executeInEditMode(true)
export class SplineJunctionPatchV2 extends SplineMeshGeneratorV2 {
    @property({type:[JunctionRoadLinkV2],tooltip:'Three or four Road links sharing one junction center.'})
    branches:JunctionRoadLinkV2[]=[];
    @property({type:Enum(JunctionUVModeV2),tooltip:'Matched Repeat uses original trimmed Road edge UV0 modulo whole tiles; projected uses world XZ UV.'})
    junctionUVMode=JunctionUVModeV2.MatchedRepeat;
    @property({min:.05,max:.95,step:.05,tooltip:'Inner transition radius for the central shared UV patch.'})
    junctionUVBlend=.55;
    @property({min:.01,max:1,step:.01,tooltip:'Maximum gap between the original (untrimmed) Road endpoints, in local units.'})
    endpointTolerance=.25;
    @property({min:.05,max:5,step:.05,tooltip:'Editor-only maximum distance to move a linked Pure Vec3 Path endpoint when applying Junction Endpoint Snap.'})
    endpointSnapMaxDistance=.75;
    @property({min:.01,max:1,step:.01,tooltip:'Maximum flat-plane height difference in local units; in Gentle Grade, also caps crossfall (max .03).'})
    flatTolerance=.1;
    @property({type:Enum(JunctionGradeModeV2),tooltip:'Flat is the legacy default. Gentle Grade supports longitudinal slopes only; banking and steep transitions are rejected.'})
    gradeMode=JunctionGradeModeV2.Flat;
    @property({min:.01,max:.35,step:.01,tooltip:'Largest allowed rise per horizontal metre from center to each trimmed Road ring (Gentle Grade only).'})
    maxGrade=.15;
    @property({min:-.2,max:.2,step:.001,tooltip:'Optional small lift in local Y; normally 0 because Roads have already been trimmed.'})
    patchLift=0;
    @property({min:.01,max:2,step:.01,tooltip:'Maximum curb lip height above flat asphalt supported by the radial shoulder/curb transition.'})
    maxCurbHeight=.6;
    @property({type:Enum(JunctionCurbCornerModeV2),tooltip:'Radial Legacy: taper curb to center. Rounded Continuous: smooth top and vertical wall around flat junction corners, all Roads need curb.'})
    curbCornerMode=JunctionCurbCornerModeV2.RadialLegacy;
    @property({min:4,max:48,step:1,tooltip:'Geometry divisions in each rounded curb corner. Active only for Rounded Continuous.'})
    curbCornerSegments=12;
    @property({min:.1,max:.7,step:.01,tooltip:'Cubic corner inward tangent pull (0.1..0.7). Active only for Rounded Continuous.'})
    curbCornerPull=.32;
    @property({type:[JunctionCurbRampLinkV2],tooltip:'Opt-in lowered corner pairs from original Branches indices. Only adjacent pairs in Rounded Continuous Curb / Flat mode.'})
    curbRamps:JunctionCurbRampLinkV2[]=[];
    @property({min:.005,max:.08,step:.005,tooltip:'Residual positive curb lip in middle of selected lowered corners, metres in Road-local coordinates.'})
    curbRampMinLip=.015;
    @property({min:.02,max:.6,step:.01,tooltip:'Upper limit of the local ramp top longitudinal rise/run. Unsafe short corners reject instead of folding.'})
    curbRampMaxSlope=.35;
    @property({min:0,max:6,step:.05,tooltip:'Exterior sidewalk strip width in local metres. Set 0 to disable. Available only with Rounded Continuous Curb (slot 5).'})
    sidewalkApronWidth=0;
    @property({min:-2,max:2,step:.05,tooltip:'Local terrain-edge Y offset relative to Junction center. This is a planar target, NOT real Terrain height sampling.'})
    sidewalkTerrainHeightOffset=0;
    @property({min:.02,max:1,step:.01,tooltip:'Maximum vertical rise per horizontal metre from rounded curb outer rail to apron terrain edge.'})
    sidewalkMaxCrossSlope=.35;
    @property({type:Enum(JunctionTerrainEdgeModeV2),tooltip:'Flat Height: old manually entered Y. Sample Terrain: read each outer apron vertex from a linked 3.8.x Terrain at Rebuild/Bake time.'})
    sidewalkTerrainMode=JunctionTerrainEdgeModeV2.FlatHeight;
    @property({type:Terrain,tooltip:'Optional Cocos Terrain component, only read when Sample Terrain is active. Its node must remain upright; no terrain geometry is modified.'})
    sidewalkTerrainSource:Terrain|null=null;
    @property({min:.02,max:1,step:.01,tooltip:'Reject steep height differences between consecutive sampled Terrain edge vertices.'})
    sidewalkMaxEdgeSlope=.35;
    @property({tooltip:'Join each Junction apron end exactly to enabled Road Sidewalk outer edges with Repeat UV U phase. Requires identical apron/road width, Terrain mode, height offset and unit-scale Road/Junction nodes.'})
    joinRoadSidewalks=false;
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
    @property({tooltip:'Show read-only junction center, trimmed Road rings and curb end guides when selected.'})
    showJunctionSceneGizmos=true;
    @property({tooltip:'Include curb profile end markers in the Junction selection guides.'})
    gizmoJunctionCurbs=true;
    private _lastJunctionReport:(JunctionPatchReportV2&{markings?:JunctionMarkingReportV2})|null=null;
    /** Selected-only read-only authoring visualization. Never paints runtime geometry. */
    public onDrawGizmosSelected():void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.showJunctionSceneGizmos||
            !availableGizmoBackend()||this.branches.length<3||
            this.branches.length>4)return;
        try{
            const inverse=Mat4.invert(new Mat4(),this.node.worldMatrix);
            const local=(p:{x:number;y:number;z:number})=>{
                const v=Vec3.transformMat4(new Vec3(),
                    new Vec3(p.x,p.y,p.z),inverse);
                return {x:v.x,y:v.y,z:v.z};
            };
            const entries:JunctionRoadBranchV2[]=this.branches.map(link=>{
                if(!link.road||!link.road.node.isValid)
                    throw new Error('Road link missing');
                const ring=link.road.sampleJunctionEndV2(!!link.atEnd);
                return {endpoint:local(ring.endpoint),
                    left:{position:local(ring.left.position),uv0:ring.left.uv0},
                    middle:{position:local(ring.middle.position),uv0:ring.middle.uv0},
                    right:{position:local(ring.right.position),uv0:ring.right.uv0},
                    ...(ring.profile?{profile:{edgeMaterials:ring.profile.edgeMaterials,
                        vertices:ring.profile.vertices.map(p=>({
                            position:local(p.position),uv0:p.uv0
                        }))}}:{})};
            });
            const guide=buildJunctionSceneGuideV2(entries,{
                showCurb:this.gizmoJunctionCurbs});
            drawSplineSceneGizmos(this.node,guide);
        }catch{
            // Leave authoring errors to explicit Inspector Rebuild/diagnostics.
            // Gizmos never mutate Nodes, meshes or the saved Scene.
        }
    }
    /**
     * Safe proposal only. Never moves Knot Nodes, writes Road trims or
     * creates meshes. Caller must commit values through Creator property
     * history and then explicitly refresh the temporary mesh previews.
     */
    public planAutomaticTrimsV2(){
        if(!EDITOR_NOT_IN_PREVIEW)
            throw new Error('Junction Auto Trim is Editor-only');
        const roads=this.branches.map((link,index)=>{
            if(!link?.road?.node?.isValid)
                throw new Error('Missing Junction Road branch '+index);
            return link.road.junctionAutoTrimCandidateV2(link.road.node.uuid);
        });
        const plan=planJunctionAutoTrimV2(roads,{
            center:this.node.worldPosition,
            endpointTolerance:this.endpointTolerance,
            heightTolerance:this.flatTolerance
        });
        return {...plan,branches:plan.branches.map((branch,index)=>{
            const road=this.branches[index].road!;
            if(!!this.branches[index].atEnd!==branch.atEnd)
                throw new Error('Junction branch '+index+' At End does not match nearest Path endpoint; correct the link first');
            return {...branch,nodeUuid:road.node.uuid,
                componentIndex:(road.node as unknown as {components:unknown[]}).components.indexOf(road)};
        })};
    }
    /**
     * Pure Vec3 endpoint connection proposal. Reads distinct Path sources
     * and converts one world-space Junction center into each Path-local
     * position. Does not mutate Scene serialization or any Baked meshes.
     */
    public planEndpointSnapsV2(){
        if(!EDITOR_NOT_IN_PREVIEW)
            throw new Error('Endpoint Snap is Editor-only');
        const inputs=this.branches.map((link,index)=>{
            const road=link?.road;
            if(!road?.node?.isValid||!road.pathSource?.node?.isValid)
                throw new Error('Endpoint Snap missing Road/Path source at branch '+index);
            return {...road.junctionAutoTrimCandidateV2(road.node.uuid),
                pathId:road.pathSource.node.uuid,atEnd:!!link.atEnd};
        });
        const plan=planJunctionEndpointSnapV2(inputs,{
            center:this.node.worldPosition,
            maxDistance:this.endpointSnapMaxDistance,
            maxHeightDelta:this.flatTolerance
        });
        return {...plan,branches:plan.branches.map((branch,index)=>{
            const road=this.branches[index].road!;
            const path=road.pathSource!;
            const indexOfKnot=branch.atEnd?path.knots.length-1:0;
            const source=path.knots[indexOfKnot];
            if(!source||path.knots.length<2)
                throw new Error('Endpoint Snap Path has fewer than 2 valid Knots');
            const m=path.node.worldMatrix;
            const determinant=m.m00*(m.m05*m.m10-m.m06*m.m09)-
                m.m04*(m.m01*m.m10-m.m02*m.m09)+
                m.m08*(m.m01*m.m06-m.m02*m.m05);
            if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-8)
                throw new Error('Endpoint Snap Path has singular world transform');
            const inv=Mat4.invert(new Mat4(),m);
            const target=Vec3.transformMat4(new Vec3(),
                new Vec3(branch.to.x,branch.to.y,branch.to.z),inv);
            if(![target.x,target.y,target.z].every(Number.isFinite))
                throw new Error('Endpoint Snap cannot convert world position to Path-local Knot');
            return {...branch,pathUuid:path.node.uuid,
                knotIndex:indexOfKnot,knotCount:path.knots.length,
                expectedLocal:{x:source.position.x,y:source.position.y,z:source.position.z},
                targetLocal:{x:target.x,y:target.y,z:target.z}};
        })};
    }
    /** Read-only Scene Road adjacency scan. Does not auto-link components. */
    public inspectRoadNetworkV2(){
        if(!EDITOR_NOT_IN_PREVIEW)throw new Error('Road Network is Editor-only');
        const root=director.getScene();
        if(!root)throw new Error('No active Cocos Scene for Network scan');
        const candidates:RoadNetworkCandidateV2[]=[];
        const skipped:Array<{roadId:string;reason:string}>=[];
        const stack=[root];
        let visits=0;
        while(stack.length){
            const node=stack.pop()!;
            if(++visits>10000)throw new Error('Network scan exceeded 10000 Scene Nodes');
            for(const child of node.children)stack.push(child);
            const comps=(node as unknown as {components:unknown[]}).components||[];
            for(const candidate of comps){
                if(!(candidate instanceof SplineRoadV2))continue;
                if(candidates.length+skipped.length>=256)
                    throw new Error('Network scan exceeded 256 Roads');
                try{
                    if(!candidate.pathSource?.node?.isValid)
                        throw new Error('Missing Path Source');
                    candidates.push({...candidate.junctionAutoTrimCandidateV2(node.uuid),
                        pathId:candidate.pathSource.node.uuid});
                }catch(error){
                    skipped.push({roadId:node.uuid,
                        reason:String(error instanceof Error?error.message:error)});
                }
            }
        }
        return {...buildSplineRoadNetworkV2(candidates,{
            maxDistance:this.endpointTolerance,
            maxHeightDelta:this.flatTolerance
        }),scannedRoads:candidates.length+skipped.length,skipped};
    }
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
            if(seen.has(road))throw new Error('Junction V2 cannot link a Road twice');
            seen.add(road);
            const edge=road.sampleJunctionEndV2(!!link.atEnd);
            return {endpoint:local(edge.endpoint),
                ...(edge.sidewalkStation===undefined?{}:{sidewalkStation:edge.sidewalkStation}),
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
        const sampleTerrain=this.sidewalkTerrainMode===JunctionTerrainEdgeModeV2.SampleTerrain;
        if(this.joinRoadSidewalks){
            if(this.curbCornerMode!==JunctionCurbCornerModeV2.RoundedContinuous||
               this.sidewalkApronWidth<=0)
                throw new Error('Junction Road Sidewalk join requires Rounded Continuous Curb with Sidewalk Apron Width > 0');
            const unitScale=(m:Mat4)=>{
                const near=(x:number)=>Math.abs(x-1)<1e-4;
                return near(Math.hypot(m.m00,m.m01,m.m02))&&
                    near(Math.hypot(m.m04,m.m05,m.m06))&&
                    near(Math.hypot(m.m08,m.m09,m.m10));
            };
            if(!unitScale(this.node.worldMatrix))
                throw new Error('Junction Road Sidewalk join requires unscaled Junction node');
            for(const link of this.branches){
                const road=link.road!;
                if(!unitScale(road.node.worldMatrix))
                    throw new Error('Junction Road Sidewalk join requires unscaled Road nodes');
                if(Math.abs(road.roadSidewalkWidth-this.sidewalkApronWidth)>1e-5)
                    throw new Error('Junction Road Sidewalk join requires matching Road Sidewalk/Apron widths');
                const roadTerrain=road.roadSidewalkTerrainMode===1;
                if(roadTerrain!==sampleTerrain||
                   (sampleTerrain&&road.roadSidewalkTerrainSource!==this.sidewalkTerrainSource))
                    throw new Error('Junction Road Sidewalk join requires the same Terrain sample mode/source');
                if(Math.abs(road.roadSidewalkTerrainHeightOffset-
                    this.sidewalkTerrainHeightOffset)>1e-5)
                    throw new Error('Junction Road Sidewalk join requires matching Terrain height offsets');
                if(!sampleTerrain&&Math.abs(road.node.worldPosition.y-
                    this.node.worldPosition.y)>1e-5)
                    throw new Error('Junction Road Sidewalk join requires identical world base Y in Flat mode');
            }
        }
        let terrainSample:((x:number,z:number)=>number|null)|undefined;
        if(sampleTerrain){
            const terrain=this.sidewalkTerrainSource;
            if(this.sidewalkApronWidth<=0)
                throw new Error('Junction V2 Sample Terrain needs Sidewalk Apron Width > 0');
            if(!terrain||!terrain.node?.isValid)
                throw new Error('Junction V2 Sample Terrain needs a valid Terrain component in Inspector');
            // Cocos Terrain.getHeightAt takes x,z in the Terrain NODE's
            // local coordinate system and returns Terrain-local Y. Reject
            // tilted nodes: in that case a heightfield's XZ domain no
            // longer corresponds to a horizontal Junction apron.
            const upright=(m:Mat4)=>m.m05>1e-6&&
                Math.hypot(m.m04,m.m06)<=m.m05*1e-4;
            if(!upright(this.node.worldMatrix)||!upright(terrain.node.worldMatrix))
                throw new Error('Junction V2 Sample Terrain requires upright Junction/Terrain nodes (Y-axis rotations only)');
            const terrainInverse=Mat4.invert(new Mat4(),terrain.node.worldMatrix);
            const centerY=entries.reduce((sum,b)=>sum+b.endpoint.y,0)/entries.length;
            terrainSample=(x,z)=>{
                const world=Vec3.transformMat4(new Vec3(),
                    new Vec3(x,centerY,z),this.node.worldMatrix);
                const terrainLocal=Vec3.transformMat4(new Vec3(),world,terrainInverse);
                const height=terrain.getHeightAt(terrainLocal.x,terrainLocal.z);
                if(height===null||height===undefined||!Number.isFinite(height))return null;
                const onTerrain=Vec3.transformMat4(new Vec3(),
                    new Vec3(terrainLocal.x,height,terrainLocal.z),terrain.node.worldMatrix);
                const localY=Vec3.transformMat4(new Vec3(),onTerrain,inverse).y;
                return Number.isFinite(localY)?localY:null;
            };
        }
        const result=buildJunctionPatchV2(entries,{
            uvMode:this.junctionUVMode===JunctionUVModeV2.WorldProjected?'projected':'matched',
            uvMetersPerRepeat:this.uvMetersPerRepeat,
            uvBlendStart:this.junctionUVBlend,endpointTolerance:this.endpointTolerance,
            flatTolerance:this.flatTolerance,
            gradeMode:this.gradeMode===JunctionGradeModeV2.Gentle?'gentle':'flat',
            maxGrade:this.maxGrade,surfaceLift:this.patchLift,materialSlot:0,
            maxCurbHeight:this.maxCurbHeight,
            curbCornerMode:this.curbCornerMode===JunctionCurbCornerModeV2.RoundedContinuous?'rounded':'radial',
            curbCornerSegments:this.curbCornerSegments,curbCornerPull:this.curbCornerPull,
            curbRampPairs:this.curbRamps.map(pair=>({fromBranch:pair.fromBranch,toBranch:pair.toBranch})),
            curbRampMinLip:this.curbRampMinLip,curbRampMaxSlope:this.curbRampMaxSlope,
            sidewalkApronWidth:this.sidewalkApronWidth,
            sidewalkTerrainHeightOffset:this.sidewalkTerrainHeightOffset,
            sidewalkMaxCrossSlope:this.sidewalkMaxCrossSlope,
            sidewalkTerrainMode:sampleTerrain?'sample':'flat',
            sidewalkTerrainSampler:terrainSample,
            sidewalkMaxEdgeSlope:this.sidewalkMaxEdgeSlope,
            sidewalkRoadJoin:this.joinRoadSidewalks
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
