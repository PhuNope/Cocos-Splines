import { Color, Mat4, Node, Vec3 } from 'cc';

/** Immutable, bounded mesh wireframe cache used only by optional Cocos-Gizmos.
 * The generated source Mesh can release its CPU buffers; gizmos never read back
 * GPU data, change the MeshRenderer or create another Material instance.
 * Coordinates stay LOCAL to the renderer node and are transformed at draw time.
 */
export interface MeshGizmoLines { positions: number[]; edgePairs: number[] }

/** Collect at most maxEdges unique mesh edges, distributed along the index buffer.
 * Sampling whole triangles, rather than a contiguous prefix, shows the shape
 * along long roads and large repeated meshes without drawing thousands of lines.
 */
export function buildMeshGizmoLines(
    positions: ReadonlyArray<number>, indices: ReadonlyArray<number>, maxEdges=240,
): MeshGizmoLines {
    const budget=Math.max(0, Math.min(2400, Math.floor(maxEdges)));
    const result:MeshGizmoLines={positions:[],edgePairs:[]};
    const triangleCount=Math.floor(indices.length/3);
    const vertexCount=Math.floor(positions.length/3);
    if(!budget||!triangleCount||!vertexCount)return result;
    const sampleCount=Math.min(triangleCount,Math.max(1,Math.floor(budget/3)));
    const edgeKeys=new Set<string>();
    const originalPairs:number[]=[];
    for(let sample=0;sample<sampleCount;sample++){
        const triangle=Math.floor((sample+.5)*triangleCount/sampleCount);
        const start=triangle*3;
        const a=indices[start],b=indices[start+1],c=indices[start+2];
        if(!Number.isInteger(a)||!Number.isInteger(b)||!Number.isInteger(c)||
            a<0||b<0||c<0||a>=vertexCount||b>=vertexCount||c>=vertexCount)continue;
        for(const [u,v] of [[a,b],[b,c],[c,a]]){
            if(u===v)continue;
            const key=u<v?`${u}:${v}`:`${v}:${u}`;
            if(edgeKeys.has(key))continue;
            edgeKeys.add(key);originalPairs.push(u,v);
            if(originalPairs.length/2>=budget)break;
        }
        if(originalPairs.length/2>=budget)break;
    }
    // Compact output down to vertices actually used by the selected edges.
    const remap=new Map<number,number>();
    for(const idx of originalPairs){
        let mapped=remap.get(idx);
        if(mapped===undefined){
            mapped=result.positions.length/3;
            remap.set(idx,mapped);
            result.positions.push(positions[idx*3],positions[idx*3+1],positions[idx*3+2]);
        }
        result.edgePairs.push(mapped);
    }
    return result;
}

/** Draw selection wireframe if the separately installed Cocos-Gizmos is present. */
export function drawMeshGizmoLines(owner:Node, modelNode:Node, geometry:MeshGizmoLines|null, color:Color):void {
    const gizmos=(globalThis as any).Gizmos3D;
    if(!gizmos?.beginColor||!gizmos?.drawLine||!geometry||!owner.isValid||!modelNode.isValid)return;
    gizmos.beginColor(owner,color);
    const p=geometry.positions,edges=geometry.edgePairs,world:Mat4=modelNode.worldMatrix;
    const cache:Vec3[]=[];
    for(let i=0;i<p.length;i+=3){
        cache.push(Vec3.transformMat4(new Vec3(),new Vec3(p[i],p[i+1],p[i+2]),world));
    }
    for(let i=0;i+1<edges.length;i+=2)gizmos.drawLine(owner,cache[edges[i]],cache[edges[i+1]]);
}
