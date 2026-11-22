'use strict';
/**
 * Stateless Knot edit planning. Local positions are stored on Knot nodes;
 * World operations use the current container transform (including rotation,
 * non-uniform scale and translation). No mutation or Cocos dependency here.
 */
const AXES=Object.freeze(['x','y','z']);
function dimensionAxes(dimension){
    return dimension===1?['x','y']:dimension===2?['x','z']:AXES;
}
function validPoint(value){
    return !!value&&AXES.every(axis=>typeof value[axis]==='number'&&Number.isFinite(value[axis]));
}
function validDelta(value){
    if(!validPoint(value)||AXES.some(axis=>Math.abs(value[axis])>1e6))
        throw new Error('Move delta must contain finite X/Y/Z values within ±1,000,000.');
    return {x:value.x,y:value.y,z:value.z};
}
function gridStep(step){
    if(typeof step!=='number'||!Number.isFinite(step)||step<=0||step>1e6)
        throw new Error('Grid step must be a finite number greater than zero and at most 1,000,000.');
    return step;
}
function validatedKnots(knots,ids){
    if(!Array.isArray(knots)||!Array.isArray(ids)||ids.length<1||ids.length>512)
        throw new Error('Select 1 to 512 knots in the same spline.');
    if(ids.some(id=>typeof id!=='string'||!id))throw new Error('Invalid Knot UUID.');
    const unique=new Set(ids);
    if(unique.size!==ids.length)throw new Error('Duplicate Knot UUID.');
    const byId=new Map(knots.map(k=>[k.uuid,k]));
    if(unique.size>byId.size)throw new Error('Selection exceeds knot count.');
    for(const id of unique)if(!byId.has(id))throw new Error('Knot selection must belong to the active spline.');
    const ordered=knots.filter(k=>unique.has(k.uuid));
    if(ordered.some(k=>!validPoint(k.position)))throw new Error('Knot position must be finite.');
    return ordered;
}
function rounded(value,step){
    const result=Math.round(value/step)*step;
    if(!Number.isFinite(result))throw new Error('Snap result is not finite.');
    return Math.abs(result)<1e-10?0:result;
}
function cross(a,b){
    return {x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x};
}
function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}
function length(a){return Math.hypot(a.x,a.y,a.z);}
function transformFrame(matrix){
    // Cocos Creator's Mat4 is column-major: m00,m01,m02,m03,m04,...m15.
    // The last row must be [0,0,0,1], as for a Node's affine worldMatrix.
    if(!Array.isArray(matrix)||matrix.length!==16||!matrix.every(Number.isFinite)||
       [3,7,11].some(i=>Math.abs(matrix[i])>1e-7)||Math.abs(matrix[15]-1)>1e-7)
        throw new Error('Invalid affine spline world matrix.');
    const a={x:matrix[0],y:matrix[1],z:matrix[2]};
    const b={x:matrix[4],y:matrix[5],z:matrix[6]};
    const c={x:matrix[8],y:matrix[9],z:matrix[10]};
    const origin={x:matrix[12],y:matrix[13],z:matrix[14]};
    const bc=cross(b,c),ca=cross(c,a),ab=cross(a,b),det=dot(a,bc);
    const scale=length(a)*length(b)*length(c);
    if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(det)||Math.abs(det)<=1e-10*scale)
        throw new Error('Spline world transform is singular; check zero scale or collapsed axes.');
    const toWorld=p=>({
        x:origin.x+a.x*p.x+b.x*p.y+c.x*p.z,
        y:origin.y+a.y*p.x+b.y*p.y+c.y*p.z,
        z:origin.z+a.z*p.x+b.z*p.y+c.z*p.z,
    });
    const toLocal=p=>{
        const d={x:p.x-origin.x,y:p.y-origin.y,z:p.z-origin.z};
        return {x:dot(d,bc)/det,y:dot(d,ca)/det,z:dot(d,ab)/det};
    };
    return {toWorld,toLocal};
}
function planKnotPositions(knots,ids,operation,options={},dimension=0,worldMatrix=null){
    const selected=validatedKnots(knots,ids);
    const axes=dimensionAxes(dimension);
    if(!['snap','align','move','distribute'].includes(operation))throw new Error('Unknown knot operation.');
    const space=options.space===undefined?'local':options.space;
    if(space!=='local'&&space!=='world')throw new Error('Coordinate space must be local or world.');
    // Moving the 2D spline in three independent world axes would leave its
    // authored plane: fail explicitly rather than create invisible Z/Y changes.
    if(space==='world'&&dimension!==0)
        throw new Error('World editing is only available for 3D splines; use Local for XY2D or XZ2D.');
    const frame=space==='world'?transformFrame(worldMatrix):null;
    if(operation==='snap')gridStep(options.step);
    if((operation==='align'||operation==='distribute')&&(!AXES.includes(options.axis)||
        (space==='local'&&!axes.includes(options.axis))))
        throw new Error('Alignment axis is not active in this spline dimension.');
    // Distribute in spatial axis order, not mark-click or hierarchy order.
    // Keep the two extreme Knots fixed and leave all other coordinates intact.
    if(operation==='distribute'){
        if(selected.length<3)throw new Error('Distribute requires at least three marked Knots.');
        const axis=options.axis;
        const sorted=selected.map((knot,index)=>({
            knot,index,point:frame?frame.toWorld(knot.position):{...knot.position},
        }));
        if(sorted.some(entry=>!validPoint(entry.point)))
            throw new Error('Distribution requires finite transformed Knot positions.');
        sorted.sort((a,b)=>a.point[axis]-b.point[axis]||a.index-b.index);
        const lo=sorted[0].point[axis],hi=sorted[sorted.length-1].point[axis];
        if(lo===hi)return [];
        const edits=[];
        for(let i=1;i<sorted.length-1;i++){
            const {knot,point}=sorted[i];
            const t=i/(sorted.length-1);
            // A weighted interpolation avoids overflow from hi-lo.
            const value=lo*(1-t)+hi*t;
            const target={...point,[axis]:value};
            const before={...knot.position};
            const after=frame?frame.toLocal(target):target;
            if(!validPoint(after))throw new Error('Distribution produced a non-finite position.');
            if(AXES.some(k=>Math.abs(after[k]-before[k])>1e-8))
                edits.push({uuid:knot.uuid,before,after,changed:true});
        }
        // Use the established hierarchy order for serialized batch writes.
        const order=new Map(selected.map((k,i)=>[k.uuid,i]));
        return edits.sort((a,b)=>order.get(a.uuid)-order.get(b.uuid));
    }
    const delta=operation==='move'?validDelta(options.delta):null;
    if(delta&&space==='local'&&AXES.some(axis=>!axes.includes(axis)&&delta[axis]!==0))
        throw new Error('Move delta cannot change the inactive 2D axis.');
    const anchor=frame?frame.toWorld(selected[0].position):selected[0].position;
    return selected.map(knot=>{
        const before={x:knot.position.x,y:knot.position.y,z:knot.position.z};
        const original=frame?frame.toWorld(before):before;
        const target={...original};
        if(operation==='snap')for(const axis of axes)target[axis]=rounded(original[axis],options.step);
        else if(operation==='align')target[options.axis]=anchor[options.axis];
        else for(const axis of axes)target[axis]=original[axis]+delta[axis];
        const after=frame?frame.toLocal(target):target;
        if(!validPoint(after))throw new Error('Knot edit produced a non-finite position.');
        const changed=AXES.some(axis=>Math.abs(after[axis]-before[axis])>1e-8);
        return {uuid:knot.uuid,before,after,changed};
    }).filter(e=>e.changed);
}

/** Unit quaternions, independent of Cocos math / Editor runtime. */
function validQuaternion(q){
    return !!q&&['x','y','z','w'].every(k=>typeof q[k]==='number'&&Number.isFinite(q[k]));
}
function normalizeQuaternion(q){
    if(!validQuaternion(q))throw Error('Knot or spline rotation must be a finite quaternion.');
    const norm=Math.hypot(q.x,q.y,q.z,q.w);
    if(!(norm>1e-9))throw Error('Knot or spline rotation cannot be a zero quaternion.');
    return {x:q.x/norm,y:q.y/norm,z:q.z/norm,w:q.w/norm};
}
function multiplyQuaternion(a,b){
    return {
        x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
        y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
        z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
        w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z,
    };
}
const conjugate=q=>({x:-q.x,y:-q.y,z:-q.z,w:q.w});
function rotateByQuaternion(q,v){
    const u={x:q.x,y:q.y,z:q.z};
    const t=cross(u,v);
    const c=cross(u,t);
    return {x:v.x+2*(q.w*t.x+c.x),y:v.y+2*(q.w*t.y+c.y),
        z:v.z+2*(q.w*t.z+c.z)};
}
function unit(v){
    const n=length(v);
    if(!(n>1e-8)||!Number.isFinite(n))throw Error('Surface alignment has no stable direction.');
    return {x:v.x/n,y:v.y/n,z:v.z/n};
}
function subtractVector(a,b){return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};}
function projectPlane(v,n){return subtractVector(v,{x:n.x*dot(v,n),y:n.y*dot(v,n),z:n.z*dot(v,n)});}
function quaternionFromAxes(right,up,forward){
    const m00=right.x,m01=up.x,m02=forward.x;
    const m10=right.y,m11=up.y,m12=forward.y;
    const m20=right.z,m21=up.z,m22=forward.z;
    const trace=m00+m11+m22;
    let x,y,z,w,s;
    if(trace>0){
        s=Math.sqrt(trace+1)*2;
        w=.25*s;x=(m21-m12)/s;y=(m02-m20)/s;z=(m10-m01)/s;
    }else if(m00>m11&&m00>m22){
        s=Math.sqrt(1+m00-m11-m22)*2;
        w=(m21-m12)/s;x=.25*s;y=(m01+m10)/s;z=(m02+m20)/s;
    }else if(m11>m22){
        s=Math.sqrt(1+m11-m00-m22)*2;
        w=(m02-m20)/s;x=(m01+m10)/s;y=.25*s;z=(m12+m21)/s;
    }else{
        s=Math.sqrt(1+m22-m00-m11)*2;
        w=(m10-m01)/s;x=(m02+m20)/s;y=(m12+m21)/s;z=.25*s;
    }
    return normalizeQuaternion({x,y,z,w});
}
/**
 * Orients the Knot's +Y world axis to mesh normal. Preserve as much of
 * its current world +Z heading as possible on the surface tangent plane.
 * Returns a NODE LOCAL rotation relative to SplineContainer.
 */
function alignLocalRotationToNormal(localRotation,parentWorldRotation,upNormal){
    const parent=normalizeQuaternion(parentWorldRotation);
    const original=normalizeQuaternion(localRotation);
    if(!validPoint(upNormal))throw Error('Surface hit is missing a finite normal.');
    const up=unit(upNormal);
    if(up.y<.05)throw Error('Surface normal is too steep to align Knot Up.');
    const world=normalizeQuaternion(multiplyQuaternion(parent,original));
    let heading=projectPlane(rotateByQuaternion(world,{x:0,y:0,z:1}),up);
    if(length(heading)<1e-6){
        const right=projectPlane(rotateByQuaternion(world,{x:1,y:0,z:0}),up);
        heading=cross(unit(right),up);
    }
    const forward=unit(heading);
    const right=unit(cross(up,forward));
    const correctedForward=unit(cross(right,up));
    const targetWorld=quaternionFromAxes(right,up,correctedForward);
    const targetLocal=normalizeQuaternion(multiplyQuaternion(conjugate(parent),targetWorld));
    // q and -q are equivalent; keep shortest signed representation.
    const similarity=original.x*targetLocal.x+original.y*targetLocal.y+
        original.z*targetLocal.z+original.w*targetLocal.w;
    return similarity<0?{x:-targetLocal.x,y:-targetLocal.y,z:-targetLocal.z,w:-targetLocal.w}:targetLocal;
}
function quaternionChanged(a,b){
    const one=normalizeQuaternion(a),two=normalizeQuaternion(b);
    const dotValue=Math.abs(one.x*two.x+one.y*two.y+one.z*two.z+one.w*two.w);
    return 1-dotValue>1e-9;
}

/**
 * Surface hits are generated in the Scene process from a single explicit
 * target MeshRenderer. Validate the entire batch before any Scene mutation.
 */
function planSurfaceKnotPositions(knots,ids,hits,worldMatrix,alignNormal=false,parentRotation=null){
    const selected=validatedKnots(knots,ids);
    if(selected.length>64||!Array.isArray(hits)||hits.length!==selected.length)
        throw Error('Every selected Knot must have exactly one surface hit (max 64).');
    const frame=transformFrame(worldMatrix);
    const mapped=new Map();
    for(const hit of hits){
        if(typeof hit?.uuid!=='string'||mapped.has(hit.uuid)||!validPoint(hit.position))
            throw Error('Surface returned duplicate or invalid world positions.');
        mapped.set(hit.uuid,hit);
    }
    return selected.map(knot=>{
        const hit=mapped.get(knot.uuid);
        if(!hit)throw Error('Surface results did not match selected Knot UUIDs.');
        const before={x:knot.position.x,y:knot.position.y,z:knot.position.z};
        const after=frame.toLocal(hit.position);
        if(!validPoint(after))throw Error('Surface produced an invalid local position.');
        const positionChanged=AXES.some(axis=>Math.abs(before[axis]-after[axis])>1e-8);
        const beforeRotation=alignNormal?normalizeQuaternion(knot.rotation):null;
        const afterRotation=alignNormal?
            alignLocalRotationToNormal(beforeRotation,parentRotation,hit.normal):null;
        const rotationChanged=alignNormal&&quaternionChanged(beforeRotation,afterRotation);
        return {uuid:knot.uuid,before,after,positionChanged,
            beforeRotation,afterRotation,rotationChanged,
            changed:positionChanged||rotationChanged};
    }).filter(edit=>edit.changed);
}
module.exports={dimensionAxes,gridStep,validatedKnots,transformFrame,planKnotPositions,planSurfaceKnotPositions,alignLocalRotationToNormal,quaternionChanged};
