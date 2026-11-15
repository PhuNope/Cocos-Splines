import {type V3} from '../core/SplineCurves';

/**
 * Editor authoring helper: align Bézier *endpoint* handles with the local
 * Road arm chord. This is tangent direction alignment, NOT a multi-road
 * C1/G1 surface join or an intersection Boolean solver.
 */
export interface JunctionTangentArmV2 {
    readonly roadId:string;
    readonly pathId:string;
    readonly atEnd:boolean;
    readonly endpoint:V3;
    readonly neighbor:V3;
    /** Authored active handle offset converted to WORLD-space. */
    readonly activeHandle:V3;
    /** SplineBezierTangentModeV2 (0 Auto,1 Free,2 Aligned,3 Mirrored). */
    readonly mode:number;
}
export interface JunctionTangentSettingsV2 {
    readonly center:V3;
    readonly endpointTolerance?:number;
    readonly maxAngleDegrees?:number;
    readonly maxHandleFraction?:number;
    readonly maxGrade?:number;
}
export interface JunctionTangentBranchV2 {
    readonly roadId:string;
    readonly pathId:string;
    readonly atEnd:boolean;
    readonly endpoint:V3;
    readonly handleSide:'in'|'out';
    readonly originalHandle:V3;
    readonly targetHandle:V3;
    readonly originalMode:number;
    readonly targetMode:number;
    readonly angleDegrees:number;
    readonly handleLength:number;
    readonly changed:boolean;
}
export interface JunctionTangentPlanV2 {
    readonly center:V3;
    readonly branches:ReadonlyArray<JunctionTangentBranchV2>;
    readonly changedCount:number;
}
const finite=(p:V3)=>p!=null&&[p.x,p.y,p.z].every(Number.isFinite);
const sub=(a:V3,b:V3):V3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const scale=(a:V3,n:number):V3=>({x:a.x*n,y:a.y*n,z:a.z*n});
const dot=(a:V3,b:V3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const len=(a:V3)=>Math.hypot(a.x,a.y,a.z);
const clamp=(n:number,low:number,high:number)=>Math.min(high,Math.max(low,n));
const distance=(a:V3,b:V3)=>len(sub(a,b));
const positive=(n:number,label:string)=>{
    if(!Number.isFinite(n)||n<=0)throw new Error(label+' must be positive');
    return n;
};
export function planJunctionTangentAlignmentV2(
    arms:ReadonlyArray<JunctionTangentArmV2>,
    options:JunctionTangentSettingsV2
):JunctionTangentPlanV2 {
    if(arms.length!==3&&arms.length!==4)
        throw new Error('Align Tangents requires exactly 3 or 4 linked Bezier Road Paths');
    if(!finite(options.center))throw new Error('Invalid Junction center');
    const tolerance=positive(options.endpointTolerance??.05,'Endpoint tolerance');
    const maxAngle=positive(options.maxAngleDegrees??3,'Tangent angle threshold');
    const fraction=positive(options.maxHandleFraction??1/3,'Handle length fraction');
    const maxGrade=positive(options.maxGrade??.35,'Maximum tangent slope');
    if(maxAngle>45||fraction>.45||maxGrade>1)
        throw new Error('Tangent settings exceed safe limits');
    const roads=new Set<string>(),paths=new Set<string>();
    const branches=arms.map(arm=>{
        if(!arm.roadId||!arm.pathId||roads.has(arm.roadId)||
           paths.has(arm.pathId))
            throw new Error('Align Tangents requires distinct Road and Path sources');
        roads.add(arm.roadId);paths.add(arm.pathId);
        if(typeof arm.atEnd!=='boolean'||!finite(arm.endpoint)||
           !finite(arm.neighbor)||!finite(arm.activeHandle)||
           !Number.isInteger(arm.mode)||arm.mode<0||arm.mode>3)
            throw new Error('Invalid Bezier endpoint/handle');
        if(distance(arm.endpoint,options.center)>tolerance)
            throw new Error('Road '+arm.roadId+' endpoint is not snapped to Junction; apply Endpoint Snap first');
        const chord=sub(arm.neighbor,arm.endpoint);
        const length=len(chord),horizontal=Math.hypot(chord.x,chord.z);
        if(length<.15||horizontal<.15)
            throw new Error('Road '+arm.roadId+' has a short or vertical endpoint arm');
        if(Math.abs(chord.y)/horizontal>maxGrade)
            throw new Error('Road '+arm.roadId+' is too steep for safe Junction tangent alignment');
        const originalLength=len(arm.activeHandle);
        const ideal=Math.min(length*fraction,length*.45);
        const handleLength=originalLength<1e-6?ideal:
            Math.min(Math.max(originalLength,Math.min(.05,ideal)),ideal);
        const targetHandle=scale(chord,handleLength/length);
        const angle=originalLength<1e-8?180:Math.acos(clamp(
            dot(arm.activeHandle,chord)/(originalLength*length),-1,1))*180/Math.PI;
        // Auto already uses the endpoint chord with Bezier defaults.
        // Do not force a mode change, even if its unused serialized handle
        // happens to have an arbitrary direction.
        const changed=arm.mode!==0&&(angle>maxAngle||
            Math.abs(originalLength-handleLength)>1e-5);
        return {roadId:arm.roadId,pathId:arm.pathId,atEnd:arm.atEnd,
            endpoint:arm.endpoint,handleSide:arm.atEnd?'in' as const:'out' as const,
            originalHandle:arm.activeHandle,
            targetHandle:changed?targetHandle:arm.activeHandle,
            originalMode:arm.mode,targetMode:changed?1:arm.mode,
            angleDegrees:angle,handleLength,changed};
    });
    return {center:options.center,branches,
        changedCount:branches.filter(b=>b.changed).length};
}
