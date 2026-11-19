'use strict';
/** Editor-neutral mock of GizmoHUD.createHud() fluent builder/command API.
 * Validates the new contract in component integration tests, not DOM visuals. */
function createBuilder(id){
 const nodes=[];
 const fluent={
  id,nodes,
  position(){return this;},theme(){return this;},width(){return this;},
  padding(){return this;},gap(){return this;},
  text(key,text,opts={}){nodes.push({id:key,kind:'text',text,...opts});return this;},
  row(key,callback){
   const group=createBuilder(key);callback(group);
   nodes.push({id:key,kind:'row',children:group.nodes});return this;
  },
  toggle(key,text,command){nodes.push({id:key,kind:'toggle',text,command});return this;},
  slider(key,text,command,options){nodes.push({
   id:key,kind:'slider',text,command,...options});return this;},
  button(key,text,command){nodes.push({id:key,kind:'button',text,command});return this;},
  build(){return {kind:'hud',id,root:{kind:'column',id,children:nodes}};}
 };
 return fluent;
}
const mockGizmoHUD={
 createHud:createBuilder,
 bind:property=>({kind:'property',property}),
 action:execute=>({kind:'action',execute})
};
function flattenHud(hud){
 return hud?.root?.children?.flatMap(function visit(n){
  return [n,...(n.children||[]).flatMap(visit)];
 })||[];
}
function findHud(hud,id){return flattenHud(hud).find(x=>x.id===id);}
module.exports={mockGizmoHUD,flattenHud,findHud};
