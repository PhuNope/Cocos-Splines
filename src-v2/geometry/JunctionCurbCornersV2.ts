import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';
import {type JunctionRoadBranchV2,type JunctionRoadEdgeV2,
    type JunctionPatchOptionsV2,type JunctionPatchReportV2} from './JunctionPatchV2';

/**
 * Rounded, continuous curb corners for flat 3-/4-way Road junctions.
 * Driveable asphalt/shoulder ends at a curved curb FOOT, while curved top
 * and vertical curb wall connect exactly to each source Road end-ring.
 * Unlike radial mode no curb face fans toward the Junction center.
 *
 * This is local corner topology, not full sidewalk Boolean/terrain CSG.
 */
type Profile={readonly vertices:ReadonlyArray<JunctionRoadEdgeV2>;readonly edges:ReadonlyArray<number>};
type P=JunctionRoadEdgeV2;
type Side={readonly outer:P;readonly high:P;readonly foot:P;
    readonly shoulderSlot:number};
type Arm={readonly index:number;readonly angle:number;
    readonly flat:ReadonlyArray<{readonly p:P;readonly ordinal:number;readonly angle:number}>;
    readonly before:Side;readonly after:Side};
const finite=(v:number)=>Number.isFinite(v)&&Number.isFinite(Math.fround(v));
const dist=(a:Vec3MeshV2,b:Vec3MeshV2)=>Math.hypot(a.x-b.x,a.z-b.z);
const angle=(p:Vec3MeshV2,c:Vec3MeshV2)=>Math.atan2(p.z-c.z,p.x-c.x);
const wrap=(x:number)=>((x+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
const mix2=(a:Vec2MeshV2,b:Vec2MeshV2,t:number):Vec2MeshV2=>({
    x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const mix3=(a:Vec3MeshV2,b:Vec3MeshV2,t:number):Vec3MeshV2=>({
    x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const cross=(a:Vec3MeshV2,b:Vec3MeshV2,c:Vec3MeshV2):Vec3MeshV2=>{
    const u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
    return {x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};
};
const area=(a:Vec3MeshV2,b:Vec3MeshV2,c:Vec3MeshV2)=>
    (b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);
function arc(a:P,b:P,center:Vec3MeshV2,pull:number,t:number):P{
    const c1=mix3(a.position,center,pull),c2=mix3(b.position,center,pull),s=1-t;
    return {position:{
        x:s*s*s*a.position.x+3*s*s*t*c1.x+3*s*t*t*c2.x+t*t*t*b.position.x,
        y:s*s*s*a.position.y+3*s*s*t*c1.y+3*s*t*t*c2.y+t*t*t*b.position.y,
        z:s*s*s*a.position.z+3*s*s*t*c1.z+3*s*t*t*c2.z+t*t*t*b.position.z
    },uv0:mix2(a.uv0,b.uv0,t)};
}
export function buildJunctionCurbCornersV2(
    branches:ReadonlyArray<JunctionRoadBranchV2>,profiles:ReadonlyArray<Profile>,
    options:JunctionPatchOptionsV2,center:Vec3MeshV2
):{mesh:MeshDataV2;report:JunctionPatchReportV2}{
    const count=branches.length,segments=options.curbCornerSegments??12;
    const pull=options.curbCornerPull??.32,lift=options.surfaceLift??0;
    const repeat=options.uvMetersPerRepeat??5,baseSlot=options.materialSlot??0;
    const apronWidth=options.sidewalkApronWidth??0;
    const terrainOffset=options.sidewalkTerrainHeightOffset??0;
    const apronSlope=options.sidewalkMaxCrossSlope??.35;
    const terrainMode=options.sidewalkTerrainMode??'flat';
    const edgeSlope=options.sidewalkMaxEdgeSlope??.35;
    const apronEnabled=apronWidth>0;
    const joinRoads=options.sidewalkRoadJoin===true;
    // Terrain elevation is explicit in the Junction node's LOCAL Y plane.
    // No external Terrain/heightmap is sampled by this geometry-only adapter.
    if(!finite(apronWidth)||apronWidth<0||apronWidth>6||
       (apronWidth>0&&apronWidth<.4)||
       !finite(terrainOffset)||Math.abs(terrainOffset)>2||
       !finite(apronSlope)||apronSlope<.02||apronSlope>1||
       !finite(edgeSlope)||edgeSlope<.02||edgeSlope>1||
       (terrainMode!=='flat'&&terrainMode!=='sample'))
        throw new Error('Junction V2 invalid sidewalk apron width, terrain height, sample mode or cross slope');
    if(terrainMode==='sample'&&(!apronEnabled||
       typeof options.sidewalkTerrainSampler!=='function'))
        throw new Error('Junction V2 Terrain sample mode requires enabled Apron Width and valid Terrain sampler');
    if(options.gradeMode==='gentle')throw new Error('Junction V2 Rounded Curb needs level flat Roads');
    if(!Number.isSafeInteger(segments)||segments<4||segments>48||
       !finite(pull)||pull<.1||pull>.7)
        throw new Error('Junction V2 invalid Rounded Curb segments/pull');
    if(profiles.length!==count)throw new Error('Junction V2 Rounded Curb profile count mismatch');
    // Each ramp selects a GAP between two adjacent Road arms. Use the original
    // Inspector indices, not the polar-sorted list order; a pair is undirected.
    const rampPairs=options.curbRampPairs??[];
    const lip=options.curbRampMinLip??.015,maxSlope=options.curbRampMaxSlope??.35;
    if(!Array.isArray(rampPairs)||rampPairs.length>count||
       !finite(lip)||lip<.005||lip>.08||
       !finite(maxSlope)||maxSlope<.02||maxSlope>.6)
        throw new Error('Junction V2 invalid curb ramp lip/slope or pair count');
    const rampKey=(a:number,b:number)=>Math.min(a,b)+':'+Math.max(a,b);
    const requested=new Set<string>();
    for(const pair of rampPairs){
        if(!pair||!Number.isSafeInteger(pair.fromBranch)||!Number.isSafeInteger(pair.toBranch)||
           pair.fromBranch<0||pair.toBranch<0||
           pair.fromBranch>=count||pair.toBranch>=count||
           pair.fromBranch===pair.toBranch)
            throw new Error('Junction V2 curb ramp has invalid Road branch indices');
        const key=rampKey(pair.fromBranch,pair.toBranch);
        if(requested.has(key))throw new Error('Junction V2 duplicate curb ramp Road pair');
        requested.add(key);
    }
    const reference=branches[0].middle.uv0;
    const arms:Arm[]=profiles.map((profile,index)=>{
        const vertices=profile.vertices,slots=profile.edges,n=vertices.length;
        if(n<7||slots.length!==n-1||slots[0]!==2||slots[1]!==2||
           slots[n-3]!==2||slots[n-2]!==2)
            throw new Error('Junction V2 Rounded Curb requires curb width and height on every Road');
        const branch=branches[index],shift={
            x:Math.round(reference.x-branch.middle.uv0.x),
            y:Math.round(reference.y-branch.middle.uv0.y)
        };
        const pts=vertices.map(p=>({position:p.position,
            uv0:(options.uvMode??'matched')==='matched'
                ?{x:p.uv0.x+shift.x,y:p.uv0.y+shift.y}
                :{x:.5+(p.position.x-center.x)/repeat,y:.5+(p.position.z-center.z)/repeat}}));
        const side=(outerId:number,highId:number,footId:number,innerEdge:number):Side=>{
            const outer=pts[outerId],high=pts[highId],foot=pts[footId];
            if(dist(high.position,foot.position)>2e-5||
               dist(outer.position,high.position)<.02||
               Math.abs(outer.position.y-high.position.y)>.005||
               high.position.y-foot.position.y<.02||
               high.position.y-foot.position.y>(options.maxCurbHeight??.6)+1e-5||
               (slots[innerEdge]!==0&&slots[innerEdge]!==1))
                throw new Error('Junction V2 Rounded Curb requires a conventional vertical lip and level curb top');
            return {outer,high,foot,shoulderSlot:slots[innerEdge]};
        };
        const first=side(0,1,2,2),last=side(n-1,n-2,n-3,n-4);
        const y=branch.middle.position.y;
        if(Math.abs(y-center.y)>.005||
           Math.abs(first.foot.position.y-y)>.005||
           Math.abs(last.foot.position.y-y)>.005||
           Math.abs(first.high.position.y-last.high.position.y)>.005)
            throw new Error('Junction V2 Rounded Curb needs a level flat Junction');
        const midAngle=angle(branch.middle.position,center);
        const a0=wrap(angle(first.outer.position,center)-midAngle);
        const a1=wrap(angle(last.outer.position,center)-midAngle);
        if(a0*a1>=0||Math.abs(a0)>=Math.PI/2||Math.abs(a1)>=Math.PI/2)
            throw new Error('Junction V2 Rounded Curb profile crosses center; increase Road trim');
        const flat=Array.from({length:n-4},(_,j)=>j+2)
            .map(ordinal=>({p:pts[ordinal],ordinal,
                angle:wrap(angle(pts[ordinal].position,center)-midAngle)}))
            .sort((a,b)=>a.angle-b.angle);
        if(flat.some((v,i)=>i>0&&(v.angle-flat[i-1].angle<1e-6||
            Math.abs(v.ordinal-flat[i-1].ordinal)!==1)))
            throw new Error('Junction V2 Rounded Curb flat profile is folded/interleaved');
        return {index,angle:midAngle,flat,
            before:a0<a1?first:last,after:a0>a1?first:last};
    }).sort((a,b)=>a.angle-b.angle);
    for(let i=0;i<count;i++){
        const a=angle(arms[i].after.outer.position,center);
        const b=angle(arms[(i+1)%count].before.outer.position,center);
        const delta=((b-a)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
        if(delta<.03||delta>=Math.PI-.01)
            throw new Error('Junction V2 Rounded Curb branches overlap; increase trim or separate directions');
    }
    // Reject non-neighbour pairs rather than silently choosing the wrong corner.
    const actualCorners=new Set<string>();
    for(let i=0;i<count;i++)
        actualCorners.add(rampKey(arms[i].index,arms[(i+1)%count].index));
    for(const key of requested)
        if(!actualCorners.has(key))throw new Error('Junction V2 curb ramp Roads are not adjacent in polar order');
    const positions:Vec3MeshV2[]=[],uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[],normals:Vec3MeshV2[]=[];
    const groups=new Map<number,number[]>();
    let wallTriangles=0,minWedge=Infinity,loweredCurbCorners=0;
    let sidewalkApronCorners=0,sidewalkApronTriangles=0;
    const origin:P={position:center,uv0:reference};
    const push=(a:P,b:P,c:P,slot:number,face:'up'|'inward')=>{
        let n=cross(a.position,b.position,c.position);
        let len=Math.hypot(n.x,n.y,n.z);
        if(len<1e-8||!finite(len))throw new Error('Junction V2 Rounded Curb has degenerate geometry');
        const tri=[a,b,c];
        if(face==='up'&&n.y<0)tri.reverse();
        if(face==='inward'){
            const midpoint=mix3(a.position,c.position,.5);
            const facing=n.x*(center.x-midpoint.x)+n.z*(center.z-midpoint.z);
            if(Math.abs(facing)<1e-9)
                throw new Error('Junction V2 Rounded Curb wall has undefined inward facing');
            if(facing<0)tri.reverse();
            wallTriangles++;
        }
        n=cross(tri[0].position,tri[1].position,tri[2].position);
        len=Math.hypot(n.x,n.y,n.z);
        const normal={x:n.x/len,y:n.y/len,z:n.z/len};
        const first=positions.length;
        for(const p of tri){
            positions.push({x:p.position.x,y:p.position.y+lift,z:p.position.z});
            normals.push(normal);uv0.push(p.uv0);
            uv2.push({x:.5+(p.position.x-center.x)/(repeat*2*count),
                y:.5+(p.position.z-center.z)/(repeat*2*count)});
        }
        let indices=groups.get(slot);if(!indices){indices=[];groups.set(slot,indices);}
        indices.push(first,first+1,first+2);
    };
    const core=(a:P,b:P,slot:number)=>{
        // Increasing polar angles are CCW when viewed in XZ, which
        // produces a -Y cross product. Use its negation for a positive
        // polygon sweep, then reverse the triangle for +Y-facing asphalt.
        const c=-area(center,a.position,b.position);
        if(c<1e-7)throw new Error('Junction V2 Rounded Curb inner polygon folded');
        minWedge=Math.min(minWedge,
            Math.atan2(c,(a.position.x-center.x)*(b.position.x-center.x)+
                (a.position.z-center.z)*(b.position.z-center.z)));
        push(origin,b,a,slot===0?baseSlot:slot,'up');
    };
    for(let i=0;i<count;i++){
        const arm=arms[i],next=arms[(i+1)%count];
        for(let k=0;k<arm.flat.length-1;k++){
            const a=arm.flat[k],b=arm.flat[k+1];
            core(a.p,b.p,profiles[arm.index].edges[Math.min(a.ordinal,b.ordinal)]);
        }
        const lowered=requested.has(rampKey(arm.index,next.index));
        if(lowered){
            const h0=arm.after.high.position.y-arm.after.foot.position.y;
            const h1=next.before.high.position.y-next.before.foot.position.y;
            if(Math.min(h0,h1)<=lip+.01||Math.abs(h0-h1)>.01)
                throw new Error('Junction V2 curb ramp requires compatible curb heights above residual lip');
            loweredCurbCorners++;
        }
        const samples=Array.from({length:segments+1},(_,k)=>{
            const t=k/segments;
            const foot=arc(arm.after.foot,next.before.foot,center,pull,t);
            const high=arc(arm.after.high,next.before.high,center,pull,t);
            const outer=arc(arm.after.outer,next.before.outer,center,pull,t);
            if(!lowered)return {foot,high,outer};
            // Cosine easing has zero derivative at source Road seams, so no
            // abrupt UV or height jump there. Preserve nonzero wall height
            // at the center to avoid degenerate/collapsed curb faces.
            const drop=Math.max(0,high.position.y-foot.position.y-lip)*
                Math.sin(Math.PI*t)**2;
            return {foot,
                high:{...high,position:{...high.position,y:high.position.y-drop}},
                outer:{...outer,position:{...outer.position,y:outer.position.y-drop}}};
        });
        // Optional terrace joins each existing outer curb-top rail to an
        // independently authored local terrain-height edge. This is an
        // exterior band, not a whole-road sidewalk or Terrain CSG operation.
        if(apronEnabled){
            sidewalkApronCorners++;
            const elevation=center.y+terrainOffset;
            if(joinRoads&&(!finite(branches[arm.index].sidewalkStation??NaN)||
                !finite(branches[next.index].sidewalkStation??NaN)))
                throw new Error('Junction V2 Road Sidewalk join needs exact sidewalk UV station on each linked Road');
            const rows:Array<{inner:P;outer:P}>=[];
            // Build a separate OUTER Bezier from the two EXACT Road sidewalk
            // outer endpoints. Interpolating normalized curb lateral vectors
            // per sample can reverse the outer edge on concave inner corners.
            // The paired cubic keeps endpoint seams exact without the fold.
            const extend=(outer:P,high:P):P=>{
                const dx=outer.position.x-high.position.x;
                const dz=outer.position.z-high.position.z;
                const size=Math.hypot(dx,dz);
                if(size<.01)throw new Error('Junction V2 sidewalk outward curb tangent collapsed');
                return {position:{x:outer.position.x+apronWidth*dx/size,
                    y:outer.position.y,z:outer.position.z+apronWidth*dz/size},
                    uv0:outer.uv0};
            };
            const outerStart=joinRoads?extend(arm.after.outer,arm.after.high):null;
            const outerFinish=joinRoads?extend(next.before.outer,next.before.high):null;
            let station=0;
            for(let k=0;k<=segments;k++){
                const curb=samples[k].outer.position;
                if(k)station+=Math.hypot(curb.x-samples[k-1].outer.position.x,
                    curb.z-samples[k-1].outer.position.z);
                const dx=curb.x-center.x,dz=curb.z-center.z,radius=Math.hypot(dx,dz);
                if(radius<.1||apronWidth>radius*.6)
                    throw new Error('Junction V2 sidewalk apron extends beyond safe local corner width; increase Road trim or reduce Apron Width');
                // For joined Road sidewalks the outer rail follows its OWN
                // cubic between the two exact Road-side endpoints (not a
                // rapidly rotating local offset vector). This avoids
                // flipping narrow corner quads and preserves seam XYZ.
                const outside=joinRoads?
                    arc(outerStart!,outerFinish!,center,pull,k/segments).position:null;
                const edgeX=outside?outside.x:curb.x+apronWidth*dx/radius;
                const edgeZ=outside?outside.z:curb.z+apronWidth*dz/radius;
                let outerY=elevation;
                if(terrainMode==='sample'){
                    try{
                        const sample=options.sidewalkTerrainSampler!(edgeX,edgeZ);
                        if(sample===null||sample===undefined)
                            throw new Error('outside Terrain bounds');
                        if(!finite(sample))throw new Error('non-finite sampled height');
                        // Height offset retains its manual role as an optional
                        // lift when sampling, but must not silently fall back.
                        outerY=sample+terrainOffset;
                    }catch(error){
                        throw new Error('Junction V2 Terrain height sample failed at apron outer edge: '+
                            (error instanceof Error?error.message:String(error)));
                    }
                }
                const crossfall=Math.abs(curb.y-outerY)/apronWidth;
                if(crossfall>apronSlope+1e-7)
                    throw new Error('Junction V2 sidewalk apron exceeds Max Cross Slope; increase Apron Width or adjust Terrain Height');
                if(rows.length){
                    const prev=rows[rows.length-1].outer.position;
                    const run=Math.hypot(edgeX-prev.x,edgeZ-prev.z);
                    if(run<1e-5||Math.abs(outerY-prev.y)>edgeSlope*run+1e-7)
                        throw new Error('Junction V2 Terrain edge exceeds Max Edge Slope; increase corner sampling or prepare Terrain');
                }
                rows.push({
                    inner:{position:curb,uv0:{x:station/repeat,y:0}},
                    outer:{position:{
                        x:edgeX,y:outerY,z:edgeZ
                    },uv0:{x:station/repeat,y:apronWidth/repeat}}
                });
            }
            // Phase-constrained UV: match BOTH independent source Road
            // sidewalk U coordinates modulo integer Repeat periods. The
            // small residual adjustment is distributed over the corner arc.
            if(joinRoads){
                const start=branches[arm.index].sidewalkStation!;
                const end=branches[next.index].sidewalkStation!;
                const curveLength=station;
                if(curveLength<.05)throw new Error('Junction V2 Road Sidewalk corner arc is too short');
                const predicted=start+curveLength/repeat;
                const correction=end+Math.round(predicted-end)-predicted;
                for(let k=0;k<rows.length;k++){
                    const row=rows[k],distance=row.inner.uv0.x*repeat;
                    const u=start+distance/repeat+correction*distance/curveLength;
                    rows[k]={inner:{position:row.inner.position,uv0:{x:u,y:0}},
                        outer:{position:row.outer.position,uv0:{x:u,y:apronWidth/repeat}}};
                }
            }
            // Positive projected winding: no inverted or overlapping strip
            // triangles. Each curb-side vertex is identical in XYZ to the
            // rounded curb top; apron UV is separate material-slot 5 UV.
            for(let k=0;k<segments;k++){
                const a=rows[k],b=rows[k+1];
                const a0=area(a.inner.position,b.inner.position,a.outer.position);
                const a1=area(b.inner.position,b.outer.position,a.outer.position);
                if(a0<1e-8||a1<1e-8)
                    throw new Error('Junction V2 sidewalk apron folds at corner; reduce width or Corner Pull '+
                        JSON.stringify({corner:i,segment:k,a0,a1,inner0:a.inner.position,
                            inner1:b.inner.position,outer0:a.outer.position,outer1:b.outer.position}));
                push(a.inner,b.inner,a.outer,5,'up');
                push(b.inner,b.outer,a.outer,5,'up');
                sidewalkApronTriangles+=2;
            }
        }
        if(lowered)for(let k=1;k<=segments;k++){
            const a=samples[k-1],b=samples[k];
            for(const rail of ['high','outer'] as const){
                const v0=a[rail].position,v1=b[rail].position;
                const run=dist(v0,v1),rise=Math.abs(v1.y-v0.y);
                if(run<1e-5||rise>maxSlope*run+1e-7)
                    throw new Error('Junction V2 curb ramp exceeds Max Slope; increase Junction Trim or Corner Segments');
            }
        }
        for(let k=0;k<segments;k++){
            const a=samples[k],b=samples[k+1];
            if(dist(a.foot.position,a.high.position)>2e-5||
               dist(b.foot.position,b.high.position)>2e-5||
               dist(a.outer.position,a.high.position)<.005||
               dist(b.outer.position,b.high.position)<.005)
                throw new Error('Junction V2 Rounded Curb band overlaps/collapses; reduce Pull or increase trim');
            const shoulder=arm.after.shoulderSlot===1&&next.before.shoulderSlot===1?1:0;
            core(a.foot,b.foot,shoulder);
            push(a.high,a.outer,b.outer,2,'up');
            push(a.high,b.outer,b.high,2,'up');
            push(a.foot,b.foot,a.high,2,'inward');
            push(a.high,b.foot,b.high,2,'inward');
        }
    }
    const submeshes=Array.from(groups.entries()).sort((a,b)=>a[0]-b[0])
        .map(([materialSlot,indices])=>({materialSlot,indices}));
    const mesh=buildMeshV2({positions,normals,uv0,uv2,submeshes});
    return {mesh,report:{branches:count,matchedUV:(options.uvMode??'matched')==='matched',
        polygonVertices:mesh.vertexCount,triangles:mesh.triangleCount,
        minimumWedgeDegrees:minWedge*180/Math.PI,
        roundedCurbCorners:count,curbWallTriangles:wallTriangles,loweredCurbCorners,
        sidewalkApronCorners,sidewalkApronTriangles,
        profileBands:{asphalt:(groups.get(baseSlot)?.length??0)/3,
            shoulder:(groups.get(1)?.length??0)/3,
            curb:(groups.get(2)?.length??0)/3}}};
}
