import {_decorator,Component,Node,Vec3} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {SplinePath,SplineSpace} from './SplinePath';
import {buildSplineCacheV2,type SplineCacheV2} from '../core/SplineCache';
import {projectPointOnSplineV2,type SplineProjectionV2}
    from '../core/SplineProjection';

const {ccclass,property,menu}=_decorator;
export interface SplineWorldProjection {
    readonly parameter:number;readonly distanceAlong:number;
    readonly distanceFromPoint:number;readonly worldPosition:Vec3;
    readonly worldTangent:Vec3;
}
/** Closest-point consumer: source may be any Node, result can optionally
 * drive this component's Node. Does not alter any Knot, Road or Baked Mesh.
 * World closest-point distance is measured after Path's full world matrix,
 * including nonuniform scales.
 */
@ccclass('Spline.Projector')
@menu('Cocos Splines/Projector')
export class SplineProjector extends Component {
    @property({type:SplinePath})
    path:SplinePath|null=null;
    @property({type:Node,tooltip:'Query this Node position; empty uses own Node.'})
    sourcePosition:Node|null=null;
    @property({tooltip:'Project each Play frame, or every Editor frame when Preview In Editor is enabled.'})
    continuous=false;
    @property({tooltip:'Enable continuous projection in Scene edit mode.'})
    previewInEditor=false;
    @property({tooltip:'Move this component Node to the projected position.'})
    snapThisNode=false;
    @property({min:4,max:128,step:1,tooltip:'Coarse intervals per spline segment.'})
    subdivisions=24;
    @property({min:1,max:64,step:1,tooltip:'Intervals refined by exact curve evaluation.'})
    candidates=16;
    private _cache:SplineCacheV2|null=null;
    private _boundPath:SplinePath|null=null;
    private _sourceKey='';
    private _latest:SplineWorldProjection|null=null;
    public get latest():SplineWorldProjection|null {return this._latest;}
    protected onDisable():void {
        this._cache=null;this._boundPath=null;this._sourceKey='';
        this._latest=null;
    }
    private resolve():SplineCacheV2|null {
        const path=this.path;
        if(!path?.node?.isValid||!this.node?.isValid)return null;
        const data=path.getSplineData(path.node,SplineSpace.Local);
        const signature=JSON.stringify(data);
        if(this._boundPath!==path||!this._cache||this._sourceKey!==signature){
            this._cache=buildSplineCacheV2(data);
            this._sourceKey=signature;this._boundPath=path;
        }
        return this._cache;
    }
    /** Calculate on demand (with no allocations into the Scene), optionally
     * snap own Node. Never moves the source Node unless it is also this Node
     * AND snapThisNode is explicitly enabled. */
    public projectOnce():SplineWorldProjection|null {
        const cache=this.resolve(),path=this.path,
            origin=this.sourcePosition??this.node;
        if(!cache||!path||!origin?.isValid)return null;
        const matrix=path.node.worldMatrix;
        const transform=(p:{x:number;y:number;z:number})=>
            Vec3.transformMat4(new Vec3(),new Vec3(p.x,p.y,p.z),matrix);
        const query=origin.worldPosition;
        const nearest:SplineProjectionV2=projectPointOnSplineV2(cache,query,{
            subdivisions:this.subdivisions,candidates:this.candidates,
            transformPosition:transform
        });
        const position=transform(nearest.position);
        const base=transform({x:0,y:0,z:0});
        const tip=transform(nearest.tangent);
        const direction=Vec3.normalize(new Vec3(),Vec3.subtract(
            new Vec3(),tip,base));
        this._latest=Object.freeze({
            parameter:nearest.parameter,distanceAlong:nearest.distanceAlong,
            distanceFromPoint:nearest.distanceFromPoint,
            worldPosition:position,worldTangent:direction
        });
        if(this.snapThisNode)this.node.setWorldPosition(position);
        return this._latest;
    }
    protected update(_dt:number):void {
        if(!this.continuous||(EDITOR_NOT_IN_PREVIEW&&!this.previewInEditor))
            return;
        this.projectOnce();
    }
}
