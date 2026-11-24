/**
 * Pure deterministic multi-octave 1D value noise for spline-frame population offsets.
 * Progress is normalized arc progress. No Math.random / global mutable state.
 * All closed-loop layers tile exactly at the 0/1 seam.
 */
export interface NoiseVector { x:number;y:number;z:number }
export interface NoiseLayerConfig {
    enabled:boolean;
    frequency:number;
    octaves:number;
    persistence:number;
    phase:number;
    seed:number;
    amplitude:NoiseVector;
    fadeEnds:number;
}
const finite=(v:number)=>typeof v==='number'&&Number.isFinite(v);
const bounded=(v:number,lo:number,hi:number)=>finite(v)&&v>=lo&&v<=hi;
const fract=(v:number)=>v-Math.floor(v);
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(t:number)=>t*t*(3-2*t);
/** Positive unbiased hash value in [-1,1], independent for each axis/lattice. */
function valueHash(seed:number,lattice:number,axis:number):number {
    let x=(seed|0)^Math.imul(lattice|0,0x9e3779b9)^Math.imul(axis+1,0x85ebca6b);
    x=Math.imul(x^(x>>>16),0x7feb352d);
    x=Math.imul(x^(x>>>15),0x846ca68b);
    return ((x^(x>>>16))>>>0)/2147483647.5-1;
}
/** Multi-octave output is normalized to [-1,1] before multiplying amplitude. */
export function sampleNoiseLayers(
    layers:ReadonlyArray<NoiseLayerConfig>,progress:number,seed:number,closed:boolean
):NoiseVector {
    const zero=():NoiseVector=>({x:0,y:0,z:0});
    if(!Array.isArray(layers)||!finite(progress)||!Number.isSafeInteger(seed)||
       Math.abs(seed)>0x7fffffff)
        throw Error('Invalid spline noise input or global integer seed.');
    if(layers.length>16)throw Error('Noise supports up to 16 layers.');
    const p=closed?((progress%1)+1)%1:Math.max(0,Math.min(1,progress));
    const result=zero();
    for(const layer of layers){
        if(!layer.enabled)continue;
        if(!Number.isSafeInteger(layer.frequency)||layer.frequency<1||layer.frequency>64||
           !Number.isSafeInteger(layer.octaves)||layer.octaves<1||layer.octaves>6||
           !bounded(layer.persistence,0,1)||!bounded(layer.phase,-1000,1000)||
           !Number.isSafeInteger(layer.seed)||Math.abs(layer.seed)>0x7fffffff||
           !bounded(layer.fadeEnds,0,.5)||
           !layer.amplitude||!['x','y','z'].every(axis=>
               bounded(layer.amplitude[axis as keyof NoiseVector],-10000,10000)))
            throw Error('Invalid enabled spline noise layer settings.');
        let weight=1,sum=0;
        const channels=[0,0,0];
        for(let octave=0;octave<layer.octaves;octave++){
            const cycles=layer.frequency*(1<<octave); // integer, periodic when closed
            const coord=p*cycles+layer.phase;
            const a=Math.floor(coord),t=smooth(fract(coord));
            const latticeA=closed?((a%cycles)+cycles)%cycles:a;
            const latticeB=closed?(latticeA+1)%cycles:a+1;
            for(let axis=0;axis<3;axis++){
                const noise=lerp(valueHash(seed^layer.seed,latticeA,axis),
                                 valueHash(seed^layer.seed,latticeB,axis),t);
                channels[axis]+=noise*weight;
            }
            sum+=weight;weight*=layer.persistence;
        }
        let envelope=1;
        if(!closed&&layer.fadeEnds>0){
            envelope=smooth(Math.min(1,p/layer.fadeEnds))*
                     smooth(Math.min(1,(1-p)/layer.fadeEnds));
        }
        result.x+=channels[0]/sum*layer.amplitude.x*envelope;
        result.y+=channels[1]/sum*layer.amplitude.y*envelope;
        result.z+=channels[2]/sum*layer.amplitude.z*envelope;
    }
    return result;
}
