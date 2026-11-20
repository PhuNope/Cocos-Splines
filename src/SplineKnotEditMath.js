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
    if(!['snap','align','move'].includes(operation))throw new Error('Unknown knot operation.');
    const space=options.space===undefined?'local':options.space;
    if(space!=='local'&&space!=='world')throw new Error('Coordinate space must be local or world.');
    // Moving the 2D spline in three independent world axes would leave its
    // authored plane: fail explicitly rather than create invisible Z/Y changes.
    if(space==='world'&&dimension!==0)
        throw new Error('World editing is only available for 3D splines; use Local for XY2D or XZ2D.');
    const frame=space==='world'?transformFrame(worldMatrix):null;
    if(operation==='snap')gridStep(options.step);
    if(operation==='align'&&(!AXES.includes(options.axis)||
        (space==='local'&&!axes.includes(options.axis))))
        throw new Error('Alignment axis is not active in this spline dimension.');
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
module.exports={dimensionAxes,gridStep,validatedKnots,transformFrame,planKnotPositions};
