/** Read-only sampled 3D centerline proximity diagnostics for traffic exits.
 * A candidate is NOT proof of a physical road collision: meshes, lane widths,
 * bounds, signal timing, and vertical clearance are not simulated.
 * Never changes serialized conflicts, traffic signals, or topology.
 */
export interface ConflictPoint3 {x:number;y:number;z:number}
export interface ConflictProbePath {
    exitIndex:number;
    points:readonly ConflictPoint3[];
    /** Preserve direction was probed in both possible directions. */
    uncertainDirection?:boolean;
    /** Opt-in World-space road half-width, 0 = centerline-only. */
    halfWidth?:number;
}
export interface ConflictCandidate {
    firstExit:number;secondExit:number;
    distance:number;
    point:ConflictPoint3;
    declared:boolean;
    samePhase:number[];
    uncertainDirection:boolean;
    horizontalDistance?:number;
    verticalGap?:number;
    roadWidthsApplied?:boolean;
}
export interface ConflictGeometryReport {
    candidates:ConflictCandidate[];
    missingPairs:ConflictCandidate[];
    unsafePhases:number[];
    comparisons:number;
}
const dot=(a:ConflictPoint3,b:ConflictPoint3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a:ConflictPoint3,b:ConflictPoint3)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const addScaled=(a:ConflictPoint3,b:ConflictPoint3,t:number)=>({x:a.x+b.x*t,y:a.y+b.y*t,z:a.z+b.z*t});
const finite=(p:ConflictPoint3)=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
const clamp=(x:number)=>Math.min(1,Math.max(0,x));
/** Closest approach of two finite 3D segments; correct with elevated bridges. */
export function closestConflictSegments(
    p:ConflictPoint3,p1:ConflictPoint3,q:ConflictPoint3,q1:ConflictPoint3,
):{distance:number;point:ConflictPoint3}{
    if(!finite(p)||!finite(p1)||!finite(q)||!finite(q1))
        throw Error('Invalid traffic geometry sample.');
    const u=sub(p1,p),v=sub(q1,q),w=sub(p,q);
    const a=dot(u,u),b=dot(u,v),c=dot(v,v),d=dot(u,w),e=dot(v,w);
    const D=a*c-b*b;
    let sn=0,sd=D,tn=0,td=D;
    const EPS=1e-12;
    if(a<EPS&&c<EPS){
        const point={x:(p.x+q.x)/2,y:(p.y+q.y)/2,z:(p.z+q.z)/2};
        return {distance:Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z),point};
    }
    if(a<EPS){sn=0;sd=1;tn=e;td=c;}
    else if(c<EPS){sn=clamp(-d/a);sd=1;tn=0;td=1;}
    else {
        if(D<EPS){sn=0;sd=1;tn=e;td=c;}
        else{
            sn=b*e-c*d;tn=a*e-b*d;
            if(sn<0){sn=0;tn=e;td=c;}
            else if(sn>sd){sn=sd;tn=e+b;td=c;}
        }
    }
    if(tn<0){
        tn=0;
        if(-d<0)sn=0;
        else if(-d>a)sn=sd;
        else {sn=-d;sd=a;}
    }else if(tn>td){
        tn=td;
        if(-d+b<0)sn=0;
        else if(-d+b>a)sn=sd;
        else{sn=-d+b;sd=a;}
    }
    const s=Math.abs(sn)<EPS?0:sn/sd,t=Math.abs(tn)<EPS?0:tn/td;
    const pointA=addScaled(p,u,clamp(s)),pointB=addScaled(q,v,clamp(t));
    return {distance:Math.hypot(pointA.x-pointB.x,pointA.y-pointB.y,pointA.z-pointB.z),
        point:{x:(pointA.x+pointB.x)/2,y:(pointA.y+pointB.y)/2,z:(pointA.z+pointB.z)/2}};
}
/** Width-only diagnostic: closest approach in XZ with independent WORLD Y
 * clearance. Widths extend laterally, NOT vertically (bridge awareness).
 */
export function closestConflictRoadFootprints(
    p:ConflictPoint3,p1:ConflictPoint3,q:ConflictPoint3,q1:ConflictPoint3,
):{horizontalDistance:number;verticalGap:number;point:ConflictPoint3}{
    const flat=(x:ConflictPoint3)=>({x:x.x,y:0,z:x.z});
    const near=closestConflictSegments(flat(p),flat(p1),flat(q),flat(q1));
    const projection=(a:ConflictPoint3,b:ConflictPoint3)=>{
        const dx=b.x-a.x,dz=b.z-a.z,denom=dx*dx+dz*dz;
        return denom<1e-12?0:clamp(((near.point.x-a.x)*dx+(near.point.z-a.z)*dz)/denom);
    };
    const ta=projection(p,p1),tb=projection(q,q1);
    const yA=p.y+(p1.y-p.y)*ta,yB=q.y+(q1.y-q.y)*tb;
    return {horizontalDistance:near.distance,verticalGap:Math.abs(yA-yB),
        point:{x:near.point.x,y:(yA+yB)*.5,z:near.point.z}};
}
/** Output only unordered index pairs. If multiple directions are sampled for
 * one exit, report a single nearest candidate and mark direction uncertain.
 * A geometrically near pair is a warning, never auto-added as a conflict.
 */
export function analyzeTrafficConflictPaths(
    paths:readonly ConflictProbePath[],
    declared:readonly {firstExit:number;secondExit:number}[],
    phases:readonly {greenExits:readonly number[]}[],
    threshold=0.75,verticalTolerance=0.75,
):ConflictGeometryReport{
    if(!Array.isArray(paths)||paths.length>64||!Array.isArray(declared)||
       declared.length>2048||!Array.isArray(phases)||phases.length>32||
       !Number.isFinite(threshold)||threshold<=0||threshold>100||
       !Number.isFinite(verticalTolerance)||verticalTolerance<=0||verticalTolerance>100)
        throw Error('Invalid traffic conflict diagnostic options.');
    for(const path of paths){
        if(!path||!Number.isInteger(path.exitIndex)||path.exitIndex<0||
           !Array.isArray(path.points)||path.points.length<2||path.points.length>33||
           path.points.some((x:ConflictPoint3)=>!finite(x))||
           (path.halfWidth!==undefined&&(!Number.isFinite(path.halfWidth)||
            path.halfWidth<0||path.halfWidth>100)))
            throw Error('Invalid traffic exit trajectory.');
    }
    const key=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(':');
    const declaredPairs=new Set<string>();
    for(const c of declared){
        if(!c||!Number.isInteger(c.firstExit)||!Number.isInteger(c.secondExit)||
           c.firstExit<0||c.secondExit<0||c.firstExit===c.secondExit)
            throw Error('Invalid declared traffic conflict.');
        declaredPairs.add(key(c.firstExit,c.secondExit));
    }
    const phaseSets=phases.map(p=>{
        if(!p||!Array.isArray(p.greenExits)||p.greenExits.some((x:number)=>!Number.isInteger(x)||x<0))
            throw Error('Invalid traffic conflict phase.');
        return new Set(p.greenExits);
    });
    const nearest=new Map<string,ConflictCandidate>();
    let comparisons=0;
    for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
        const a=paths[i],b=paths[j];
        if(a.exitIndex===b.exitIndex)continue;
        const pairKey=key(a.exitIndex,b.exitIndex);
        for(let k=1;k<a.points.length;k++)for(let m=1;m<b.points.length;m++){
            comparisons++;
            const widths=(a.halfWidth??0)+(b.halfWidth??0);
            const widthMode=widths>0;
            const road=widthMode?closestConflictRoadFootprints(
                a.points[k-1],a.points[k],b.points[m-1],b.points[m]):null;
            const center=road?null:closestConflictSegments(
                a.points[k-1],a.points[k],b.points[m-1],b.points[m]);
            const horizontal=road?.horizontalDistance;
            const vertical=road?.verticalGap;
            const distance=road?road.horizontalDistance:center!.distance;
            const point=road?road.point:center!.point;
            const previous=nearest.get(pairKey);
            if((widthMode&&vertical!==undefined&&vertical>verticalTolerance)||
               distance>threshold+widths||
               (previous&&distance>=previous.distance))continue;
            const firstExit=Math.min(a.exitIndex,b.exitIndex),secondExit=Math.max(a.exitIndex,b.exitIndex);
            nearest.set(pairKey,{firstExit,secondExit,distance,point,
                ...(widthMode?{horizontalDistance:horizontal,verticalGap:vertical,
                    roadWidthsApplied:true}:{}),
                declared:declaredPairs.has(pairKey),
                samePhase:phaseSets.flatMap((group,index)=>
                    group.has(firstExit)&&group.has(secondExit)?[index]:[]),
                uncertainDirection:!!(a.uncertainDirection||b.uncertainDirection)});
        }
    }
    const candidates=[...nearest.values()].sort((a,b)=>a.firstExit-b.firstExit||a.secondExit-b.secondExit);
    return {candidates,missingPairs:candidates.filter(x=>!x.declared),
        unsafePhases:[...new Set(candidates.flatMap(x=>x.samePhase))].sort((a,b)=>a-b),
        comparisons};
}
