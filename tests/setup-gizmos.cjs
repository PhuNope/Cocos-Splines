'use strict';
// Node-only mock of the db:// AssetDB import. Never shipped as runtime code.
const Module=require('node:module'),original=Module._load;
Module._load=function(request,parent,isMain){
    if(request==='db://cocos-gizmos/RegisterGizmos'){
        return {registerGizmos(Drawer){
            return target=>{
                const instances=new WeakMap();
                for(const hook of ['onGizmoSettings','onGizmoHandles','onDrawGizmos',
                    'onDrawGizmosSelected','onGizmoChanged']){
                    if(typeof Drawer.prototype[hook]!=='function')continue;
                    Object.defineProperty(target.prototype,hook,{
                        configurable:true,
                        value:function(...args){
                            let drawer=instances.get(this);
                            if(!drawer){drawer=new Drawer(this);instances.set(this,drawer);}
                            return drawer[hook](...args);
                        },
                    });
                }
                return target;
            };
        }};
    }
    return original.apply(this,arguments);
};
