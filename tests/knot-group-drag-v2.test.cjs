'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-group-move-'));
(async()=>{
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
        setWorldPosition(value){this.worldPosition=value.clone();this.position=value.clone();}
        setPosition(value){this.position=value.clone();this.worldPosition=value.clone();}
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
        let selection=['b','a','remote'],snapshots=0,failSnapshot=false;
        let delayedSnapshot=null;
        const writes=[];
        globalThis.Editor={
            Selection:{getSelected(){return selection;}},
            Message:{request:(channel,message,payload)=>{
                assert.equal(channel,'scene');
                if(message==='set-property'){
                    assert.equal(payload.path,'position');
                    assert.equal(payload.record,false);
                    assert.equal(payload.dump.type,'cc.Vec3');
                    writes.push(payload);
                    const node=nodes.find(node=>node.uuid===payload.uuid);
                    assert(node,'Unknown Knot '+payload.uuid);
                    node.setPosition(new Vec3(...['x','y','z'].map(k=>payload.dump.value[k])));
                    return true;
                }
                assert.equal(message,'snapshot');snapshots++;
                return delayedSnapshot||!failSnapshot;
            }},
        };
        globalThis.Gizmos3D={
            supportsExternalHistory:true,
            move:(name,options)=>{
                if(name==='editorGroupWorldPosition')assert.equal(options.history,'external');
                return [{property:name,visual:'move'}];
            },
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
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(writes.length,2,'Both Knot positions are written through serialized Scene API');
        assert.equal(snapshots,1,'Exactly one Scene snapshot on successful group drag');
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        a.onGizmoChanged('editorGroupWorldPosition','end');
        assert.equal(snapshots,1,'No-op drag must not snapshot');
        const savedWorld=nodes.map(node=>node.worldPosition.clone());
        failSnapshot=true;
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        knots[0].editorGroupWorldPosition=new Vec3(20,29,4);
        a.onGizmoChanged('editorGroupWorldPosition','update');
        a.onGizmoChanged('editorGroupWorldPosition','end');
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(snapshots,2,'Failed snapshot was attempted exactly once');
        nodes.forEach((node,i)=>assert.deepEqual(node.worldPosition,savedWorld[i],
            'Group snapshot failure restores every selected Knot'));
        failSnapshot=false;
        // Selection changes without a plugin 'cancel' callback must still
        // invalidate at End and restore only the group created by this drag.
        const beforeSelectionChange=nodes.map(node=>node.worldPosition.clone());
        selection=['a','b'];
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        knots[0].editorGroupWorldPosition=new Vec3(30,30,9);
        a.onGizmoChanged('editorGroupWorldPosition','update');
        selection=['a']; // b was deselected
        a.onGizmoChanged('editorGroupWorldPosition','end');
        assert.equal(snapshots,2,'Selection invalidation does not snapshot');
        nodes.forEach((node,i)=>assert.deepEqual(node.worldPosition,beforeSelectionChange[i]));
        // Redraw callbacks can invalidate a gesture before the native adapter
        // dispatches cancel. A later End must remain a no-op.
        selection=['a','b'];
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        knots[0].editorGroupWorldPosition=new Vec3(35,30,9);
        a.onGizmoChanged('editorGroupWorldPosition','update');
        selection=['a'];
        a.onGizmoHandles();
        a.onGizmoChanged('editorGroupWorldPosition','end');
        assert.equal(snapshots,2);
        nodes.forEach((node,i)=>assert.deepEqual(node.worldPosition,beforeSelectionChange[i]));
        // Reparent a Knot while dragging: restore the unchanged owner, never
        // move a Node that is now owned by a different container.
        selection=['a','b'];
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        knots[0].editorGroupWorldPosition=new Vec3(33,30,9);
        a.onGizmoChanged('editorGroupWorldPosition','update');
        const movedB=nodes[1].worldPosition.clone();
        nodes[1].parent=otherContainer;
        a.onGizmoChanged('editorGroupWorldPosition','end');
        assert.deepEqual(nodes[0].worldPosition,beforeSelectionChange[0]);
        assert.deepEqual(nodes[1].worldPosition,movedB,'Reparented Knot is not rewritten');
        assert.equal(snapshots,2);
        nodes[1].parent=container;
        nodes[1].setWorldPosition(beforeSelectionChange[1]);
        // Deleted knot cannot produce snapshot, but surviving owner rolls back.
        selection=['a','b'];
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        knots[0].editorGroupWorldPosition=new Vec3(28,29,7);
        a.onGizmoChanged('editorGroupWorldPosition','update');
        nodes[1].isValid=false;
        a.onGizmoChanged('editorGroupWorldPosition','end');
        assert.deepEqual(nodes[0].worldPosition,beforeSelectionChange[0]);
        assert.equal(snapshots,2);
        nodes[1].isValid=true;
        nodes[1].setWorldPosition(beforeSelectionChange[1]);
        // Disabled spline must invalidate an otherwise valid selection.
        selection=['a','b'];
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        knots[0].editorGroupWorldPosition=new Vec3(42,44,10);
        a.onGizmoChanged('editorGroupWorldPosition','update');
        container.spline.enabled=false;
        a.onGizmoChanged('editorGroupWorldPosition','end');
        assert.equal(snapshots,2);
        nodes.forEach((node,i)=>assert.deepEqual(node.worldPosition,beforeSelectionChange[i]));
        container.spline.enabled=true;
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
        // A pending async history commit must block even a DIFFERENT Knot
        // drawer from starting a second tangent or group transaction.
        selection=['a','b'];
        let resolveSnapshot;
        delayedSnapshot=new Promise(resolve=>{resolveSnapshot=resolve;});
        const savedForGate=nodes.map(n=>n.worldPosition.clone());
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        knots[0].editorGroupWorldPosition=new Vec3(
            savedForGate[0].x+2,savedForGate[0].y+4,savedForGate[0].z+1);
        a.onGizmoChanged('editorGroupWorldPosition','update');
        a.onGizmoChanged('editorGroupWorldPosition','end');
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(snapshots,3,'Third commit is waiting on Scene IPC');
        assert.equal(a.onGizmoHandles().length,0,'Owning drawer hides all handles until commit');
        assert.equal(b.onGizmoHandles().length,0,'Other Knot drawer is also held');
        assert.throws(
            ()=>b.onGizmoChanged('editorTangentOut','begin'),
            /still committing/,
            'No second gesture may write into the same spline during snapshot IPC');
        resolveSnapshot(true);
        await new Promise(resolve=>setImmediate(resolve));
        assert(a.onGizmoHandles().length>0,'Handles return once commit completes');
        b.onGizmoChanged('editorTangentOut','begin');
        b.onGizmoChanged('editorTangentOut','cancel');
        assert.equal(snapshots,3,'Cancel after unlock does not create history');
        // Unloading a Scene while the drag is still active invalidates the
        // original ancestor lease, even though old Knot objects still exist
        // in memory. No snapshot or restoration may target the next Scene.
        const originalScene=new Node('scene-before-reload');
        container.parent=originalScene;
        selection=['a','b'];
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        const preUnload=nodes[0].worldPosition.clone();
        knots[0].editorGroupWorldPosition=new Vec3(
            preUnload.x+7,preUnload.y+3,preUnload.z+2);
        a.onGizmoChanged('editorGroupWorldPosition','update');
        const staleWorld=nodes[0].worldPosition.clone();
        originalScene.isValid=false;
        a.onGizmoChanged('editorGroupWorldPosition','end');
        assert.equal(snapshots,3,'No Group Move snapshot after Scene unload');
        assert.deepEqual(nodes[0].worldPosition,staleWorld,
            'Never restore unloaded Scene nodes through stale callbacks');
        // Replacing the Scene root with a different Node bearing the same
        // UUID is also stale: identity, not name/UUID, defines this lease.
        originalScene.isValid=true;
        a.onGizmoChanged('editorGroupWorldPosition','begin');
        const replacementScene=new Node('scene-before-reload');
        container.parent=replacementScene;
        a.onGizmoChanged('editorGroupWorldPosition','end');
        assert.equal(snapshots,3);
        container.parent=null;
        delete globalThis.Editor;
        assert(!a.onGizmoHandles().some(h=>h.property==='editorGroupWorldPosition'),
            'Unavailable Editor Selection must fail closed');
        delete globalThis.Gizmos3D;
        console.log('KNOT GROUP DRAG PASS: direct handle, selected-only translation, cancel, snapshots and 2D guards.');
    }finally{Module._load=old;}
}finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
