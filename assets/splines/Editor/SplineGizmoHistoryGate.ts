/**
 * Prevents overlapping native Scene Undo transactions across different Knot
 * drawers belonging to the same SplineContainer.
 *
 * Each drawer is a separate class instance. An instance-level busy flag is
 * therefore insufficient: another selected Knot could begin a gesture while
 * the first Knot's serialized set-property/snapshot IPC is still in flight.
 *
 * The gate is keyed by the owning Scene Node (WeakMap: no persistent refs,
 * no manual Scene events or polling). It is held from begin until *after*
 * the async history coordinator has settled its success/rollback path.
 * Callers must release on Cancel, no-op or synchronous validation failure.
 */
export class SplineGizmoHistoryGate {
    private static readonly holders=new WeakMap<object,object>();

    static claim(scope:object,owner:object):boolean {
        if(!scope||typeof scope!=='object'||!owner||typeof owner!=='object'||
           this.holders.has(scope))return false;
        this.holders.set(scope,owner);
        return true;
    }
    static locked(scope:object):boolean {
        return !!scope&&this.holders.has(scope);
    }
    static owns(scope:object,owner:object):boolean {
        return !!scope&&this.holders.get(scope)===owner;
    }
    static release(scope:object,owner:object):boolean {
        if(!this.owns(scope,owner))return false;
        this.holders.delete(scope);
        return true;
    }
}
