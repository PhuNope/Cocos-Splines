import type {NetworkRoute} from './SplineNetworkGraph';

/** Bounded, deterministic memo for compiled network snapshots and shortest paths.
 * No engine imports. Graph snapshots belong to this cache; route results are
 * defensively copied because callers may annotate/modify preview steps.
 */
export interface NetworkCacheStats {
    snapshots:number;paths:number;graphBuilds:number;graphHits:number;
    routeComputes:number;routeHits:number;
}
type Snapshot<T>={value:T;routes:Map<string,NetworkRoute|null>};
function copyRoute(route:NetworkRoute|null):NetworkRoute|null{
    return route?{cost:route.cost,distance:route.distance,
        switchCount:route.switchCount,steps:route.steps.map(s=>({...s}))}:null;
}
export class SplineNetworkMemo<T>{
    private readonly entries=new Map<string,Snapshot<T>>();
    private graphBuilds=0;
    private graphHits=0;
    private routeComputes=0;
    private routeHits=0;
    constructor(private readonly maxSnapshots=4,private readonly maxRoutes=64){
        if(!Number.isInteger(maxSnapshots)||maxSnapshots<1||maxSnapshots>32||
           !Number.isInteger(maxRoutes)||maxRoutes<1||maxRoutes>1024)
            throw Error('Invalid Spline Network cache capacity.');
    }
    /** Move accessed graph snapshot to the LRU tail. */
    public snapshot(key:string,build:()=>T):T{
        const cached=this.entries.get(key);
        if(cached){
            this.graphHits++;
            this.entries.delete(key);this.entries.set(key,cached);
            return cached.value;
        }
        const value=build(); // Failure is never cached.
        this.entries.set(key,{value,routes:new Map()});
        this.graphBuilds++;
        if(this.entries.size>this.maxSnapshots){
            const oldest=this.entries.keys().next().value;
            if(oldest!==undefined)this.entries.delete(oldest);
        }
        return value;
    }
    public route(snapshotKey:string,routeKey:string,calculate:()=>NetworkRoute|null):NetworkRoute|null{
        const entry=this.entries.get(snapshotKey);
        if(!entry)throw Error('Network cache snapshot must be prepared before route lookup.');
        if(entry.routes.has(routeKey)){
            this.routeHits++;
            const route=entry.routes.get(routeKey)!;
            // Mark this route as recently used too.
            entry.routes.delete(routeKey);entry.routes.set(routeKey,route);
            return copyRoute(route);
        }
        const route=copyRoute(calculate());
        entry.routes.set(routeKey,route);
        this.routeComputes++;
        if(entry.routes.size>this.maxRoutes){
            const oldest=entry.routes.keys().next().value;
            if(oldest!==undefined)entry.routes.delete(oldest);
        }
        return copyRoute(route);
    }
    public clear():void{
        this.entries.clear();
    }
    public get stats():NetworkCacheStats{
        return {snapshots:this.entries.size,
            paths:[...this.entries.values()].reduce((n,s)=>n+s.routes.size,0),
            graphBuilds:this.graphBuilds,graphHits:this.graphHits,
            routeComputes:this.routeComputes,routeHits:this.routeHits};
    }
}
