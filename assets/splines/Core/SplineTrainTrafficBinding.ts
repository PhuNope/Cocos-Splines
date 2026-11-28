/** Consist-wide traffic reservation lifecycle. One private gate owner per
 * route transition allows a long train to retain several exits simultaneously.
 * The shared FIFO gate still counts each admitted train once per exit.
 * Open routes with a stable prefix, including append-only dynamic history.
 * No reverse seeks, cyclic routes or repeated exits.
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
    public prepare(transitions:ReadonlyArray<TrainTrafficTransition>,from:number,to:number,tailOffset:number,clearance:number,stopGap:number):TrainTrafficMove{
        if(![from,to,tailOffset,clearance,stopGap].every(Number.isFinite)||from<0||to<from||tailOffset<0||clearance<0||stopGap<=0)
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
            for(let index=0;index<transitions.length;index++){
                const t=transitions[index];
                if(t.distance<=from||t.distance-stopGap>to||this.held.has(index))continue;
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
        }};
    }
}
