'use strict';
/**
 * Pure, read-only adapter for Cocos 3D Physics raycast results.
 * Only the explicitly selected node's Collider components can win.
 * Results supplied by PhysicsSystem are copied synchronously because
 * the engine reuses its raycast results across calls.
 */
const MAX_KNOTS=64;
const finite=p=>!!p&&['x','y','z'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]));
function validateBatch(entries,options={}){
    if(!Array.isArray(entries)||entries.length<1||entries.length>MAX_KNOTS||
        entries.some(e=>typeof e?.uuid!=='string'||!e.uuid||!finite(e.position))||
        new Set(entries.map(e=>e.uuid)).size!==entries.length)
        throw Error('Select 1 to 64 distinct 3D Knots with finite world positions.');
    const height=options.height===undefined?10:options.height;
    const maxDrop=options.maxDrop===undefined?100:options.maxDrop;
    if(typeof height!=='number'||!Number.isFinite(height)||height<0||height>1e6||
       typeof maxDrop!=='number'||!Number.isFinite(maxDrop)||maxDrop<=0||maxDrop>1e6)
        throw Error('Collider ray start height must be >= 0 and depth > 0 (both <= 1,000,000).');
    if(options.alignNormal===true&&options.smoothNormal===true)
        throw Error('Smooth Normal is only available for readable MeshRenderer targets; disable it for Collider.');
    return {height,maxDrop,alignNormal:options.alignNormal===true};
}
function upwardNormal(value){
    if(!finite(value))throw Error('Physics backend did not return a valid hit normal; turn off Align Normal.');
    let x=value.x,y=value.y,z=value.z;
    const size=Math.hypot(x,y,z);
    if(!(size>1e-12))throw Error('Physics backend returned a zero hit normal.');
    x/=size;y/=size;z/=size;
    if(y<0){x=-x;y=-y;z=-z;}
    if(y<.05)throw Error('Collider surface is too steep to align Knot Up; disable Align Normal.');
    return {x:x||0,y:y||0,z:z||0};
}
function nearestTargetHit(results,colliders,origin,depth,alignNormal){
    if(!Array.isArray(results))throw Error('Physics raycast results unavailable.');
    let best=null,bestDistance=Infinity;
    for(const hit of results){
        if(!hit||!colliders.has(hit.collider))continue;
        const distance=hit.distance,p=hit.hitPoint;
        if(typeof distance!=='number'||!Number.isFinite(distance)||
           distance<0||distance>depth+1e-5||!finite(p))continue;
        // Raycast is vertical. Reject unrelated or internally inconsistent
        // hit points; never accidentally snap onto a different Scene node.
        if(Math.abs(p.x-origin.x)>1e-3||Math.abs(p.z-origin.z)>1e-3||
           Math.abs(p.y-(origin.y-distance))>1e-3)continue;
        if(distance<bestDistance){
            bestDistance=distance;
            best={position:{x:p.x,y:p.y,z:p.z},normal:alignNormal?upwardNormal(hit.hitNormal):null};
        }
    }
    return best;
}
function snapColliderOrigins(entries,colliderComponents,options,raycast){
    const {height,maxDrop,alignNormal}=validateBatch(entries,options);
    if(!Array.isArray(colliderComponents)||!colliderComponents.length||
       typeof raycast!=='function')throw Error('Selected Collider or Physics raycast is unavailable.');
    const selected=new Set(colliderComponents);
    const hits=[];
    for(const entry of entries){
        const origin={x:entry.position.x,y:entry.position.y+height,z:entry.position.z};
        if(!finite(origin))throw Error('Collider ray origin is not finite.');
        const results=raycast(origin,maxDrop);
        const best=nearestTargetHit(results,selected,origin,maxDrop,alignNormal);
        if(!best)throw Error('No hit on the selected Collider below Knot '+entry.uuid+
            '; all Knot positions remain unchanged.');
        const hit={uuid:entry.uuid,position:best.position};
        if(alignNormal)hit.normal=best.normal;
        hits.push(hit);
    }
    return hits;
}
module.exports={validateBatch,upwardNormal,nearestTargetHit,snapColliderOrigins};
