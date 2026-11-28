/** Pure playback-rate profile. Values are dimensionless, not physical
 * velocity or acceleration. No implicit sorting of duplicate progress keys. */
export enum SpeedProfileInterpolation {Step=0,Linear=1,SmoothStep=2}
export interface SpeedProfileKeyData {progress:number;multiplier:number}
export interface SpeedProfileZoneData {start:number;end:number;maxMultiplier:number}
export interface CompiledSpeedProfile {
    keys:ReadonlyArray<Readonly<SpeedProfileKeyData>>;
    zones:ReadonlyArray<Readonly<SpeedProfileZoneData>>;
    interpolation:SpeedProfileInterpolation;
}
export const MAX_SPEED_PROFILE_KEYS=128,MAX_SPEED_PROFILE_ZONES=64;
const unit=(n:number)=>Number.isFinite(n)&&n>=0&&n<=1;
const rate=(n:number)=>Number.isFinite(n)&&n>=.01&&n<=10;
export function compileSpeedProfile(keys:ReadonlyArray<SpeedProfileKeyData>,zones:ReadonlyArray<SpeedProfileZoneData>,interpolation:SpeedProfileInterpolation):CompiledSpeedProfile{
    if(!Array.isArray(keys)||keys.length>MAX_SPEED_PROFILE_KEYS||!Array.isArray(zones)||zones.length>MAX_SPEED_PROFILE_ZONES||
       ![0,1,2].includes(interpolation))throw Error('Invalid speed profile size or interpolation.');
    const sorted=Array.from(keys,k=>{
        if(!k||!unit(k.progress)||!rate(k.multiplier))throw Error('Invalid speed profile key.');
        return Object.freeze({progress:k.progress,multiplier:k.multiplier});
    }).sort((a,b)=>a.progress-b.progress);
    if(sorted.some((k,i)=>i>0&&k.progress===sorted[i-1].progress))throw Error('Duplicate speed profile key progress.');
    const limits=Array.from(zones,z=>{
        if(!z||!unit(z.start)||!unit(z.end)||z.start===z.end||!rate(z.maxMultiplier))throw Error('Invalid speed profile zone.');
        return Object.freeze({start:z.start,end:z.end,maxMultiplier:z.maxMultiplier});
    });
    return Object.freeze({keys:Object.freeze(sorted),zones:Object.freeze(limits),interpolation});
}
export function sampleSpeedProfile(profile:CompiledSpeedProfile,progress:number,closed:boolean):{multiplier:number;limit:number}{
    if(!unit(progress)||typeof closed!=='boolean')throw Error('Invalid speed profile sample progress.');
    if(!closed&&profile.zones.some(z=>z.start>z.end))throw Error('Wrapped speed zone requires a closed spline.');
    const keys=profile.keys;
    let multiplier=1;
    if(keys.length){
        if(progress<=keys[0].progress)multiplier=keys[0].multiplier;
        else if(progress>=keys[keys.length-1].progress)multiplier=keys[keys.length-1].multiplier;
        else{
            let lo=0,hi=keys.length-1;
            while(lo+1<hi){const mid=(lo+hi)>>>1;if(keys[mid].progress<=progress)lo=mid;else hi=mid;}
            const a=keys[lo],b=keys[hi];
            let u=(progress-a.progress)/(b.progress-a.progress);
            if(profile.interpolation===SpeedProfileInterpolation.Step)u=0;
            else if(profile.interpolation===SpeedProfileInterpolation.SmoothStep)u=u*u*(3-2*u);
            multiplier=a.multiplier+(b.multiplier-a.multiplier)*u;
        }
    }
    let limit=Infinity;
    // Closed seam belongs to progress 0 for zone membership. 0..1 covers all.
    const p=closed&&progress===1?0:progress;
    for(const z of profile.zones){
        const inside=z.start<z.end?(p>=z.start&&(p<z.end||!closed&&p===1&&z.end===1)):
            (p>=z.start||p<z.end);
        if(inside)limit=Math.min(limit,z.maxMultiplier);
    }
    return {multiplier,limit};
}
/** Exact time average for a linear ramp with target saturation. 0 slope
 * means instantaneous response; a zero current value permits startup. */
export function rampPlaybackRate(current:number,target:number,dt:number,acceleration:number,deceleration:number):{end:number;average:number}{
    if(![current,target,dt,acceleration,deceleration].every(Number.isFinite)||current<0||target<0||current>10000||target>10000||dt<=0||
       acceleration<0||deceleration<0||acceleration>10000||deceleration>10000)
        throw Error('Invalid playback rate ramp.');
    const slope=target>=current?acceleration:deceleration,delta=target-current;
    if(slope===0||delta===0)return {end:target,average:target};
    const time=Math.min(dt,Math.abs(delta)/slope),end=current+Math.sign(delta)*slope*time;
    const average=((current+end)*.5*time+target*(dt-time))/dt;
    return {end:time<dt?target:end,average};
}

/** World-distance envelope for upcoming zone entries on the current spline.
 * Rate is dimensionless; this is not a physical acceleration guarantee.
 * Caller supplies the validated sampled centerline arc. */
export function lookaheadSpeedZoneLimit(zones:ReadonlyArray<Readonly<SpeedProfileZoneData>>,
    progress:number,direction:1|-1,wrap:boolean,lookahead:number,target:number,
    length:number,distanceAt:(progress:number)=>number):number{
    if(!Number.isFinite(progress)||progress<0||progress>1||
       (direction!==1&&direction!==-1)||!Number.isFinite(lookahead)||lookahead<0||
       !Number.isFinite(target)||target<0||!Number.isFinite(length)||length<=0)
        throw Error('Invalid speed zone lookahead.');
    if(lookahead===0)return Infinity;
    const here=distanceAt(progress);
    let limit=Infinity;
    for(const z of zones){
        if(z.maxMultiplier>=target||(z.start===1&&z.end===0))continue;
        const entry=direction===1?z.start:z.end;
        let distance=direction*(distanceAt(entry)-here);
        if(distance<0&&wrap)distance+=length;
        if(distance<0||distance>=lookahead)continue;
        const u=distance/lookahead;
        limit=Math.min(limit,Math.sqrt(z.maxMultiplier*z.maxMultiplier+
            (target*target-z.maxMultiplier*z.maxMultiplier)*u));
    }
    return limit;
}
