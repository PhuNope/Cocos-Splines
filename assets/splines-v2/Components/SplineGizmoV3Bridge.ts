import {Color,Mat4,Node,Vec3} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {type SceneGuideDataV2,type SceneGuideGroupV2} from '../geometry/SceneGizmoGuideV2';

/**
 * Non-invasive bridge for separately installed Gizmos3D SDKs.
 * We DO NOT import a third-party 'db://...' asset: the Spline extension
 * must still compile and run for users without that vendor package.
 *
 * The integrator may supply __SplineGizmosV3 matching the methods below.
 * Existing Gizmos3D globals remain a compatible fallback. Specific Gizmos
 * v3 SDK registration/decorators require its actual API package to verify.
 */
export interface SplineSceneGizmoV3Backend {
    beginColor(owner:Node,color:Color):void;
    drawLine(owner:Node,a:Vec3,b:Vec3):void;
    drawSphere?(owner:Node,p:Vec3,radius:number,wire?:boolean,
        sectors?:number,stacks?:number):void;
}
export function availableGizmoV3Backend():SplineSceneGizmoV3Backend|null {
    if(!EDITOR_NOT_IN_PREVIEW)return null;
    const host=globalThis as unknown as {
        __SplineGizmosV3?:SplineSceneGizmoV3Backend;
        Gizmos3D?:SplineSceneGizmoV3Backend;
    };
    for(const candidate of [host.__SplineGizmosV3,host.Gizmos3D])
        if(candidate&&typeof candidate.beginColor==='function'&&
            typeof candidate.drawLine==='function')return candidate;
    return null;
}
const palette:Record<SceneGuideGroupV2,Color>={
    center:new Color(65,205,250,255),
    edge:new Color(66,216,127,255),
    knot:new Color(255,180,55,255),
    trim:new Color(255,120,75,255),
    junction:new Color(65,190,245,255),
    curb:new Color(239,215,90,255)
};
const isPoint=(p:{x:number;y:number;z:number})=>
    [p.x,p.y,p.z].every(Number.isFinite);
export function drawSplineSceneGizmosV3(owner:Node,guide:SceneGuideDataV2,
    backend=availableGizmoV3Backend()):number {
    if(!EDITOR_NOT_IN_PREVIEW||!backend||!owner.isValid)return 0;
    // Hard cap protects Editor when the scene is extremely dense.
    const matrix:Mat4=owner.worldMatrix;
    let calls=0;
    const world=(p:{x:number;y:number;z:number})=>
        Vec3.transformMat4(new Vec3(),new Vec3(p.x,p.y,p.z),matrix);
    for(const part of guide.lines.slice(0,600)){
        if(!isPoint(part.a)||!isPoint(part.b))continue;
        backend.beginColor(owner,palette[part.group]);
        backend.drawLine(owner,world(part.a),world(part.b));
        calls++;
    }
    if(typeof backend.drawSphere==='function')
        for(const part of guide.dots.slice(0,128)){
            if(!isPoint(part.at)||!Number.isFinite(part.radius)||part.radius<=0)continue;
            backend.beginColor(owner,palette[part.group]);
            backend.drawSphere(owner,world(part.at),part.radius,true,8,6);
            calls++;
        }
    return calls;
}
