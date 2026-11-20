/**
 * Owns one Cocos-Gizmos begin/update/end/cancel gesture.
 *
 * Gizmo ports mutate scene objects synchronously during drag. This class
 * never rewrites them on update; it preserves a baseline for Cancel and
 * creates one Scene snapshot only for a genuinely changed End.
 *
 * An asynchronous snapshot failure restores the completed gesture only
 * when its after-state is still current and no newer gesture has begun.
 * This prevents an old rejected IPC request from clobbering later edits.
 * Native Creator undo history / prefab overrides still need live testing.
 */
export interface SplineGizmoEditPort<T> {
    capture():T;
    restore(before:T):void;
    changed(before:T,after:T):boolean;
    /** Optional live Scene/Selection guard. A false result cancels without snapshot. */
    valid?():boolean;
}
export type SplineSnapshotRequest=()=>unknown|Promise<unknown>;
export type SplineGestureFailure=(reason:unknown)=>void;

interface Active<T> {
    property:string;
    before:T;
    port:SplineGizmoEditPort<T>;
    version:number;
}
export class SplineGizmoEditTransaction<T> {
    private active:Active<T>|null=null;
    private version=0;
    private pending=new Set<Promise<void>>();
    constructor(
        private readonly snapshot:SplineSnapshotRequest,
        private readonly onFailure:SplineGestureFailure,
    ){}

    get baseline():T|null {return this.active?.before??null;}
    get property():string|null{return this.active?.property??null;}
    get pendingCount():number{return this.pending.size;}

    /** Cancels the current gesture even when its property is unknown to the caller. */
    cancelActive():boolean {
        return this.active ? this.cancel(this.active.property) : false;
    }
    /** Called at drag updates, redraws and before End; fail closed on stale context. */
    validateActive():boolean {
        const gesture=this.active;
        if(!gesture)return false;
        try {
            if(gesture.port.valid?.()!==false)return true;
            this.cancel(gesture.property);
            return false;
        }catch(error){
            this.cancel(gesture.property);
            this.onFailure(error);
            return false;
        }
    }

    begin(property:string,port:SplineGizmoEditPort<T>):boolean {
        if(!property||this.active)return false;
        if(port.valid?.()===false)return false;
        const before=port.capture();
        this.active={property,before,port,version:++this.version};
        return true;
    }
    cancel(property:string):boolean {
        const gesture=this.active;
        if(!gesture||gesture.property!==property)return false;
        this.active=null;
        ++this.version;
        try{gesture.port.restore(gesture.before);}
        catch(error){this.onFailure(error);}
        return true;
    }
    end(property:string):boolean {
        const gesture=this.active;
        if(!gesture||gesture.property!==property)return false;
        if(!this.validateActive())return false;
        this.active=null;
        let after:T;
        try{after=gesture.port.capture();}
        catch(error){
            // A member may disappear mid-drag. Restore any surviving state
            // rather than leaving half of the selected group transformed.
            try{gesture.port.restore(gesture.before);}
            catch(rollbackError){this.onFailure(rollbackError);}
            this.onFailure(error);
            return false;
        }
        if(!gesture.port.changed(gesture.before,after))return false;
        const version=gesture.version;
        const fail=(error:unknown)=>{
            // Only restore if nothing newer has begun AND the entire completed
            // after-state still matches. Otherwise report but leave it intact.
            if(this.version===version&&!this.active){
                try{
                    if(gesture.port.valid?.()===false){
                        this.onFailure(new Error('Gizmo scene context changed before snapshot response; skip rollback.'));
                        this.onFailure(error);
                        return;
                    }
                    const now=gesture.port.capture();
                    if(!gesture.port.changed(after,now))
                        gesture.port.restore(gesture.before);
                }catch(rollbackError){this.onFailure(rollbackError);}
            }
            this.onFailure(error);
        };
        let requested:unknown;
        try{
            // Execute IPC synchronously on End; the Promise may settle later.
            requested=this.snapshot();
        }catch(error){fail(error);return true;}
        if(requested===false||
           (!!requested&&typeof requested==='object'&&
             (requested as {ok?:boolean}).ok===false)){
            fail(new Error('Scene snapshot rejected this Gizmo edit.'));
            return true;
        }
        const pending=Promise.resolve(requested).then(value=>{
            if(value===false||(value&&typeof value==='object'&&
                (value as {ok?:boolean}).ok===false))
                fail(new Error('Scene snapshot rejected this Gizmo edit.'));
        },fail);
        this.pending.add(pending);
        void pending.finally(()=>this.pending.delete(pending));
        return true;
    }
}
