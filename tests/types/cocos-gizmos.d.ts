/**
 * Compile-only contract for the REQUIRED db://cocos-gizmos asset package.
 * This file is deliberately NOT shipped: Creator resolves the actual
 * RegisterGizmos.ts mounted by the installed Cocos-Gizmos extension.
 */
interface GizmoHudDefinition {readonly kind:'hud';readonly id:string;readonly root:unknown;}
declare module 'db://cocos-gizmos/RegisterGizmos' {
    import type {Component} from 'cc';
    export interface IDrawGizmos<T extends Component=Component> {
        readonly component:T;
        onGizmoHandles?(): Array<{property:string}>;
        onDrawGizmosSelected?():void;
        onGizmoHUD?():GizmoHudDefinition;
        onGizmoChanged?(name:string,
            phase:'begin'|'update'|'end'|'cancel',index?:number):void;
        onGizmoHudChanged?(name:string,
            phase:'begin'|'update'|'end'|'cancel',value:number|boolean):void;
    }
    export type GizmosDrawerConstructor<T extends Component>=
        new (component:T)=>IDrawGizmos<T>;
    export function registerGizmos<T extends Component>(
        Drawer:GizmosDrawerConstructor<T>):ClassDecorator;
}
