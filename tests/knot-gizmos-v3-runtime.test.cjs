'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-knot-v3-'));
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
        constructor(name){this.name=name;this.parent=null;this.children=[];this.position=new Vec3();
            this.rotation=new Quat();this.worldRotation=new Quat();this.isValid=true;this.enabled=true;this.components=[];}
        getComponent(type){
            if(typeof type==='string'&&type==='Splines.SplineContainer')return this.spline||null;
            return this.components.find(c=>c instanceof type)||null;
        }
        setWorldRotation(q){this.worldRotation=q.clone();}
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
            move:name=>[{property:name,visual:'axis'}],
            rotate:name=>[{property:name,visual:'rotation'}],
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
        delete globalThis.Gizmos3D;
        console.log('KNOT GIZMOS V3 PASS: selected handles, tangent materialization, cancel and rotation.');
    } finally {Module._load=original;}
} finally {fs.rmSync(dir,{recursive:true,force:true});}
