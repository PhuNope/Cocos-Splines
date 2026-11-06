/** Pure hierarchy bending: root-local vertex coordinates are mapped to spline frame.
 * Axis coordinate becomes normalized arc-length; orthogonal coordinates keep their
 * root-local units and are carried along Right/Up of the spline frame.
 */
export interface P3{x:number;y:number;z:number}
export interface BendFrame{position:P3;right:P3;up:P3}
export interface BendOptions{axis:0|1|2;min:number;max:number;start:number;end:number;widthScale:number;heightScale:number}
export function bendHierarchyPositions(positions:ReadonlyArray<number>,frameAt:(t:number)=>BendFrame,o:BendOptions):number[]{
    const len=o.max-o.min;if(!(len>1e-7))throw Error('Hierarchy has zero length along bend axis.');
    if(positions.length%3!==0)throw Error('Positions must be XYZ triples.');
    const out:number[]=[];
    for(let i=0;i<positions.length;i+=3){
        const x=positions[i],y=positions[i+1],z=positions[i+2];
        const axis=o.axis===0?x:o.axis===1?y:z;
        const raw=Math.max(0,Math.min(1,(axis-o.min)/len));
        const t=o.start+(o.end-o.start)*raw,fr=frameAt(t);
        const right=(o.axis===0?z:x)*o.widthScale;
        const up=(o.axis===1?z:y)*o.heightScale;
        out.push(fr.position.x+fr.right.x*right+fr.up.x*up,
            fr.position.y+fr.right.y*right+fr.up.y*up,
            fr.position.z+fr.right.z*right+fr.up.z*up);
    }
    return out;
}

/** Non-destructive sequential layout for meshes that share an origin/mesh asset.
 * Child part ordering is DFS MeshRenderer order; original mesh vertices and child
 * transforms remain unchanged. All coordinates are root-local.
 */
export function layoutSequentialMeshParts(parts:ReadonlyArray<ReadonlyArray<number>>,axis:0|1|2,gap=0):number[][]{
    const output:number[][]=[];
    let cursor=0;
    for(const original of parts){
        if(original.length%3)throw Error('Positions must be XYZ triples.');
        let min=Infinity,max=-Infinity;
        for(let i=axis;i<original.length;i+=3){min=Math.min(min,original[i]);max=Math.max(max,original[i]);}
        if(!Number.isFinite(min)){output.push([]);continue;}
        const offset=cursor-min,coordinates=Array.from(original);
        for(let i=axis;i<coordinates.length;i+=3)coordinates[i]+=offset;
        output.push(coordinates);
        cursor+=Math.max(0,max-min)+Math.max(0,gap);
    }
    return output;
}
