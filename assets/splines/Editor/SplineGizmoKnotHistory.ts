import type { SceneMessageRequest } from './SplineGizmoGroupHistory';

/**
 * Editor-only serialized history for one Knot's tangent or local rotation.
 *
 * Gizmo ports edit the live Knot and its optional tangent-handle Nodes for
 * responsive dragging. At End, this writer validates the actual live state,
 * forwards each changed REAL serialized field to the official Scene Editor
 * set-property API with record:false, and requests exactly one snapshot.
 *
 * It does not access __prefab metadata or rely on computed Gizmo properties
 * being serialized. Native Prefab/Undo acceptance requires Creator 3.8.8.
 */
export interface KnotVec3 {x:number;y:number;z:number;}
export interface KnotQuat extends KnotVec3 {w:number;}
export interface KnotSceneNode {
    uuid:string;
    parent:unknown;
    isValid?:boolean;
    position:KnotVec3;
    rotation:KnotQuat;
}
export interface KnotSerializedState {
    parent:unknown;
    mode:number;
    inTangent:KnotVec3;
    outTangent:KnotVec3;
    inHandle:KnotVec3|null;
    outHandle:KnotVec3|null;
    inHandleNode:KnotSceneNode|null;
    outHandleNode:KnotSceneNode|null;
    inHandleParent:unknown;
    outHandleParent:unknown;
    localRotation:KnotQuat;
}
export interface KnotSerializedTarget {
    node:KnotSceneNode;
    isValid?:boolean;
    mode:number;
    tangentIn:KnotVec3;
    tangentOut:KnotVec3;
    tangentInHandle:KnotSceneNode|null;
    tangentOutHandle:KnotSceneNode|null;
}
type FieldValue=number|KnotVec3|KnotQuat;
interface Write {
    uuid:string;
    path:string;
    type:string;
    before:FieldValue;
    after:FieldValue;
    // Checks only the mutated field; other fields may be updated by another
    // Scene command in the same transaction.
    current:()=>FieldValue;
    valid:()=>boolean;
}
const xyz=['x','y','z'] as const;
const xyzw=['x','y','z','w'] as const;
const validPoint=(p:KnotVec3)=>!!p&&xyz.every(k=>Number.isFinite(p[k]));
const validQuat=(q:KnotQuat)=>!!q&&xyzw.every(k=>Number.isFinite(q[k]))&&
    Math.hypot(q.x,q.y,q.z,q.w)>1e-9;
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-6+1e-6*Math.max(Math.abs(a),Math.abs(b));
export const sameVec=(a:KnotVec3,b:KnotVec3):boolean=>
    validPoint(a)&&validPoint(b)&&xyz.every(k=>near(a[k],b[k]));
export const sameQuat=(a:KnotQuat,b:KnotQuat):boolean=>{
    if(!validQuat(a)||!validQuat(b))return false;
    const dot=xyzw.reduce((v,k)=>v+a[k]*b[k],0)/
        (Math.hypot(a.x,a.y,a.z,a.w)*Math.hypot(b.x,b.y,b.z,b.w));
    return 1-Math.abs(dot)<=1e-7; // q and -q represent the same rotation.
};
const equal=(a:FieldValue,b:FieldValue):boolean=>
    typeof a==='number'||typeof b==='number'?
        typeof a==='number'&&typeof b==='number'&&a===b:
        ('w' in a||'w' in b)?sameQuat(a as KnotQuat,b as KnotQuat):
        sameVec(a,b);
const good=(value:unknown)=>value!==false&&!(value&&typeof value==='object'&&
    (value as {ok?:boolean}).ok===false);
function valueCopy(v:FieldValue):FieldValue {
    if(typeof v==='number')return v;
    return 'w' in v?{x:v.x,y:v.y,z:v.z,w:v.w}:{x:v.x,y:v.y,z:v.z};
}
function verifyState(target:KnotSerializedTarget,state:KnotSerializedState):boolean {
    if(!target||target.isValid===false||!target.node||
       target.node.isValid===false||target.node.parent!==state.parent||
       !Number.isInteger(state.mode)||state.mode<0||state.mode>4||
       target.mode!==state.mode||
       !sameVec(target.tangentIn,state.inTangent)||
       !sameVec(target.tangentOut,state.outTangent)||
       !sameQuat(target.node.rotation,state.localRotation))return false;
    const handles=[
        [target.tangentInHandle,state.inHandleNode,state.inHandle,state.inHandleParent],
        [target.tangentOutHandle,state.outHandleNode,state.outHandle,state.outHandleParent],
    ] as const;
    for(const [current,node,point,parent] of handles){
        if(current!==node)return false;
        if(node&&(node.isValid===false||node.parent!==parent||
            !point||!sameVec(node.position,point)))return false;
        if(!node&&point!==null)return false;
    }
    return true;
}
async function write(op:Write,value:FieldValue,request:SceneMessageRequest):Promise<void>{
    const result=await request('scene','set-property',{
        uuid:op.uuid,path:op.path,
        dump:{type:op.type,value:valueCopy(value)},
        record:false,
    });
    if(!good(result))
        throw Error('Editor rejected serialized Knot field '+op.uuid+'/'+op.path);
}
async function componentIndex(
    target:KnotSerializedTarget,request:SceneMessageRequest,
):Promise<{index:number;values:Record<string,any>}> {
    const dump=await request('scene','query-node',target.node.uuid) as any;
    const comps=dump?.__comps__;
    if(!Array.isArray(comps))
        throw Error('Cannot resolve serialized SplineKnot component in Scene.');
    const candidates=comps.map((comp:any,i:number)=>({comp,i})).filter(({comp}:any)=>{
        const type=String(comp?.type||'');
        const fields=comp?.value;
        return type==='Splines.SplineKnot'||type.endsWith('SplineKnot')||
            (!!fields&&['mode','tangentIn','tangentOut'].every(key=>key in fields));
    });
    if(candidates.length!==1)
        throw Error('Missing or ambiguous serialized SplineKnot component in Scene.');
    return {index:candidates[0].i,values:candidates[0].comp.value||{}};
}
/** Commit one logical gizmo gesture; all field writes share one snapshot. */
export async function commitKnotSerializedGesture(
    property:'editorTangentIn'|'editorTangentOut'|'editorWorldEuler',
    target:KnotSerializedTarget,
    before:KnotSerializedState,after:KnotSerializedState,
    request:SceneMessageRequest,
):Promise<unknown>{
    if(typeof request!=='function'||!target||!before||!after||
       before.parent!==after.parent||
       before.inHandleNode!==after.inHandleNode||
       before.outHandleNode!==after.outHandleNode||
       before.inHandleParent!==after.inHandleParent||
       before.outHandleParent!==after.outHandleParent||
       !verifyState(target,after))
        throw Error('Knot Scene state changed; refusing stale serialized Gizmo commit.');
    const tangent=property==='editorTangentIn'||property==='editorTangentOut';
    if(!tangent&&property!=='editorWorldEuler')
        throw Error('Unsupported serialized Knot Gizmo property.');
    const ops:Write[]=[];
    const ownerValid=()=>target.isValid!==false&&target.node.isValid!==false&&
        target.node.parent===before.parent;
    const append=(uuid:string,path:string,type:string,b:FieldValue,a:FieldValue,
        current:()=>FieldValue,valid:()=>boolean)=>{
        if(!equal(b,a))ops.push({uuid,path,type,before:valueCopy(b),
            after:valueCopy(a),current,valid});
    };
    if(tangent){
        const changedComponent=before.mode!==after.mode||
            !sameVec(before.inTangent,after.inTangent)||
            !sameVec(before.outTangent,after.outTangent);
        let idx=-1,types:Record<string,any>={};
        if(changedComponent){
            const found=await componentIndex(target,request);
            idx=found.index;types=found.values;
        }
        const componentType=(key:string,fallback:string)=>{
            const type=types[key]?.type;
            return typeof type==='string'&&type?type:fallback;
        };
        if(changedComponent){
            append(target.node.uuid,'__comps__.'+idx+'.mode',
                componentType('mode','Enum'),before.mode,after.mode,
                ()=>target.mode,ownerValid);
            append(target.node.uuid,'__comps__.'+idx+'.tangentIn',
                componentType('tangentIn','cc.Vec3'),
                before.inTangent,after.inTangent,()=>target.tangentIn,ownerValid);
            append(target.node.uuid,'__comps__.'+idx+'.tangentOut',
                componentType('tangentOut','cc.Vec3'),
                before.outTangent,after.outTangent,()=>target.tangentOut,ownerValid);
        }
        for(const side of ['in','out'] as const){
            const node=side==='in'?before.inHandleNode:before.outHandleNode;
            const beforePoint=side==='in'?before.inHandle:before.outHandle;
            const afterPoint=side==='in'?after.inHandle:after.outHandle;
            const parent=side==='in'?before.inHandleParent:before.outHandleParent;
            if(node&&beforePoint&&afterPoint){
                append(node.uuid,'position','cc.Vec3',beforePoint,afterPoint,
                    ()=>node.position,()=>ownerValid()&&node.isValid!==false&&
                        node.parent===parent&&
                        (side==='in'?target.tangentInHandle:target.tangentOutHandle)===node);
            }
        }
    }else{
        if(!validQuat(before.localRotation)||!validQuat(after.localRotation))
            throw Error('Knot rotation was invalid during Gizmo edit.');
        append(target.node.uuid,'rotation','cc.Quat',
            before.localRotation,after.localRotation,
            ()=>target.node.rotation,ownerValid);
    }
    if(!ops.length)return true;
    // Query-node occurs asynchronously; reject property edits made between
    // preflight and the first serialized write.
    if(!verifyState(target,after))
        throw Error('Knot Scene state changed during serialized Gizmo planning.');
    const touched:Write[]=[];
    try{
        for(const op of ops){
            if(!op.valid()||!equal(op.current(),op.after))
                throw Error('Knot field changed during serialized Gizmo transaction.');
            touched.push(op);
            await write(op,op.after,request);
            if(!op.valid()||!equal(op.current(),op.after))
                throw Error('Knot field changed while applying Editor property.');
        }
        const snapshot=await request('scene','snapshot');
        if(!good(snapshot))
            throw Error('Scene rejected Knot Gizmo snapshot.');
        return snapshot;
    }catch(error){
        const failures:string[]=[];
        for(const op of touched.reverse()){
            // If another edit modified the field, don't overwrite it.
            if(!op.valid()||!equal(op.current(),op.after))continue;
            try{await write(op,op.before,request);}
            catch(e){failures.push(op.uuid+'/'+op.path+': '+String(e));}
        }
        const message=String((error as Error)?.message||error);
        if(failures.length)
            throw Error(message+'; serialized rollback failed for '+failures.join(', '));
        throw Error(message);
    }
}
