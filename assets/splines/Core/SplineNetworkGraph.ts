/** Deterministic, direction-aware shortest path over SplineJunction links.
 *
 * Pure route planner; never mutates Nodes, Components, serialized links, or
 * follower state. Cost is distance in each spline's LOCAL arc units plus a
 * configurable transfer penalty. Not world-space traffic/mesh routing.
 */
export type NetworkDirection=1|-1;
export interface NetworkSpline {id:string;length:number;closed?:boolean}
export interface NetworkLink {
    splineId:string; progress:number;
    /** Serialized SplineJunctionLink index; do not renumber filtered links. */
    linkIndex:number;
    /** 0 = preserve incoming direction, 1 = forward, 2 = backward. */
    exitDirection?:0|1|2;
    world?:{x:number;y:number;z:number};
}
export interface NetworkJunction {id:string;links:readonly NetworkLink[]}
export interface NetworkAnchor {splineId:string;progress:number}
export interface NetworkRouteOptions {
    startDirection?:NetworkDirection;
    transferPenalty?:number;
    /** If set, reject transfers with no world coordinates or an excessive gap. */
    maxWorldGap?:number;
}
export interface NetworkTravel {
    kind:'travel';splineId:string;fromProgress:number;toProgress:number;
    direction:NetworkDirection;distance:number;
}
export interface NetworkSwitch {
    kind:'switch';junctionId:string;entryIndex:number;exitIndex:number;
    fromSplineId:string;toSplineId:string;
    fromProgress:number;toProgress:number;
    direction:NetworkDirection;distance:0;
}
export type NetworkRouteStep=NetworkTravel|NetworkSwitch;
export interface NetworkRoute {
    steps:NetworkRouteStep[];distance:number;cost:number;switchCount:number;
}
type Edge={to:number;cost:number;step:NetworkRouteStep};
type State={splineId:string;progress:number;direction:NetworkDirection};
type QueueItem={id:number;cost:number;switches:number};
const EPS=1e-9;
const finite=(n:number)=>Number.isFinite(n);
function key(id:string,p:number):string{return id+'@'+p.toFixed(10);}
function checkAnchor(a:NetworkAnchor,known:Map<string,NetworkSpline>):void{
    if(!a||!known.has(a.splineId)||!finite(a.progress)||a.progress<0||a.progress>1)
        throw Error('Network anchor must reference a known spline at progress 0..1.');
}
function compare(a:QueueItem,b:QueueItem):number{
    return a.cost-b.cost||a.switches-b.switches||a.id-b.id;
}
/** Binary heap for O((V+E)log V) Dijkstra; lexicographic stability by node ID. */
class Heap {
    private items:QueueItem[]=[];
    get length():number{return this.items.length;}
    push(v:QueueItem):void{
        const a=this.items;let i=a.length;a.push(v);
        while(i>0){const p=(i-1)>>1;if(compare(a[p],v)<=0)break;a[i]=a[p];i=p;}
        a[i]=v;
    }
    pop():QueueItem|undefined{
        const a=this.items;if(!a.length)return undefined;
        const top=a[0],last=a.pop()!;
        if(a.length){
            let i=0;
            while(true){
                const left=2*i+1;if(left>=a.length)break;
                const right=left+1;
                const child=right<a.length&&compare(a[right],a[left])<0?right:left;
                if(compare(a[child],last)>=0)break;
                a[i]=a[child];i=child;
            }
            a[i]=last;
        }
        return top;
    }
}
/**
 * Link switches are bidirectional as in SplineJunction.pick(). Destination
 * exitDirection controls the direction of the resulting traversal state.
 * No arbitrary mid-spline U-turns; a follower can reverse only where a
 * junction's selected exit explicitly permits it.
 */
export function findNetworkRoute(
    splines:readonly NetworkSpline[],junctions:readonly NetworkJunction[],
    start:NetworkAnchor,goal:NetworkAnchor,options:NetworkRouteOptions={},
):NetworkRoute|null {
    if(!Array.isArray(splines)||!Array.isArray(junctions)||
       splines.length>512||junctions.length>512)
        throw Error('Network exceeds 512 splines/junctions.');
    const penalty=options.transferPenalty??0;
    const maxGap=options.maxWorldGap;
    if(!finite(penalty)||penalty<0||penalty>1e9||
       (maxGap!==undefined&&(!finite(maxGap)||maxGap<0))||
       (options.startDirection!==undefined&&options.startDirection!==1&&options.startDirection!==-1))
        throw Error('Invalid Network route options.');
    const bySpline=new Map<string,NetworkSpline>();
    for(const s of splines){
        if(!s||!s.id||typeof s.id!=='string'||s.id.length>256||
           !finite(s.length)||s.length<=EPS||typeof s.closed!=='boolean'&&s.closed!==undefined||
           bySpline.has(s.id))throw Error('Invalid or duplicate Network spline.');
        bySpline.set(s.id,s);
    }
    checkAnchor(start,bySpline);checkAnchor(goal,bySpline);
    const points=new Map<string,Map<string,number>>();
    for(const s of bySpline.values())points.set(s.id,new Map([['0.0000000000',0],['1.0000000000',1]]));
    const insert=(a:NetworkAnchor):void=>{
        // Quantize only the waypoint identity; keep original value in the graph
        // and use a consistent key for marker-to-edge lookup.
        const p=Math.round(a.progress*1e10)/1e10;
        points.get(a.splineId)!.set(p.toFixed(10),p);
    };
    insert(start);insert(goal);
    const orderedJunctions=[...junctions].sort((a,b)=>String(a?.id).localeCompare(String(b?.id)));
    const junctionIDs=new Set<string>(),linkTotal=orderedJunctions.reduce((n,j)=>n+(j?.links?.length||0),0);
    if(linkTotal>2048)throw Error('Network exceeds 2048 links.');
    for(const j of orderedJunctions){
        if(!j||typeof j.id!=='string'||!j.id||j.id.length>256||
           junctionIDs.has(j.id)||!Array.isArray(j.links))
            throw Error('Invalid or duplicate Network junction.');
        junctionIDs.add(j.id);
        const used=new Set<number>();
        for(const l of j.links){
            if(!l||!bySpline.has(l.splineId)||!finite(l.progress)||
               l.progress<0||l.progress>1||!Number.isInteger(l.linkIndex)||
               l.linkIndex<0||used.has(l.linkIndex)||
               (l.exitDirection!==undefined&&![0,1,2].includes(l.exitDirection)))
                throw Error('Invalid Network junction link.');
            used.add(l.linkIndex);
            insert({splineId:l.splineId,progress:l.progress});
        }
    }
    // Fail before allocating millions of edges for highly connected junctions.
    // Every ordered pair of distinct links can transfer in both directions.
    const possibleTransfers=orderedJunctions.reduce(
        (total,j)=>total+2*j.links.length*(j.links.length-1),0);
    if(possibleTransfers>65536)
        throw Error('Network exceeds 65536 possible transfer edges.');
    const sortedSplines=[...bySpline.values()].sort((a,b)=>a.id.localeCompare(b.id));
    const state:State[]=[],index=new Map<string,number>(),adj:Edge[][]=[];
    const stateKey=(id:string,p:number,dir:NetworkDirection)=>key(id,p)+':'+dir;
    for(const s of sortedSplines){
        const values=[...points.get(s.id)!.values()].sort((a,b)=>a-b);
        for(const p of values)for(const dir of [1,-1] as const){
            const id=state.length;
            state.push({splineId:s.id,progress:p,direction:dir});
            index.set(stateKey(s.id,p,dir),id);adj.push([]);
        }
    }
    if(state.length>4096)throw Error('Network exceeds 4096 directional states.');
    const get=(id:string,p:number,dir:NetworkDirection):number=>{
        const found=index.get(stateKey(id,Math.round(p*1e10)/1e10,dir));
        if(found===undefined)throw Error('Network waypoint does not exist.');
        return found;
    };
    const edge=(from:number,to:number,step:NetworkRouteStep,cost:number):void=>{
        adj[from].push({to,step,cost});
    };
    for(const s of sortedSplines){
        const positions=[...points.get(s.id)!.values()].sort((a,b)=>a-b);
        for(let i=0;i<positions.length-1;i++){
            const a=positions[i],b=positions[i+1],distance=(b-a)*s.length;
            if(distance<=0)continue;
            edge(get(s.id,a,1),get(s.id,b,1),{
                kind:'travel',splineId:s.id,fromProgress:a,toProgress:b,
                direction:1,distance},distance);
            edge(get(s.id,b,-1),get(s.id,a,-1),{
                kind:'travel',splineId:s.id,fromProgress:b,toProgress:a,
                direction:-1,distance},distance);
        }
        if(s.closed){
            // For a closed curve 0 and 1 are the same geometric seam.
            for(const [a,b,dir] of [[1,0,1],[0,1,-1]] as const){
                edge(get(s.id,a,dir),get(s.id,b,dir),{
                    kind:'travel',splineId:s.id,fromProgress:a,toProgress:b,
                    direction:dir,distance:0},0);
            }
        }
    }
    for(const j of orderedJunctions){
        for(const entry of j.links)for(const exit of j.links){
            if(entry.linkIndex===exit.linkIndex)continue;
            if(maxGap!==undefined){
                const a=entry.world,b=exit.world;
                if(!a||!b||![a.x,a.y,a.z,b.x,b.y,b.z].every(finite)||
                   Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>maxGap)continue;
            }
            for(const dir of [1,-1] as const){
                const destinationDirection:NetworkDirection=
                    exit.exitDirection===1?1:exit.exitDirection===2?-1:dir;
                edge(get(entry.splineId,entry.progress,dir),
                     get(exit.splineId,exit.progress,destinationDirection),{
                    kind:'switch',junctionId:j.id,entryIndex:entry.linkIndex,
                    exitIndex:exit.linkIndex,fromSplineId:entry.splineId,
                    toSplineId:exit.splineId,fromProgress:entry.progress,
                    toProgress:exit.progress,direction:destinationDirection,distance:0,
                },penalty);
            }
        }
    }
    const totalEdges=adj.reduce((n,a)=>n+a.length,0);
    if(totalEdges>65536)throw Error('Network exceeds 65536 directed edges.');
    // Stable ordering across equal-cost alternatives, independent of input arrays.
    const edgeKey=(e:Edge):string=>e.step.kind==='switch'
        ?'S:'+e.step.junctionId+':'+e.step.entryIndex+':'+e.step.exitIndex
        :'T:'+e.step.splineId+':'+e.step.toProgress;
    for(const edges of adj)edges.sort((a,b)=>a.cost-b.cost||
        edgeKey(a).localeCompare(edgeKey(b))||a.to-b.to);
    const dist=new Array<number>(state.length).fill(Infinity),
          changes=new Array<number>(state.length).fill(Infinity),
          prev=new Array<{id:number;edge:Edge}|undefined>(state.length);
    const heap=new Heap();
    for(const dir of (options.startDirection?[options.startDirection]:[1,-1]) as NetworkDirection[]){
        const id=get(start.splineId,start.progress,dir);
        dist[id]=0;changes[id]=0;heap.push({id,cost:0,switches:0});
    }
    const destinations=new Set([get(goal.splineId,goal.progress,1),get(goal.splineId,goal.progress,-1)]);
    let finish=-1;
    while(heap.length){
        const item=heap.pop()!;
        if(item.cost>dist[item.id]+EPS||item.switches!==changes[item.id])continue;
        if(destinations.has(item.id)){finish=item.id;break;}
        for(const e of adj[item.id]){
            const cost=item.cost+e.cost;
            const switches=item.switches+(e.step.kind==='switch'?1:0);
            if(cost<dist[e.to]-EPS||
               (Math.abs(cost-dist[e.to])<=EPS&&switches<changes[e.to])){
                dist[e.to]=cost;changes[e.to]=switches;
                prev[e.to]={id:item.id,edge:e};
                heap.push({id:e.to,cost,switches});
            }
        }
    }
    if(finish<0)return null;
    const reversed:NetworkRouteStep[]=[];
    let cursor=finish;
    for(let i=0;i<=state.length;i++){
        const p=prev[cursor];if(!p)break;
        reversed.push(p.edge.step);cursor=p.id;
        if(i===state.length)throw Error('Network route contains a cycle.');
    }
    const steps=reversed.reverse();
    return {steps,distance:steps.reduce((n,s)=>n+s.distance,0),
        cost:dist[finish],switchCount:changes[finish]};
}
