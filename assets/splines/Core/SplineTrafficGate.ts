/** Opt-in, per-Junction-exit FIFO admission for spline followers.
 * Owners retain their previous granted slot while they queue for the next.
 * Fairness is deterministic by first blocked attempt (single-threaded runtime),
 * and never depends on a timer or follower update order after enqueue.
 */
export interface SplineTrafficSlot {junction:object;exitIndex:number}
const validSlot=(owner:object,junction:object,exitIndex:number,capacity:number):void=>{
    if(!owner||typeof owner!=='object'||!junction||typeof junction!=='object'||
       !Number.isInteger(exitIndex)||exitIndex<0||
       !Number.isInteger(capacity)||capacity<0||capacity>4096)
        throw Error('Invalid Junction traffic reservation.');
};
export class SplineTrafficGate{
    private readonly owners=new Map<object,SplineTrafficSlot>();
    private readonly occupancy=new Map<object,Map<number,Set<object>>>();
    private readonly queues=new Map<object,Map<number,object[]>>();
    private readonly queued=new Map<object,SplineTrafficSlot>();
    private readonly priorities=new Map<object,number>();
    public canEnter(owner:object,junction:object,exitIndex:number,capacity:number,
        green=true,priority=0):boolean{
        validSlot(owner,junction,exitIndex,capacity);
        if(typeof green!=='boolean'||!Number.isInteger(priority)||priority<0||priority>10)
            throw Error('Invalid Junction signal or traffic priority.');
        if(!green)return false;
        const current=this.owners.get(owner);
        if(current?.junction===junction&&current.exitIndex===exitIndex)return true;
        const owners=this.occupancy.get(junction)?.get(exitIndex);
        if(capacity>0&&(owners?.size??0)>=capacity)return false;
        const line=this.queues.get(junction)?.get(exitIndex);
        if(!line?.length||line[0]===owner)return true;
        // A newly arrived higher-priority request may overtake a lower-priority
        // waiting request. Equal priority keeps strict FIFO.
        return priority>(this.priorities.get(line[0])??0);
    }
    /** Failed move joins the FIFO once; a successful move cancels any previous
     * queue and atomically releases the previously occupied slot.
     */
    public move(owner:object,junction:object,exitIndex:number,capacity:number,
        green=true,priority=0):boolean{
        validSlot(owner,junction,exitIndex,capacity);
        if(!this.canEnter(owner,junction,exitIndex,capacity,green,priority)){
            this.enqueue(owner,junction,exitIndex,priority);
            return false;
        }
        this.cancelWait(owner);
        if(capacity===0){this.releaseReservation(owner);return true;}
        const old=this.owners.get(owner);
        if(old?.junction===junction&&old.exitIndex===exitIndex)return true;
        this.releaseReservation(owner);
        let byExit=this.occupancy.get(junction);
        if(!byExit){byExit=new Map();this.occupancy.set(junction,byExit);}
        let followers=byExit.get(exitIndex);
        if(!followers){followers=new Set();byExit.set(exitIndex,followers);}
        followers.add(owner);
        this.owners.set(owner,{junction,exitIndex});
        return true;
    }
    /** Move a waiting follower to a different link without losing an existing
     * granted slot. Never enqueue twice and never leave stale queue entries.
     */
    public enqueue(owner:object,junction:object,exitIndex:number,priority=0):void{
        validSlot(owner,junction,exitIndex,1);
        if(!Number.isInteger(priority)||priority<0||priority>10)
            throw Error('Invalid Junction traffic priority.');
        const previous=this.queued.get(owner);
        if(previous?.junction===junction&&previous.exitIndex===exitIndex&&
           this.priorities.get(owner)===priority)return;
        this.cancelWait(owner);
        let byExit=this.queues.get(junction);
        if(!byExit){byExit=new Map();this.queues.set(junction,byExit);}
        let queue=byExit.get(exitIndex);
        if(!queue){queue=[];byExit.set(exitIndex,queue);}
        // Priority order is descending, FIFO within each priority tier.
        const at=queue.findIndex(other=>(this.priorities.get(other)??0)<priority);
        if(at<0)queue.push(owner);else queue.splice(at,0,owner);
        this.queued.set(owner,{junction,exitIndex});
        this.priorities.set(owner,priority);
    }
    public cancelWait(owner:object):void{
        const wait=this.queued.get(owner);
        if(!wait)return;
        this.queued.delete(owner);
        this.priorities.delete(owner);
        const byExit=this.queues.get(wait.junction);
        const queue=byExit?.get(wait.exitIndex);
        if(queue){
            const at=queue.indexOf(owner);
            if(at>=0)queue.splice(at,1);
            if(queue.length===0)byExit?.delete(wait.exitIndex);
        }
        if(byExit?.size===0)this.queues.delete(wait.junction);
    }
    private releaseReservation(owner:object):void{
        const slot=this.owners.get(owner);
        if(!slot)return;
        this.owners.delete(owner);
        const exits=this.occupancy.get(slot.junction);
        const followers=exits?.get(slot.exitIndex);
        followers?.delete(owner);
        if(followers?.size===0)exits?.delete(slot.exitIndex);
        if(exits?.size===0)this.occupancy.delete(slot.junction);
    }
    public release(owner:object):void{
        this.cancelWait(owner);
        this.releaseReservation(owner);
    }
    public releaseJunction(junction:object):void{
        const occupied=this.occupancy.get(junction);
        if(occupied){
            for(const followers of occupied.values())
                for(const owner of followers)this.owners.delete(owner);
            this.occupancy.delete(junction);
        }
        const waiting=this.queues.get(junction);
        if(waiting){
            for(const line of waiting.values())
                for(const owner of line){this.queued.delete(owner);this.priorities.delete(owner);}
            this.queues.delete(junction);
        }
    }
    public count(junction:object,exitIndex:number):number{
        return this.occupancy.get(junction)?.get(exitIndex)?.size??0;
    }
    public waiting(junction:object,exitIndex:number):number{
        return this.queues.get(junction)?.get(exitIndex)?.length??0;
    }
    /** Zero-based position; -1 when the owner is not waiting on this exit. */
    public queuePosition(owner:object,junction:object,exitIndex:number):number{
        return this.queues.get(junction)?.get(exitIndex)?.indexOf(owner)??-1;
    }
    public reservation(owner:object):SplineTrafficSlot|null{
        const slot=this.owners.get(owner);
        return slot?{...slot}:null;
    }
    public get size():number{return this.owners.size;}
    public get waitingCount():number{return this.queued.size;}
    public clear():void{
        this.owners.clear();this.occupancy.clear();this.queues.clear();this.queued.clear();this.priorities.clear();
    }
}
/** Playback only. No Editor preview reservations. */
export const splineTrafficGate=new SplineTrafficGate();
