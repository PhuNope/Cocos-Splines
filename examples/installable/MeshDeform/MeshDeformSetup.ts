import {_decorator,Component,Mesh} from 'cc';
import {SplineContainer} from 'db://cocos-splines/splines/Core/SplineContainer';
import {SplineMeshDeform,DeformAxis,DeformMode,DeformUV}
    from 'db://cocos-splines/splines/Components/SplineMeshDeform';
const {ccclass,property}= _decorator;
/** Attach to any node and assign a readable imported Mesh, a spline,
 * and a SplineMeshDeform component (on a Node with MeshRenderer).
 * No imported asset is ever modified. */
@ccclass('CocosSplinesMeshDeformExampleV2')
export class CocosSplinesMeshDeformExampleV2 extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:SplineMeshDeform}) deform:SplineMeshDeform|null=null;
    @property({type:Mesh,tooltip:'Use a subdivided mesh with Allow Data Access enabled.'})
    sourceMesh:Mesh|null=null;
    @property({tooltip:'Apply on Play after references are bound.'}) applyOnStart=true;
    @property({tooltip:'Repeat the source mesh along the full spline rather than stretching it.'})
    repeat=true;
    start():void{if(this.applyOnStart)this.configure();}
    public configure():boolean{
        if(!this.spline||!this.deform||!this.sourceMesh){
            console.warn('[Cocos Splines Example] Assign Spline, SplineMeshDeform and Source Mesh.');
            return false;
        }
        if(!this.sourceMesh.allowDataAccess){
            console.warn('[Cocos Splines Example] Enable Allow Data Access on Source Mesh import.');
            return false;
        }
        this.deform.spline=this.spline;
        this.deform.sourceMesh=this.sourceMesh;
        this.deform.axis=DeformAxis.Z;
        this.deform.mode=this.repeat?DeformMode.Repeat:DeformMode.Stretch;
        this.deform.repeatCount=8;
        this.deform.widthScale=1;
        this.deform.heightScale=1;
        this.deform.uvMode=DeformUV.Distance;
        this.deform.rebuild();
        return true;
    }
}
