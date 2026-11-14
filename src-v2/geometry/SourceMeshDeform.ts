import {type SplineCacheV2} from '../core/SplineCache';
import {type SplineDataV2} from '../core/SplineCurves';
import {buildSplineFramesV2,frameAtDistanceV2,type SplineFramesOptionsV2} from '../core/SplineFrames';
import {buildMeshV2,type MeshDataV2,type Vec3MeshV2,type Vec4MeshV2,type Vec2MeshV2} from './MeshData';

export type SourceLongitudinalAxisV2='z'|'x';
export type SourceUVTileModeV2='preserve'|'advance';
export interface MeshDeformOptionsV2 {
    /** Which local axis of the authored mesh runs along the spline. */
    readonly longitudinalAxis?:SourceLongitudinalAxisV2;
    /** How many copies of the original module are placed end to end. */
    readonly repeatCount?:number;
    /** Advance UV0 by the original UV span per copy, or preserve its atlas. */
    readonly uvTileMode?:SourceUVTileModeV2;
    readonly longitudinalUVAxis?:'u'|'v';
    /** Shift source lateral geometric midpoint to the spline centreline. */
    readonly centerLateral?:boolean;
    /** Keep source y unmodified relative to the transported frame's up. */
    readonly verticalOffset?:number;
    /** Frame resolution is used for orientation interpolation, not source topology. */
    readonly maxFrameStep?:number;
    readonly maxAngleDegrees?:number;
    readonly maxChordError?:number;
    /** Roll values from original Path when ConstantWidth builds a fillet. */
    readonly rollSource?:SplineDataV2;
}
export interface MeshDeformReportV2 {
    readonly sourceVertexCount:number;
    readonly outputVertexCount:number;
    readonly copies:number;
    readonly sourceLongitudinalLength:number;
    readonly pathLength:number;
    readonly preservedUV2:boolean;
    readonly sourceSectionRows:number;
}
/**
 * Maps every original source vertex into an arc-length based Cocos spline
 * frame without modifying its authored UV0/UV2 topology.
 *
 * Contract: no mesh subdivision or junction union. Source geometry MUST have
 * sufficient longitudinal edges to bend smoothly. In 'advance' tile mode,
 * the UV0 longitudinal coordinate receives one source UV span per copy. For a
 * repeat-wrapped texture the module start/end UVs must already tile; atlas
 * textures should use 'preserve'. UV2 repeats as authored, not a lightmap atlas.
 */
export function deformSourceMeshV2(cache:SplineCacheV2,source:MeshDataV2,
    options:MeshDeformOptionsV2={}):{mesh:MeshDataV2;report:MeshDeformReportV2}{
    const axis=options.longitudinalAxis??'z',copies=options.repeatCount??1;
    const uvMode=options.uvTileMode??'preserve';
    const uvAxis=options.longitudinalUVAxis??'v';
    const offset=options.verticalOffset??0,step=options.maxFrameStep??.25;
    if(axis!=='z'&&axis!=='x')throw new Error('Source mesh axis must be z or x');
    if(!Number.isSafeInteger(copies)||copies<1||copies>128)throw new Error('Source mesh repeatCount must be 1..128');
    if(uvMode!=='preserve'&&uvMode!=='advance')throw new Error('Source mesh UV Tile mode is invalid');
    if(uvAxis!=='u'&&uvAxis!=='v')throw new Error('Source mesh longitudinal UV axis must be U or V');
    if(!Number.isFinite(offset)||!Number.isFinite(step)||step<=0)throw new Error('Source mesh offset/frame step invalid');
    if(source.vertexCount*copies>250000)throw new Error('Source mesh deformation exceeds 250000 vertices');
    if(cache.length<=1e-7)throw new Error('Source mesh requires a nonzero-length spline');
    const li=axis==='z'?2:0,sideIndex=axis==='z'?0:2;
    let low=Infinity,high=-Infinity,sideLow=Infinity,sideHigh=-Infinity;
    const sections=new Set<number>();
    for(let i=0;i<source.vertexCount;i++){
        const v=source.positions[3*i+li],l=source.positions[3*i+sideIndex];
        low=Math.min(low,v);high=Math.max(high,v);sideLow=Math.min(sideLow,l);sideHigh=Math.max(sideHigh,l);
        sections.add(Math.round(v*10000)/10000);
    }
    const sourceLength=high-low;
    if(sourceLength<1e-7)throw new Error('Source mesh has zero length along selected local axis');
    const halfOrigin=options.centerLateral===false?0:(sideLow+sideHigh)*.5;
    const uvIdx=uvAxis==='u'?0:1;
    let uvMin=Infinity,uvMax=-Infinity;
    for(let i=0;i<source.vertexCount;i++){
        const u=source.uv0[2*i+uvIdx];uvMin=Math.min(uvMin,u);uvMax=Math.max(uvMax,u);
    }
    const uvSpan=uvMax-uvMin;
    const frameOptions:SplineFramesOptionsV2={
        maxStep:step,maxAngleDegrees:options.maxAngleDegrees,
        maxChordError:options.maxChordError,
        rollSource:options.rollSource
    };
    const table=buildSplineFramesV2(cache,frameOptions);
    const positions:Vec3MeshV2[]=[],normals:Vec3MeshV2[]=[],tangents:Vec4MeshV2[]=[],uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[];
    const submeshes=source.submeshes.map(group=>({materialSlot:group.materialSlot,indices:[] as number[]}));
    const normalize=(p:Vec3MeshV2):Vec3MeshV2=>{
        const length=Math.hypot(p.x,p.y,p.z)||1;
        return {x:p.x/length,y:p.y/length,z:p.z/length};
    };
    for(let tile=0;tile<copies;tile++){
        for(let i=0;i<source.vertexCount;i++){
            const idx=i*3;
            const normalized=(source.positions[idx+li]-low)/sourceLength;
            const distance=cache.length*(tile+normalized)/copies;
            const frame=frameAtDistanceV2(cache,table,distance);
            // For source Z-long: X->right, Y->up, Z->tangent.
            // For source X-long: X->tangent, Y->up, Z->-right.
            // Both are proper, orientation-preserving rotations.
            const lateral=axis==='z'
                ?source.positions[idx]-halfOrigin
                :-(source.positions[idx+2]-halfOrigin);
            const vector=(x:number,y:number,z:number):Vec3MeshV2=>{
                const side=axis==='z'?x:-z,along=axis==='z'?z:x;
                return {x:frame.right.x*side+frame.up.x*y+frame.tangent.x*along,
                    y:frame.right.y*side+frame.up.y*y+frame.tangent.y*along,
                    z:frame.right.z*side+frame.up.z*y+frame.tangent.z*along};
            };
            const y=source.positions[idx+1]+offset;
            positions.push({x:frame.position.x+frame.right.x*lateral+frame.up.x*y,
                y:frame.position.y+frame.right.y*lateral+frame.up.y*y,
                z:frame.position.z+frame.right.z*lateral+frame.up.z*y});
            const normal=vector(source.normals[idx],source.normals[idx+1],source.normals[idx+2]);
            normals.push(normalize(normal));
            const t=4*i;
            const tangent=normalize(vector(source.tangents[t],source.tangents[t+1],source.tangents[t+2]));
            tangents.push({...tangent,w:source.tangents[t+3]});
            const u=source.uv0[2*i],v=source.uv0[2*i+1];
            uv0.push(uvMode==='advance'
                ?uvAxis==='u'?{x:u+tile*uvSpan,y:v}:{x:u,y:v+tile*uvSpan}
                :{x:u,y:v});
            if(source.uv2)uv2.push({x:source.uv2[2*i],y:source.uv2[2*i+1]});
        }
        const shift=tile*source.vertexCount;
        source.submeshes.forEach((group,k)=>{
            for(const index of group.indices)submeshes[k].indices.push(index+shift);
        });
    }
    const mesh=buildMeshV2({positions,normals,tangents,uv0,
        uv2:source.uv2?uv2:undefined,submeshes});
    return {mesh,report:{sourceVertexCount:source.vertexCount,outputVertexCount:mesh.vertexCount,
        copies,sourceLongitudinalLength:sourceLength,pathLength:cache.length,
        preservedUV2:!!source.uv2,sourceSectionRows:sections.size}};
}
