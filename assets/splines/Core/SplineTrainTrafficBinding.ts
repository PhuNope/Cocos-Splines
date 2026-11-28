/** Consist-wide traffic reservation lifecycle. One private gate owner per
 * route transition allows a long train to retain several exits simultaneously.
 * The shared FIFO gate still counts each admitted train once per exit.
 * Open routes with a stable prefix, including append-only dynamic history.
 * Fixed periodic routes reuse one transition index per exit; the held
 * occurrence distances are rebased after each wrap. No reverse seeks.
 */
import {splineTrafficGate} from './SplineTrafficGate';
export interface TrainTrafficTransition {
    distance:number;junction:object;exitIndex:number;capacity:number;green:boolean;
}
interface Held {token:object;transition:TrainTrafficTransition}
export interface TrainTrafficMove {distance:number;blocked:boolean;commit():void;rollback():void}
export class SplineTrainTrafficBinding {
    private held=new Map<number,Held>();
    private waiting:{index:number;token:object}|null=null;
    public get reservedCount():number{return this.held.size;}
    public get waitingIndex():number{return this.waiting?.index??-1;}
    public clear():void{
        for(const h of this.held.values())splineTrafficGate.release(h.token);
        this.held.clear();this.cancelWait();
    }
    public cancelWait():void{
        if(this.waiting)splineTrafficGate.release(this.waiting.token);
        this.waiting=null;
    }
    /** Remap live tokens after a committed open-route prefix removal. No gate
     * release/reacquire: FIFO and occupied slots retain their exact owner. */
    public discardOpenPrefix(count:number,offset:number):void{
        if(!Number.isInteger(count)||count<1||!Number.isFinite(offset)||offset<=0||
           [...this.held.keys()].some(i=>i<count)||(this.waiting&&this.waiting.index<count))
            throw Error('Cannot discard occupied or queued train history.');
        const remapped=new Map<number,Held>();
        for(const [index,h] of this.held)remapped.set(index-count,{token:h.token,transition:{...h.transition,distance:h.transition.distance-offset}});
        this.held=remapped;
        if(this.waiting)this.waiting={index:this.waiting.index-count,token:this.waiting.token};
    }
    public prepare(transitions:ReadonlyArray<TrainTrafficTransition>,from:number,to:number,tailOffset:number,clearance:number,stopGap:number,period=0):TrainTrafficMove{
        if(![from,to,tailOffset,clearance,stopGap,period].every(Number.isFinite)||from<0||to<from||tailOffset<0||clearance<0||stopGap<=0||period<0||
           (period>0&&(from>=period||period<=tailOffset+clearance+stopGap||to-from>period-stopGap+1e-8)))
            throw Error('Invalid train traffic movement.');
        for(const [index,h] of this.held){
            const current=transitions[index],slot=splineTrafficGate.reservation(h.token);
            if(!current||current.junction!==h.transition.junction||current.exitIndex!==h.transition.exitIndex||
               (h.transition.capacity===0)!==(current.capacity===0)||
               (h.transition.capacity>0&&(!slot||slot.junction!==current.junction||slot.exitIndex!==current.exitIndex)))
                throw Error('Train traffic reservation invalidated; stop and reinitialize safely.');
        }
        const acquired:number[]=[];
        let distance=to,blocked=false,finished=false;
        const rollback=()=>{
            if(finished)return;finished=true;
            for(const index of acquired){const h=this.held.get(index);if(h)splineTrafficGate.release(h.token);this.held.delete(index);}
            this.cancelWait();
        };
        try{
            const events=transitions.map((t,index)=>({index,t:period>0&&t.distance<=from?{...t,distance:t.distance+period}:t}));
            if(period>0)events.sort((a,b)=>a.t.distance-b.t.distance);
            for(const {index,t} of events){
                if(t.distance<=from||t.distance-stopGap>to)continue;
                const held=this.held.get(index);
                if(held){
                    if(period===0||Math.abs(held.transition.distance-t.distance)<1e-8)continue;
                    // Do not overwrite a previous lap's occupied slot. Stop
                    // at the new margin, commit physical motion, then retry.
                    // Loop fit guarantees the old tail can clear by then.
                    distance=Math.max(from,t.distance-stopGap);blocked=true;break;
                }
                // Keep the exact queued token across retries, preserving FIFO.
                if(this.waiting&&this.waiting.index!==index)this.cancelWait();
                const token=this.waiting?.token??{};
                if(!splineTrafficGate.move(token,t.junction,t.exitIndex,t.capacity,t.green,0)){
                    this.waiting={index,token};
                    distance=Math.max(from,t.distance-stopGap);blocked=true;break;
                }
                this.waiting=null;this.held.set(index,{token,transition:{...t}});acquired.push(index);
            }
        }catch(error){rollback();throw error;}
        return {distance,blocked,rollback,commit:()=>{
            if(finished)return;finished=true;
            // Strictly beyond the junction, plus configured rear clearance.
            for(const [index,h] of this.held){
                if(distance-tailOffset>h.transition.distance+clearance){
                    splineTrafficGate.release(h.token);this.held.delete(index);
                }
            }
            if(period>0&&distance>=period){
                for(const h of this.held.values())h.transition.distance-=period;
            }
        }};
    }
}
