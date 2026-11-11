'use strict';
/* Standalone TypeScript/mesh regression tests with no Cocos engine dependency. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-v2-mesh-'));
try{
    cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict','--outDir',temp,
        ...['MeshData','MeshProcessing','MeshBuildPlan'].map(n=>path.resolve(__dirname,'../src-v2/geometry/'+n+'.ts'))],{stdio:'pipe'});
    const {buildMeshV2,validateMeshInputV2}=require(path.join(temp,'MeshData.js'));
    const {splitMeshV2,inspectMeshV2,buildMeshColliderDataV2}=require(path.join(temp,'MeshProcessing.js'));
    const {fingerprintMeshV2,createMeshBuildPlanV2}=require(path.join(temp,'MeshBuildPlan.js'));
    const p=(x,y=0,z=0)=>({x,y,z}),uv=(x,y)=>({x,y});
    const near=(a,b,t=1e-5)=>assert(Math.abs(a-b)<=t,`${a} != ${b}`);
    const input={
        positions:[p(0,0,0),p(1,0,0),p(1,0,1),p(0,0,1)],
        uv0:[uv(0,0),uv(1,0),uv(1,1),uv(0,1)],
        uv2:[uv(.1,.2),uv(.3,.4),uv(.5,.6),uv(.7,.8)],
        submeshes:[{materialSlot:2,indices:[0,2,1]},{materialSlot:7,indices:[0,3,2]}]
    };
    validateMeshInputV2(input);
    const mesh=buildMeshV2(input);
    assert.equal(mesh.vertexCount,4);assert.equal(mesh.triangleCount,2);
    assert.equal(mesh.submeshes.length,2);
    assert.deepEqual(mesh.submeshes.map(s=>s.materialSlot),[2,7]);
    assert(mesh.submeshes[0].indices instanceof Uint16Array);
    assert.deepEqual(mesh.min,p(0,0,0));assert.deepEqual(mesh.max,p(1,0,1));
    for(let i=0;i<4;i++){
        near(mesh.normals[i*3],0);near(mesh.normals[i*3+1],1);near(mesh.normals[i*3+2],0);
        near(mesh.tangents[i*4],1);near(mesh.tangents[i*4+1],0);
        near(mesh.tangents[i*4+2],0);near(mesh.tangents[i*4+3],-1);
    }
    near(mesh.uv2[4],.5);near(mesh.uv2[7],.8);
    const inspect=inspectMeshV2(mesh);
    assert.equal(inspect.degenerateTriangles,0);assert.equal(inspect.boundaryEdges,4);
    assert.equal(inspect.nonManifoldEdges,0);
    const collision=buildMeshColliderDataV2(mesh);
    assert.equal(collision.triangleCount,2);assert.equal(collision.positions.length,18);
    assert.deepEqual(Array.from(collision.materialSlots),[2,7]);

    const flipped=buildMeshV2({...input,uv0:input.uv0.map(t=>uv(t.y,t.x))});
    for(let i=0;i<4;i++)near(flipped.tangents[i*4+3],1);
    const degenerate=buildMeshV2({positions:[p(0),p(0),p(1)],uv0:[uv(0,0),uv(0,0),uv(0,0)],
        submeshes:[{materialSlot:0,indices:[0,1,2]}]});
    assert.equal(inspectMeshV2(degenerate).degenerateTriangles,1);
    assert.equal(buildMeshColliderDataV2(degenerate).triangleCount,0);
    assert(Array.from(degenerate.tangents).every(Number.isFinite));
    assert(Array.from(degenerate.normals).every(Number.isFinite));
    const authored=buildMeshV2({...input,normals:input.positions.map(()=>p(0,1,0)),
        tangents:input.positions.map(()=>({x:1,y:.3,z:0,w:-1}))});
    for(let i=0;i<4;i++){near(authored.tangents[4*i+1],0);near(authored.tangents[4*i+3],-1);}
    const invalid=[
        {...input,positions:[p(NaN)]},
        {...input,uv0:[uv(0,0)]},
        {...input,uv2:[uv(Infinity,0),...input.uv2.slice(1)]},
        {...input,submeshes:[{materialSlot:-1,indices:[0,2,1]}]},
        {...input,submeshes:[{materialSlot:0,indices:[0,2,99]}]},
        {...input,submeshes:[{materialSlot:0,indices:[0,2,.5]}]},
        {...input,submeshes:[{materialSlot:0,indices:[0,2]}]},
        {...input,submeshes:[]},
    ];
    for(const invalidMesh of invalid)assert.throws(()=>buildMeshV2(invalidMesh));
    assert.throws(()=>splitMeshV2(mesh,2),/maxVertices/);

    const pieces=splitMeshV2(mesh,3);
    assert.equal(pieces.length,2);
    assert.deepEqual(pieces.map(c=>c.mesh.submeshes[0].materialSlot),[2,7]);
    assert.deepEqual(pieces.map(c=>c.sourceSubmeshIds),[[0],[1]]);
    assert.deepEqual(pieces.map(c=>Array.from(c.sourceVertexIds)),[[0,2,1],[0,3,2]]);
    for(const piece of pieces){
        for(let i=0;i<piece.mesh.vertexCount;i++){
            const orig=piece.sourceVertexIds[i];
            for(let j=0;j<3;j++)near(piece.mesh.positions[3*i+j],mesh.positions[3*orig+j]);
            for(let j=0;j<2;j++)near(piece.mesh.uv2[2*i+j],mesh.uv2[2*orig+j]);
            for(let j=0;j<4;j++)near(piece.mesh.tangents[4*i+j],mesh.tangents[4*orig+j]);
        }
    }
    const hugeCount=65538;
    const huge=buildMeshV2({positions:Array.from({length:hugeCount},(_,i)=>p(i%3===1?1:0,Math.floor(i/3),i%3===2?1:0)),
        submeshes:[{materialSlot:2,indices:Array.from({length:hugeCount-3},(_,i)=>i)},
                   {materialSlot:7,indices:[hugeCount-3,hugeCount-2,hugeCount-1]}]});
    assert(huge.submeshes[0].indices instanceof Uint32Array);
    const hugeChunks=splitMeshV2(huge,65535);
    assert.equal(hugeChunks.length,2);
    assert.equal(hugeChunks.reduce((a,c)=>a+c.mesh.triangleCount,0),huge.triangleCount);
    assert(hugeChunks.every(c=>c.mesh.vertexCount<=65535 && c.mesh.submeshes.every(s=>s.indices instanceof Uint16Array)));
    assert.deepEqual(hugeChunks.flatMap(c=>c.mesh.submeshes.map(s=>s.materialSlot)),[2,7]);

    const fingerprint=fingerprintMeshV2(mesh);
    assert.equal(fingerprint,fingerprintMeshV2(mesh));
    assert.notEqual(fingerprint,fingerprintMeshV2(mesh,'new profile'));
    const plan=createMeshBuildPlanV2(mesh,{mode:'baked',maxVertices:3,sourceRevision:'profile-1'});
    assert.equal(plan.rebuildOnPlay,false);assert.equal(plan.requiresPersistentAsset,true);
    assert.equal(plan.parts.length,2);assert.equal(plan.parts[0].materialSlot,2);
    assert.equal(plan.parts[1].materialSlot,7);near(plan.parts[1].uv2[0],.1);
    assert(createMeshBuildPlanV2(mesh,{mode:'dynamic'}).rebuildOnPlay);
    assert(!createMeshBuildPlanV2(mesh,{mode:'manual'}).rebuildOnPlay);
    assert.throws(()=>createMeshBuildPlanV2(mesh,{mode:'unknown'}),/Unknown/);
    const edit=buildMeshV2({...input,positions:[p(0,.1,0),...input.positions.slice(1)]});
    assert.notEqual(fingerprintMeshV2(edit),fingerprint);
    const editedUV=buildMeshV2({...input,uv2:[uv(.9,.9),...input.uv2.slice(1)]});
    assert.notEqual(fingerprintMeshV2(editedUV),fingerprint);
    console.log('V2 MESH PIPELINE PASS: submeshes/material slots, UV0/UV2, normals, tangent signs, chunking, collider data, fingerprints, modes');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
