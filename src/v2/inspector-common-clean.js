'use strict';
/** Compact standalone Inspector primitives. No legacy Spline UI or log panel. */
const NAME='cocos-splines';
const style=`
:host{display:block;color:var(--color-normal-contrast,#d8e4ee)}
.spl-inspector{padding:3px 0 9px;font-size:12px;line-height:1.5}
.spl-header{padding:9px 10px;border:1px solid var(--color-border-normal,#374b5c);background:rgba(42,140,177,.09);border-radius:7px;margin:4px 0 9px}
.spl-header strong{font-size:13px;color:#82cae6}
.spl-section{margin:7px 0;border:1px solid var(--color-border-normal,#364551);border-radius:6px;padding:6px 8px}
.spl-section>summary{cursor:pointer;font-weight:600;user-select:none;margin:0 0 6px}
.spl-prop{display:block;margin:5px 0;width:100%}
.spl-row[hidden],.spl-section[hidden]{display:none!important}
.spl-btns{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0}
.spl-btn{background:rgba(52,102,131,.22);border:1px solid #4c7182;border-radius:5px;padding:5px 8px;font-size:11px;color:inherit;cursor:pointer}
.spl-btn:hover{background:rgba(73,141,172,.27)}
.spl-btn:disabled{opacity:.4;cursor:default}
`;
async function callEditor(_inspector,message,...args){
    try{return await Editor.Message.request(NAME,message,...args);}
    catch(error){return {ok:false,error:String(error instanceof Error?error.message:error)};}
}
module.exports={style,callEditor};
