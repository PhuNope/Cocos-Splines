import {Color,Vec3} from 'cc';
import type {SplineObjectController} from '../Components/SplineObjectController';
import {samplePlacementMarkers,type PlacementDiagnostic,type PlacementReason} from '../Core/SplinePlacementDiagnostics';

/** Cocos-Gizmos v3 drawer. Read-only: never runs Respawn, writes a Knot, creates
 * a Node or performs a Scene snapshot. Full candidate planning is cached by
 * the component's placement revision, then drawing is capped at 256 markers.
 */
export class SplinePlacementGizmos {
    constructor(public readonly component:SplineObjectController){}
    private cachedRevision='';
    private cachedPoints:PlacementDiagnostic[]=[];
    private lastError='';
    private colorOf(reason:PlacementReason):Color{
        switch(reason){
            case 'accepted': return new Color(80,220,130,255);  // green
            case 'surface': return new Color(255,152,68,255);  // orange
            case 'collider':return new Color(242,78,85,255);   // red
            case 'peer':    return new Color(189,117,241,255); // purple
            case 'exclusion':return new Color(152,159,171,255);// gray
            case 'density': return new Color(255,216,86,255);  // yellow
            case 'spacing': return new Color(80,158,246,255);  // blue
        }
    }
    onDrawGizmosSelected():void{
        const c=this.component;
        if(!c.showPlacementGizmos||!c.node?.isValid)return;
        const g=(globalThis as any).Gizmos3D;
        if(!g?.beginColor||!g?.drawLine)return;
        try{
            const revision=c.placementPreviewRevision();
            if(this.cachedRevision!==revision){
                this.cachedPoints=c.previewPlacement();
                this.cachedRevision=revision;
                this.lastError='';
            }
        }catch(error){
            this.cachedPoints=[];
            this.cachedRevision='';
            const message=error instanceof Error?error.message:String(error);
            if(message!==this.lastError){
                this.lastError=message;
                console.warn('[cocos-splines] Placement Debug Gizmos preview:',message);
            }
            return;
        }
        const limit=Math.min(256,Math.max(1,Math.floor(c.placementGizmoLimit)||96));
        const size=Math.min(2,Math.max(.02,c.placementGizmoSize||.12));
        for(const entry of samplePlacementMarkers(this.cachedPoints,limit)){
            const p=new Vec3(entry.position.x,entry.position.y,entry.position.z);
            g.beginColor(c.node,this.colorOf(entry.reason));
            if(g.drawSphere)g.drawSphere(c.node,p,size,false,8,6);
            else{
                const x=size,y=size;
                g.drawLine(c.node,new Vec3(p.x-x,p.y,p.z),new Vec3(p.x+x,p.y,p.z));
                g.drawLine(c.node,new Vec3(p.x,p.y-y,p.z),new Vec3(p.x,p.y+y,p.z));
                g.drawLine(c.node,new Vec3(p.x,p.y,p.z-x),new Vec3(p.x,p.y,p.z+x));
            }
            if(c.showPlacementFootprints&&entry.radius>size&&g.drawSphere)
                g.drawSphere(c.node,p,entry.radius,false,12,8);
        }
    }
}
