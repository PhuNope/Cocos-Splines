import {_decorator,Component,Node,Mat4,Vec3,Enum} from 'cc';
import {type SplineDataV2,type CurveTypeV2} from '../core/SplineCurves';

const {ccclass,property,executeInEditMode,menu}=_decorator;

/**
 * Reusable v2 spline SOURCE. Holds authored Knot Nodes only; consumer meshes
 * belong to Road/Extrude/Deform. No duplicate coordinates, no hidden rebuilds.
 * Consumers evaluate the Knot world positions in their own local space.
 */
export enum SplinePathCurveModeV2 {
    Linear=0,Bezier=1,CatmullRom=2,Centripetal=3
}
@ccclass('SplinesV2.SplinePath')
@menu('Cocos Splines V2/Path')
@executeInEditMode(true)
export class SplinePathV2 extends Component {
    @property({type:[Node],tooltip:'Shared Knot Nodes in path order. Positions are read in world coordinates; the Path may be on a different Node from its consumers.'})
    knots:Node[]=[];
    @property({type:Enum(SplinePathCurveModeV2)})
    interpolation=SplinePathCurveModeV2.Centripetal;
    @property({tooltip:'Connect the last Knot to the first Knot.'})
    closed=false;

    // Ephemeral Editor preview subscribers, not serialized on SplinePathV2.
    private _previewConsumers=new Set<{onSharedSplinePathEdited(force:boolean):void}>();
    public registerPreviewConsumer(consumer:{onSharedSplinePathEdited(force:boolean):void}):void {
        this._previewConsumers.add(consumer);
    }
    public unregisterPreviewConsumer(consumer:{onSharedSplinePathEdited(force:boolean):void}):void {
        this._previewConsumers.delete(consumer);
    }
    public notifyPreviewConsumers(origin:unknown,force:boolean):void {
        for(const consumer of this._previewConsumers) {
            if(consumer===origin)continue;
            consumer.onSharedSplinePathEdited(force);
        }
    }
    protected onDestroy():void {this._previewConsumers.clear();}
    public getKnotNodes():ReadonlyArray<Node> {return this.knots;}

    public getSplineDataV2(consumer:Node):SplineDataV2 {
        if(!consumer?.isValid||!this.node?.isValid)
            throw new Error('SplinePathV2 requires valid Source and consumer Nodes');
        if(this.knots.length<2||this.knots.some(k=>!k||!k.isValid))
            throw new Error('SplinePathV2 needs at least 2 valid Knot Nodes');
        const map:CurveTypeV2[]=[
            'linear','bezier','catmull-rom','catmull-rom-centripetal'
        ];
        const curve=map[this.interpolation];
        if(!curve)throw new Error('SplinePathV2 interpolation is invalid');
        const inverse=Mat4.invert(new Mat4(),consumer.worldMatrix);
        return {type:curve,closed:this.closed,
            knots:this.knots.map(k=>{
                const position=Vec3.transformMat4(new Vec3(),k.worldPosition,inverse);
                return {position:{x:position.x,y:position.y,z:position.z}};
            })};
    }
}
