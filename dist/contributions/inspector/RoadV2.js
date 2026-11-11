'use strict';
/** Inspector only, no extra editor panel. Uses native ui-prop dumps for undo/prefab support. */
const NAME='cocos-splines';
const {style,callEditor}=require('./common');
const groups=[
 ['Path and geometry',['knots','interpolation','closed','width','sampleStep','uvMetersPerRepeat']],
 ['Materials and persistence',['meshMode','materials','bakedMesh']]
];
const fields=groups.flatMap(g=>g[1]);
const selectors={status:'.spl-status',preview:'.spl-v2-preview',bake:'.spl-v2-bake',inspect:'.spl-v2-inspect'};
const sections=groups.map(([title,names])=>
    `<details open class="spl-section"><summary>${title}</summary>`+
    names.map(name=>{
        selectors[name]='.spl-v2-'+name;
        return `<ui-prop type="dump" class="spl-prop spl-v2-${name}"></ui-prop>`;
    }).join('')+'</details>'
).join('');
module.exports={
    style,
    template:`<div class="spl-inspector">
      <div class="spl-header"><strong>∿ Spline Road V2</strong><p>Experimental v2 strip — dedicated knot Nodes, no legacy UUIDs.</p></div>
      ${sections}
      <div class="spl-btns">
        <button type="button" class="spl-btn spl-v2-preview">↻ Rebuild preview</button>
        <button type="button" class="spl-btn spl-v2-bake">▣ Bake glTF asset</button>
        <button type="button" class="spl-btn spl-v2-inspect">◎ Check bake status</button>
      </div>
      <p class="spl-note">Bake exports a new .gltf asset under Project Assets. After import, expand it and assign its Mesh subasset to Baked Mesh. Manual/Baked never generate geometry during Play; Dynamic does.</p>
      <div class="spl-status" role="status"></div>
    </div>`,
    $:selectors,
    update(dump){
        for(const field of fields){
            const prop=dump?.value?.[field];
            if(prop&&this.$[field])this.$[field].render(prop);
        }
    },
    ready(){
        this.$.preview.addEventListener('click',()=>void callEditor(this,'rebuild-v2-road'));
        this.$.bake.addEventListener('click',()=>void callEditor(this,'bake-v2-road'));
        this.$.inspect.addEventListener('click',()=>void callEditor(this,'check-v2-road-bake'));
    }
};
