/** Opt-in, approximate swept-sphere world-proximity admission.
 * All registered followers are modeled as stationary spheres at their latest
 * known world positions. Segment-sphere intersections prevent large dt from
 * tunneling across the sampled polyline of a follower's candidate path.
 * NOT a rigid-body collision solver or a multiplayer authoritative system.
 */
export interface ProximityPoint {x:number;y:number;z:number}
export interface ProximityOccupant {position:ProximityPoint;radius:number}
export interface ProximityPlan {
    fraction:number;
    limited:boolean;
    stopped:boolean;
    obstacle:object|null;
    nearestWorldDistance:number|null;
}
const finite=(x:number)=>Number.isFinite(x);
const validPoint=(p:ProximityPoint)=>!!p&&finite(p.x)&&finite(p.y)&&finite(p.z);
const d2=(a:ProximityPoint,b:ProximityPoint)=>{
    const x=a.x-b.x,y=a.y-b.y,z=a.z-b.z;return x*x+y*y+z*z;
};
function segmentEntry(a:ProximityPoint,b:ProximityPoint,center:ProximityPoint,radius:number):number|null{
    const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z;
    const dx=a.x-center.x,dy=a.y-center.y,dz=a.z-center.z;
    const c=dx*dx+dy*dy+dz*dz-radius*radius;
    if(c<=0)return 0; // Pre-existing overlap stops until reconfigured/moved
    const aa=ux*ux+uy*uy+uz*uz;
    if(aa<=1e-14)return null;
    const halfB=dx*ux+dy*uy+dz*uz;
    if(halfB>=0)return null; // Moving away
    const disc=halfB*halfB-aa*c;
    if(disc<0)return null;
    const hit=(-halfB-Math.sqrt(Math.max(0,disc)))/aa;
    return hit>=0&&hit<=1?hit:null;
}
/** Bounded static-obstacle polyline sweep. fraction is the maximum safe
 * fraction of the requested movement, conservatively before first entry.
 */
export function planSplineProximity(
    own:object,points:(fraction:number)=>ProximityPoint,
    occupants:ReadonlyMap<object,ProximityOccupant>,
    radius:number,safetyGap:number,samples=16,
):ProximityPlan{
    if(!own||typeof points!=='function'||!finite(radius)||radius<=0||radius>100||
       !finite(safetyGap)||safetyGap<0||safetyGap>100||
       !Number.isInteger(samples)||samples<2||samples>64)
        throw Error('Invalid spline proximity sweep.');
    const start=points(0);
    if(!validPoint(start))throw Error('Invalid starting proximity world position.');
    let first=1,obstacle:object|null=null,nearest=Infinity;
    for(const [id,other] of occupants){
        if(id===own)continue;
        if(!other||!validPoint(other.position)||!finite(other.radius)||
           other.radius<=0||other.radius>100)continue;
        nearest=Math.min(nearest,Math.sqrt(d2(start,other.position)));
        const threshold=radius+other.radius+safetyGap;
        let previous=start;
        for(let j=1;j<=samples;j++){
            const progress=j/samples,point=points(progress);
            if(!validPoint(point))throw Error('Invalid proximity path world position.');
            const entry=segmentEntry(previous,point,other.position,threshold);
            if(entry!==null){
                const hit=(j-1+entry)/samples;
                if(hit<first){
                    first=Math.max(0,hit-1e-5);
                    obstacle=id;
                }
                break;
            }
            previous=point;
        }
    }
    // Conservative tolerance for imminent contact: without this, repeated
    // sweeps can asymptotically creep toward a sphere by microscopic steps,
    // never entering an actual stopped state or firing the blocked event.
    const safeFraction=first<=1e-3?0:first;
    return {fraction:safeFraction,limited:safeFraction<1-1e-8,
        stopped:safeFraction===0,obstacle,
        nearestWorldDistance:nearest===Infinity?null:nearest};
}
export class SplineProximityRegistry {
    private readonly occupants=new Map<object,ProximityOccupant>();
    public set(owner:object,position:ProximityPoint,radius:number):void{
        if(!owner||!validPoint(position)||!finite(radius)||radius<=0||radius>100)
            throw Error('Invalid spline proximity occupant.');
        this.occupants.set(owner,{position:{x:position.x,y:position.y,z:position.z},radius});
    }
    public remove(owner:object):void{this.occupants.delete(owner);}
    public get(owner:object):ProximityOccupant|null{
        const value=this.occupants.get(owner);
        return value?{radius:value.radius,position:{...value.position}}:null;
    }
    public get size():number{return this.occupants.size;}
    public limit(owner:object,points:(fraction:number)=>ProximityPoint,
        radius:number,safetyGap:number,samples=16):ProximityPlan{
        return planSplineProximity(owner,points,this.occupants,radius,safetyGap,samples);
    }
    public clear():void{this.occupants.clear();}
}
export const splineProximityRegistry=new SplineProximityRegistry();
