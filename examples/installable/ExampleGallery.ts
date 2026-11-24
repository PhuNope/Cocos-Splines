import {
    _decorator, Component, Enum, Node, Vec3, Color, MeshRenderer,
    Camera, DirectionalLight, Material, primitives, utils,
} from 'cc';
import { SplineContainer } from 'db://cocos-splines/splines/Core/SplineContainer';
import { SplineKnot, TangentMode } from 'db://cocos-splines/splines/Core/SplineKnot';
import { SplineAnimate, JunctionMode, LoopMode } from 'db://cocos-splines/splines/Components/SplineAnimate';
import { SplineRoad } from 'db://cocos-splines/splines/Components/SplineRoad';
import { SplineExtrude } from 'db://cocos-splines/splines/Components/SplineExtrude';
import { SplineJunction, SplineJunctionLink } from 'db://cocos-splines/splines/Components/SplineJunction';
import { SplinePositioner } from 'db://cocos-splines/splines/Components/SplinePositioner';

const {ccclass,property}= _decorator;
/** Each mode builds an independent, temporary scene setup during Play.
 * Nothing is generated while the Editor is idle; no asset or prefab is modified.
 * Requires the Cocos Splines extension and Cocos-Gizmos dependency.
 */
export enum SplineExampleKind {
    Follower=0, Road=1, Extrude=2, Junction=3, Proximity=4, Positioner=5,
}
Enum(SplineExampleKind);

@ccclass('CocosSplinesExampleGalleryV2')
export class CocosSplinesExampleGalleryV2 extends Component {
    @property({type:Enum(SplineExampleKind),tooltip:'Choose a feature, then press Play. Nodes are created only at runtime.'})
    example:SplineExampleKind=SplineExampleKind.Follower;
    private created=false;

    start():void {
        if(this.created)return;
        this.created=true;
        this.makeCamera();
        switch(this.example){
            case SplineExampleKind.Follower:this.showFollower();break;
            case SplineExampleKind.Road:this.showRoad();break;
            case SplineExampleKind.Extrude:this.showExtrude();break;
            case SplineExampleKind.Junction:this.showJunction();break;
            case SplineExampleKind.Proximity:this.showProximity();break;
            case SplineExampleKind.Positioner:this.showPositioner();break;
        }
    }
    private child(parent:Node,name:string,at?:Vec3):Node {
        const node=new Node(name);
        node.setParent(parent);
        if(at)node.setPosition(at);
        return node;
    }
    private makeCamera():void {
        const node=this.child(this.node,'Examples Camera',new Vec3(0,15,24));
        node.setRotationFromEuler(-32,0,0);
        node.addComponent(Camera);
        const light=this.child(this.node,'Examples Light',new Vec3(0,12,7));
        light.setRotationFromEuler(-55,25,0);
        light.addComponent(DirectionalLight);
    }
    private spline(name:string,points:Vec3[]):SplineContainer {
        const root=this.child(this.node,name);
        const spline=root.addComponent(SplineContainer);
        spline.showGizmosAlways=true;
        for(let i=0;i<points.length;i++){
            const knotNode=this.child(root,'Knot '+(i+1),points[i]);
            const knot=knotNode.addComponent(SplineKnot);
            knot.mode=TangentMode.AutoSmooth;
        }
        spline.refresh();
        return spline;
    }
    private box(name:string,color:Color):Node {
        const node=this.child(this.node,name);
        const renderer=node.addComponent(MeshRenderer);
        renderer.mesh=utils.createMesh(primitives.box({width:1,height:.8,length:1.6}));
        const material=new Material();
        material.initialize({effectName:'builtin-unlit'});
        material.setProperty('mainColor',color);
        renderer.setSharedMaterial(material,0);
        return node;
    }
    private road(spline:SplineContainer,width=3):SplineRoad {
        const node=this.child(spline.node,'Procedural Road');
        node.addComponent(MeshRenderer);
        const road=node.addComponent(SplineRoad);
        road.spline=spline;
        road.width=width;
        road.shoulderWidth=.25;
        road.curbWidth=0;
        road.thickness=.08;
        road.rebuild();
        return road;
    }
    private follower(spline:SplineContainer,name:string,color:Color,
        progress=0):SplineAnimate {
        const node=this.box(name,color);
        const animate=node.addComponent(SplineAnimate);
        animate.spline=spline;
        animate.target=node;
        animate.duration=7;
        animate.loopMode=LoopMode.Loop;
        animate.startProgress=progress;
        animate.playOnStart=true;
        return animate;
    }
    private showFollower():void {
        const spline=this.spline('01 — Spline + Follower',[
            new Vec3(-8,0,0),new Vec3(-3,0,-3),
            new Vec3(3,0,3),new Vec3(8,0,0),
        ]);
        this.road(spline,2.5);
        this.follower(spline,'Animated Follower',new Color(40,190,240));
    }
    private showRoad():void {
        const spline=this.spline('02 — Generated Road',[
            new Vec3(-9,0,-2),new Vec3(-2,0,3),
            new Vec3(5,0,-2),new Vec3(9,0,1),
        ]);
        this.road(spline,5.5);
        this.follower(spline,'Road Vehicle',new Color(245,190,55));
    }
    private showExtrude():void {
        const spline=this.spline('03 — Tube Extrusion',[
            new Vec3(-8,1,0),new Vec3(-3,3,-3),
            new Vec3(4,4,0),new Vec3(8,1,3),
        ]);
        const node=this.child(spline.node,'Extrude Mesh');
        node.addComponent(MeshRenderer);
        const extrude=node.addComponent(SplineExtrude);
        extrude.spline=spline;
        extrude.radius=.45;
        extrude.sides=12;
        extrude.rebuild();
        this.follower(spline,'Tube Follower',new Color(230,100,190));
    }
    private showJunction():void {
        const incoming=this.spline('04 — Entry',[
            new Vec3(-9,0,0),new Vec3(-4,0,0),new Vec3(0,0,0),
        ]);
        const left=this.spline('04 — Exit Left',[
            new Vec3(0,0,0),new Vec3(4,0,-2),new Vec3(9,0,-4),
        ]);
        const right=this.spline('04 — Exit Right',[
            new Vec3(0,0,0),new Vec3(4,0,2),new Vec3(9,0,4),
        ]);
        [incoming,left,right].forEach(s=>this.road(s,2));
        const junction=this.child(this.node,'Junction 3-way').addComponent(SplineJunction);
        const link=(spline:SplineContainer,progress:number):SplineJunctionLink=>{
            const value=new SplineJunctionLink();
            value.spline=spline;
            value.progress=progress;
            return value;
        };
        junction.connections=[link(incoming,1),link(left,0),link(right,0)];
        const follower=this.follower(incoming,'Route Follower',new Color(245,130,60));
        follower.junctionMode=JunctionMode.FirstOther;
        follower.loopMode=LoopMode.Once;
    }
    private showProximity():void {
        const horizontal=this.spline('05 — East / West',[
            new Vec3(-9,0,0),new Vec3(0,0,0),new Vec3(9,0,0),
        ]);
        const vertical=this.spline('05 — North / South',[
            new Vec3(0,0,-9),new Vec3(0,0,0),new Vec3(0,0,9),
        ]);
        [horizontal,vertical].forEach(s=>this.road(s,1.5));
        for(const [spline,name,color] of [
            [horizontal,'Horizontal Agent',new Color(20,185,220)],
            [vertical,'Vertical Agent',new Color(245,145,50)],
        ] as [SplineContainer,string,Color][]){
            const animate=this.follower(spline,name,color);
            animate.duration=6;
            animate.loopMode=LoopMode.Loop;
            animate.enableProximityAvoidance=true;
            animate.proximityPredictAgents=true;
            animate.proximityPredictionHorizon=.25;
            animate.proximityRadius=.7;
            animate.proximitySafetyGap=.2;
        }
    }
    private showPositioner():void {
        const spline=this.spline('06 — Non-animated Positioners',[
            new Vec3(-9,0,-2),new Vec3(-3,0,3),
            new Vec3(4,0,-1),new Vec3(9,0,2),
        ]);
        this.road(spline,2);
        const entries:[number,Color][]=[
            [.2,new Color(70,220,140)],[.5,new Color(240,200,65)],
            [.8,new Color(90,150,245)],
        ];
        for(const [progress,color] of entries){
            const node=this.box('Positioner '+Math.round(progress*100)+'%',color);
            const positioner=node.addComponent(SplinePositioner);
            positioner.spline=spline;
            positioner.target=node;
            positioner.followOnUpdate=false;
            positioner.progress=progress;
            positioner.applyPosition();
        }
    }
}
