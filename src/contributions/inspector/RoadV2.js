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
    }else if(action==='plan-v2-junction-auto-trim'&&result?.ok){
        console.info('[Cocos Splines V2] Junction Auto Trim proposal:',result.plan);
    }else if(action==='apply-v2-junction-auto-trim'&&result?.ok){
        console.info('[Cocos Splines V2] Applied '+result.changed+' Road trims; Baked assets unchanged');
    }else if(action==='plan-v2-junction-endpoint-snap'&&result?.ok){
        console.info('[Cocos Splines V2] Junction Endpoint Snap (read-only):',result.plan);
    }else if(action==='apply-v2-junction-endpoint-snap'&&result?.ok){
        console.info('[Cocos Splines V2] Recorded '+result.changed+' Pure Vec3 Path snaps; Baked Mesh untouched');
        if(result.warnings?.length)console.warn('[Cocos Splines V2] Preview warnings:',result.warnings);
    }else if(action==='inspect-v2-road-network'&&result?.ok){
        console.info('[Cocos Splines V2] Scene Road connectivity (read-only):',result.report);
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
        [['Junction branches',['branches','endpointSnapMaxDistance','junctionUVMode','junctionUVBlend','endpointTolerance','flatTolerance','gradeMode','maxGrade','patchLift','maxCurbHeight','curbCornerMode','curbCornerSegments','curbCornerPull','curbRamps','curbRampMinLip','curbRampMaxSlope','sidewalkApronWidth','sidewalkTerrainHeightOffset','sidewalkMaxCrossSlope','sidewalkTerrainMode','sidewalkTerrainSource','sidewalkMaxEdgeSlope','joinRoadSidewalks','uvMetersPerRepeat']],
         ['Junction Scene Gizmos',['showJunctionSceneGizmos','gizmoJunctionCurbs']],
         ['Junction markings',['generateJunctionMarkings','generateStopBars','generateCrosswalks','markingLift',
             'stopBarWidth','stopBarSetback','zebraStripeLength','zebraGap','zebraStartSetback',
             'zebraStripeCount','markingLateralInset','turnGuides','guideLineWidth']],
         ['Materials and persistence',['meshMode','materials','bakedMesh']]]:
        deform?
        [['Spline Source',['pathSource']],
         ['Mesh deformation',['sourceMesh','sourceLongitudinalAxis','sourceLongitudinalUVAxis','repeatCount','uvTileMode','centerSourceLateral','deformVerticalOffset']],
         ['Sampling & fillets',['sampleStep','adaptiveSampling','maxTurnAngleDegrees','maxChordError','surfaceMode','filletRadiusScale','filletArcAngleDegrees','filletChordError']],
         ['Live Editor mesh',['gizmoLiveMesh','gizmoMeshIntervalMs']],
         ['Materials and persistence',['meshMode','materials','bakedMesh']]]:
        tube?
        [['Spline Source',['pathSource']],
         ['Tube profile',['radius','sides','capEnds','flipFaces','sampleStep','uvMetersPerRepeat','uvLongitudinalAxis']],
         ['Live Editor mesh',['gizmoLiveMesh','gizmoMeshIntervalMs']],
         ['Materials and persistence',['meshMode','materials','bakedMesh']]]:
        [['Spline source',['pathSource']],
         ['Road and cross-section',['width','shoulderWidth','curbWidth','curbHeight','sampleStep','junctionStartTrim','junctionEndTrim','adaptiveSampling','maxTurnAngleDegrees','maxChordError','cornerMode','cornerTrimSafety','cornerMiterLimit','surfaceMode','filletRadiusScale','shortKnotMode','filletArcAngleDegrees','filletChordError','clearanceSafety','widthSlope','resolvePlanarOverlaps','stitchCutUV','uvMetersPerRepeat','uvLongitudinalAxis','uvCrossMode','generateMarkings','markingLineWidth','markingDashLength','markingDashGap']],
         ['Road Gizmos',['showSceneGizmos','gizmoSteps','gizmoEdges',
             'gizmoLiveMesh','gizmoMeshIntervalMs']],
         ['Road sidewalk (optional, material 5)',['roadSidewalkWidth','roadSidewalkTerrainMode',
             'roadSidewalkTerrainSource','roadSidewalkTerrainHeightOffset',
             'roadSidewalkMaxCrossSlope','roadSidewalkMaxEdgeSlope']],
         ['Materials and persistence',['meshMode','materials','bakedMesh']]];
    const names=fields.flatMap(g=>g[1]);
    const selectors={preview:'.spl-v2-preview',restore:'.spl-v2-restore',bake:'.spl-v2-bake',bind:'.spl-v2-bind',inspect:'.spl-v2-inspect'};
    if(junction){selectors.autoTrimPlan='.spl-v2-autotrim-plan';selectors.autoTrimApply='.spl-v2-autotrim-apply';}
    if(junction){selectors.snapPlan='.spl-v2-snap-plan';selectors.snapApply='.spl-v2-snap-apply';selectors.network='.spl-v2-network';}
    const sections=fields.map(([title,props])=>
        `<details open class="spl-section"><summary>${title}</summary>`+
        props.map(name=>{
            selectors[name]='.spl-v2-'+name;
            selectors['row_'+name]='.spl-v2-row-'+name;
            return `<div class="spl-row spl-v2-row-${name}"><ui-prop type="dump" class="spl-prop spl-v2-${name}"></ui-prop></div>`;
        }).join('')+'</details>'
    ).join('');
    return {
        style,
        template:`<div class="spl-inspector">
          <div class="spl-header"><strong>∿ Spline ${tube?'Extrude':deform?'Mesh Deform':junction?'Junction Patch':'Road'} V2</strong></div>
          ${sections}
          ${junction?'<div class="spl-btns"><button type="button" class="spl-btn spl-v2-autotrim-plan">Check Auto Trim</button><button type="button" class="spl-btn spl-v2-autotrim-apply">Apply Auto Trim</button></div>':''}
          ${junction?'<div class="spl-btns"><button type="button" class="spl-btn spl-v2-network">Check Road Network</button><button type="button" class="spl-btn spl-v2-snap-plan">Check Endpoint Snap</button><button type="button" class="spl-btn spl-v2-snap-apply">Apply Endpoint Snap</button></div>':''}
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
                const row=this.$['row_'+field];
                if(row)row.hidden=!prop;
                if(prop&&this.$[field])this.$[field].render(prop);
            }
        },
        ready(){
            this.$.preview.addEventListener('click',()=>void dispatchV2(this,'rebuild-v2-road'));
            this.$.restore.addEventListener('click',()=>void dispatchV2(this,'restore-v2-road-baked'));
            this.$.bake.addEventListener('click',()=>void dispatchV2(this,'bake-v2-road'));
            this.$.bind.addEventListener('click',()=>void dispatchV2(this,'bind-v2-road-mesh'));
            this.$.inspect.addEventListener('click',()=>void dispatchV2(this,'check-v2-road-bake'));
            if(junction){
                this.$.autoTrimPlan.addEventListener('click',()=>void dispatchV2(this,'plan-v2-junction-auto-trim'));
                this.$.autoTrimApply.addEventListener('click',()=>void dispatchV2(this,'apply-v2-junction-auto-trim'));
                this.$.network.addEventListener('click',()=>void dispatchV2(this,'inspect-v2-road-network'));
                this.$.snapPlan.addEventListener('click',()=>void dispatchV2(this,'plan-v2-junction-endpoint-snap'));
                this.$.snapApply.addEventListener('click',()=>void dispatchV2(this,'apply-v2-junction-endpoint-snap'));
            }
        }
    };
}
module.exports=makeV2Inspector('road');
module.exports.makeV2Inspector=makeV2Inspector;
