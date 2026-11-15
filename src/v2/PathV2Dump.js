'use strict';
/**
 * Pure planner for Creator 3.8 IProperty dumps. Topology edits go through
 * scene.set-property(record:true), NOT an untracked Scene script mutation.
 * The returned dump keeps Cocos element metadata and nested IProperty types.
 * No engine objects are created in the extension main process.
 */
const operations=new Set(['add','insert','duplicate','remove','up','down','select']);
const clone=value=>JSON.parse(JSON.stringify(value));
const {knotPosition:position,setKnotPosition:setPosition,knotDumpShape}=require('./PathKnotDumpCodec');
function plus(a,b){return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};}
function minus(a,b){return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};}
function half(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2};}
function isPath(c){
    if(!c||typeof c!=='object')return false;
    const type=[c.type,c.value?.__type__,c.value?.__classname__].filter(x=>typeof x==='string');
    const props=c.value;
    return type.includes('Spline.Path')||
        (!!props?.knots&&!!props?.interpolation&&!!props?.gizmoKnotIndex);
}
function defaultTemplate(array){
    const first=array.elementTypeData;
    if(position(first))return clone(first);
    // When the element metadata is absent, keep an authored Knot's exact
    // dump nesting so Creator sees the same class-array shape on insert.
    const existing=array.value?.find(entry=>position(entry));
    if(existing)return clone(existing);
    // Some Creator 3.8 dump versions omit elementTypeData on an empty
    // array. Cocos CCClass annotations match these fields and types.
    return {type:'Spline.Knot',value:{
        position:{type:'cc.Vec3',value:{x:0,y:0,z:0}},
        mode:{type:'Enum',value:0},
        handleIn:{type:'cc.Vec3',value:{x:-1,y:0,z:0}},
        handleOut:{type:'cc.Vec3',value:{x:1,y:0,z:0}},
        tension:{type:'Float',value:0},
        rollDegrees:{type:'Float',value:0}
    }};
}
function planPathEditDump(nodeDump,operation,index){
    if(!operations.has(operation)||!Number.isSafeInteger(index)||index<0)
        throw new Error('Unsupported Path edit operation or index');
    const comps=nodeDump?.__comps__;
    if(!Array.isArray(comps))throw new Error('Creator did not return a node component dump');
    const componentIndex=comps.findIndex(isPath);
    if(componentIndex<0)throw new Error('Selected Node does not contain SplinePath');
    const props=comps[componentIndex].value;
    const field=operation==='select'?'gizmoKnotIndex':'knots';
    const raw=props[field];
    const array=props.knots;
    if(!raw||!array||!Array.isArray(array.value))
        throw new Error('SplinePath serialized Knot dump is unavailable');
    const current=array.value;
    const selectionDump=clone(props.gizmoKnotIndex);
    if(current.length>128)
        throw new Error('SplinePath supports at most 128 Knots');
    // Active selection does not read/modify any position, so a malformed
    // legacy entry must not block selecting another Knot for inspection.
    if(operation==='select'){
        if(index>=current.length)throw new Error('Selected Knot does not exist');
        const selected=clone(raw);
        selected.value=index;
        return {field,componentIndex,dump:selected,index,count:current.length,record:false,selectionDump:selected};
    }
    const broken=current.findIndex(entry=>!position(entry));
    if(broken!==-1)
        throw new Error('SplinePath Knot '+broken+' has unsupported or invalid Vec3 dump ('+
            knotDumpShape(current[broken])+'). No Knot data was changed.');
    const result=clone(array),knots=result.value,n=knots.length;
    if(operation==='add'||operation==='insert'||operation==='duplicate'){
        if(n>=128)throw new Error('SplinePath supports at most 128 Knots');
        const source=knots[Math.min(index,n-1)];
        const next=operation==='duplicate'&&n?clone(source):defaultTemplate(result);
        let p={x:0,y:0,z:0};
        if(operation==='duplicate'&&n){
            p=plus(position(source),{x:1,y:0,z:0});
        }else if(operation==='insert'&&index<n-1){
            p=half(position(knots[index]),position(knots[index+1]));
        }else if(n){
            const last=position(knots[n-1]),prev=position(knots[Math.max(0,n-2)]);
            const delta=n===1?{x:0,y:0,z:5}:minus(last,prev);
            p=plus(last,Math.hypot(delta.x,delta.y,delta.z)>1e-6?
                delta:{x:0,y:0,z:5});
        }
        setPosition(next,p);
        const to=operation==='add'?n:Math.min(index+1,n);
        knots.splice(to,0,next);
        selectionDump.value=to;
        return {field,componentIndex,dump:result,index:to,count:knots.length,record:true,selectionDump};
    }
    if(index>=n)throw new Error('Knot does not exist');
    if(operation==='remove'){
        if(n<=2)throw new Error('Spline requires at least two Knots');
        knots.splice(index,1);
        const selected=Math.min(index,knots.length-1);
        selectionDump.value=selected;
        return {field,componentIndex,dump:result,
            index:selected,count:knots.length,record:true,selectionDump};
    }
    const to=index+(operation==='up'?-1:1);
    if(to<0||to>=n)
        return {field,componentIndex,dump:result,index,count:n,record:false,noOp:true,selectionDump};
    [knots[index],knots[to]]=[knots[to],knots[index]];
    selectionDump.value=to;
    return {field,componentIndex,dump:result,index:to,count:n,record:true,selectionDump};
}
module.exports={planPathEditDump};
