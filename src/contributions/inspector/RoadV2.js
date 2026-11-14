'use strict';
/** Inspector-only geometry and persistence actions; native ui-prop owns Undo. */
const {style,callEditor}=require('./common');
function makeV2Inspector(kind='road'){
    const tube=kind==='extrude';
    const deform=kind==='mesh-deform';
    const junction=kind==='junction';
    const fields=junction?
        [['Junction branches',['branches','junctionUVMode','junctionUVBlend','endpointTolerance','flatTolerance','gradeMode','maxGrade','patchLift','maxCurbHeight','curbCornerMode','curbCornerSegments','curbCornerPull','curbRamps','curbRampMinLip','curbRampMaxSlope','sidewalkApronWidth','sidewalkTerrainHeightOffset','sidewalkMaxCrossSlope','sidewalkTerrainMode','sidewalkTerrainSource','sidewalkMaxEdgeSlope','joinRoadSidewalks','uvMetersPerRepeat']],
         ['Junction Scene Gizmos',['showJunctionSceneGizmosV3','gizmoV3JunctionCurbs']],
         ['Junction markings',['generateJunctionMarkings','generateStopBars','generateCrosswalks','markingLift',
             'stopBarWidth','stopBarSetback','zebraStripeLength','zebraGap','zebraStartSetback',
             'zebraStripeCount','markingLateralInset','turnGuides','guideLineWidth']],
         ['Materials and persistence',['meshMode','materials','bakedMesh']]]:
        deform?
        [['Path and deformation',['knots','interpolation','closed','sourceMesh','sourceLongitudinalAxis','sourceLongitudinalUVAxis','repeatCount','uvTileMode','centerSourceLateral','deformVerticalOffset','sampleStep','adaptiveSampling','maxTurnAngleDegrees','maxChordError','surfaceMode','filletRadiusScale','filletArcAngleDegrees','filletChordError']],
         ['Materials and persistence',['meshMode','materials','bakedMesh']]]:
        tube?
        [['Path and tube',['knots','interpolation','closed','radius','sides','capEnds','flipFaces','sampleStep','uvMetersPerRepeat','uvLongitudinalAxis']],
         ['Materials and persistence',['meshMode','materials','bakedMesh']]]:
        [['Road and cross-section',['knots','interpolation','closed','width','shoulderWidth','curbWidth','curbHeight','sampleStep','junctionStartTrim','junctionEndTrim','adaptiveSampling','maxTurnAngleDegrees','maxChordError','cornerMode','cornerTrimSafety','cornerMiterLimit','surfaceMode','filletRadiusScale','filletArcAngleDegrees','filletChordError','clearanceSafety','widthSlope','resolvePlanarOverlaps','stitchCutUV','uvMetersPerRepeat','uvLongitudinalAxis','uvCrossMode','generateMarkings','markingLineWidth','markingDashLength','markingDashGap']],
         ['Road Scene Gizmos',['showSceneGizmosV3','gizmoV3Steps','gizmoV3Edges','gizmoV3Knots','gizmoV3EditKnot','gizmoV3KnotIndex','gizmoV3MultiKnotPoints','gizmoV3PointLimit']],
         ['Road sidewalk (optional, material 5)',['roadSidewalkWidth','roadSidewalkTerrainMode',
             'roadSidewalkTerrainSource','roadSidewalkTerrainHeightOffset',
             'roadSidewalkMaxCrossSlope','roadSidewalkMaxEdgeSlope']],
         ['Materials and persistence',['meshMode','materials','bakedMesh']]];
    const names=fields.flatMap(g=>g[1]);
    const selectors={status:'.spl-status',preview:'.spl-v2-preview',restore:'.spl-v2-restore',bake:'.spl-v2-bake',bind:'.spl-v2-bind',inspect:'.spl-v2-inspect'};
    const sections=fields.map(([title,props])=>
        `<details open class="spl-section"><summary>${title}</summary>`+
        props.map(name=>{
            selectors[name]='.spl-v2-'+name;
            return `<div class="spl-row"><ui-prop type="dump" class="spl-prop spl-v2-${name}"></ui-prop></div>`;
        }).join('')+'</details>'
    ).join('');
    return {
        style,
        template:`<div class="spl-inspector">
          <div class="spl-header"><strong>∿ Spline ${tube?'Extrude':deform?'Mesh Deform':junction?'Junction Patch':'Road'} V2</strong><p>Mesh generation happens only on request in Editor or Dynamic Play.</p></div>
          ${sections}
          <div class="spl-btns">
            <button type="button" class="spl-btn spl-v2-preview">↻ Rebuild Preview</button>
            <button type="button" class="spl-btn spl-v2-restore">↩ Show Baked Mesh</button>
            <button type="button" class="spl-btn spl-v2-bake">▣ Bake glTF Asset</button>
            <button type="button" class="spl-btn spl-v2-bind">⌁ Bind Imported Mesh</button>
            <button type="button" class="spl-btn spl-v2-inspect">◎ Check Bake Status</button>
          </div>
          <p class="spl-note">Bake creates a glTF under Project Assets and tries to link its unique cc.Mesh subasset automatically. If import is still pending, use Bind Imported Mesh later. Manual/Baked never generate geometry in Play. Select Longitudinal UV Axis: V repeats along texture Y (default); U repeats along texture X. Use Repeat wrap mode and Rebuild/Bake. Rebuild Preview replaces the visible renderer with a temporary Mesh; Show Baked Mesh restores the saved asset. Road Corner Mode JoinAndTrim locally trims tight inside bends. Resolve Planar Overlaps removes near-coplanar duplicate triangles (first surface wins) while interpolating UV0/UV2. ConstantWidth Surface Mode rounds guide Knot corners with tangent Bezier fillets (radius >= half the full road width times Fillet Radius Scale); it keeps the whole road width and UV0/UV2 uncut. The guide corner Knot is not interpolated exactly; a too-short Knot segment shows an Editor error instead of shrinking the road. No global junction CSG. Existing Scenes must select ConstantWidth in Surface Mode. Continuous Surface Mode adds a UV-anchored centreline row and conservatively narrows the inside according to local curvature; the effective Width Slope is capped at 0.25 for smooth stripes. No triangles/UVs are cut in this mode. Adaptive Sampling refines high-curvature rings. Physical Cross UV keeps asphalt texel density but may move baked-in paint. Separate Markings requires blank asphalt and white/yellow materials in slots 3 and 4. Clip Overlaps preserves the authored width but may break road markings. UV Stitch Cut matches repeating UV0 phase to the retained material at the cut, while keeping UV2 unchanged. Directional lane markings at a true intersection require a dedicated junction material. Separate-height crossings and true junctions still need dedicated geometry. Road materials use slots 0=asphalt, 1=shoulder, 2=curb. Junction Patch v2: link 3-4 open ConstantWidth Road endpoints in Branches. Set Junction Start/End Trim > 0 on EACH linked Road, rebuild each Road first, then rebuild the Junction. Use same asphalt Material in slot 0 and preferably unpainted asphalt; different Road direction markings cannot be made continuous across a multi-road junction with UV alone. The flat patch follows the exact Road boundary ring and requires snapped endpoint Knot nodes. Shoulder/Curb transition: Junction now supports open ConstantWidth Road shoulders (slot 1) and curb top/wall (slot 2) on FLAT intersections. The original end-ring UV0 is matched for all profile edges; curb lip height tapers toward the junction center. For Width 4 with Shoulder 0.45 and Curb 0.22, start with Trim 4 and Max Curb Height 0.6. Sample Terrain (optional): set Sidewalk Terrain Mode = Sample Terrain and link the Cocos Terrain component; the Junction samples each OUTER apron vertex via Terrain.getHeightAt in Terrain-local XZ, transforms the Y back to Junction-local, and rejects outside-Terrain, steep, tilted or invalid sample configurations. This only reads Terrain at Rebuild/Bake time; no live updates to Baked mesh or terrain modification. A modified heightfield needs an explicit rebuild and rebake. Cocos-Gizmos v3 (PhuNope/Cocos-Gizmos branch v3) integration: install/enable its Project or Global extension. Scene automatically discovers onDrawGizmosSelected() and onGizmoHandles(), no decorator or custom adapter assignment. Road Gizmo V3 Edit Knot (off by default) selects one Knot index and calls Gizmos3D.move('gizmoKnotPosition') for XYZ/plane drag. Optional Multi Knot Points exposes up to 32 compact indexed camera-plane point handles for the other Knots through gizmoKnotPositions[index] (Cocos-Gizmos v3 indexed Vec3[] contract); each writes only the source Node, uses SDK cancel rollback, and pins the node for a drag even if Inspector indices change. Its Vec3 property is a live proxy for the Knot Node, not another source of coordinates; Cancel restores the Node using v3's rollback setter. Cross-Node Undo/Redo and real Cocos Creator 3.8.x mouse interaction require Editor certification. Read-only Scene Gizmos v3 compatibility: selected Road/Junction components expose onDrawGizmosSelected() guides for Knots, road edges, trim rings and curb. A separately installed Gizmos3D renderer may be attached through the optional typed adapter. Missing renderer => no gizmo draw, not an extension failure. This preview never edits node data, creates a Mesh or runs when Play. Drag the actual Knot Nodes using Cocos transform gizmos to edit. Exact vendor Gizmos v3 decorator/registration support requires checking its SDK source. Road network sidewalk (opt-in): enable Road Sidewalk Width on an OPEN ConstantWidth Road with full curb; mesh follows the exact Road curb-top rings (material slot 5) including trims/fillets. Flat Height uses a local Y plane; Sample Terrain reads each edge from a linked Cocos Terrain. The Junction's Join Road Sidewalks mode matches exact 3D endpoints and Repeat-U phase when all linked Road widths, terrain source, offset and world base match. Road/Junction nodes must have unit scale. This is an alpha seam join, NOT city sidewalk CSG or a certified pedestrian ramp. Optional Sidewalk Apron (flat rounded mode only): set Sidewalk Apron Width > 0 to extend a local, outward-sloped corner strip from the existing curb top to an explicit flat terrain-edge Y (slot 5, separate UV tiles). Height offset is Junction-node-local, not sampled from external Terrain. Limit Max Cross Slope; too short or folded corners fail safely in Editor. This does NOT stitch road-length sidewalks or modify terrain and requires real Cocos Editor verification. Optional Curb Ramps: in Rounded Continuous Curb + Flat mode, set ordered-independent From/To Road pairs in Curb Ramps. Each pair must share an exterior corner; a smooth dip lowers the curb top toward a small nonzero lip and checks Max Slope. The adjacent source Road UV seams stay unchanged. This is NOT a certified accessibility ramp or full sidewalk-terrain connector. Rounded Continuous Curb (opt-in) bridges top and vertical curb wall around flat road-corner gaps, keeping Road profile UV seam and asphalt/shoulder core. It requires all 3-4 linked Roads to have level curbs; banked/graded paths and missing curbs are rejected. Corner Segments increases smoothness; Corner Pull controls roundness. Existing Radial Legacy remains the default. Opt-in Gentle Grade mode handles shallow longitudinal slopes up to Max Grade, but rejects banked cross-sections and severe grade transitions. Not a junction sidewalk CSG or steep banked ramp. Junction Markings V2 (off by default): enable Generate Junction Markings, then Stop Bars, Crosswalks and/or Turn Guides (explicit From Branch → To Branch zero-based indices). Uses white material slot 3 for stop/zebra, yellow slot 4 for turn guides; asphalt slot 0 should have no baked road paint. Stripe placement requires enough Junction Trim and paint must stay inside the patch. Arrow decals and automatic traffic routing are not implemented. Mesh Deform V2: assign a readable Source Mesh with UV0. The original source UV0/UV2, normals and material-slot layout are preserved; no mesh auto-subdivision happens. For curved geometry, use a source mesh with enough longitudinal edges. RepeatCount 1 stretches the source along the full spline; higher counts duplicate it. UV Tile Mode Advance offsets only the selected UV0 axis per copy. When using Source Mesh Deform, Manual/Baked Play never reads source data.</p>
          <div class="spl-status" role="status"></div>
        </div>`,
        $:selectors,
        update(dump){
            for(const field of names){
                const prop=dump?.value?.[field];
                if(prop&&this.$[field])this.$[field].render(prop);
            }
        },
        ready(){
            this.$.preview.addEventListener('click',()=>void callEditor(this,'rebuild-v2-road'));
            this.$.restore.addEventListener('click',()=>void callEditor(this,'restore-v2-road-baked'));
            this.$.bake.addEventListener('click',()=>void callEditor(this,'bake-v2-road'));
            this.$.bind.addEventListener('click',()=>void callEditor(this,'bind-v2-road-mesh'));
            this.$.inspect.addEventListener('click',()=>void callEditor(this,'check-v2-road-bake'));
        }
    };
}
module.exports=makeV2Inspector('road');
module.exports.makeV2Inspector=makeV2Inspector;
