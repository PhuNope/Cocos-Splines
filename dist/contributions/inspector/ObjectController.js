'use strict';
const base=require('./common').makeInspector('objectController');
const model=require('../../SplinePopulationGraphVisualModel');
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=types=>types.map(t=>'<option value="'+escape(t)+'">'+escape(model.TYPES[t].label)+'</option>').join('');
const template=base.template+`
<details class="spl-section spl-pg-panel" open>
 <summary>Visual Population Graph · local JSON</summary>
 <div class="spl-pg-message" role="status"></div>
 <div class="spl-pg-chain" role="group" aria-label="Typed population pipeline"></div>
 <div class="spl-pg-tools">
 <label>Distribution <select class="spl-pg-distribution">${options(model.DISTRIBUTIONS)}</select></label><button class="spl-pg-replace" type="button">Change</button>
 <label>Insert after selection <select class="spl-pg-filter">${options(model.FILTERS)}</select></label><button class="spl-pg-insert" type="button">Add</button>
 <button class="spl-pg-up" type="button">↑ Move</button><button class="spl-pg-down" type="button">↓ Move</button><button class="spl-pg-remove" type="button">Remove</button>
 </div>
 <div class="spl-pg-fields"></div><button class="spl-pg-apply" type="button">Apply parameters</button>
 <div class="spl-pg-note">Edits affect local graph only. Respawn explicitly to update instances. Scene placement gizmos preview accepted candidates.</div>
</details>`;
const style=base.style+`
.spl-pg-chain{display:flex;flex-direction:column;gap:3px;padding:6px 0}
.spl-pg-card{display:flex;flex-direction:column;text-align:left;padding:6px 10px;border:1px solid var(--color-normal-border,#555);border-radius:4px;background:transparent;color:inherit}
.spl-pg-card.selected{border-color:#60a5fa;background:rgba(96,165,250,.12)}
.spl-pg-port{font-size:11px;opacity:.75}.spl-pg-arrow{text-align:center;opacity:.65}
.spl-pg-tools{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}.spl-pg-tools label{display:flex;align-items:center;gap:4px}
.spl-pg-fields label{display:flex;flex-direction:column;gap:3px;margin:5px 0}
.spl-pg-fields input,.spl-pg-fields select,.spl-pg-fields textarea{box-sizing:border-box;max-width:100%;width:100%}
.spl-pg-fields textarea{min-height:44px;resize:vertical;font-family:monospace}.spl-pg-note,.spl-pg-message{font-size:11px;opacity:.85;margin:5px 0}
`;
const $={...base.$,pgPanel:'.spl-pg-panel',pgMessage:'.spl-pg-message',pgChain:'.spl-pg-chain',pgFields:'.spl-pg-fields',
 pgDistribution:'.spl-pg-distribution',pgReplace:'.spl-pg-replace',pgFilter:'.spl-pg-filter',pgInsert:'.spl-pg-insert',
 pgUp:'.spl-pg-up',pgDown:'.spl-pg-down',pgRemove:'.spl-pg-remove',pgApply:'.spl-pg-apply'};
function state(panel){
 const d=panel._splineDump,v=d?.value,asset=v?.populationGraphAsset;
 const shared=asset?.value;
 const assigned=typeof shared==='object'&&shared!==null?!!(shared.uuid||shared.value||shared.id):!!shared;
 const multi=[d?.values,v?.populationGraphJson?.values,v?.usePopulationGraph?.values,asset?.values].some(a=>Array.isArray(a)&&a.length>1);
 return {enabled:v?.usePopulationGraph?.value===true,locked:assigned||multi,text:v?.populationGraphJson?.value,dump:v?.populationGraphJson};
}
function message(panel,text){panel.$.pgMessage.textContent=text;}
function render(panel){
 const s=state(panel);panel.$.pgPanel.hidden=!s.enabled;
 const controls=['pgDistribution','pgReplace','pgFilter','pgInsert','pgUp','pgDown','pgRemove','pgApply'];
 for(const k of controls)panel.$[k].disabled=true;
 panel.$.pgChain.innerHTML='';panel.$.pgFields.innerHTML='';panel._pgRenderedText=null;
 if(!s.enabled)return;
 if(s.locked){message(panel,'Shared graph asset or multi-selection: visual editing is read-only. Use a single local graph.');return;}
 try{
  const g=model.parse(s.text);panel._pgRenderedText=s.text;
  if(!g.nodes.some(n=>n.id===panel._pgSelected))panel._pgSelected=g.nodes[1].id;
  const i=g.nodes.findIndex(n=>n.id===panel._pgSelected),n=g.nodes[i],d=model.TYPES[n.type];
  panel.$.pgChain.innerHTML=g.nodes.map((node,index)=>{
   const desc=model.TYPES[node.type];
   return (index?'<div class="spl-pg-arrow">↓ '+escape(desc.input)+'</div>':'')+
    '<button type="button" data-pg-node="'+escape(node.id)+'" class="spl-pg-card'+(node.id===n.id?' selected':'')+'"><strong>'+escape(desc.label)+'</strong><span class="spl-pg-port">'+escape(node.id)+' · '+escape(desc.input||'source')+' → '+escape(desc.output)+'</span></button>';
  }).join('');
  const distribution=model.DISTRIBUTIONS.includes(n.type),filter=model.FILTERS.includes(n.type);
  panel.$.pgDistribution.disabled=panel.$.pgReplace.disabled=!distribution;
  if(distribution)panel.$.pgDistribution.value=n.type;
  panel.$.pgFilter.disabled=panel.$.pgInsert.disabled=d.output!=='candidates'||g.nodes.length>=32;
  panel.$.pgRemove.disabled=!filter;
  panel.$.pgUp.disabled=!filter||!model.FILTERS.includes(g.nodes[i-1]?.type);
  panel.$.pgDown.disabled=!filter||!model.FILTERS.includes(g.nodes[i+1]?.type);
  panel.$.pgApply.disabled=Object.keys(d.fields).length===0;
  panel.$.pgFields.innerHTML=Object.entries(d.fields).map(([key,f])=>{
   const val=n[key]===undefined?f.value:n[key],attr=' data-pg-param="'+key+'"';
   let widget;
   if(f.kind==='boolean'||f.kind==='enum'){
    const opts=f.kind==='boolean'?['true','false']:f.options;
    widget='<select'+attr+'>'+opts.map(v=>'<option value="'+escape(v)+'"'+(String(val)===v?' selected':'')+'>'+escape(v)+'</option>').join('')+'</select>';
   }else if(f.kind==='json')widget='<textarea'+attr+'>'+escape(JSON.stringify(val))+'</textarea>';
   else widget='<input type="number"'+attr+' min="'+f.min+'" max="'+f.max+'" step="'+(f.integer?'1':'any')+'" value="'+escape(val)+'">';
   return '<label>'+escape(key)+widget+'</label>';
  }).join('');
  message(panel,g.nodes.length+' nodes · '+d.label+' selected.');
 }catch(error){message(panel,'Invalid local graph: '+String(error?.message||error)+'. Repair using Population Graph Json.');}
}
function commit(panel,action){
 try{
  const s=state(panel),p=panel.$.p_populationGraphJson;
  if(!s.enabled||s.locked||typeof s.text!=='string'||s.text!==panel._pgRenderedText||!p||typeof p.dispatch!=='function')
   throw Error('Graph changed or is read-only. Refresh selection before editing.');
  const next=model.edit(s.text,{id:panel._pgSelected,...action});
  if(next===s.text)return;
  const prior=s.dump.value;
  try{p.dump=s.dump;s.dump.value=next;p.dispatch('change-dump');}
  catch(error){s.dump.value=prior;throw error;}
  render(panel);message(panel,'Local graph saved via Inspector. Respawn to apply.');
 }catch(error){message(panel,String(error?.message||error));}
}
module.exports={...base,template,style,$,
 update(dump){
  const prior=state(this),previousDump=this._splineDump;
  base.update.call(this,dump);
  const next=state(this);
  if(previousDump!==dump||prior.text!==next.text||prior.enabled!==next.enabled||prior.locked!==next.locked||this._pgRenderedText!==next.text)render(this);
 },
 ready(){
  base.ready.call(this);
  this.$.pgChain.addEventListener('click',event=>{
   const id=event.target?.closest?.('[data-pg-node]')?.dataset?.pgNode;
   if(id){this._pgSelected=id;render(this);}
  });
  const click=(k,action)=>this.$[k].addEventListener('click',()=>commit(this,action()));
  click('pgReplace',()=>({kind:'distribution',type:this.$.pgDistribution.value}));
  click('pgInsert',()=>({kind:'insert',type:this.$.pgFilter.value}));
  click('pgRemove',()=>({kind:'remove'}));click('pgUp',()=>({kind:'move',delta:-1}));click('pgDown',()=>({kind:'move',delta:1}));
  this.$.pgApply.addEventListener('click',()=>{
   try{
    const g=model.parse(this._pgRenderedText),n=g.nodes.find(n=>n.id===this._pgSelected),d=model.TYPES[n.type],params={};
    for(const widget of this.$.pgFields.querySelectorAll('[data-pg-param]')){
     const k=widget.dataset.pgParam,f=d.fields[k],v=widget.value;
     if(!f)throw Error('Unknown parameter.');
     params[k]=f.kind==='json'?JSON.parse(v):f.kind==='number'?(v.trim()===''?NaN:Number(v)):f.kind==='boolean'?v==='true':v;
     if(f.kind==='number'&&!Number.isFinite(params[k]))throw Error('Invalid number: '+k);
    }
    commit(this,{kind:'parameters',params});
   }catch(error){message(this,String(error?.message||error));}
  });
 },
 close(){base.close.call(this);this._pgSelected=null;this._pgRenderedText=null;}
};
