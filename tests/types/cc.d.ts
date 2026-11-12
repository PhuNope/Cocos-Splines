// Offline type *mock* to detect TS syntax problems without the Cocos engine installed.
// Live Creator type-check is still required before production usage.
declare module 'cc' {
    export const _decorator: {
        ccclass(name: string):ClassDecorator;
        property:any;
        menu(name:string):ClassDecorator;
        executeInEditMode(x?:any):any;
        requireComponent(type:Function):ClassDecorator;
    };
    export function Enum<T>(type:T):T;
    export class Vec3 {
        x:number;y:number;z:number;
        static UP:Vec3;
        constructor(x?:number,y?:number,z?:number);
        clone():Vec3;set(x:number|Vec3,y?:number,z?:number):this;
        length():number;lengthSqr():number;
        static add(out:Vec3,a:Vec3,b:Vec3):Vec3;
        static subtract(out:Vec3,a:Vec3,b:Vec3):Vec3;
        static multiplyScalar(out:Vec3,a:Vec3,b:number):Vec3;
        static normalize(out:Vec3,a:Vec3):Vec3;
        static cross(out:Vec3,a:Vec3,b:Vec3):Vec3;
        static dot(a:Vec3,b:Vec3):number;
        static transformQuat(out:Vec3,a:Vec3,q:Quat):Vec3;
        static transformMat4(out:Vec3,a:Vec3,m:Mat4):Vec3;
    }
    export class Quat {
        constructor(x?:number,y?:number,z?:number,w?:number);
        clone():Quat;
        static slerp(out:Quat,a:Quat,b:Quat,t:number):Quat;
        static multiply(out:Quat,a:Quat,b:Quat):Quat;
        static invert(out:Quat,a:Quat):Quat;
        static fromAxes(out:Quat,x:Vec3,y:Vec3,z:Vec3):Quat;
        static fromEuler(out:Quat,x:number,y:number,z:number):Quat;
    }
    export class Mat4 {
        m00:number;m01:number;m02:number;m04:number;m05:number;m06:number;m08:number;m09:number;m10:number;m12:number;m13:number;m14:number;
        static invert(out:Mat4,a:Mat4):Mat4;
    }
    export class CCObject { static Flags:{DontSave:number;HideInHierarchy:number}; }
    export class Node {
        constructor(name?:string);
        parent:Node|null;worldPosition:Vec3;
        uuid:string;name:string;isValid:boolean;hideFlags:number;children:Node[];position:Vec3;rotation:Quat;scale:Vec3;worldMatrix:Mat4;worldRotation:Quat;
        getComponent<T>(c:new (...args:any[])=>T):T|null;
        addComponent<T>(c:new (...args:any[])=>T):T;
        setPosition(v:Vec3):void;setWorldPosition(v:Vec3):void;setWorldRotation(v:Quat):void;setParent(n:Node|null):void;removeFromParent():void;setScale(v:Vec3):void;
        emit(event:string,payload?:any):void;
        destroy():void;
    }
    // Cocos Creator 3.8 heightmap readback; arguments use local Terrain XZ.
    export class Terrain extends Component {
        getHeightAt(x:number,z:number):number|null;
    }
    export class Component {
        node:Node;enabled:boolean;
        getComponent<T>(c:new (...args:any[])=>T):T|null;
    }
    export class EventHandler { static emitEvents(events:EventHandler[],...args:any[]):void; }
    export class Prefab {uuid:string}
    export function instantiate(p:Prefab):Node;
    export class Mesh {uuid:string;isValid:boolean;data:Uint8Array;allowDataAccess:boolean;subMeshCount:number;
        struct:{primitives:any[];vertexBundles?:any[]};readAttribute(i:number,attr:string):Float32Array|Uint16Array|Int16Array|Uint32Array|Int32Array|null;
        readIndices(i:number):Uint16Array|Uint32Array|null;
        readAttributeFormat(i:number,attr:string):{name:string;size:number;count:number}|number|null;
        destroy():void;
    }
    export class Graphics extends Component {
        lineWidth:number;strokeColor:Color;clear():void;moveTo(x:number,y:number):void;
        lineTo(x:number,y:number):void;stroke():void;close():void;
    }
    export const gfx:{Attribute:new (name:string,format:number)=>any;AttributeName:{ATTR_TEX_COORD1:string;ATTR_POSITION:string;ATTR_TEX_COORD:string;ATTR_NORMAL:string;ATTR_TANGENT:string};Format:{RGB32F:number;RG32F:number;RGB16F:number;RG16F:number;RGB16I:number;RGB16UI:number;RG16I:number;RG16UI:number}};
    export class Color {constructor(r?:number,g?:number,b?:number,a?:number);r:number;g:number;b:number;a:number;}
    export class Material {uuid:string;initialize(options:any):void;setProperty(key:string,value:any):void;destroy():void;}
    export class MeshRenderer extends Component {
        mesh:Mesh|null;
        setMaterial(m:Material,index:number):void;
        getSharedMaterial(index:number):Material|null;
        setSharedMaterial(m:Material|null,index:number):void;
    }
    export const utils:{createMesh(options:any):Mesh};
}

declare module 'cc/env' { export const EDITOR_NOT_IN_PREVIEW:boolean; }
