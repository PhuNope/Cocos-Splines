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
