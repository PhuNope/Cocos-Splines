'use strict';
/** Inspector-only geometry and persistence actions; native ui-prop owns Undo. */
const {style,callEditor}=require('./common');
/** V2 Inspector is controls-only. Explicit button errors and fallback notices
 * belong in the Editor Console, never in a persistent bottom status panel.
 */
async function dispatchV2(inspector,action){
    const result=await callEditor(inspector,action);
    if(result?.ok===false){
        console.warn('[Cocos Splines V2] '+String(result.error||'Editor action failed'));
    }else if(result?.shortKnotFallback){
        console.warn('[Cocos Splines V2] Short Knot: ConstantWidth cannot fit; generated a seamless Continuous Road with adaptive width. '+result.shortKnotFallback);
    }else if(action==='check-v2-road-bake'&&result?.ok){
        console.info('[Cocos Splines V2] Bake status:',result);
    }
    return result;
}

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
        [['Road and cross-section',['knots','interpolation','closed','width','shoulderWidth','curbWidth','curbHeight','sampleStep','junctionStartTrim','junctionEndTrim','adaptiveSampling','maxTurnAngleDegrees','maxChordError','cornerMode','cornerTrimSafety','cornerMiterLimit','surfaceMode','filletRadiusScale','shortKnotMode','filletArcAngleDegrees','filletChordError','clearanceSafety','widthSlope','resolvePlanarOverlaps','stitchCutUV','uvMetersPerRepeat','uvLongitudinalAxis','uvCrossMode','generateMarkings','markingLineWidth','markingDashLength','markingDashGap']],
         ['Road Scene Gizmos',['showSceneGizmosV3','gizmoV3Steps','gizmoV3Edges','gizmoV3Knots','gizmoV3EditKnot','gizmoV3KnotIndex','gizmoV3MultiKnotPoints','gizmoV3PointLimit']],
         ['Road sidewalk (optional, material 5)',['roadSidewalkWidth','roadSidewalkTerrainMode',
             'roadSidewalkTerrainSource','roadSidewalkTerrainHeightOffset',
             'roadSidewalkMaxCrossSlope','roadSidewalkMaxEdgeSlope']],
         ['Materials and persistence',['meshMode','materials','bakedMesh']]];
    const names=fields.flatMap(g=>g[1]);
    const selectors={preview:'.spl-v2-preview',restore:'.spl-v2-restore',bake:'.spl-v2-bake',bind:'.spl-v2-bind',inspect:'.spl-v2-inspect'};
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
          <div class="spl-header"><strong>∿ Spline ${tube?'Extrude':deform?'Mesh Deform':junction?'Junction Patch':'Road'} V2</strong></div>
          ${sections}
          <div class="spl-btns">
            <button type="button" class="spl-btn spl-v2-preview">↻ Rebuild Preview</button>
            <button type="button" class="spl-btn spl-v2-restore">↩ Show Baked Mesh</button>
            <button type="button" class="spl-btn spl-v2-bake">▣ Bake glTF Asset</button>
            <button type="button" class="spl-btn spl-v2-bind">⌁ Bind Imported Mesh</button>
            <button type="button" class="spl-btn spl-v2-inspect">◎ Check Bake Status</button>
          </div>
        </div>`,
        $:selectors,
        update(dump){
            for(const field of names){
                const prop=dump?.value?.[field];
                if(prop&&this.$[field])this.$[field].render(prop);
            }
        },
        ready(){
            this.$.preview.addEventListener('click',()=>void dispatchV2(this,'rebuild-v2-road'));
            this.$.restore.addEventListener('click',()=>void dispatchV2(this,'restore-v2-road-baked'));
            this.$.bake.addEventListener('click',()=>void dispatchV2(this,'bake-v2-road'));
            this.$.bind.addEventListener('click',()=>void dispatchV2(this,'bind-v2-road-mesh'));
            this.$.inspect.addEventListener('click',()=>void dispatchV2(this,'check-v2-road-bake'));
        }
    };
}
module.exports=makeV2Inspector('road');
module.exports.makeV2Inspector=makeV2Inspector;
