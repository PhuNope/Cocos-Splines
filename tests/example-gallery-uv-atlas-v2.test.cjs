'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'examples/installable/ExampleGallery.ts'),'utf8');
class Vec3 {constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}}
class Color {constructor(r=0,g=0,b=0){this.r=r;this.g=g;this.b=b;}}
class Node {
 constructor(name=''){this.name=name;this.children=[];this.components=[];}
 setParent(parent){this.parent=parent;parent.children.push(this);}
 setPosition(v){this.position=v;}
 setRotationFromEuler(){}
 addComponent(C){
  const value=new C();value.node=this;this.components.push(value);return value;
 }
 getComponent(C){return this.components.find(c=>c instanceof C)||null;}
}
class Component {}
class MeshRenderer extends Component {constructor(){super();this.mesh=null;}}
class JsonAsset {constructor(){this.json=null;}}
class Material {
 initialize(opt){this.effect=opt.effectName;}
 setProperty(name,value){this[name]=value;}
}
class SplineContainer extends Component {refresh(){this.refreshed=true;}}
class SplineKnot extends Component {}
class SplineGeometryGraphRenderer extends Component {
 rebuild(){
  const data=this.profileAssetA?.json;
  assert(data&&data.format==='cocos-splines/profile');
  assert(data.uv.sideIslandMode===2);
  const graph=JSON.parse(this.graphJson);
  const extrude=graph.nodes.find(n=>n.type==='extrude');
  assert.equal(extrude.profileSlot,0);
  assert.equal(this.spline?.refreshed,true);
  assert.equal(this.useGraphAsset,false);
  assert.equal(this.rebuildOnChange,false);
  assert(this.material);
  this.node.getComponent(MeshRenderer).mesh={positions:[1,2,3],uv:data.uv};
  observed.push(this);
 }
}
const observed=[];
const decorators={
 ccclass:()=>C=>C,property:()=>()=>{},menu:()=>C=>C,
 executeInEditMode:()=>C=>C,requireComponent:()=>C=>C,
};
const cc={_decorator:decorators,Component,Node,Vec3,Color,MeshRenderer,
 Camera:class extends Component {},DirectionalLight:class extends Component {},
 Material,Prefab:class{},JsonAsset,primitives:{},utils:{},Enum:x=>x,
};
const mocks={SplineContainer:{SplineContainer},SplineKnot:{SplineKnot,TangentMode:{AutoSmooth:1}},
 SplineGeometryGraphRenderer:{SplineGeometryGraphRenderer}};
const requireMock=name=>{
 if(name==='cc')return cc;
 const last=name.slice(name.lastIndexOf('/')+1);
 return mocks[last]||new Proxy({},{get:()=>class extends Component {}});
};
const result=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,
 experimentalDecorators:true,
},reportDiagnostics:true});
assert.equal(result.diagnostics.length,0);
const out={exports:{}};
new Function('require','module','exports',result.outputText)(requireMock,out,out.exports);
const {CocosSplinesExampleGalleryV2, SplineExampleKind}=out.exports;
assert.equal(SplineExampleKind.GeometryGraphUVAtlas,13);
const gallery=new CocosSplinesExampleGalleryV2();
gallery.node=new Node('Gallery');
gallery.example=SplineExampleKind.GeometryGraphUVAtlas;
gallery.start();
assert.equal(observed.length,2,'Gallery Play creates a pair of independent graph renderers');
assert.equal(gallery.node.children.length,4,'Camera + Light + two spline hierarchies');
assert(observed[0].node.name.includes('UV regular'));
assert(observed[1].node.name.includes('UV Atlas'));
const normal=observed[0].profileAssetA.json,packed=observed[1].profileAssetA.json;
assert.equal(normal.uv.atlasPacking,undefined);
assert.equal(normal.uv.atlasPadding,undefined);
assert.equal(packed.uv.atlasPacking,true);
assert.equal(packed.uv.atlasPadding,.06);
assert.deepEqual(normal.points,packed.points);
assert.notEqual(normal,packed,'Runtime profiles must have separate instances');
const presetGraph=JSON.parse(fs.readFileSync(path.join(root,
 'examples/installable/GeometryGraph/UVIslandExtrudeGraph.json'),'utf8'));
const presetProfile=JSON.parse(fs.readFileSync(path.join(root,
 'examples/installable/GeometryGraph/Profiles/UVAtlasProfile.json'),'utf8'));
assert.deepEqual(JSON.parse(observed[0].graphJson),presetGraph,
 'Built-in Gallery graph must stay aligned with Install Examples preset');
assert.deepEqual(packed,presetProfile,
 'Built-in Gallery profile must match Install Examples preset');
const once=observed.length;gallery.start();
assert.equal(observed.length,once,'start() is idempotent for the same Gallery');
const overridden=new CocosSplinesExampleGalleryV2();
overridden.node=new Node('Edited Gallery');
overridden.example=SplineExampleKind.GeometryGraphUVAtlas;
const authorProfile={...presetProfile,uv:{...presetProfile.uv,atlasPadding:.12}};
const authorGraph={...presetGraph};
const original=JSON.stringify(authorProfile);
overridden.uvAtlasProfile={json:authorProfile};
overridden.uvAtlasGraph={json:authorGraph};
const checker=new Material();overridden.uvAtlasPreviewMaterial=checker;
overridden.start();
assert.equal(observed.length,4);
assert.equal(JSON.stringify(authorProfile),original,'Gallery must not mutate assigned author asset');
assert.equal(observed[3].profileAssetA.json.uv.atlasPadding,.12);
assert.equal(observed[2].profileAssetA.json.uv.atlasPadding,undefined);
assert.equal(observed[3].material,checker);
assert.equal(observed[2].material,checker);
assert.notEqual(observed[3].profileAssetA,overridden.uvAtlasProfile,
 'Even provided Profile JsonAsset must be cloned for a temporary runtime mesh');
const triangleMode=new CocosSplinesExampleGalleryV2();
triangleMode.node=new Node('Triangle Gallery');
triangleMode.example=SplineExampleKind.GeometryGraphTriangleUV;
triangleMode.start();
assert.equal(SplineExampleKind.GeometryGraphTriangleUV,14);
assert.equal(observed.length,6,'New mode generates two Graph renderers');
const left=observed[4].profileAssetA.json,right=observed[5].profileAssetA.json;
assert.equal(left.uv.triangleUnwrap,undefined);
assert.equal(left.uv.atlasPacking,undefined);
assert.equal(right.uv.triangleUnwrap,true);
assert.equal(right.uv.atlasPacking,true);
assert.equal(right.uv.atlasPadding,.06);
const triangleFile=JSON.parse(fs.readFileSync(path.join(root,
 'examples/installable/GeometryGraph/Profiles/UVTriangleUnwrapProfile.json'),'utf8'));
assert.deepEqual(right,triangleFile,
 'Gallery triangle mode must match the installable authored Profile example');
assert.notEqual(left,right,'Runtime modes use independent transient JsonAssets');
const advancedMode=new CocosSplinesExampleGalleryV2();
advancedMode.node=new Node('Advanced Atlas Gallery');
advancedMode.example=SplineExampleKind.GeometryGraphAdvancedAtlas;
advancedMode.start();
assert.equal(SplineExampleKind.GeometryGraphAdvancedAtlas,15);
assert.equal(observed.length,8);
const advancedLeft=observed[6].profileAssetA.json,advancedRight=observed[7].profileAssetA.json;
assert.equal(advancedLeft.uv.atlasPacking,true);
assert.equal(advancedLeft.uv.triangleUnwrap,true);
assert.equal(advancedLeft.uv.atlasRotate,undefined);
assert.equal(advancedLeft.uv.atlasPixelPadding,undefined);
assert.equal(advancedRight.uv.atlasPacking,true);
assert.equal(advancedRight.uv.triangleUnwrap,true);
assert.equal(advancedRight.uv.atlasRotate,true);
assert.deepEqual(advancedRight.uv.atlasPixelPadding,{resolution:1024,pixels:4});
const hollowMode=new CocosSplinesExampleGalleryV2();
hollowMode.node=new Node('Hollow Gallery');
hollowMode.example=SplineExampleKind.GeometryGraphProfileHoles;
hollowMode.start();
assert.equal(SplineExampleKind.GeometryGraphProfileHoles,16);
assert.equal(observed.length,10);
assert.equal(observed[8].profileAssetA.json.holes,undefined);
assert.equal(observed[9].profileAssetA.json.holes.length,2);
assert.equal(observed[9].profileAssetA.json.uv.atlasPacking,undefined);
assert(require(root+'/package.json').scripts.test.includes('example-gallery-uv-atlas-v2.test.cjs'));
console.log('EXAMPLE UV ATLAS GALLERY V2 PASS: Play creates two Geometry Graph renderers without asset drag/drop, preserves author assets, clones Profile JSON, and keeps original enum IDs.');
