/** Opt-in, bounded admission control for Junction destination links.
 * A slot is owned by one live follower until it transfers to another link or
 * releases on disable/destroy/explicit teleport. NO timer, network or Scene IO.
 */
export interface SplineTrafficSlot {junction:object;exitIndex:number}
export class SplineTrafficGate {
    private readonly owners=new Map<object,SplineTrafficSlot>();
    private readonly occupancy=new Map<object,Map<number,Set<object>>>();
    /** A capacity of 0 means unlimited/no managed slot. */
    public move(owner:object,junction:object,exitIndex:number,capacity:number):boolean{
        if(!owner||typeof owner!=='object'||!junction||typeof junction!=='object'||
           !Number.isInteger(exitIndex)||exitIndex<0||
           !Number.isInteger(capacity)||capacity<0||capacity>4096)
            throw Error('Invalid Junction traffic reservation.');
        const current=this.owners.get(owner);
        if(capacity===0){this.release(owner);return true;}
        if(current?.junction===junction&&current.exitIndex===exitIndex)return true;
        const list=this.occupancy.get(junction)?.get(exitIndex);
        if(list&&list.size>=capacity)return false;
        this.release(owner);
        let byExit=this.occupancy.get(junction);
        if(!byExit){byExit=new Map();this.occupancy.set(junction,byExit);}
        let followers=byExit.get(exitIndex);
        if(!followers){followers=new Set();byExit.set(exitIndex,followers);}
        followers.add(owner);this.owners.set(owner,{junction,exitIndex});
        return true;
    }
    public release(owner:object):void {
        const slot=this.owners.get(owner);
        if(!slot)return;
        this.owners.delete(owner);
        const exits=this.occupancy.get(slot.junction);
        const followers=exits?.get(slot.exitIndex);
        followers?.delete(owner);
        if(followers?.size===0)exits?.delete(slot.exitIndex);
        if(exits?.size===0)this.occupancy.delete(slot.junction);
    }
    /** Junction lifecycle cleanup: no stale slot remains after disabling
     * or destroying its Component, even if admitted followers are paused.
     */
    public releaseJunction(junction:object):void{
        const byExit=this.occupancy.get(junction);
        if(!byExit)return;
        for(const followers of byExit.values()){
            for(const owner of followers)this.owners.delete(owner);
        }
        this.occupancy.delete(junction);
    }
    public count(junction:object,exitIndex:number):number{
        return this.occupancy.get(junction)?.get(exitIndex)?.size??0;
    }
    public reservation(owner:object):SplineTrafficSlot|null{
        const slot=this.owners.get(owner);
        return slot?{...slot}:null;
    }
    public get size():number{return this.owners.size;}
    public clear():void{this.owners.clear();this.occupancy.clear();}
}
/** One manager shared by playback followers only. Editor preview does not reserve. */
export const splineTrafficGate=new SplineTrafficGate();
