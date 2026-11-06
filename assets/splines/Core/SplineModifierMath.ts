/** Keyed per-path modifiers. Progress is normalized ARC distance (0..1).
 * Pure math used by ObjectController and SplineModifiers; key arrays never mutate.
 */
export interface ModifierValues {
    offset:{x:number;y:number;z:number};
    scale:{x:number;y:number;z:number};
    width:number;speed:number;roll:number;
}
export interface ModifierPoint extends ModifierValues { progress:number }
export type ModifierInterpolation='linear'|'smooth';
const clamp=(n:number)=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const finite=(n:number,f:number)=>Number.isFinite(n)?n:f;
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export function evaluateModifier(keys:ReadonlyArray<ModifierPoint>,progress:number,interpolation:ModifierInterpolation='linear'):ModifierValues{
    const identity=():ModifierValues=>({offset:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},width:1,speed:1,roll:0});
    if(keys.length===0)return identity();
    const sorted=keys.slice().sort((a,b)=>a.progress-b.progress);
    const t=clamp(progress);
    let a=sorted[0],b=sorted[sorted.length-1];
    if(t<=a.progress)b=a;
    else if(t>=b.progress)a=b;
    else for(let i=1;i<sorted.length;i++){if(t<=sorted[i].progress){a=sorted[i-1];b=sorted[i];break;}}
    const raw=b.progress>a.progress?clamp((t-a.progress)/(b.progress-a.progress)):0;
    const u=interpolation==='smooth'?raw*raw*(3-2*raw):raw;
    const vector=(key:'offset'|'scale',d:number)=>({
        x:lerp(finite(a[key]?.x,d),finite(b[key]?.x,d),u),
        y:lerp(finite(a[key]?.y,d),finite(b[key]?.y,d),u),
        z:lerp(finite(a[key]?.z,d),finite(b[key]?.z,d),u),
    });
    return {offset:vector('offset',0),scale:vector('scale',1),
        width:Math.max(0.01,lerp(finite(a.width,1),finite(b.width,1),u)),
        speed:Math.max(0.01,lerp(finite(a.speed,1),finite(b.speed,1),u)),
        roll:lerp(finite(a.roll,0),finite(b.roll,0),u)};
}
