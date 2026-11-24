'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {installSplineExamples,EXAMPLE_FILES,EXAMPLE_FOLDER}=
    require('../dist/SplineExampleInstaller');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-examples-install-'));
try {
 const project=path.join(temp,'My Cocos Project'),assets=path.join(project,'assets');
 fs.mkdirSync(assets,{recursive:true});
 const first=installSplineExamples({projectPath:project,extensionRoot:root});
 assert.equal(first.installed,EXAMPLE_FILES.length);
 assert.equal(first.skipped,0);
 assert.equal(first.assetUrl,'db://assets/CocosSplinesExamples');
 assert.equal(first.folder,path.join(assets,EXAMPLE_FOLDER));
 assert(fs.existsSync(path.join(first.folder,'ExampleGallery.ts')));
 assert(fs.readFileSync(path.join(first.folder,'README.md'),'utf8')
     .includes('CocosSplinesExampleGalleryV2'));
 for(const [relative] of EXAMPLE_FILES){
     const target=path.join(first.folder,...relative.split('/'));
     assert(fs.statSync(target).isFile(),relative);
     assert(!fs.existsSync(target+'.meta'), 'No extension UUIDs should be copied');
 }
 const custom=path.join(first.folder,'ExampleGallery.ts');
 fs.appendFileSync(custom,'\n// USER MODIFICATION PRESERVED\n');
 const second=installSplineExamples({projectPath:project,extensionRoot:root});
 assert.equal(second.installed,0);
 assert.equal(second.skipped,EXAMPLE_FILES.length);
 assert(fs.readFileSync(custom,'utf8').includes('USER MODIFICATION PRESERVED'));
 // Partial re-install only restores missing files, never rewrites user changes.
 fs.unlinkSync(path.join(first.folder,'Road/RoadUvSetup.ts'));
 const third=installSplineExamples({projectPath:project,extensionRoot:root});
 assert.equal(third.installed,1);
 assert.equal(third.skipped,EXAMPLE_FILES.length-1);
 assert(fs.readFileSync(custom,'utf8').includes('USER MODIFICATION PRESERVED'));
 // Directories must never be allowed to escape via symlinks.
 fs.rmSync(path.join(first.folder,'Train'),{recursive:true,force:true});
 const outside=path.join(temp,'outside');fs.mkdirSync(outside);
 fs.symlinkSync(outside,path.join(first.folder,'Train'),'dir');
 assert.throws(()=>installSplineExamples({projectPath:project,extensionRoot:root}),
   /real directory|Unsafe/);
 assert.equal(fs.readdirSync(outside).length,0);
 fs.unlinkSync(path.join(first.folder,'Train'));
 fs.symlinkSync(outside,path.join(first.folder,'README.md')+'.evil');
 // Even the Assets root must be a normal project directory.
 const unsafe=path.join(temp,'Unsafe Project');
 fs.mkdirSync(unsafe);
 fs.symlinkSync(assets,path.join(unsafe,'assets'),'dir');
 assert.throws(()=>installSplineExamples({projectPath:unsafe,extensionRoot:root}),
   /real directory/);
 assert.throws(()=>installSplineExamples({projectPath:'relative-path',extensionRoot:root}),
   /project path/);
 const empty=path.join(temp,'Empty Project');fs.mkdirSync(empty);
 assert.throws(()=>installSplineExamples({projectPath:empty,extensionRoot:root}),
   /ENOENT/);
 assert.equal(fs.existsSync(path.join(empty,'assets')),false);
 // Main-menu dispatch must install into the ACTIVE Editor.Project.path only.
 const other=path.join(temp,'Another Project');
 fs.mkdirSync(path.join(other,'assets'),{recursive:true});
 const messages=[];
 global.Editor={
   Project:{path:other},
   Selection:{getSelected:()=>[]},
   Message:{
     send(...args){messages.push(args);},
     request:async()=>{throw Error('Unexpected scene mutation during installation');},
   },
 };
 const {methods}=require('../dist/main.js');
 (async()=>{
   const result=await methods.installExamples();
   assert(result.ok,result.message);
   assert.equal(result.installed,EXAMPLE_FILES.length);
   assert.deepEqual(messages,[['asset-db','refresh-asset','db://assets']]);
   const again=await methods.installExamples();
   assert(again.ok&&!again.installed);
   assert.equal(messages.length,2);
   assert(fs.existsSync(path.join(other,'assets',EXAMPLE_FOLDER,'ExampleGallery.ts')));
   const manifest=require('../package.json').contributions;
   assert.deepEqual(manifest.messages['install-examples'].methods,['installExamples']);
   assert(manifest.menu.some(m=>m.label==='Install Examples'&&m.message==='install-examples'));
   console.log('INSTALL EXAMPLES PASS: menu, content, safe copy, re-install, non-overwrite, symlink/path checks, asset refresh.');
 })().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
}catch(error){fs.rmSync(temp,{recursive:true,force:true});throw error;}
