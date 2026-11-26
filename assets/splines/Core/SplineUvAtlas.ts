/** Deterministic, bounded UV0 atlas layout for authored Profile Extrude.
 * Uniform scale is shared by every island, preserving relative texel density
 * and each island's U/V aspect (including nonuniform taper/shear).
 * No geometry, normals, topology, source Profile or material assets are touched.
 */
export interface UvAtlasIsland {firstVertex:number;vertexCount:number}
interface MeasuredIsland extends UvAtlasIsland {
    minU:number;maxU:number;minV:number;maxV:number;width:number;height:number;
}
const MAX_ISLANDS=16384;
const MAX_CANDIDATE_COLUMNS=64;
const EPS=1e-10;

/** Rewrites only UV0; writes atomically after all validation and layout. */
/** Opt-in per-triangle UV0 seams for Profile Extrude.
 * Each triangle receives unique vertices (same positions/normals/winding)
 * and a local UV origin, while preserving the source U/V physical scale.
 * No geometry is modified until the complete output has been validated.
 */
export function unwrapProfileUvTriangles(geometry:{
    positions:number[];normals:number[];uvs:number[];indices:number[];
}):UvAtlasIsland[]{
    const {positions,normals,uvs,indices}=geometry;
    if(indices.length<3||indices.length%3!==0||
       positions.length!==normals.length||
       positions.length%3!==0||uvs.length/2!==positions.length/3||
       indices.length>65536||indices.length/3>MAX_ISLANDS)
        throw Error('Graph Profile UV Triangle Unwrap exceeds the 65536-vertex / 16384-island limit.');
    const vertexCount=positions.length/3;
    const nextPositions:number[]=[],nextNormals:number[]=[],nextUvs:number[]=[],nextIndices:number[]=[];
    const groups:UvAtlasIsland[]=[];
    for(let t=0;t<indices.length;t+=3){
        const a=indices[t],b=indices[t+1],c=indices[t+2];
        if(![a,b,c].every(n=>Number.isInteger(n)&&n>=0&&n<vertexCount))
            throw Error('Graph Profile UV Triangle Unwrap index is invalid.');
        const ids=[a,b,c];
        const us=ids.map(n=>uvs[n*2]),vs=ids.map(n=>uvs[n*2+1]);
        const minU=Math.min(...us),maxU=Math.max(...us);
        const minV=Math.min(...vs),maxV=Math.max(...vs);
        if(![...us,...vs].every(Number.isFinite)||
           maxU-minU<1e-10||maxV-minV<1e-10)
            throw Error('Graph Profile UV Triangle Unwrap requires nondegenerate UV triangles.');
        const start=t;
        groups.push({firstVertex:start,vertexCount:3});
        for(let i=0;i<3;i++){
            const src=ids[i],newIndex=nextPositions.length/3;
            for(let k=0;k<3;k++){
                const p=positions[src*3+k],n=normals[src*3+k];
                if(!Number.isFinite(p)||!Number.isFinite(n))
                    throw Error('Graph Profile UV Triangle Unwrap contains nonfinite geometry.');
                nextPositions.push(p);nextNormals.push(n);
            }
            nextUvs.push(us[i]-minU,vs[i]-minV);
            nextIndices.push(newIndex);
        }
    }
    // Ensure all failures above leave every caller-owned array unmodified.
    for(const [dst,src] of [
        [positions,nextPositions],[normals,nextNormals],
        [uvs,nextUvs],[indices,nextIndices],
    ] as Array<[number[],number[]]>) {
        dst.length=src.length;
        for(let i=0;i<src.length;i++)dst[i]=src[i];
    }
    return groups;
}

export function packProfileUvAtlas(
    uvs:number[],groups:ReadonlyArray<Readonly<UvAtlasIsland>>,padding:number,
):void{
    if(!Array.isArray(uvs)||uvs.length<4||uvs.length%2!==0||
       !Array.isArray(groups)||groups.length<1||groups.length>MAX_ISLANDS||
       typeof padding!=='number'||!Number.isFinite(padding)||padding<0||padding>.2)
        throw Error('Graph Profile UV Atlas requires 1–16384 islands and padding in [0,0.2].');
    let nextVertex=0;
    const islands:MeasuredIsland[]=groups.map(group=>{
        if(!group||!Number.isInteger(group.firstVertex)||
           !Number.isInteger(group.vertexCount)||group.vertexCount<3||
           group.firstVertex!==nextVertex||
           group.firstVertex+group.vertexCount>uvs.length/2)
            throw Error('Graph Profile UV Atlas islands must be consecutive nonempty vertex spans.');
        nextVertex=group.firstVertex+group.vertexCount;
        let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
        for(let i=group.firstVertex;i<nextVertex;i++){
            const u=uvs[i*2],v=uvs[i*2+1];
            if(!Number.isFinite(u)||!Number.isFinite(v))
                throw Error('Graph Profile UV Atlas received nonfinite UV0.');
            minU=Math.min(minU,u);maxU=Math.max(maxU,u);
            minV=Math.min(minV,v);maxV=Math.max(maxV,v);
        }
        const width=maxU-minU,height=maxV-minV;
        if(!Number.isFinite(width)||!Number.isFinite(height)||
           width<EPS||height<EPS)
            throw Error('Graph Profile UV Atlas cannot pack degenerate UV islands.');
        return {firstVertex:group.firstVertex,vertexCount:group.vertexCount,
            minU,maxU,minV,maxV,width,height};
    });
    if(nextVertex!==uvs.length/2)
        throw Error('Graph Profile UV Atlas island groups must cover all vertices.');
    const count=islands.length;
    let bestColumns=0,bestWidth:number[]=[],bestHeight:number[]=[];
    let bestExtent=Infinity,bestArea=Infinity;
    // Deterministic column-major candidate grid search. The maximum extent,
    // rather than area alone, maximizes the single global uniform UV scale.
    for(let columns=1;columns<=Math.min(count,MAX_CANDIDATE_COLUMNS);columns++){
        const rows=Math.ceil(count/columns);
        const colWidths=Array(columns).fill(0),rowHeights=Array(rows).fill(0);
        for(let i=0;i<count;i++){
            const island=islands[i],col=i%columns,row=Math.floor(i/columns);
            colWidths[col]=Math.max(colWidths[col],island.width);
            rowHeights[row]=Math.max(rowHeights[row],island.height);
        }
        const width=colWidths.reduce((a,b)=>a+b,0),
            height=rowHeights.reduce((a,b)=>a+b,0);
        const extent=Math.max(width,height),area=width*height;
        if(!Number.isFinite(extent)||extent<EPS||!Number.isFinite(area))
            throw Error('Graph Profile UV Atlas extents overflow.');
        if(extent<bestExtent-1e-10||
           (Math.abs(extent-bestExtent)<=1e-10&&area<bestArea)){
            bestColumns=columns;
            bestWidth=colWidths;bestHeight=rowHeights;
            bestExtent=extent;bestArea=area;
        }
    }
    const widthSum=bestWidth.reduce((a,b)=>a+b,0);
    const heightSum=bestHeight.reduce((a,b)=>a+b,0);
    const scale=1/bestExtent,shrink=1-2*padding;
    const originU=(1-widthSum*scale)/2,originV=(1-heightSum*scale)/2;
    const colOffsets:number[]=[0],rowOffsets:number[]=[0];
    for(const width of bestWidth)colOffsets.push(colOffsets[colOffsets.length-1]+width);
    for(const height of bestHeight)rowOffsets.push(rowOffsets[rowOffsets.length-1]+height);
    const nextUV=uvs.slice();
    for(let i=0;i<count;i++){
        const island=islands[i],col=i%bestColumns,row=Math.floor(i/bestColumns);
        const baseU=originU+(colOffsets[col]+bestWidth[col]/2)*scale;
        const baseV=originV+(rowOffsets[row]+bestHeight[row]/2)*scale;
        const midU=(island.minU+island.maxU)/2;
        const midV=(island.minV+island.maxV)/2;
        for(let j=island.firstVertex;j<island.firstVertex+island.vertexCount;j++){
            const u=baseU+(uvs[j*2]-midU)*scale*shrink;
            const v=baseV+(uvs[j*2+1]-midV)*scale*shrink;
            if(!Number.isFinite(u)||!Number.isFinite(v)||
               u< -1e-8||u>1+1e-8||v< -1e-8||v>1+1e-8)
                throw Error('Graph Profile UV Atlas produced out-of-range UV0.');
            nextUV[j*2]=Math.max(0,Math.min(1,u));
            nextUV[j*2+1]=Math.max(0,Math.min(1,v));
        }
    }
    for(let i=0;i<nextUV.length;i++)uvs[i]=nextUV[i];
}
