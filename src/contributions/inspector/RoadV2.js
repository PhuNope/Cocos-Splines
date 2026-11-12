'use strict';
/** Inspector-only geometry and persistence actions; native ui-prop owns Undo. */
const {style,callEditor}=require('./common');
function makeV2Inspector(kind='road'){
    const tube=kind==='extrude';
    const deform=kind==='mesh-deform';
    const junction=kind==='junction';
    const fields=junction?
        [['Junction branches',['branches','junctionUVMode','junctionUVBlend','endpointTolerance','flatTolerance','patchLift','uvMetersPerRepeat']],
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
          <p class="spl-note">Bake creates a glTF under Project Assets and tries to link its unique cc.Mesh subasset automatically. If import is still pending, use Bind Imported Mesh later. Manual/Baked never generate geometry in Play. Select Longitudinal UV Axis: V repeats along texture Y (default); U repeats along texture X. Use Repeat wrap mode and Rebuild/Bake. Rebuild Preview replaces the visible renderer with a temporary Mesh; Show Baked Mesh restores the saved asset. Road Corner Mode JoinAndTrim locally trims tight inside bends. Resolve Planar Overlaps removes near-coplanar duplicate triangles (first surface wins) while interpolating UV0/UV2. ConstantWidth Surface Mode rounds guide Knot corners with tangent Bezier fillets (radius >= half the full road width times Fillet Radius Scale); it keeps the whole road width and UV0/UV2 uncut. The guide corner Knot is not interpolated exactly; a too-short Knot segment shows an Editor error instead of shrinking the road. No global junction CSG. Existing Scenes must select ConstantWidth in Surface Mode. Continuous Surface Mode adds a UV-anchored centreline row and conservatively narrows the inside according to local curvature; the effective Width Slope is capped at 0.25 for smooth stripes. No triangles/UVs are cut in this mode. Adaptive Sampling refines high-curvature rings. Physical Cross UV keeps asphalt texel density but may move baked-in paint. Separate Markings requires blank asphalt and white/yellow materials in slots 3 and 4. Clip Overlaps preserves the authored width but may break road markings. UV Stitch Cut matches repeating UV0 phase to the retained material at the cut, while keeping UV2 unchanged. Directional lane markings at a true intersection require a dedicated junction material. Separate-height crossings and true junctions still need dedicated geometry. Road materials use slots 0=asphalt, 1=shoulder, 2=curb. Junction Patch v2: link 3-4 open ConstantWidth Road endpoints in Branches. Set Junction Start/End Trim > 0 on EACH linked Road, rebuild each Road first, then rebuild the Junction. Use same asphalt Material in slot 0 and preferably unpainted asphalt; different Road direction markings cannot be made continuous across a multi-road junction with UV alone. The flat patch follows the exact Road boundary ring and requires snapped endpoint Knot nodes. Junction Markings V2 (off by default): enable Generate Junction Markings, then Stop Bars, Crosswalks and/or Turn Guides (explicit From Branch → To Branch zero-based indices). Uses white material slot 3 for stop/zebra, yellow slot 4 for turn guides; asphalt slot 0 should have no baked road paint. Stripe placement requires enough Junction Trim and paint must stay inside the patch. Arrow decals and automatic traffic routing are not implemented. Mesh Deform V2: assign a readable Source Mesh with UV0. The original source UV0/UV2, normals and material-slot layout are preserved; no mesh auto-subdivision happens. For curved geometry, use a source mesh with enough longitudinal edges. RepeatCount 1 stretches the source along the full spline; higher counts duplicate it. UV Tile Mode Advance offsets only the selected UV0 axis per copy. When using Source Mesh Deform, Manual/Baked Play never reads source data.</p>
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
