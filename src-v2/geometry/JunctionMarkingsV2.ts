import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';
import {type JunctionRoadBranchV2} from './JunctionPatchV2';

export interface JunctionGuideRouteV2 {
    readonly fromBranch:number;
    readonly toBranch:number;
}
export interface JunctionMarkingOptionsV2 {
    readonly stopBars?:boolean;
    readonly crosswalks?:boolean;
    readonly stopBarBranches?:ReadonlyArray<boolean>;
    readonly crosswalkBranches?:ReadonlyArray<boolean>;
    readonly guideRoutes?:ReadonlyArray<JunctionGuideRouteV2>;
    /** All paint is physically separate from the asphalt UV0. */
    readonly paintHeight?:number;
    readonly surfaceLift?:number;
    readonly stopBarWidth?:number;
    readonly stopBarSetback?:number;
    readonly zebraStripeLength?:number;
    readonly zebraGap?:number;
    readonly zebraStartSetback?:number;
    readonly zebraStripeCount?:number;
    readonly lateralInset?:number;
    readonly guideWidth?:number;
    readonly guideSamples?:number;
    readonly uvMetersPerRepeat?:number;
    readonly whiteMaterialSlot?:number;
    readonly guideMaterialSlot?:number;
}
export interface JunctionMarkingReportV2 {
    readonly stopBars:number;
    readonly zebraStripes:number;
    readonly guideRoutes:number;
    readonly whiteTriangles:number;
    readonly guideTriangles:number;
}
const finite=(x:number)=>Number.isFinite(x)&&Number.isFinite(Math.fround(x));
const dist=(a:Vec3MeshV2,b:Vec3MeshV2)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const mix=(a:Vec3MeshV2,b:Vec3MeshV2,t:number):Vec3MeshV2=>({
    x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t
});
const crossUp=(a:Vec3MeshV2,b:Vec3MeshV2,c:Vec3MeshV2)=>
    (b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);

/**
 * Geometry-only junction paint: never changes the source Road strips or their
 * asphalt UV phase. Paint is built INSIDE each center-to-boundary fan wedge.
 * Every extra sample is raised above the Junction (not the original Roads).
 *
 * This is an authoring aid for flat patches, not a traffic-rules engine:
 * turn guide routes are explicit branch-index pairs, not automatic lanes.
 */
export function buildJunctionMarkingsV2(
    branches:ReadonlyArray<JunctionRoadBranchV2>,
    options:JunctionMarkingOptionsV2={}
):{mesh:MeshDataV2;report:JunctionMarkingReportV2}{
    if(branches.length!==3&&branches.length!==4)
        throw new Error('Junction Markings V2 requires 3 or 4 branches');
    const stop=options.stopBars===true,crosswalks=options.crosswalks===true;
    const routes=options.guideRoutes??[];
    if(!stop&&!crosswalks&&!routes.length)
        throw new Error('Junction Markings V2 has no enabled paint');
    const paintHeight=options.paintHeight??.015,surfaceLift=options.surfaceLift??0;
    const stopWidth=options.stopBarWidth??.14;
    const stopSetback=options.stopBarSetback??.22;
    const zebraLength=options.zebraStripeLength??.26,zebraGap=options.zebraGap??.18;
    const zebraStart=options.zebraStartSetback??.65,zebraCount=options.zebraStripeCount??3;
    const inset=options.lateralInset??.13,guideWidth=options.guideWidth??.10;
    const samples=options.guideSamples??24,uvRepeat=options.uvMetersPerRepeat??5;
    const whiteSlot=options.whiteMaterialSlot??3,guideSlot=options.guideMaterialSlot??4;
    if(![paintHeight,surfaceLift,stopWidth,stopSetback,zebraLength,zebraGap,zebraStart,inset,guideWidth,uvRepeat]
        .every(finite)||paintHeight<.001||paintHeight>.2||Math.abs(surfaceLift)>.2||stopWidth<=0||
        stopSetback<0||zebraLength<=0||zebraGap<0||zebraStart<0||inset<0||
        guideWidth<=0||uvRepeat<=0||
        !Number.isSafeInteger(zebraCount)||zebraCount<1||zebraCount>20||
        !Number.isSafeInteger(samples)||samples<8||samples>128||
        ![whiteSlot,guideSlot].every(s=>Number.isSafeInteger(s)&&s>0&&s<=0xffffffff)||
        whiteSlot===guideSlot)
        throw new Error('Invalid Junction Markings V2 dimensions/material slots');
    const positions:Vec3MeshV2[]=[],normals:Vec3MeshV2[]=[],uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[];
    const groups=new Map<number,number[]>();
    const addQuad=(quad:ReadonlyArray<Vec3MeshV2>,slot:number,uvs:ReadonlyArray<Vec2MeshV2>)=>{
        const base=positions.length;
        for(let i=0;i<4;i++){
            const p=quad[i];
            positions.push({x:p.x,y:p.y+surfaceLift+paintHeight,z:p.z});
            normals.push({x:0,y:1,z:0});
            uv0.push(uvs[i]);uv2.push(uvs[i]);
        }
        let indices=groups.get(slot);
        if(!indices){indices=[];groups.set(slot,indices);}
        const [a,b,c,d]=quad;
        if(Math.abs(crossUp(a,b,c))<1e-8||Math.abs(crossUp(b,d,c))<1e-8)
            throw new Error('Junction Markings V2 has degenerate paint geometry');
        if(crossUp(a,b,c)>0)indices.push(base,base+1,base+2,base+1,base+3,base+2);
        else indices.push(base,base+2,base+1,base+1,base+2,base+3);
    };
    const center:Vec3MeshV2={
        x:branches.reduce((v,b)=>v+b.endpoint.x,0)/branches.length,
        y:branches.reduce((v,b)=>v+b.endpoint.y,0)/branches.length,
        z:branches.reduce((v,b)=>v+b.endpoint.z,0)/branches.length
    };
    // The patch outline is the angularly ordered polygon through every
    // trimmed Road vertex. Validate all paint corners against the same shape.
    const outline=branches.flatMap(b=>[b.left.position,b.middle.position,b.right.position])
        .sort((a,b)=>Math.atan2(a.z-center.z,a.x-center.x)-
            Math.atan2(b.z-center.z,b.x-center.x));
    const inside=(p:Vec3MeshV2):boolean=>{
        let present=false;
        for(let i=0,j=outline.length-1;i<outline.length;j=i++){
            const a=outline[i],b=outline[j];
            if((a.z>p.z)!==(b.z>p.z)&&
                p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)present=!present;
        }
        return present;
    };
    let stopBars=0,zebraStripes=0,guideRoutes=0;
    const mid=(b:JunctionRoadBranchV2)=>b.middle.position;
    const wedgePoint=(b:JunctionRoadBranchV2,d:number,s:number):Vec3MeshV2=>{
        // d in metres INWARD from the existing trimmed Road seam.
        const radius=dist(mid(b),center);
        const f=1-d/radius;
        const boundary=mix(b.left.position,b.right.position,s);
        return mix(center,boundary,f);
    };
    for(const [index,b] of branches.entries()){
        const D=dist(mid(b),center);
        const W=dist(b.left.position,b.right.position);
        if(!finite(D)||!finite(W)||D<=0||W<=.01)
            throw new Error('Junction Markings V2 Road boundary is invalid');
        const sInset=inset/W;
        if(sInset>=.45)throw new Error('Junction Markings V2 lateral inset exceeds Road width');
        const stripe=(inner:number,outer:number):void=>{
            // Inward distances grow toward center. Respect trim boundary and
            // leave a safety margin away from center where lateral width is zero.
            if(inner<0||outer<=inner||outer>D*.84)
                throw new Error('Junction Markings V2 stripe does not fit the trimmed Road patch; increase Junction Trim');
            const quad=[
                wedgePoint(b,inner,sInset),wedgePoint(b,inner,1-sInset),
                wedgePoint(b,outer,sInset),wedgePoint(b,outer,1-sInset)
            ];
            if(!quad.every(inside))throw new Error('Junction Markings V2 stripe leaves Junction polygon; increase trim or reduce stripe width');
            addQuad(quad,whiteSlot,[{x:0,y:inner/uvRepeat},{x:1,y:inner/uvRepeat},
                {x:0,y:outer/uvRepeat},{x:1,y:outer/uvRepeat}]);
        };
        if(stop&&(options.stopBarBranches?.[index]??true)){
            stripe(stopSetback,stopSetback+stopWidth);stopBars++;
        }
        if(crosswalks&&(options.crosswalkBranches?.[index]??true)){
            for(let row=0;row<zebraCount;row++){
                const inner=zebraStart+row*(zebraLength+zebraGap);
                stripe(inner,inner+zebraLength);
                zebraStripes++;
            }
        }
    }
    if(routes.length>64)throw new Error('Junction Markings V2 has too many turn guides');
    const used=new Set<string>();
    for(const [routeIndex,route] of routes.entries()){
        const from=route.fromBranch,to=route.toBranch;
        if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||
            from<0||to<0||from>=branches.length||to>=branches.length||from===to)
            throw new Error('Junction Markings V2 guide '+routeIndex+' has invalid branch indices');
        const key=from+'>'+to;
        if(used.has(key))throw new Error('Junction Markings V2 guide route is duplicated');
        used.add(key);
        const p0=mix(center,mid(branches[from]),.70);
        const p2=mix(center,mid(branches[to]),.70);
        const curve=(t:number)=>mix(mix(p0,center,t),mix(center,p2,t),t);
        const all:Array<{left:Vec3MeshV2;right:Vec3MeshV2;distance:number}>=[];
        let distance=0,last:Vec3MeshV2|null=null;
        for(let i=0;i<=samples;i++){
            const t=i/samples,p=curve(t);
            if(last)distance+=dist(p,last);
            last=p;
            const t1=Math.max(0,t-1/(2*samples)),t2=Math.min(1,t+1/(2*samples));
            const a=curve(t1),b=curve(t2),dx=b.x-a.x,dz=b.z-a.z;
            const l=Math.hypot(dx,dz);
            if(l<1e-7)throw new Error('Junction Markings V2 has a degenerate turn guide; select different branches');
            const side={x:dz/l*guideWidth*.5,y:0,z:-dx/l*guideWidth*.5};
            const left={x:p.x+side.x,y:p.y,z:p.z+side.z};
            const right={x:p.x-side.x,y:p.y,z:p.z-side.z};
            if(!inside(left)||!inside(right))
                throw new Error('Junction Markings V2 turn guide leaves Junction polygon; select safer branch pair or reduce guide width');
            all.push({left,right,distance});
        }
        for(let i=0;i<samples;i++){
            const a=all[i],b=all[i+1];
            addQuad([a.left,a.right,b.left,b.right],guideSlot,[
                {x:0,y:a.distance/uvRepeat},{x:1,y:a.distance/uvRepeat},
                {x:0,y:b.distance/uvRepeat},{x:1,y:b.distance/uvRepeat}
            ]);
        }
        guideRoutes++;
    }
    const submeshes=Array.from(groups.entries()).sort((a,b)=>a[0]-b[0])
        .map(([materialSlot,indices])=>({materialSlot,indices}));
    if(!submeshes.length)throw new Error('Junction Markings V2 generated no paint; enable at least one branch');
    const mesh=buildMeshV2({positions,normals,uv0,uv2,submeshes});
    return {mesh,report:{stopBars,zebraStripes,guideRoutes,
        whiteTriangles:(groups.get(whiteSlot)?.length??0)/3,
        guideTriangles:(groups.get(guideSlot)?.length??0)/3}};
}
