'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-knot-v3-'));
(async()=>{
try {
    cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',dir]);
    class Vec3 {
        constructor(x=0,y=0,z=0){this.set(x,y,z);}
        set(x,y,z){
            if(typeof x==='object')Object.assign(this,x);
            else Object.assign(this,{x,y,z});
            return this;
        }
        clone(){return new Vec3(this.x,this.y,this.z);}
        static transformQuat(out,v){return out.set(v);}
    }
    class Quat {
        constructor(){this.x=0;this.y=0;this.z=0;this.w=1;}
        clone(){return Object.assign(new Quat(),this);}
        static invert(out){return out;}
        static fromEuler(out,x,y,z){out.x=x;out.y=y;out.z=z;return out;}
        static toEuler(out,q){return out.set(q.x,q.y,q.z);}
    }
    class Node {
        constructor(name){this.name=name;this.uuid=name;this.parent=null;this.children=[];this.position=new Vec3();
            this.rotation=new Quat();this.worldRotation=new Quat();this.isValid=true;this.enabled=true;this.components=[];}
        getComponent(type){
            if(typeof type==='string'&&type==='Splines.SplineContainer')return this.spline||null;
            return this.components.find(c=>c instanceof type)||null;
        }
        setWorldRotation(q){this.worldRotation=q.clone();this.rotation=q.clone();}
        setPosition(v){this.position=v.clone();}
    }
    class Component {constructor(){this.enabled=true;this.isValid=true;}}
    const noop=()=>{};
    const dec={ccclass:()=>cls=>cls,property:()=>noop,menu:()=>cls=>cls,executeInEditMode:()=>cls=>cls};
    const cc={_decorator:dec,Component,Node,Vec3,Quat,Enum:v=>v};
    const original=Module._load;
    Module._load=function(request,parent,isMain){
        if(request==='cc')return cc;
        return original.apply(this,arguments);
    };
    try {
        const {SplineKnot,TangentMode}=require(path.join(dir,'Core/SplineKnot.js'));
        const {SplineKnotGizmos}=require(path.join(dir,'Editor/SplineKnotGizmos.js'));
        const rootNode=new Node('root');
        const nodeA=new Node('A'),nodeB=new Node('B');
        nodeA.parent=rootNode;nodeB.parent=rootNode;rootNode.children=[nodeA,nodeB];
        const knot=new SplineKnot();knot.node=nodeA;nodeA.components.push(knot);
        const knotB=new SplineKnot();knotB.node=nodeB;nodeB.components.push(knotB);
        let refreshCount=0;
        const spline={count:2,dimension:0,refresh(){refreshCount++;},
            getNaturalResolvedKnots(){return [
                {tangentIn:{x:-2,y:0,z:0},tangentOut:{x:2,y:0,z:0}},
                {tangentIn:{x:-1,y:0,z:0},tangentOut:{x:1,y:0,z:0}},
            ];}};
        rootNode.spline=spline;
        knot.mode=TangentMode.AutoSmooth;
        assert.equal(knot.editorTangentOut.x,2,'AutoSmooth getter uses resolved tangent');
        const gizmo=new SplineKnotGizmos(knot);
        globalThis.Gizmos3D={
            supportsExternalHistory:true,
            move:(name,options)=>{
                assert.equal(options.history,'external');
                return [{property:name,visual:'axis'}];
            },
            rotate:(name,options)=>{
                assert.equal(options.history,'external');
                return [{property:name,visual:'rotation'}];
            },
        };
        const handles=gizmo.onGizmoHandles();
        assert.deepEqual(handles.map(x=>x.property),['editorTangentIn','editorTangentOut','editorWorldEuler']);
        gizmo.onGizmoChanged('editorTangentOut','begin');
        knot.editorTangentOut=new Vec3(4,2,0);
        assert.equal(knot.mode,TangentMode.Broken,'Editing AutoSmooth must materialize into Broken');
        assert.equal(knot.tangentIn.x,-2,'Opposite tangent kept');
        assert.equal(knot.tangentOut.x,4);
        assert(refreshCount>0,'Updating tangent invalidates spline');
        gizmo.onGizmoChanged('editorTangentOut','cancel');
        assert.equal(knot.mode,TangentMode.AutoSmooth,'Cancel restores tangent mode');
        assert.equal(knot.tangentOut.x,1,'Cancel restores serialized tangent');
        assert.equal(knot.tangentIn.x,-1,'Cancel restores opposite serialized tangent');
        gizmo.onGizmoChanged('editorWorldEuler','begin');
        knot.editorWorldEuler=new Vec3(10,20,30);
        assert.equal(nodeA.worldRotation.z,30,'Rotate Gizmo writes node world rotation');
        gizmo.onGizmoChanged('editorWorldEuler','cancel');
        assert.equal(nodeA.worldRotation.z,0,'Cancel restores node world rotation');
        let requests=0,writes=0,rejectSnapshot=true;
        globalThis.Editor={Message:{request:(channel,method,payload)=>{
            assert.equal(channel,'scene');
            if(method==='query-node')return {
                __comps__:[{type:'Splines.SplineKnot',value:{
                    mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},
                    tangentOut:{type:'cc.Vec3'},
                }}],
            };
            if(method==='set-property'){
                assert.equal(payload.record,false);
                writes++;
                if(payload.path==='rotation'){
                    nodeA.rotation=Object.assign(new Quat(),payload.dump.value);
                    nodeA.worldRotation=nodeA.rotation.clone();
                }else{
                    const field=payload.path.split('.').at(-1);
                    assert(['mode','tangentIn','tangentOut'].includes(field));
                    knot[field]=field==='mode'?payload.dump.value:
                        new Vec3().set(payload.dump.value);
                }
                return true;
            }
            assert.equal(method,'snapshot');
            requests++;
            return !rejectSnapshot;
        }}};
        gizmo.onGizmoChanged('editorTangentOut','begin');
        knot.editorTangentOut=new Vec3(7,3,0);
        gizmo.onGizmoChanged('editorTangentOut','end');
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(knot.mode,TangentMode.AutoSmooth,'Failed tangent commit restores AutoSmooth');
        assert.equal(knot.tangentOut.x,1,'Failed tangent commit restores original outgoing tangent');
        assert.equal(requests,1);
        assert(writes>=4,'Tangent serialized mode/vector updates also roll back');
        gizmo.onGizmoChanged('editorWorldEuler','begin');
        knot.editorWorldEuler=new Vec3(0,50,20);
        gizmo.onGizmoChanged('editorWorldEuler','end');
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(nodeA.worldRotation.y,0,'Failed rotate snapshot restores previous world rotation');
        assert.equal(requests,2);
        // Successful tangent drag: mode, both tangent vectors and one snapshot.
        rejectSnapshot=false;
        const writesBefore=writes;
        gizmo.onGizmoChanged('editorTangentOut','begin');
        knot.editorTangentOut=new Vec3(5,1,0);
        gizmo.onGizmoChanged('editorTangentOut','end');
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(requests,3,'One snapshot for AutoSmooth-to-Broken tangent gesture');
        assert.equal(knot.mode,TangentMode.Broken);
        assert.equal(knot.tangentOut.x,5);
        assert(writes>=writesBefore+3,'Mode and both vectors are serialized');
        // Reset baseline for invalidated-gesture tests.
        knot.mode=TangentMode.AutoSmooth;
        knot.tangentIn=new Vec3(-1,0,0);
        knot.tangentOut=new Vec3(1,0,0);
        // Component disabled mid-drag: no snapshot, tangent/mode restored.
        knot.enabled=true;
        gizmo.onGizmoChanged('editorTangentOut','begin');
        knot.editorTangentOut=new Vec3(8,1,0);
        knot.enabled=false;
        gizmo.onGizmoChanged('editorTangentOut','end');
        assert.equal(knot.mode,TangentMode.AutoSmooth);
        assert.equal(knot.tangentOut.x,1);
        assert.equal(requests,3,'Disabled component does not commit');
        knot.enabled=true;
        // Owner moved to a different parent; do not restore its new transform
        // when cancelling a rotation from the original spline.
        gizmo.onGizmoChanged('editorWorldEuler','begin');
        knot.editorWorldEuler=new Vec3(0,15,10);
        const changedRotation=nodeA.worldRotation.clone();
        const differentParent=new Node('Other Root');
        nodeA.parent=differentParent;
        gizmo.onGizmoChanged('editorWorldEuler','end');
        assert.deepEqual(nodeA.worldRotation,changedRotation,
            'Reparented owner is left for its new hierarchy to manage');
        assert.equal(requests,3);
        nodeA.parent=rootNode;
        nodeA.setWorldRotation(new Quat());
        delete globalThis.Editor;
        delete globalThis.Gizmos3D;
        console.log('KNOT GIZMOS V3 PASS: tangent/rotate cancel and failed snapshots.');
    } finally {Module._load=original;}
} finally {fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
