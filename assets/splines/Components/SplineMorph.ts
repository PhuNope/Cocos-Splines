import { _decorator, Component, Vec3, Mat4 } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SplineContainer } from '../Core/SplineContainer';
import { SplineKnot, TangentMode } from '../Core/SplineKnot';
import { morphPoint } from '../Core/SplineMorphMath';
const {ccclass,property,menu,executeInEditMode}=_decorator;
interface KnotState{knot:SplineKnot;position:Vec3;input:Vec3;output:Vec3;mode:TangentMode;local:boolean}

/** Blend two source shapes into OUTPUT spline without modifying either source.
 * Same knot count: exact per-knot Bezier blend in output local space.
 * Different knot counts: resampled approximation (output knot density limits fidelity).
 * Output spline needs existing knots with no tangent handle Nodes.
 */
@ccclass('Splines.SplineMorph')
@menu('Splines/Spline Morph')
@executeInEditMode(true)
export class SplineMorph extends Component {
    @property({type:SplineContainer}) sourceA:SplineContainer|null=null;
    @property({type:SplineContainer}) sourceB:SplineContainer|null=null;
    @property({type:SplineContainer}) outputSpline:SplineContainer|null=null;
    @property({range:[0,1,0.001],slide:true}) blend=0.5;
    @property({tooltip:'On Editor, output knot transforms are edited temporarily and restored when Preview is off.'}) previewInEditor=false;
    @property({tooltip:'Update output when sources or Blend change.'}) updateOnChange=true;
    private _snapshot:KnotState[]=[];
    private _signature='';
    private _applying=false;
    private holdRestore=false;
    private key():string{return JSON.stringify([this.sourceA?.getRevision(),this.sourceB?.getRevision(),
        this.sourceA?.node.worldMatrix,this.sourceB?.node.worldMatrix,this.outputSpline?.node.worldMatrix,this.blend]);}
    private sample():boolean {
        const a=this.sourceA,b=this.sourceB,c=this.outputSpline;
        if(!a||!b||!c||a===b||a===c||b===c||a.count<2||b.count<2||c.count<2)return false;
        const target=c.knots;
        if(this._snapshot.length&&(target.length!==this._snapshot.length||target.some((k,i)=>k!==this._snapshot[i].knot))){
            console.warn('[SplineMorph] Output knot structure changed during preview; restore first.');return false;
        }
        if(target.some(k=>k.hasTangentHandles)){
            console.warn('[SplineMorph] Output knots must not use Tangent Handle Nodes.');return false;
        }
        if(!this._snapshot.length)this._snapshot=target.map(k=>({knot:k,position:k.node.position.clone(),
            input:k.tangentIn.clone(),output:k.tangentOut.clone(),mode:k.mode,local:k.tangentsInKnotSpace}));
        const inverse=Mat4.invert(new Mat4(),c.node.worldMatrix);
        const tWeight=Math.max(0,Math.min(1,this.blend));
        const count=target.length;
        const exact=a.count===count&&b.count===count&&a.reversed===false&&b.reversed===false&&c.reversed===false;
        const ak=a.getNaturalResolvedKnots(),bk=b.getNaturalResolvedKnots();
        const samplePosition=(s:SplineContainer,t:number)=>s.evaluateWorldPositionAtT(t);
        const src=(s:SplineContainer,list:typeof ak,i:number,which:'position'|'tangentIn'|'tangentOut')=>{
            const knot=list[i];const position=knot.position;
            const offset=which==='position'?{x:0,y:0,z:0}:knot[which];
            const p=new Vec3(position.x+offset.x,position.y+offset.y,position.z+offset.z);
            return Vec3.transformMat4(p,p,s.node.worldMatrix);
        };
        const out=[] as Array<{position:Vec3;input:Vec3;output:Vec3}>;
        for(let i=0;i<count;i++){
            const t=i/(count-1);
            const point=(which:'position'|'tangentIn'|'tangentOut')=>{
                let ap:Vec3,bp:Vec3;
                if(exact){ap=src(a,ak,i,which);bp=src(b,bk,i,which);}
                else {
                    const diff=1/(Math.max(1,count-1)*3),sign=which==='tangentIn'?-1:which==='tangentOut'?1:0;
                    ap=samplePosition(a,Math.max(0,Math.min(1,t+diff*sign)));
                    bp=samplePosition(b,Math.max(0,Math.min(1,t+diff*sign)));
                    if(sign!==0){
                        // Endpoint derivative extrapolation for nonmatching knot counts.
                        if(t+diff*sign<0){const p=samplePosition(a,Math.min(1,diff));const q=samplePosition(a,0);ap=Vec3.subtract(new Vec3(),Vec3.multiplyScalar(new Vec3(),q,2),p);
                            const pb=samplePosition(b,Math.min(1,diff)),qb=samplePosition(b,0);bp=Vec3.subtract(new Vec3(),Vec3.multiplyScalar(new Vec3(),qb,2),pb);}
                        if(t+diff*sign>1){const p=samplePosition(a,Math.max(0,1-diff));const q=samplePosition(a,1);ap=Vec3.subtract(new Vec3(),Vec3.multiplyScalar(new Vec3(),q,2),p);
                            const pb=samplePosition(b,Math.max(0,1-diff)),qb=samplePosition(b,1);bp=Vec3.subtract(new Vec3(),Vec3.multiplyScalar(new Vec3(),qb,2),pb);}
                    }
                }
                const merged=morphPoint(ap,bp,tWeight);
                return Vec3.transformMat4(new Vec3(merged.x,merged.y,merged.z),new Vec3(merged.x,merged.y,merged.z),inverse);
            };
            const position=point('position');
            const input=Vec3.subtract(new Vec3(),point('tangentIn'),position);
            const output=Vec3.subtract(new Vec3(),point('tangentOut'),position);
            out.push({position,input,output});
        }
        // Avoid partially mutating the output if a source evaluation failed.
        for(let i=0;i<count;i++){
            const k=target[i],v=out[i];k.node.setPosition(v.position);k.tangentIn.set(v.input);k.tangentOut.set(v.output);
            k.mode=TangentMode.Broken;k.tangentsInKnotSpace=false;
        }
        c.refresh();return true;
    }
    public apply():boolean {
        if(this._applying)return false;
        this._applying=true;this.holdRestore=false;
        try{const ok=this.sample();if(ok)this._signature=this.key();return ok;}
        finally{this._applying=false;}
    }
    public restore():void{
        for(const state of this._snapshot){const k=state.knot;
            if(!k.node.isValid)continue;
            k.node.setPosition(state.position);k.tangentIn.set(state.input);k.tangentOut.set(state.output);
            k.mode=state.mode;k.tangentsInKnotSpace=state.local;
        }
        this.outputSpline?.refresh();this._snapshot=[];this._signature='';this.holdRestore=true;
    }
    onEnable():void{if(!EDITOR_NOT_IN_PREVIEW||this.previewInEditor)this.apply();}
    update():void{
        if(EDITOR_NOT_IN_PREVIEW&&!this.previewInEditor){if(this._snapshot.length)this.restore();this.holdRestore=false;return;}
        if(this.holdRestore)return;
        if(this.updateOnChange&&this.key()!==this._signature)this.apply();
    }
    onDisable():void{this.restore();}
    onDestroy():void{this.restore();}
}
