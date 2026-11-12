import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';
import {roadProfileLayoutV2} from './ProfileSweep';

export interface RoadSidewalkOptionsV2 {
    readonly width:number;
    readonly roadWidth:number;
    readonly shoulderWidth:number;
    readonly curbWidth:number;
    readonly curbHeight:number;
    readonly uvMetersPerRepeat?:number;
    readonly uvLongitudinalAxis?:'u'|'v';
    /** Flat is the legacy opt-in mode. Sample requires an explicit Road-local height callback. */
    readonly terrainMode?:'flat'|'sample';
    /** Height of flat surface in Road local Y; added to samples in Sample mode. */
    readonly terrainHeightOffset?:number;
    readonly terrainSampler?:(x:number,z:number)=>number|null;
    readonly maxCrossSlope?:number;
    readonly maxEdgeSlope?:number;
}
export interface RoadSidewalkReportV2 {
    readonly rings:number;
    readonly triangles:number;
    readonly sampledHeights:number;
    readonly minimumCrossSlope:number;
    readonly maximumCrossSlope:number;
}
const finite=(x:number):boolean=>Number.isFinite(x)&&Number.isFinite(Math.fround(x));
const magnitude=(x:number,z:number)=>Math.hypot(x,z);

/**
 * Generate both Road-length sidewalk strips by reading the EXACT authored
 * curb-top positions from an already-trimmed ConstantWidth Road mesh.
 * The Road remains byte-for-byte unchanged and the new material slot is 5.
 * This helper is not terrain CSG and does not merge independent Road networks.
 */
export function buildRoadSidewalkV2(
    road:MeshDataV2,opts:RoadSidewalkOptionsV2
):{mesh:MeshDataV2;report:RoadSidewalkReportV2}{
    const width=opts.width,repeat=opts.uvMetersPerRepeat??5;
    const terrainMode=opts.terrainMode??'flat';
    const offset=opts.terrainHeightOffset??0,maxCross=opts.maxCrossSlope??.35;
    const maxEdge=opts.maxEdgeSlope??.35,axis=opts.uvLongitudinalAxis??'v';
    if(![width,repeat,offset,maxCross,maxEdge].every(finite)||
       width<.4||width>6||repeat<=0||Math.abs(offset)>2||
       maxCross<.02||maxCross>1||maxEdge<.02||maxEdge>1||
       (axis!=='u'&&axis!=='v')||(terrainMode!=='flat'&&terrainMode!=='sample'))
        throw new Error('Road Sidewalk V2 invalid width, UV axis or terrain slope');
    if(terrainMode==='sample'&&typeof opts.terrainSampler!=='function')
        throw new Error('Road Sidewalk V2 Sample Terrain requires a valid height sampler');
    if(![opts.curbWidth,opts.curbHeight,opts.shoulderWidth,opts.roadWidth].every(finite)||
       opts.roadWidth<=0||opts.curbWidth<=.01||opts.curbHeight<=.01||
       opts.shoulderWidth<0)
        throw new Error('Road Sidewalk V2 requires full-width Road curb with positive top and wall');
    const layout=roadProfileLayoutV2(opts.roadWidth,opts.shoulderWidth,
        opts.curbWidth,opts.curbHeight,true);
    const materials=layout.edgeMaterials;
    const asphalt=road.submeshes.find(g=>g.materialSlot===0);
    if(!asphalt||asphalt.indices.length%12!==0||asphalt.indices.length<12)
        throw new Error('Road Sidewalk V2 cannot determine exact ConstantWidth Road rings');
    const rings=asphalt.indices.length/12+1;
    if(road.vertexCount<materials.length*2*rings||materials[0]!==2||
       materials[materials.length-1]!==2)
        throw new Error('Road Sidewalk V2 cannot read original curb-top profile rings');
    const pos=(id:number):Vec3MeshV2=>({
        x:road.positions[3*id],y:road.positions[3*id+1],z:road.positions[3*id+2]});
    const uv=(id:number):Vec2MeshV2=>({
        x:road.uv0[2*id],y:road.uv0[2*id+1]});
    const vertex=(edge:number,ring:number,second:boolean)=>{
        const id=edge*2*rings+2*ring+(second?1:0);
        return {position:pos(id),uv0:uv(id)};
    };
    const positions:Vec3MeshV2[]=[],normals:Vec3MeshV2[]=[],
        uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[],indices:number[]=[];
    let sampledHeights=0,minCross=Infinity,maxCrossFound=0;
    const push=(a:Vec3MeshV2,b:Vec3MeshV2,c:Vec3MeshV2,
        ua:Vec2MeshV2,ub:Vec2MeshV2,uc:Vec2MeshV2)=>{
        const ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},
            ac={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
        let n={x:ab.y*ac.z-ab.z*ac.y,
            y:ab.z*ac.x-ab.x*ac.z,z:ab.x*ac.y-ab.y*ac.x};
        const verts=[a,b,c],uvs=[ua,ub,uc];
        if(n.y<0){verts.reverse();uvs.reverse();n={x:-n.x,y:-n.y,z:-n.z};}
        const len=Math.hypot(n.x,n.y,n.z);
        if(!finite(len)||n.y<=1e-9||len<1e-8)
            throw new Error('Road Sidewalk V2 has folded or degenerate apron triangles');
        const at=positions.length,unit={x:n.x/len,y:n.y/len,z:n.z/len};
        for(let i=0;i<3;i++){
            const p=verts[i];
            positions.push(p);normals.push(unit);uv0.push(uvs[i]);
            uv2.push({x:.5+p.x/(repeat*20),y:.5+p.z/(repeat*20)});
        }
        indices.push(at,at+1,at+2);
    };
    for(const side of ['left','right'] as const){
        const rows:Array<{inner:Vec3MeshV2;outer:Vec3MeshV2;u:number}>=[];
        for(let ring=0;ring<rings;ring++){
            const a=side==='left'?vertex(0,ring,false):
                vertex(materials.length-1,ring,true);
            const b=side==='left'?vertex(0,ring,true):
                vertex(materials.length-1,ring,false);
            // Outward unit vector comes from the source curb TOP width. This
            // is invariant under yaw and guarantees exact seam continuity.
            const dx=a.position.x-b.position.x,dz=a.position.z-b.position.z;
            const len=magnitude(dx,dz);
            if(len<.01||Math.abs(a.position.y-b.position.y)>.005)
                throw new Error('Road Sidewalk V2 requires level, nonbanked curb-top across its width');
            const outerX=a.position.x+width*dx/len;
            const outerZ=a.position.z+width*dz/len;
            let outerY=offset;
            if(terrainMode==='sample'){
                try{
                    const sample=opts.terrainSampler!(outerX,outerZ);
                    if(sample===null||sample===undefined)
                        throw new Error('outside Terrain bounds');
                    if(!finite(sample))throw new Error('non-finite Terrain height');
                    outerY=sample+offset;sampledHeights++;
                }catch(error){
                    throw new Error('Road Sidewalk V2 Terrain sampling failed: '+
                        (error instanceof Error?error.message:String(error)));
                }
            }
            const crossfall=Math.abs(a.position.y-outerY)/width;
            if(crossfall>maxCross+1e-7)
                throw new Error('Road Sidewalk V2 exceeds Max Cross Slope');
            minCross=Math.min(minCross,crossfall);maxCrossFound=Math.max(maxCrossFound,crossfall);
            if(rows.length){
                const prev=rows[rows.length-1].outer;
                const delta=magnitude(outerX-prev.x,outerZ-prev.z);
                if(delta<1e-5||Math.abs(outerY-prev.y)>maxEdge*delta+1e-7)
                    throw new Error('Road Sidewalk V2 exceeds Max Edge Slope');
            }
            rows.push({inner:a.position,outer:{x:outerX,y:outerY,z:outerZ},
                u:axis==='u'?a.uv0.x:a.uv0.y});
        }
        // Sidewalk UV0 always has U along the Road and V outward, while
        // asphalt's independent U/V texture axis remains unchanged.
        for(let ring=0;ring<rings-1;ring++){
            const a=rows[ring],b=rows[ring+1],v=width/repeat;
            push(a.inner,a.outer,b.inner,{x:a.u,y:0},{x:a.u,y:v},{x:b.u,y:0});
            push(a.outer,b.outer,b.inner,{x:a.u,y:v},{x:b.u,y:v},{x:b.u,y:0});
        }
    }
    const mesh=buildMeshV2({positions,normals,uv0,uv2,
        submeshes:[{materialSlot:5,indices}]});
    return {mesh,report:{rings,triangles:mesh.triangleCount,
        sampledHeights,minimumCrossSlope:minCross,maximumCrossSlope:maxCrossFound}};
}
