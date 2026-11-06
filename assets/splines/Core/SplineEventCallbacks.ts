/**
 * Runtime-only callback subscriptions. They are not serialized and never replace
 * Cocos EventHandler arrays or Node.emit events configured in the Inspector.
 * Use the SAME callback and target when unsubscribing.
 */
export type SplineEventCallback<T> = (event:T)=>void;
interface Subscription<T> { callback:SplineEventCallback<T>; target:object|null; }
export class SplineEventCallbacks<T> {
    private readonly subscriptions:Subscription<T>[]=[];
    public add(callback:SplineEventCallback<T>, target?:object|null):void {
        if(typeof callback!=='function')throw new TypeError('Spline event callback must be a function');
        const context=target??null;
        if(!this.subscriptions.some(s=>s.callback===callback&&s.target===context)){
            this.subscriptions.push({callback,target:context});
        }
    }
    public remove(callback:SplineEventCallback<T>, target?:object|null):void {
        const context=target??null;
        for(let i=this.subscriptions.length-1;i>=0;i--){
            const sub=this.subscriptions[i];
            if(sub.callback===callback&&sub.target===context)this.subscriptions.splice(i,1);
        }
    }
    /** Clear all listeners, or only listeners registered with a specified target. */
    public clear(target?:object|null):void {
        if(arguments.length===0){this.subscriptions.length=0;return;}
        const context=target??null;
        for(let i=this.subscriptions.length-1;i>=0;i--){
            if(this.subscriptions[i].target===context)this.subscriptions.splice(i,1);
        }
    }
    public emit(payload:T):void {
        // Snapshot avoids dispatching a callback that was just added from another callback.
        for(const sub of [...this.subscriptions]){
            if(!this.subscriptions.includes(sub))continue;
            const target=sub.target as {isValid?:boolean}|null;
            if(target && target.isValid===false){this.remove(sub.callback,sub.target);continue;}
            try{sub.callback.call(sub.target??undefined,payload);}
            catch(error){console.error('[Cocos Splines] Event callback error',error);}
        }
    }
    public get count():number{return this.subscriptions.length;}
}
