import {Color,Mat4,Node,Vec3} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {type V3} from '../core/SplineCurves';
import {type SceneGuideDataV2,type SceneGuideGroupV2} from '../geometry/SceneGizmoGuideV2';

/**
 * Single Editor anti-corruption layer for the REQUIRED cocos-gizmos extension.
 *
 * Ownership:
 * - Cocos-Gizmos: rendering, picking, command sessions and HUD DOM.
 * - This adapter: SDK discovery, descriptors, HUD composition, guide drawing.
 * - Spline.Path: serialized Knots and validated edits; Drawers own callbacks.
 *
 * Editor Drawers import this module; SDK resolution is always deferred until
 * a Scene draw or input callback, never performed at module evaluation time.
 * A missing/incompatible SDK is reported once per Scene session; there is
 * no fallback to the retired flat HUD or legacy gizmo adapters.
 */
export interface SplineHandleDescriptor {
    property:string;index?:number;id?:string;
    visual?:'point'|'plane'|'axis'|'box'|'rotation';
    plane?:'view'|'xy'|'xz'|'yz';axis?:'x'|'y'|'z';
    space?:'local'|'world';snap?:number;
    color?:string;hoverColor?:string;pickSize?:number;
    pivotProperty?:string;pivotSpace?:'local'|'world';
}
export type SplineHandlePhase='begin'|'update'|'end'|'cancel';
export interface SplineGizmoHandleState {
    mode:'knots'|'2d'|'3d';
    positionSpace:'local'|'world';
    rotationSpace:'local'|'world';
    positionSnap:number;
    rotationSnap:number;
    activeIndex:number;
    knotCount:number;
    showKnots:boolean;
    multiPoints:boolean;
    pointLimit:number;
    selectedIndices:ReadonlyArray<number>;
    manualTangents:boolean;
    editTangents:boolean;
    rotateTangents:boolean;
}
export interface SplineGizmoHudState {
    activeIndex:number;
    knotCount:number;
    position:V3;
    positionSpace:'local'|'world';
    selectedIndices:ReadonlyArray<number>;
    manualTangents:boolean;
    onToggleGroup:()=>void;
    onClearGroup:()=>void;
}
export interface SplineGizmoHudDefinition {
    readonly kind:'hud';readonly id:string;readonly root:unknown;
}
interface HudCommand {readonly kind:'property'|'action';}
interface HudBuilderPort {
    position(value:'top-left'|'top-right'|'bottom-left'|'bottom-right'):this;
    theme(value:'dark'|'light'):this;
    width(value:number):this;
    padding(value:number):this;
    gap(value:number):this;
    text(id:string,value:string,options?:{style?:{color?:string;fontSize?:number}}):this;
    row(id:string,build:(builder:HudBuilderPort)=>void):this;
    slider(id:string,label:string,command:HudCommand,options:{min:number;max:number;step?:number}):this;
    toggle(id:string,label:string,command:HudCommand):this;
    button(id:string,label:string,command:HudCommand):this;
    build():SplineGizmoHudDefinition;
}
interface SplineHudSdk {
    createHud(id:string):HudBuilderPort;
    bind(name:string):HudCommand;
    action(callback:(owner:unknown)=>void):HudCommand;
}
interface Gizmo3DSdk {
    readonly supportsRotationPivot:true;
    move(name:string,options:Record<string,unknown>):SplineHandleDescriptor[];
    rotate(name:string,options:Record<string,unknown>):SplineHandleDescriptor[];
    beginColor(node:Node,color:Color):void;
    drawLine(node:Node,a:Vec3,b:Vec3):void;
    drawSphere?(node:Node,p:Vec3,radius:number,wire?:boolean,
        sectors?:number,stacks?:number):void;
}
interface Gizmo2DSdk {
    rotate(name:string,options:Record<string,unknown>):SplineHandleDescriptor[];
}
interface GizmoSdk {
    Gizmos3D:Gizmo3DSdk;
    Gizmos2D:Gizmo2DSdk;
    GizmoHUD:SplineHudSdk;
}
type SdkGlobals={
    Gizmos3D?:Partial<Gizmo3DSdk>;
    Gizmos2D?:Partial<Gizmo2DSdk>;
    GizmoHUD?:Partial<SplineHudSdk>;
};

/** Structural feature check, not a best-effort compatibility shim.
 * The builder + pivot API is the explicit minimum contract. */
export function resolveSplineGizmos():GizmoSdk|null {
    if(!EDITOR_NOT_IN_PREVIEW)return null;
    const global=globalThis as unknown as SdkGlobals;
    const g=global.Gizmos3D,twod=global.Gizmos2D,hud=global.GizmoHUD;
    if(!g||g.supportsRotationPivot!==true||
       typeof g.move!=='function'||typeof g.rotate!=='function'||
       typeof g.beginColor!=='function'||typeof g.drawLine!=='function'||
       typeof twod?.rotate!=='function'||
       typeof hud?.createHud!=='function'||typeof hud.bind!=='function'||
       typeof hud.action!=='function')return null;
    return {Gizmos3D:g as Gizmo3DSdk,
        Gizmos2D:twod as Gizmo2DSdk,GizmoHUD:hud as SplineHudSdk};
}
const palette:Record<SceneGuideGroupV2,readonly [number,number,number]>={
    center:[65,205,250],edge:[66,216,127],knot:[255,180,55],
    trim:[255,120,75],junction:[65,190,245],curb:[239,215,90],
    'tangent-in':[181,140,255],'tangent-out':[72,216,230],
    'bank-right':[255,174,70],'bank-up':[115,255,145]
};
const finite=(p:V3):boolean=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
const finiteSnap=(n:number,max:number):number=>
    Number.isFinite(n)&&n>=0&&n<=max?n:0;

/**
 * Adapter / Facade: port injection is useful for tests, while the production
 * singleton always resolves the current Scene globals on demand (hot reload).
 * No runtime link, extra Node, gizmo inheritance or proprietary Editor APIs.
 */
export class SplineGizmoHandler {
    private warned=false;
    constructor(private readonly sdkProvider:()=>GizmoSdk|null=resolveSplineGizmos){}
    public sdk():GizmoSdk|null {
        if(!EDITOR_NOT_IN_PREVIEW)return null;
        const sdk=this.sdkProvider();
        if(!sdk&&!this.warned){
            this.warned=true;
            console.warn('[Cocos Splines] Missing REQUIRED cocos-gizmos >=3.0.2 '+
                '(Gizmos3D/Gizmos2D with rotation pivot + GizmoHUD builder). '+
                'Install and enable Cocos-Gizmos, then reload Creator. '+
                'No legacy Gizmos adapter is supported.');
        }
        if(sdk)this.warned=false;
        return sdk;
    }
    public handles(state:SplineGizmoHandleState):SplineHandleDescriptor[] {
        const sdk=this.sdk();if(!sdk)return [];
        const g=sdk.Gizmos3D,space=state.positionSpace;
        const rotationSnap=finiteSnap(state.rotationSnap,90);
        const rotate={
            space:state.rotationSpace,ringSize:72,pickSize:14,
            ...(rotationSnap>0?{snap:rotationSnap}:{})
        };
        if(state.mode==='2d')return sdk.Gizmos2D.rotate('pathGizmoRotationEuler',rotate);
        if(state.mode==='3d')return g.rotate('pathGizmoRotationEuler',rotate);
        if(!state.showKnots||state.activeIndex<0||
           state.activeIndex>=state.knotCount)return [];
        const snap=finiteSnap(state.positionSnap,20);
        const world=space==='world';
        const positionName=world?'pathGizmoKnotPositionWorld':'pathGizmoKnotPosition';
        const options:Record<string,unknown>={
            space,axisSize:66,pickSize:28,planeSize:18,planeOffset:14,
            showPositionLabel:true,positionLabelOffset:82,
            ...(snap>0?{snap}:{})
        };
        const handles=[...g.move(positionName,options)];
        if(state.multiPoints){
            const limit=Number.isFinite(state.pointLimit)?
                Math.max(2,Math.min(32,Math.floor(state.pointLimit))):16;
            const selected=new Set(state.selectedIndices);
            for(let i=0;i<Math.min(limit,state.knotCount);i++){
                if(i===state.activeIndex)continue;
                handles.push({
                    property:world?'pathGizmoKnotPositionsWorld':'pathGizmoKnotPositions',
                    index:i,id:'spline-knot-'+i,visual:'point',plane:'view',space,
                    ...(snap>0?{snap}:{}),
                    color:selected.has(i)?'#72e6e0':'#ffb84a',
                    hoverColor:'#ffff78',pickSize:24
                });
            }
        }
        if(state.manualTangents&&state.editTangents){
            if(state.rotateTangents)
                handles.push(...g.rotate('pathGizmoKnotTangentEuler',{
                    space:state.rotationSpace,ringSize:60,pickSize:13,
                    pivotProperty:'pathGizmoKnotPosition',pivotSpace:'local',
                    ...(rotationSnap>0?{snap:rotationSnap}:{})
                }));
            handles.push(
                {id:'path-tangent-in',
                    property:world?'pathGizmoTangentInWorld':'pathGizmoTangentIn',
                    visual:'point',plane:'view',space,...(snap>0?{snap}:{}),
                    color:'#b58cff',hoverColor:'#fff269',pickSize:24},
                {id:'path-tangent-out',
                    property:world?'pathGizmoTangentOutWorld':'pathGizmoTangentOut',
                    visual:'point',plane:'view',space,...(snap>0?{snap}:{}),
                    color:'#48d8e6',hoverColor:'#fff269',pickSize:24}
            );
        }
        return handles;
    }
    public hud(state:SplineGizmoHudState):SplineGizmoHudDefinition|null {
        const sdk=this.sdk();if(!sdk||state.knotCount<2||!finite(state.position)||
            state.activeIndex<0||state.activeIndex>=state.knotCount)return null;
        const h=sdk.GizmoHUD,bind=(prop:string)=>h.bind(prop);
        const format=(n:number)=>n.toFixed(2);
        const p=state.position,group=state.selectedIndices;
        const b=h.createHud('spline-path')
            .position('top-left').theme('dark').width(340).padding(8).gap(6)
            .text('active', 'Knot '+state.activeIndex+' · '+state.positionSpace+
                '  X '+format(p.x)+'  Y '+format(p.y)+'  Z '+format(p.z),
                {style:{color:'#a3e2ff',fontSize:12}})
            .text('group-readout',group.length?
                'Group '+group.length+': '+group.join(', '):
                'Group: none', {style:{color:'#d4e6f4',fontSize:12}});
        b.row('position-space',row=>{
            row.toggle('position-local','Position Local',bind('pathHudPositionLocal'))
                .toggle('position-world','Position World',bind('pathHudPositionWorld'));
        });
        b.row('rotation-space',row=>{
            row.toggle('rotation-local','Rotation Local',bind('pathHudRotationLocal'))
                .toggle('rotation-world','Rotation World',bind('pathHudRotationWorld'));
        });
        b.slider('position-snap','Position Snap',bind('gizmoPositionSnap'),
            {min:0,max:5,step:.05})
         .slider('active-knot','Active Knot',bind('gizmoKnotIndex'),
            {min:0,max:Math.max(1,state.knotCount-1),step:1})
         .toggle('other-knots','Other Knots',bind('gizmoMultiKnotPoints'));
        if(state.manualTangents)
            b.toggle('tangents','Tangent Handles',bind('gizmoEditTangents'));
        b.slider('roll','Knot Roll (deg)',bind('pathGizmoActiveRoll'),
            {min:-180,max:180,step:1})
         .toggle('roll-guide','Roll Guide',bind('gizmoShowRollGuide'));
        b.row('group-actions',row=>{
            row.button('group-toggle','Toggle Active Group',
                    h.action(()=>state.onToggleGroup()))
               .button('group-clear','Clear Group',
                    h.action(()=>state.onClearGroup()));
        });
        return b.build();
    }
    /** Shared read-only rendering for Path, Road, and Junction.
     * No extra runtime components or private SDK renderer state. */
    public drawGuide(owner:Node,guide:SceneGuideDataV2):number {
        const sdk=this.sdk();
        if(!sdk||!owner.isValid)return 0;
        const g=sdk.Gizmos3D,matrix:Mat4=owner.worldMatrix;
        const world=(p:V3)=>Vec3.transformMat4(new Vec3(),
            new Vec3(p.x,p.y,p.z),matrix);
        let count=0;
        for(const part of guide.lines.slice(0,600)){
            if(!finite(part.a)||!finite(part.b))continue;
            const rgb=palette[part.group];
            g.beginColor(owner,new Color(rgb[0],rgb[1],rgb[2],255));
            g.drawLine(owner,world(part.a),world(part.b));count++;
        }
        if(typeof g.drawSphere==='function')
            for(const dot of guide.dots.slice(0,128)){
                if(!finite(dot.at)||!Number.isFinite(dot.radius)||dot.radius<=0)continue;
                const rgb=palette[dot.group];
                g.beginColor(owner,new Color(rgb[0],rgb[1],rgb[2],255));
                g.drawSphere(owner,world(dot.at),dot.radius,true,8,6);count++;
            }
        return count;
    }
}
export const splineGizmos=new SplineGizmoHandler();
