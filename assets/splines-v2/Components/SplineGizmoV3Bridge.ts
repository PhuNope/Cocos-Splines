import {Color,Mat4,Node,Vec3} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {type SceneGuideDataV2,type SceneGuideGroupV2} from '../geometry/SceneGizmoGuideV2';

/**
 * Cocos-Gizmos v3 (PhuNope/Cocos-Gizmos, branch v3) integration.
 * Its scene.js installs globalThis.Gizmos3D in the Editor Scene process
 * and automatically discovers Component onDrawGizmosSelected/onGizmoHandles.
 * NO decorator, direct package import or vendor mount is necessary.
 * Do not access this object when Editor Scene Gizmos is unavailable.
 */
export interface SplineGizmoV3MoveOptions {
    space:'local'|'world';
    axisSize?:number;
    pickSize?:number;
    planeSize?:number;
    planeOffset?:number;
    showPositionLabel?:boolean;
    positionLabelOffset?:number;
    snap?:number;
}
export interface SplineGizmoV3Handle {
    property:string;
    id?:string;
    visual?:string;
    plane?:string;
    axis?:string;
    space?:string;
}
export interface SplineSceneGizmoV3Backend {
    beginColor(owner:Node,color:Color):void;
    drawLine(owner:Node,a:Vec3,b:Vec3):void;
    drawSphere?(owner:Node,p:Vec3,radius:number,wire?:boolean,
        sectors?:number,stacks?:number):void;
    /** New v3 descriptor factory, bundled with Gizmos3D in Scene process. */
    move?(property:string,options?:SplineGizmoV3MoveOptions):SplineGizmoV3Handle[];
}
export function availableGizmoV3Backend():SplineSceneGizmoV3Backend|null {
    if(!EDITOR_NOT_IN_PREVIEW)return null;
    const sdk=(globalThis as unknown as {Gizmos3D?:SplineSceneGizmoV3Backend}).Gizmos3D;
    return sdk&&typeof sdk.beginColor==='function'&&
        typeof sdk.drawLine==='function'?sdk:null;
}
/** Actual Gizmos3D.move('Vec3-property',options) from Cocos-Gizmos v3.
 * A missing/older SDK simply offers no handles.
 */
export function buildSplineKnotMoveGizmoV3(property:string):SplineGizmoV3Handle[] {
    const sdk=availableGizmoV3Backend();
    if(!sdk||typeof sdk.move!=='function')return [];
    return sdk.move(property,{space:'local',axisSize:66,pickSize:28,
        planeSize:18,planeOffset:14,showPositionLabel:true,
        positionLabelOffset:82});
}
// Constants only; in particular DO NOT construct Cocos Color at module
// evaluation, because Play/Baked and headless Editor contexts never draw.
const palette:Record<SceneGuideGroupV2,readonly [number,number,number]>={
    center:[65,205,250],edge:[66,216,127],knot:[255,180,55],
    trim:[255,120,75],junction:[65,190,245],curb:[239,215,90]
};
const color=(group:SceneGuideGroupV2):Color=>{
    const rgb=palette[group];
    return new Color(rgb[0],rgb[1],rgb[2],255);
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
        backend.beginColor(owner,color(part.group));
        backend.drawLine(owner,world(part.a),world(part.b));
        calls++;
    }
    if(typeof backend.drawSphere==='function')
        for(const part of guide.dots.slice(0,128)){
            if(!isPoint(part.at)||!Number.isFinite(part.radius)||part.radius<=0)continue;
            backend.beginColor(owner,color(part.group));
            backend.drawSphere(owner,world(part.at),part.radius,true,8,6);
            calls++;
        }
    return calls;
}
