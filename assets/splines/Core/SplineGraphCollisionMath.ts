/** Bounded, pure collision geometry generation in renderer-local space.
 * Drop UV/normal/material seams by exact Float32 position welding. No
 * tolerance-based movement, simplification or changes to visual geometry.
 */
export interface CollisionGeometry {positions:number[];indices:number[]}
export function buildGraphCollisionGeometry(chunks:ReadonlyArray<Readonly<CollisionGeometry>>):CollisionGeometry{
    if(!Array.isArray(chunks)||chunks.length<1||chunks.length>4)
        throw Error('Graph Collider requires 1–4 outputs.');
    let count=0,indexCount=0;
    for(const g of chunks){
        if(!g||!Array.isArray(g.positions)||!Array.isArray(g.indices)||
           g.positions.length<9||g.positions.length%3!==0||g.indices.length<3||g.indices.length%3!==0)
            throw Error('Invalid Graph Collider geometry.');
        count+=g.positions.length/3;indexCount+=g.indices.length;
        if(count>65536||indexCount>393216)throw Error('Graph Collider exceeds geometry budget.');
        if(Array.from(g.positions).some(p=>!Number.isFinite(p)||Math.abs(p)>1e7)||
           Array.from(g.indices).some(i=>!Number.isInteger(i)||i<0||i>=g.positions.length/3))
            throw Error('Invalid Graph Collider position/index.');
    }
    const positions:number[]=[],indices:number[]=[],weld=new Map<string,number>();
    const point=(g:CollisionGeometry,i:number):number=>{
        const x=Math.fround(g.positions[i*3]),y=Math.fround(g.positions[i*3+1]),z=Math.fround(g.positions[i*3+2]);
        const key=x+','+y+','+z;
        let id=weld.get(key);
        if(id===undefined){id=positions.length/3;positions.push(x,y,z);weld.set(key,id);}
        return id;
    };
    for(const g of chunks)for(let t=0;t<g.indices.length;t+=3){
        const a=point(g,g.indices[t]),b=point(g,g.indices[t+1]),c=point(g,g.indices[t+2]);
        if(a===b||a===c||b===c)continue;
        const ax=positions[b*3]-positions[a*3],ay=positions[b*3+1]-positions[a*3+1],az=positions[b*3+2]-positions[a*3+2];
        const bx=positions[c*3]-positions[a*3],by=positions[c*3+1]-positions[a*3+1],bz=positions[c*3+2]-positions[a*3+2];
        if(Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)===0)continue;
        indices.push(a,b,c);
    }
    if(!indices.length)throw Error('Graph Collider has no nondegenerate triangles.');
    // Compact unused vertices left by rejected triangles.
    const remap=new Map<number,number>(),compact:number[]=[];
    return {positions:compact,indices:indices.map(i=>{
        let j=remap.get(i);
        if(j===undefined){j=compact.length/3;compact.push(positions[i*3],positions[i*3+1],positions[i*3+2]);remap.set(i,j);}
        return j;
    })};
}
