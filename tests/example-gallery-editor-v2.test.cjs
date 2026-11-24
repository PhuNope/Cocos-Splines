'use strict';
const assert=require('node:assert/strict');
const {createExampleGalleryWorkflow,EXAMPLE_GALLERY_NAME,EXAMPLE_GALLERY_CLASS}=
    require('../dist/SplineExampleSceneWorkflow');
const {queryExampleGalleryScene}=require('../dist/SplineExampleScene');
const root={uuid:'scene-A',isValid:true,children:[]};
const classOf=component=>component.kind;
const inspect=()=>queryExampleGalleryScene(root,classOf);
const node=(id,components=[])=>({uuid:id,name:id,isValid:true,
    children:[],components});
const opts=()=>{
    const log=[];
    return {log,query:async()=>inspect(),scriptReady:async()=>true,
        createNode:async(name)=>{
            log.push(['create',name]);
            const id='gallery-'+(log.filter(x=>x[0]==='create').length);
            const value=node(id);
            value.name=name;root.children.push(value);return id;
        },
        addComponent:async(uuid,name)=>{
            log.push(['component',uuid,name]);
            root.children.find(n=>n.uuid===uuid).components.push({kind:name});
            return true;
        },
        snapshot:async()=>{log.push(['snapshot']);return true;},
        removeNode:async(uuid)=>{
            log.push(['remove',uuid]);
            root.children.splice(root.children.findIndex(n=>n.uuid===uuid),1);
            return true;
        },
        select:async(uuid)=>{log.push(['select',uuid]);},
    };
};
(async()=>{
    assert.deepEqual(queryExampleGalleryScene(null,classOf).ok,false);
    assert.equal(inspect().found,false);
    assert.equal(EXAMPLE_GALLERY_NAME,'Spline Example Gallery');
    assert.equal(EXAMPLE_GALLERY_CLASS,'CocosSplinesExampleGalleryV2');
    const initial=opts();
    const result=await createExampleGalleryWorkflow(initial);
    assert(result.ok&&result.created);
    assert.equal(result.uuid,'gallery-1');
    assert.equal(initial.log.filter(e=>e[0]==='snapshot').length,1);
    assert.equal(inspect().uuid,'gallery-1');
    assert.equal(root.children.length,1);
    assert.equal(root.children[0].name,'Spline Example Gallery');
    const same=await createExampleGalleryWorkflow(initial);
    assert(same.ok&&!same.created);
    assert.equal(root.children.length,1,'Existing gallery must not be duplicated');
    assert.equal(initial.log.filter(e=>e[0]==='snapshot').length,1);
    assert.equal(initial.log.filter(e=>e[0]==='create').length,1);
    // Missing compiled component must abort BEFORE any Scene mutation.
    root.children=[];
    const missing=opts();missing.scriptReady=async()=>false;
    await assert.rejects(()=>createExampleGalleryWorkflow(missing),/not compiled/);
    assert.equal(missing.log.length,0);
    // Failed native component creation rolls back only the fresh node.
    const reject=opts();reject.addComponent=async()=>false;
    await assert.rejects(()=>createExampleGalleryWorkflow(reject),/component/);
    assert.equal(root.children.length,0);
    assert.equal(reject.log.filter(e=>e[0]==='remove').length,1);
    assert.equal(reject.log.filter(e=>e[0]==='snapshot').length,0);
    // Scene switch mid-workflow must never invoke cleanup on another scene.
    const switched=opts();
    switched.addComponent=async()=>{
        root.uuid='scene-B';return true;
    };
    await assert.rejects(()=>createExampleGalleryWorkflow(switched),/Scene changed/);
    assert.equal(switched.log.filter(e=>e[0]==='remove').length,0);
    root.children=[];root.uuid='scene-A';
    // Snapshot failures attempt cleanup and report failure honestly.
    const unsaved=opts();unsaved.snapshot=async()=>false;
    await assert.rejects(()=>createExampleGalleryWorkflow(unsaved),/snapshot/);
    assert.equal(root.children.length,0);
    assert.equal(unsaved.log.filter(e=>e[0]==='remove').length,1);
    // Selecting after successful snapshot cannot invalidate created Scene.
    const noSelect=opts();noSelect.select=async()=>{throw Error('select unavailable');};
    const created=await createExampleGalleryWorkflow(noSelect);
    assert(created.ok&&created.created&&/manually/.test(created.message));
    assert.equal(root.children.length,1);
    root.children=[];
    // Main extension's public menu action (not just isolated workflow).
    const messages=[],selected=[];
    let scriptReady=true;
    global.Editor={
        Project:{path:'/tmp/no-write'},
        Selection:{
            getSelected:()=>selected.slice(),
            clear:()=>selected.splice(0),
            select:(_kind,uuid)=>selected.push(uuid),
        },
        Message:{request:async(channel,method,payload)=>{
            assert.equal(channel,'scene');
            messages.push([method,payload]);
            if(method==='execute-scene-script'){
                assert.equal(payload.method,'queryExampleGallery');
                return inspect();
            }
            if(method==='query-component-has-script'){
                assert.equal(payload,EXAMPLE_GALLERY_CLASS);
                return scriptReady;
            }
            if(method==='create-node'){
                assert.equal(payload.snapshot,false);
                const n=node('gallery-editor');n.name=payload.name;
                root.children.push(n);return n.uuid;
            }
            if(method==='create-component'){
                const n=root.children.find(x=>x.uuid===payload.uuid);
                n.components.push({kind:payload.component});return true;
            }
            if(method==='snapshot')return true;
            if(method==='remove-node'){
                root.children=root.children.filter(n=>n.uuid!==payload.uuid);
                return true;
            }
            throw Error('Unexpected scene IPC '+method);
        }},
    };
    const {methods}=require('../dist/main.js');
    const done=await methods.createExampleGallery();
    assert(done.ok&&done.created,done.error);
    assert.equal(selected[0],'gallery-editor');
    assert.equal(messages.filter(x=>x[0]==='snapshot').length,1);
    const again=await methods.createExampleGallery();
    assert(again.ok&&!again.created);
    assert.equal(messages.filter(x=>x[0]==='snapshot').length,1);
    const manifest=require('../package.json').contributions;
    assert.deepEqual(manifest.messages['create-example-gallery'].methods,
        ['createExampleGallery']);
    assert(manifest.menu.some(m=>m.message==='create-example-gallery'));
    root.children=[];
    scriptReady=false;
    const before=messages.length;
    const abort=await methods.createExampleGallery();
    assert(!abort.ok&&/not compiled/.test(abort.error));
    assert.equal(messages.slice(before).filter(x=>x[0]==='create-node').length,0);
    console.log('EXAMPLE GALLERY EDITOR PASS: scene lease, preflight, duplicate detection, one snapshot, cleanup, menu dispatch.');
})().catch(e=>{console.error(e);process.exitCode=1;});
