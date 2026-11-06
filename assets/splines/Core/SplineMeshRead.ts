/** Mesh attribute conversion, compatible with Cocos-Gizmos DrawMesh v2.0.3.
 * Pure TypeScript: usable in unit tests without loading the Cocos engine.
 * Mesh.readAttribute() returns Uint16 half-float BITS for RGB16F / RG16F.
 * Signed and unsigned 16-bit integer formats are already numeric values.
 */
export type VertexFormat =
    'RGB32F'|'RGB16F'|'RGB16I'|'RGB16UI'|'RGB32I'|'RGB32UI'|
    'RG32F'|'RG16F'|'RG16I'|'RG16UI'|'RG32I'|'RG32UI'|'UNSUPPORTED';

/** Cocos Creator 3.8.x Mesh.readAttributeFormat() returns a FormatInfo OBJECT
 * {name:'RGB32F', size:12, count:3, ...}, not gfx.Format.RGB32F (a number).
 * Accept the object, legacy numeric values and the raw vertex-bundle format.
 * Never guess a float format from a TypedArray alone: for RGB16F the Uint16Array
 * contains IEEE754 half bits, which look like ordinary integers.
 */
export function resolveAttributeFormatName(
    reported: unknown, formats: Readonly<Record<string, number|string>>,
    stored?: unknown,
): string {
    const nameOf=(candidate:unknown):string=>{
        if(typeof candidate==='string')return candidate;
        if(candidate!==null&&typeof candidate==='object'){
            const info=candidate as {name?:unknown,format?:unknown};
            if(typeof info.name==='string'&&info.name.length>0)return info.name;
            if(typeof info.format==='number'||typeof info.format==='string')return nameOf(info.format);
        }
        if(typeof candidate==='number'){
            if(typeof formats[candidate]==='string')return formats[candidate] as string;
            const found=Object.keys(formats).find(k=>formats[k]===candidate&&Number.isNaN(Number(k)));
            return found||'';
        }
        return '';
    };
    return nameOf(reported)||nameOf(stored)||'UNKNOWN';
}

/** Find the raw gfx.Format enum from the primitive's actual vertex bundle.
 * Do not assume primitive index === vertex bundle index (multi-buffer meshes).
 */
export function findStoredAttributeFormat(mesh: {
    struct?:{primitives?:Array<{vertexBundelIndices?:number[]}>,
              vertexBundles?:Array<{attributes?:Array<{name:string,format:unknown}>}>}
}, primitiveIndex:number, attributeName:string):unknown {
    const structure=mesh?.struct;
    const primitive=structure?.primitives?.[primitiveIndex];
    if(!primitive||!Array.isArray(primitive.vertexBundelIndices))return null;
    for(const bundleIndex of primitive.vertexBundelIndices){
        const attr=structure?.vertexBundles?.[bundleIndex]?.attributes?.find(a=>a.name===attributeName);
        if(attr)return attr.format;
    }
    return null;
}

export function decodeHalfFloat(bits:number):number {
    const sign=(bits&0x8000)?-1:1;
    const exponent=(bits>>>10)&31;
    const fraction=bits&1023;
    if(exponent===0)return sign*(fraction===0?0:Math.pow(2,-14)*(fraction/1024));
    if(exponent===31)return fraction===0?sign*Infinity:NaN;
    return sign*Math.pow(2,exponent-15)*(1+fraction/1024);
}
function decodeTuple(values:ArrayLike<number>,format:VertexFormat,count:number):number[]{
    const prefix=count===3?'RGB':'RG';
    if(format!==(prefix+'32F')&&format!==(prefix+'16F')&&
       format!==(prefix+'16I')&&format!==(prefix+'16UI')&&
       format!==(prefix+'32I')&&format!==(prefix+'32UI')){
        throw new Error('Source '+(count===3?'POSITION':'UV0')+' format '+format+
            ' not supported. Supported: '+prefix+'32F, '+prefix+'16F, '+prefix+'16I, '+prefix+'16UI, '+prefix+'32I, '+prefix+'32UI. '+
            'Check Mesh Import Settings / packed vertex attributes; do not treat compressed or normalized positions as raw coordinates.');
    }
    if(!values||values.length===0||values.length%count!==0)
        throw new Error('Source '+(count===3?'POSITION':'UV0')+' has invalid attribute length.');
    const half=format.endsWith('16F');
    const output=new Array<number>(values.length);
    for(let i=0;i<values.length;i++){
        const decoded=half?decodeHalfFloat(Number(values[i])):Number(values[i]);
        if(!Number.isFinite(decoded))throw Error('Source mesh contains invalid numeric attributes');
        output[i]=decoded;
    }
    return output;
}
export function readPositionTriples(values:ArrayLike<number>,format:VertexFormat):number[]{
    return decodeTuple(values,format,3);
}
export function readUVPairs(values:ArrayLike<number>,format:VertexFormat):number[]{
    return decodeTuple(values,format,2);
}

/** Decode optional source shading normals. Preserves smooth vertex normals,
 * including duplicated UV seam vertices on imported meshes. Unsupported normal
 * formats deliberately return null; the deformer then recomputes normals.
 */
export function readNormalTriples(values:ArrayLike<number>|null,format:string):number[]|null {
    if(!values)return null;
    const match=/^(RGB|RGBA)(32F|16F|8SN|16I|16UI|32I|32UI)$/.exec(format);
    if(!match)return null;
    const stride=match[1]==='RGB'?3:4;
    if(values.length%stride!==0)return null;
    const result:number[]=[];
    for(let i=0;i<values.length;i+=stride){
        const n:number[]=[];
        for(let c=0;c<3;c++){
            const raw=Number(values[i+c]);
            const val=match[2]==='16F'?decodeHalfFloat(raw):
                match[2]==='8SN'?Math.max(-1,raw/127):raw;
            if(!Number.isFinite(val))return null;
            n.push(val);
        }
        const d=Math.hypot(...n);
        if(d<1e-8)return null;
        result.push(n[0]/d,n[1]/d,n[2]/d);
    }
    return result;
}
