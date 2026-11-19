/* Offline-only declaration. Editor resolves the actual v3 module from Cocos-Gizmos. */
declare module 'db://cocos-gizmos/RegisterGizmos' {
    import type { Component } from 'cc';
    export interface IDrawGizmos<T extends Component = Component> {
        readonly component:T;
        onDrawGizmos?():void;
        onDrawGizmosSelected?():void;
        onGizmoHandles?():any[];
        onGizmoChanged?(property:string,phase:string,index?:number):void;
    }
    export function registerGizmos<T extends Component>(
        Drawer:new (component:T)=>IDrawGizmos<T>,
    ):ClassDecorator;
}
