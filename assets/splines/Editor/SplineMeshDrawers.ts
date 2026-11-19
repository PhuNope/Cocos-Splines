import { Color, Mat4, Node, Vec3 } from 'cc';
import type { MeshGizmoLines } from '../Core/SplineMeshGizmos';
import type { SplineRoad } from '../Components/SplineRoad';
import type { SplineExtrude } from '../Components/SplineExtrude';
import type { SplineMeshDeform } from '../Components/SplineMeshDeform';
import type { SplineObjectBender } from '../Components/SplineObjectBender';
import type { SplineJunctionMesh } from '../Components/SplineJunctionMesh';

/** Draw selection wireframe if the separately installed Cocos-Gizmos is present. */
export function drawMeshGizmoLines(owner:Node, modelNode:Node, geometry:MeshGizmoLines|null, color:Color):void {
    const gizmos=(globalThis as any).Gizmos3D;
    if(!gizmos?.beginColor||!gizmos?.drawLine||!geometry||!owner.isValid||!modelNode.isValid)return;
    gizmos.beginColor(owner,color);
    const p=geometry.positions,edges=geometry.edgePairs,world:Mat4=modelNode.worldMatrix;
    const cache:Vec3[]=[];
    for(let i=0;i<p.length;i+=3){
        cache.push(Vec3.transformMat4(new Vec3(),new Vec3(p[i],p[i+1],p[i+2]),world));
    }
    for(let i=0;i+1<edges.length;i+=2)gizmos.drawLine(owner,cache[edges[i]],cache[edges[i+1]]);
}

interface MeshGizmoOwner {readonly node:Node;readonly showMeshGizmos:boolean;getMeshGizmoGeometry():MeshGizmoLines|null;}
abstract class SingleMeshDrawer<T extends MeshGizmoOwner> {
    constructor(public readonly component:T,private readonly color:Color){}
    onDrawGizmosSelected():void {
        const owner=this.component;
        if(owner.showMeshGizmos)drawMeshGizmoLines(owner.node,owner.node,owner.getMeshGizmoGeometry(),this.color);
    }
}

export class SplineRoadGizmos extends SingleMeshDrawer<SplineRoad> {
    constructor(component:SplineRoad){super(component,new Color(68,190,255,255));}
}

export class SplineExtrudeGizmos extends SingleMeshDrawer<SplineExtrude> {
    constructor(component:SplineExtrude){super(component,new Color(255,163,75,255));}
}

export class SplineMeshDeformGizmos extends SingleMeshDrawer<SplineMeshDeform> {
    constructor(component:SplineMeshDeform){super(component,new Color(102,225,152,255));}
}

export class SplineJunctionMeshGizmos extends SingleMeshDrawer<SplineJunctionMesh> {
    constructor(component:SplineJunctionMesh){super(component,new Color(190,132,255,255));}
}

export class SplineObjectBenderGizmos {
    constructor(public readonly component:SplineObjectBender){}
    onDrawGizmosSelected():void {
        const owner=this.component;
        if(!owner.showMeshGizmos)return;
        const color=new Color(255,137,213,255);
        for(const entry of owner.getMeshGizmoSamples())drawMeshGizmoLines(owner.node,entry.node,entry.geometry,color);
    }
}
