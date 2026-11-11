'use strict';
/** Inspector-only geometry and persistence actions; native ui-prop owns Undo. */
const {style,callEditor}=require('./common');
function makeV2Inspector(kind='road'){
    const tube=kind==='extrude';
    const fields=tube?
        [['Path and tube',['knots','interpolation','closed','radius','sides','capEnds','flipFaces','sampleStep','uvMetersPerRepeat','uvLongitudinalAxis']],
         ['Materials and persistence',['meshMode','materials','bakedMesh']]]:
        [['Road and cross-section',['knots','interpolation','closed','width','shoulderWidth','curbWidth','curbHeight','sampleStep','cornerMode','cornerTrimSafety','cornerMiterLimit','uvMetersPerRepeat','uvLongitudinalAxis']],
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
          <div class="spl-header"><strong>∿ Spline ${tube?'Extrude':'Road'} V2</strong><p>Mesh generation happens only on request in Editor or Dynamic Play.</p></div>
          ${sections}
          <div class="spl-btns">
            <button type="button" class="spl-btn spl-v2-preview">↻ Rebuild Preview</button>
            <button type="button" class="spl-btn spl-v2-restore">↩ Show Baked Mesh</button>
            <button type="button" class="spl-btn spl-v2-bake">▣ Bake glTF Asset</button>
            <button type="button" class="spl-btn spl-v2-bind">⌁ Bind Imported Mesh</button>
            <button type="button" class="spl-btn spl-v2-inspect">◎ Check Bake Status</button>
          </div>
          <p class="spl-note">Bake creates a glTF under Project Assets and tries to link its unique cc.Mesh subasset automatically. If import is still pending, use Bind Imported Mesh later. Manual/Baked never generate geometry in Play. Select Longitudinal UV Axis: V repeats along texture Y (default); U repeats along texture X. Use Repeat wrap mode and Rebuild/Bake. Rebuild Preview replaces the visible renderer with a temporary Mesh; Show Baked Mesh restores the saved asset. Road Corner Mode JoinAndTrim locally trims tight inside bends; it is not a global road intersection Boolean. Road materials use slots 0=asphalt, 1=shoulder, 2=curb.</p>
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
