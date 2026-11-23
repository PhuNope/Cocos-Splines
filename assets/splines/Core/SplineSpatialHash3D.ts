/** Sparse 3D center-cell spatial hash for opt-in proximity broadphase.
 * Items are stored once at their center; query AABB must be expanded by the
 * largest registered sphere radius. Oversized queries explicitly fall back
 * to all owners: never skip collisions because of a grid cell budget.
 */
export interface SpatialPoint3 {x:number;y:number;z:number}
export interface SpatialQuery3 {
    owners:Set<object>;
    visitedCells:number;
    fallback:boolean;
}
const valid=(p:SpatialPoint3)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
export class SplineSpatialHash3D {
    private readonly buckets=new Map<string,Set<object>>();
    private readonly cells=new Map<object,string>();
    private readonly all=new Set<object>();
    constructor(public readonly cellSize=8,public readonly maxQueryCells=4096){
        if(!Number.isFinite(cellSize)||cellSize<=0||cellSize>1000||
           !Number.isInteger(maxQueryCells)||maxQueryCells<1||maxQueryCells>65536)
            throw Error('Invalid spline spatial hash configuration.');
    }
    private key(x:number,y:number,z:number):string{return x+','+y+','+z;}
    private cell(p:SpatialPoint3):string{
        return this.key(Math.floor(p.x/this.cellSize),
            Math.floor(p.y/this.cellSize),Math.floor(p.z/this.cellSize));
    }
    public set(owner:object,position:SpatialPoint3):void{
        if(!owner||typeof owner!=='object'||!valid(position))
            throw Error('Invalid spatial occupant.');
        const key=this.cell(position),old=this.cells.get(owner);
        if(old===key)return;
        if(old!==undefined){
            const bucket=this.buckets.get(old);
            bucket?.delete(owner);
            if(bucket?.size===0)this.buckets.delete(old);
        }
        let bucket=this.buckets.get(key);
        if(!bucket){bucket=new Set();this.buckets.set(key,bucket);}
        bucket.add(owner);this.cells.set(owner,key);this.all.add(owner);
    }
    public remove(owner:object):void{
        const key=this.cells.get(owner);
        if(key===undefined)return;
        this.cells.delete(owner);this.all.delete(owner);
        const bucket=this.buckets.get(key);
        bucket?.delete(owner);
        if(bucket?.size===0)this.buckets.delete(key);
    }
    public query(min:SpatialPoint3,max:SpatialPoint3):SpatialQuery3{
        if(!valid(min)||!valid(max)||min.x>max.x||min.y>max.y||min.z>max.z)
            throw Error('Invalid spatial query bounds.');
        const lo=[min.x,min.y,min.z].map(n=>Math.floor(n/this.cellSize));
        const hi=[max.x,max.y,max.z].map(n=>Math.floor(n/this.cellSize));
        const dims=lo.map((n,i)=>hi[i]-n+1);
        const count=dims[0]*dims[1]*dims[2];
        if(!Number.isSafeInteger(count)||count>this.maxQueryCells||
           lo.some(n=>!Number.isSafeInteger(n))||hi.some(n=>!Number.isSafeInteger(n))){
            return {owners:new Set(this.all),visitedCells:0,fallback:true};
        }
        const owners=new Set<object>();
        for(let x=lo[0];x<=hi[0];x++)
            for(let y=lo[1];y<=hi[1];y++)
                for(let z=lo[2];z<=hi[2];z++)
                    for(const owner of this.buckets.get(this.key(x,y,z))??[])
                        owners.add(owner);
        return {owners,visitedCells:count,fallback:false};
    }
    public get size():number{return this.cells.size;}
    public get cellCount():number{return this.buckets.size;}
    public clear():void{this.all.clear();this.cells.clear();this.buckets.clear();}
}
