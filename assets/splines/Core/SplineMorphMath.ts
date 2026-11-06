export interface XYZ{x:number;y:number;z:number}
export function morphPoint(a:XYZ,b:XYZ,weight:number):XYZ {
    const w=Math.max(0,Math.min(1,Number.isFinite(weight)?weight:0));
    return {x:a.x+(b.x-a.x)*w,y:a.y+(b.y-a.y)*w,z:a.z+(b.z-a.z)*w};
}
