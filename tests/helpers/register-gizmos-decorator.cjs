'use strict';
/** Headless contract double for SDK's @registerGizmos.
 * Production resolves the REAL decorator through db://cocos-gizmos.
 * This mock implements its per-Component lazy WeakMap and forwarding only. */
const hooks=['onGizmoSettings','onGizmoHandles',
    'onDrawGizmos','onDrawGizmosSelected','onGizmoHUD',
    'onGizmoHud','onGizmoHudControls','onGizmoChanged',
    'onGizmoHudChanged','onGizmoHudAction'];
const stats={created:0};
function registerGizmos(Drawer){
 if(typeof Drawer!=='function')throw new TypeError('Drawer class required');
 return function(target){
  const instances=new WeakMap();
  for(const name of hooks){
   if(typeof Drawer.prototype[name]!=='function')continue;
   const existing=target.prototype[name];
   Object.defineProperty(target.prototype,name,{
    configurable:true,writable:true,
    value:function(...args){
     if(!this||this.isValid===false||this.node?.isValid===false)return;
     let drawer=instances.get(this);
     if(!drawer){drawer=new Drawer(this);instances.set(this,drawer);stats.created++;}
     return typeof drawer[name]==='function'?
      drawer[name](...args):typeof existing==='function'?
      existing.apply(this,args):undefined;
    }
   });
  }
 };
}
module.exports={registerGizmos,stats};
