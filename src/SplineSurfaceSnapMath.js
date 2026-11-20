'use strict';
/**
 * Editor-independent downward mesh raycast. All triangles are interpreted
 * in WORLD coordinates after applying renderer.node.worldMatrix. Results are
 * deterministic and two-sided; there is no Physics Collider dependency.
 */
const MAX_TRIANGLES=20000;
const MAX_KNOTS=64;
const valid=p=>p&&['x','y','z'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]));
const validMatrix=m=>Array.isArray(m)&&m.length===16&&m.every(Number.isFinite)&&
    [3,7,11].every(i=>Math.abs(m[i])<1e-7)&&Math.abs(m[15]-1)<1e-7;
function prepareSurface(positions,indices,matrix){
    if(!Array.isArray(positions)||!Array.isArray(indices)||!validMatrix(matrix)||
        positions.length<9||positions.length%3!==0||indices.length<3||indices.length%3!==0||
        !positions.every(Number.isFinite))
        throw Error('Invalid readable triangle mesh geometry or world transform.');
    const vertexCount=positions.length/3,triangleCount=indices.length/3;
    if(triangleCount>MAX_TRIANGLES)throw Error('Surface exceeds 20,000 triangles; use a lower-poly mesh.');
    const transformed=new Array(positions.length);
    for(let i=0;i<positions.length;i+=3){
        const x=positions[i],y=positions[i+1],z=positions[i+2];
        transformed[i]=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12];
        transformed[i+1]=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13];
        transformed[i+2]=matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14];
    }
    for(const index of indices)if(!Number.isInteger(index)||index<0||index>=vertexCount)
        throw Error('Surface mesh has invalid triangle indices.');
    return {positions:transformed,indices,triangleCount};
}
/**
 * Mesh winding can face either way. Surface alignment treats the upward
 * hemisphere as the target so inverted triangle winding is harmless.
 */
function triangleUpNormal(surface,triangle){
    const p=surface.positions,ix=surface.indices;
    const a=ix[triangle*3]*3,b=ix[triangle*3+1]*3,c=ix[triangle*3+2]*3;
    const ab={x:p[b]-p[a],y:p[b+1]-p[a+1],z:p[b+2]-p[a+2]};
    const ac={x:p[c]-p[a],y:p[c+1]-p[a+1],z:p[c+2]-p[a+2]};
    let x=ab.y*ac.z-ab.z*ac.y;
    let y=ab.z*ac.x-ab.x*ac.z;
    let z=ab.x*ac.y-ab.y*ac.x;
    const length=Math.hypot(x,y,z);
    if(!(length>1e-12)||!Number.isFinite(length))
        throw Error('Surface triangle normal is degenerate.');
    x/=length;y/=length;z/=length;
    if(y<0){x=-x;y=-y;z=-z;}
    // Very steep faces provide an unstable up direction for the knot and
    // can produce unexpected flips near vertically oriented triangles.
    if(y<.05)throw Error('Surface too steep to align Knot Up; disable Align Normal.');
    return {x:x||0,y:y||0,z:z||0};
}

/**
 * Area-weighted smoothing over SHARED vertex indices, constrained by a
 * face-to-face crease angle. Explicit split vertices remain hard edges.
 * Built per surface ray batch only when smoothing is requested.
 */
function smoothingData(surface){
    const {positions:p,indices:ix,triangleCount}=surface;
    const adjacent=Array.from({length:p.length/3},()=>[]);
    const normals=new Array(triangleCount),areas=new Array(triangleCount);
    for(let tri=0;tri<triangleCount;tri++){
        const ia=ix[tri*3],ib=ix[tri*3+1],ic=ix[tri*3+2];
        const a=ia*3,b=ib*3,c=ic*3;
        const abx=p[b]-p[a],aby=p[b+1]-p[a+1],abz=p[b+2]-p[a+2];
        const acx=p[c]-p[a],acy=p[c+1]-p[a+1],acz=p[c+2]-p[a+2];
        let x=aby*acz-abz*acy;
        let y=abz*acx-abx*acz;
        let z=abx*acy-aby*acx;
        const area2=Math.hypot(x,y,z);
        if(area2>1e-12&&Number.isFinite(area2)){
            x/=area2;y/=area2;z/=area2;
            if(y<0){x=-x;y=-y;z=-z;}
            normals[tri]={x,y,z};
            areas[tri]=area2;
            adjacent[ia].push(tri);
            adjacent[ib].push(tri);
            adjacent[ic].push(tri);
        }else{
            normals[tri]=null;
            areas[tri]=0;
        }
    }
    return {adjacent,normals,areas};
}
function smoothHitNormal(surface,triangle,weights,creaseCos,prepared){
    const {indices:ix}=surface,{adjacent,normals,areas}=prepared;
    const base=normals[triangle];
    if(!base||base.y<.05)
        throw Error('Surface too steep or degenerate to align Knot Up; disable Align Normal.');
    const vectors=[];
    for(let corner=0;corner<3;corner++){
        const vertex=ix[triangle*3+corner];
        let x=0,y=0,z=0;
        for(const face of adjacent[vertex]){
            const normal=normals[face];
            if(!normal||normal.y<.05)continue;
            const similarity=normal.x*base.x+normal.y*base.y+normal.z*base.z;
            if(similarity+1e-10<creaseCos)continue;
            const area=areas[face];
            x+=normal.x*area;y+=normal.y*area;z+=normal.z*area;
        }
        const magnitude=Math.hypot(x,y,z);
        if(!(magnitude>1e-12))throw Error('Could not smooth surface normal.');
        vectors.push({x:x/magnitude,y:y/magnitude,z:z/magnitude});
    }
    let x=0,y=0,z=0;
    for(let i=0;i<3;i++){
        x+=vectors[i].x*weights[i];
        y+=vectors[i].y*weights[i];
        z+=vectors[i].z*weights[i];
    }
    const magnitude=Math.hypot(x,y,z);
    if(!(magnitude>1e-12)||!Number.isFinite(magnitude))
        throw Error('Smoothed normal has no stable direction.');
    x/=magnitude;y/=magnitude;z/=magnitude;
    if(y<.05)throw Error('Smoothed normal is too steep to align Knot Up.');
    return {x:x||0,y:y||0,z:z||0};
}

function castDown(surface,point,height=10,maxDrop=100,withNormal=false,smoothing=null){
    if(!valid(point)||!Number.isFinite(height)||height<0||height>1e6||
       !Number.isFinite(maxDrop)||maxDrop<=0||maxDrop>1e6)
        throw Error('Surface ray parameters must be finite; height >= 0 and maxDrop > 0.');
    const {positions:p,indices:ix,triangleCount}=surface;
    const startY=point.y+height,minY=startY-maxDrop;
    let bestY=-Infinity,bestTriangle=-1,bestWeights=null;
    const eps=1e-9;
    for(let tri=0;tri<triangleCount;tri++){
        const n=tri*3,a=ix[n]*3,b=ix[n+1]*3,c=ix[n+2]*3;
        const ax=p[a],az=p[a+2],bx=p[b],bz=p[b+2],cx=p[c],cz=p[c+2];
        if(point.x<Math.min(ax,bx,cx)-eps||point.x>Math.max(ax,bx,cx)+eps||
           point.z<Math.min(az,bz,cz)-eps||point.z>Math.max(az,bz,cz)+eps)continue;
        const det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
        if(Math.abs(det)<=eps)continue; // vertical or degenerate triangle
        const u=((bz-cz)*(point.x-cx)+(cx-bx)*(point.z-cz))/det;
        const v=((cz-az)*(point.x-cx)+(ax-cx)*(point.z-cz))/det;
        const w=1-u-v;
        if(u<-eps||v<-eps||w<-eps)continue;
        const y=u*p[a+1]+v*p[b+1]+w*p[c+1];
        if(y>startY+eps||y<minY-eps||y<=bestY)continue;
        bestY=y;bestTriangle=tri;bestWeights=[u,v,w];
    }
    if(bestTriangle<0)return null;
    const result={x:point.x,y:bestY,z:point.z,triangle:bestTriangle};
    if(withNormal)result.normal=smoothing?
        smoothHitNormal(surface,bestTriangle,bestWeights,smoothing.creaseCos,smoothing.prepared):
        triangleUpNormal(surface,bestTriangle);
    return result;
}
function snapOrigins(surface,entries,options={}){
    if(!Array.isArray(entries)||entries.length<1||entries.length>MAX_KNOTS||
        entries.some(item=>typeof item?.uuid!=='string'||!item.uuid||!valid(item.position))||
        new Set(entries.map(e=>e.uuid)).size!==entries.length)
        throw Error('Select 1 to 64 distinct Knots with valid world positions.');
    const height=options.height===undefined?10:options.height;
    const maxDrop=options.maxDrop===undefined?100:options.maxDrop;
    const hits=[];
    const alignNormal=options.alignNormal===true;
    const smoothNormal=alignNormal&&options.smoothNormal===true;
    let smoothing=null;
    if(smoothNormal){
        const creaseAngle=options.creaseAngle===undefined?60:options.creaseAngle;
        if(typeof creaseAngle!=='number'||!Number.isFinite(creaseAngle)||
           creaseAngle<0||creaseAngle>89)
            throw Error('Normal smoothing crease angle must be from 0 to 89 degrees.');
        smoothing={creaseCos:Math.cos(creaseAngle*Math.PI/180),prepared:smoothingData(surface)};
    }
    for(const entry of entries){
        const hit=castDown(surface,entry.position,height,maxDrop,alignNormal,smoothing);
        if(!hit)throw Error('No surface directly below Knot '+entry.uuid+
            ' within cast height and max drop. No changes were applied.');
        const item={uuid:entry.uuid,position:{x:hit.x,y:hit.y,z:hit.z},triangle:hit.triangle};
        if(alignNormal)item.normal=hit.normal;
        hits.push(item);
    }
    return hits;
}
module.exports={MAX_TRIANGLES,MAX_KNOTS,prepareSurface,castDown,snapOrigins,triangleUpNormal,smoothingData,smoothHitNormal};
