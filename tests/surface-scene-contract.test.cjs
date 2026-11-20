'use strict';
const assert=require('node:assert/strict');
const Module=require('node:module');
const {methods}=require('../src/scene.js');
const identity={m00:1,m01:0,m02:0,m03:0,m04:0,m05:1,m06:0,m07:0,
 m08:0,m09:0,m10:1,m11:0,m12:0,m13:0,m14:0,m15:1};
function node(uuid,name){
 return {uuid,name,components:[],children:[],parent:null,worldMatrix:identity};
}
function child(parent,entry){entry.parent=parent;parent.children.push(entry);return entry;}
const scene=node('scene','Scene');
const spline=child(scene,node('spline','Spline'));
  spline.components.push({kind:'Splines.SplineContainer'});
const knot=child(spline,node('knot-1','Knot A'));
knot.components.push({kind:'Splines.SplineKnot'});
const identityRotation={x:0,y:0,z:0,w:1};
spline.worldRotation=identityRotation;
knot.rotation=identityRotation;
const ownedMesh=child(spline,node('own','Own Extrusion'));
const target=child(scene,node('mesh','Ground'));
const bad=child(scene,node('bad','Unreadable'));
const surfacePositions=new Float32Array([-5,2,-5,5,2,-5,-5,2,5,5,2,5]);
const surfaceIndices=new Uint16Array([0,2,1,1,2,3]);
function mesh(allowDataAccess=true,format='RGB32F'){
 return {allowDataAccess,struct:{primitives:[{}],vertexBundles:[{}]},
 readAttribute(){return surfacePositions;},
 readIndices(){return surfaceIndices;},
 readAttributeFormat(){return {name:format};}};
}
target.components.push({kind:'cc.MeshRenderer',mesh:mesh()});
ownedMesh.components.push({kind:'cc.MeshRenderer',mesh:mesh()});
bad.components.push({kind:'cc.MeshRenderer',mesh:mesh(false)});
const original=Module._load;
Module._load=function(req,parent,isMain){
 if(req==='cc')return {
  director:{getScene:()=>scene},
  js:{getClassName:component=>component.kind},
  gfx:{AttributeName:{ATTR_POSITION:'a_position'}},
 };
 return original.apply(this,arguments);
};
try{
 let r=methods.listSurfaceMeshes('spline');
 assert(r.ok,r.error);
 assert.deepEqual(r.targets.map(x=>x.uuid),['mesh']);
 assert(!methods.listSurfaceMeshes('foreign').ok);
 const origins=[{uuid:'k1',position:{x:0,y:4,z:0}}];
 r=methods.snapToMeshSurface('spline','mesh',origins,{height:1,maxDrop:10});
 assert(r.ok,r.error);
 assert.deepEqual(r.hits[0].position,{x:0,y:2,z:0});
 assert.equal(r.triangles,2);
 const normals=methods.snapToMeshSurface('spline','mesh',origins,
  {height:1,maxDrop:10,alignNormal:true});
 assert(normals.ok,normals.error);
 assert.deepEqual(normals.hits[0].normal,{x:0,y:1,z:0});
 const orientations=methods.queryKnotOrientations('spline',['knot-1']);
 assert(orientations.ok,orientations.error);
 assert.deepEqual(orientations.parentRotation,identityRotation);
 assert.deepEqual(orientations.rotations,[{uuid:'knot-1',rotation:identityRotation}]);
 assert(!methods.queryKnotOrientations('spline',['mesh']).ok);
 assert(!methods.queryKnotOrientations('spline',['knot-1','knot-1']).ok);
 assert(!methods.snapToMeshSurface('spline','own',origins).ok,
    'Sculpting should never raycast against spline-owned meshes');
 assert(!methods.snapToMeshSurface('spline','bad',origins).ok,
    'Unreadable mesh must not be modified or raycast');
 assert(!methods.snapToMeshSurface('spline','missing',origins).ok);
 assert(!methods.snapToMeshSurface('spline','mesh',
    [{uuid:'k1',position:{x:40,y:4,z:0}}],{height:10,maxDrop:50}).ok,
    'No-hit returns error so all knots remain unchanged');
 const old=target.components[0].mesh;
 target.components[0].mesh=mesh(true,'RGB16F');
 assert.match(methods.snapToMeshSurface('spline','mesh',origins).error,/RGB32F/);
 target.components[0].mesh=old;
 console.log('SURFACE SCENE CONTRACT PASS: target discovery, normals, read-only rotations, exclusion and fail-closed.');
}finally{Module._load=original;}
