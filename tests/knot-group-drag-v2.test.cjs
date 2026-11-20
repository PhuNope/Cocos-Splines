'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-group-move-'));
try {
    cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
        '--noEmit','false','--outDir',dir]);
    class Vec3 {
        constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
        clone(){return new Vec3(this.x,this.y,this.z);}
        set(v){Object.assign(this,v);return this;}
        static add(out,a,b){return out.set({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});}
        static subtract(out,a,b){return out.set({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});}
        static transformQuat(out,v){return out.set(v);}
    }
    class Quat {
        constructor(){this.x=this.y=this.z=0;this.w=1;}
        clone(){return Object.assign(new Quat(),this);}
        static invert(out){return out;}
        static fromEuler(out,x,y,z){return Object.assign(out,{x,y,z});}
        static toEuler(out,q){return out.set(q);}
    }
    class Node {
        constructor(uuid){
            this.uuid=uuid;this.isValid=true;this.parent=null;this.children=[];
            this.position=new Vec3();this.worldPosition=new Vec3();
            this.rotation=new Quat();this.worldRotation=new Quat();
            this.components=[];this.spline=null;
        }
        getComponent(type){
            if(type==='Splines.SplineContainer')return this.spline;
            if(type==='Splines.SplineKnot')return this.components[0]||null;
            return this.components.find(comp=>comp instanceof type)||null;
        }
        setWorldRotation(value){this.worldRotation=value.clone();}
        setWorldPosition(value){this.worldPosition=value.clone();}
        setPosition(value){this.position=value.clone();}
    }
    class Component{constructor(){this.enabled=true;this.isValid=true;}}
    const identity=x=>x;
    const decorators={ccclass:()=>identity,property:()=>()=>{},menu:()=>identity,executeInEditMode:()=>identity};
    const cc={_decorator:decorators,Component,Node,Vec3,Quat,Enum:identity};
    const old=Module._load;
    Module._load=function(name,parent,isMain){
        if(name==='cc')return cc;
        return old.apply(this,arguments);
    };
    try{
        const {SplineKnot}=require(path.join(dir,'Core/SplineKnot.js'));
        const {SplineKnotGizmos}=require(path.join(dir,'Editor/SplineKnotGizmos.js'));
        const container=new Node('container');
        const otherContainer=new Node('other-container');
        const nodes=['a','b','c'].map(id=>new Node(id));
        const knots=nodes.map((node,i)=>{
            const comp=new SplineKnot();comp.node=node;node.components=[comp];
            node.parent=container;
            node.worldPosition=new Vec3(2*i+10,i+20,i-1);
            return comp;
        });
        container.children=[...nodes];
        const remote=new Node('remote');
        remote.parent=otherContainer;
        const remoteKnot=new SplineKnot();remoteKnot.node=remote;
        remote.components=[remoteKnot];otherContainer.children=[remote];
        container.spline={node:container,dimension:0,count:3,refresh(){},
            knots,getNaturalResolvedKnots(){return [];}};
        otherContainer.spline={dimension:0,count:1,refresh(){}};
        const original=nodes.map(n=>n.worldPosition.clone());
        let selection=['b','a','remote'],snapshots=0;
        globalThis.Editor={
            Selection:{getSelected(){return selection;}},
            Message:{request:async(channel,message)=>{
                assert.equal(channel,'scene');assert.equal(message,'snapshot');snapshots++;
                return true;
            }},
        };
        globalThis.Gizmos3D={
            move:name=>[{property:name,visual:'move'}],
            rotate:name=>[{property:name,visual:'rotate'}],
        };
        const a=new SplineKnotGizmos(knots[0]);
        const b=new SplineKnotGizmos(knots[1]);
        let handles=a.onGizmoHandles();
        assert(handles.some(h=>h.property==='editorGroupWorldPosition'),
            'First selected knot in natural hierarchy becomes pivot');
        handles=b.onGizmoHandles();
        assert(!handles.some(h=>h.property==='editorGroupWorldPosition'),
            'Avoid duplicate group manipulators on other selected knots');
        assert.equal(a.onGizmoHandles().filter(h=>h.property==='editorGroupWorldPosition').length,1);
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        knots[0].editorGroupWorldPosition=new Vec3(13,25,4);
        a.onGizmoChanged('editorGroupWorldPosition','update');
        assert.deepEqual(nodes[0].worldPosition,new Vec3(13,25,4));
        assert.deepEqual(nodes[1].worldPosition,new Vec3(original[1].x+3,original[1].y+5,original[1].z+5));
        assert.deepEqual(nodes[2].worldPosition,original[2],'Unselected knot remains unchanged');
        assert.deepEqual(remote.worldPosition,new Vec3(),'Foreign spline cannot be translated');
        knots[0].editorGroupWorldPosition=new Vec3(14,26,5);
        a.onGizmoChanged('editorGroupWorldPosition','update');
        assert.deepEqual(nodes[1].worldPosition,new Vec3(original[1].x+4,original[1].y+6,original[1].z+6),
            'Absolute baseline prevents cumulative drag drift');
        a.onGizmoChanged('editorGroupWorldPosition','cancel');
        nodes.forEach((node,i)=>assert.deepEqual(node.worldPosition,original[i]));
        assert.equal(snapshots,0,'Cancel must not write Scene undo snapshot');
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        knots[0].editorGroupWorldPosition=new Vec3(11,20,-1);
        a.onGizmoChanged('editorGroupWorldPosition','update');
        a.onGizmoChanged('editorGroupWorldPosition','end');
        assert.equal(snapshots,1,'Exactly one Scene snapshot on successful group drag');
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        a.onGizmoChanged('editorGroupWorldPosition','end');
        assert.equal(snapshots,1,'No-op drag must not snapshot');
        selection=['a'];
        assert(!a.onGizmoHandles().some(h=>h.property==='editorGroupWorldPosition'),
            'A single selected knot has only its individual handles');
        selection=['a','b'];
        container.spline.dimension=1;
        assert(!a.onGizmoHandles().some(h=>h.property==='editorGroupWorldPosition'),
            'Never leave an XY2D spline plane through World movement');
        container.spline.dimension=0;
        selection=['a','remote'];
        assert(!a.onGizmoHandles().some(h=>h.property==='editorGroupWorldPosition'),
            'Nodes from different spline containers are never grouped');
        selection=['a','b'];
        delete globalThis.Editor;
        assert(!a.onGizmoHandles().some(h=>h.property==='editorGroupWorldPosition'),
            'Unavailable Editor Selection must fail closed');
        delete globalThis.Gizmos3D;
        console.log('KNOT GROUP DRAG PASS: direct handle, selected-only translation, cancel, snapshots and 2D guards.');
    }finally{Module._load=old;}
}finally{fs.rmSync(dir,{recursive:true,force:true});}
