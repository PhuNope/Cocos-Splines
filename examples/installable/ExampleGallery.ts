import {
    _decorator, Component, Enum, Node, Vec3, Color, MeshRenderer,
    Camera, DirectionalLight, Material, Prefab, JsonAsset, primitives, utils,
} from 'cc';
import { SplineContainer } from 'db://cocos-splines/splines/Core/SplineContainer';
import { SplineKnot, TangentMode } from 'db://cocos-splines/splines/Core/SplineKnot';
import { SplineAnimate, JunctionMode, LoopMode } from 'db://cocos-splines/splines/Components/SplineAnimate';
import { SplineRoad } from 'db://cocos-splines/splines/Components/SplineRoad';
import { SplineExtrude } from 'db://cocos-splines/splines/Components/SplineExtrude';
import { SplineJunction, SplineJunctionLink } from 'db://cocos-splines/splines/Components/SplineJunction';
import { SplinePositioner } from 'db://cocos-splines/splines/Components/SplinePositioner';
import { SplineProjector } from 'db://cocos-splines/splines/Components/SplineProjector';
import { SplineTrigger } from 'db://cocos-splines/splines/Components/SplineTrigger';
import { SplineModifiers, SplineModifierKey } from 'db://cocos-splines/splines/Components/SplineModifiers';
import { SplineMorph } from 'db://cocos-splines/splines/Components/SplineMorph';
import { SplineMeshDeform, DeformAxis, DeformMode } from 'db://cocos-splines/splines/Components/SplineMeshDeform';
import { SplineTrafficController, SplineTrafficPhase, SplineTrafficConflict } from 'db://cocos-splines/splines/Components/SplineTrafficController';
import { SplineObjectController } from 'db://cocos-splines/splines/Components/SplineObjectController';
import { SplineGeometryGraphRenderer } from 'db://cocos-splines/splines/Components/SplineGeometryGraphRenderer';

const {ccclass,property}= _decorator;
/** Each mode builds an independent, temporary scene setup during Play.
 * Nothing is generated while the Editor is idle; no asset or prefab is modified.
 * Requires the Cocos Splines extension and Cocos-Gizmos dependency.
 */
export enum SplineExampleKind {
    Follower=0, Road=1, Extrude=2, Junction=3, Proximity=4, Positioner=5,
    Projector=6, Triggers=7, Modifiers=8, Morph=9,
    MeshDeform=10, TrafficController=11, PrefabSpawning=12,
    GeometryGraphUVAtlas=13, GeometryGraphTriangleUV=14, GeometryGraphAdvancedAtlas=15, GeometryGraphProfileHoles=16,
}
Enum(SplineExampleKind);

@ccclass('CocosSplinesExampleGalleryV2')
export class CocosSplinesExampleGalleryV2 extends Component {
    @property({type:Enum(SplineExampleKind),tooltip:'Choose a feature, then press Play. Nodes are created only at runtime.'})
    example:SplineExampleKind=SplineExampleKind.Follower;
    /** Optional project-authored overrides; default demo needs no asset drag/drop. */
    @property({type:JsonAsset,visible(){return this.example===SplineExampleKind.GeometryGraphUVAtlas||this.example===SplineExampleKind.GeometryGraphTriangleUV||this.example===SplineExampleKind.GeometryGraphAdvancedAtlas;},tooltip:'Optional UV Atlas Profile JSON.'})
    uvAtlasProfile:JsonAsset|null=null;
    @property({type:JsonAsset,visible(){return this.example===SplineExampleKind.GeometryGraphUVAtlas||this.example===SplineExampleKind.GeometryGraphTriangleUV||this.example===SplineExampleKind.GeometryGraphAdvancedAtlas;},tooltip:'Optional UV Atlas Geometry Graph JSON.'})
    uvAtlasGraph:JsonAsset|null=null;
    @property({type:Material,visible(){return this.example===SplineExampleKind.GeometryGraphUVAtlas||this.example===SplineExampleKind.GeometryGraphTriangleUV||this.example===SplineExampleKind.GeometryGraphAdvancedAtlas;},tooltip:'Optional UV checker material for both previews.'})
    uvAtlasPreviewMaterial:Material|null=null;
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
            case SplineExampleKind.Projector:this.showProjector();break;
            case SplineExampleKind.Triggers:this.showTriggers();break;
            case SplineExampleKind.Modifiers:this.showModifiers();break;
            case SplineExampleKind.Morph:this.showMorph();break;
            case SplineExampleKind.MeshDeform:this.showMeshDeform();break;
            case SplineExampleKind.TrafficController:this.showTrafficController();break;
            case SplineExampleKind.PrefabSpawning:this.showPrefabSpawning();break;
            case SplineExampleKind.GeometryGraphUVAtlas:this.showGeometryGraphUVAtlas();break;
            case SplineExampleKind.GeometryGraphTriangleUV:this.showGeometryGraphTriangleUV();break;
            case SplineExampleKind.GeometryGraphAdvancedAtlas:this.showGeometryGraphAdvancedAtlas();break;
            case SplineExampleKind.GeometryGraphProfileHoles:this.showGeometryGraphProfileHoles();break;
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
    private showProjector():void {
        const spline=this.spline('07 — Nearest-point Projection',[
            new Vec3(-9,0,-2),new Vec3(-4,0,3),
            new Vec3(2,0,-3),new Vec3(9,0,2),
        ]);
        this.road(spline,1.7);
        const source=this.box('Projection Source (offset from curve)',
            new Color(255,175,65));
        source.setPosition(new Vec3(-2,2,6));
        const marker=this.box('Nearest Point on Spline',new Color(30,220,155));
        const driver=this.child(this.node,'Nearest-point Projector');
        const projector=driver.addComponent(SplineProjector);
        projector.spline=spline;
        projector.sourceNode=source;
        projector.projectedNode=marker;
        projector.snapToSpline=true;
        projector.alignToSpline=false;
        projector.autoProject=true;
        projector.projectNow();
    }
    private showTriggers():void {
        const spline=this.spline('08 — Trigger Events',[
            new Vec3(-9,0,-1),new Vec3(-3,0,2),
            new Vec3(3,0,-2),new Vec3(9,0,1),
        ]);
        this.road(spline,2);
        const follower=this.follower(spline,'Trigger Test Follower',
            new Color(50,180,250));
        follower.duration=9;
        follower.loopMode=LoopMode.Loop;
        for(const [progress,color] of [
            [.25,new Color(60,210,130)],
            [.5,new Color(255,205,60)],
            [.75,new Color(245,110,90)],
        ] as [number,Color][]){
            const marker=this.box('Trigger '+Math.round(progress*100)+'%',color);
            marker.setWorldPosition(spline.evaluateWorldPosition(progress));
            const trigger=marker.addComponent(SplineTrigger);
            trigger.spline=spline;
            trigger.progress=progress;
            trigger.oncePerFollower=false;
            trigger.AddOnCrossEvent(event=>{
                console.log('[Cocos Splines Example] Trigger '+Math.round(progress*100)+
                    '% crossed by '+event.target.name);
            });
        }
    }
    private showModifiers():void {
        const spline=this.spline('09 — Modifiers: Speed + Width',[
            new Vec3(-9,0,0),new Vec3(-4,0,-3),
            new Vec3(3,0,3),new Vec3(9,0,0),
        ]);
        const modifierNode=this.child(spline.node,'Speed and Width Keys');
        const modifiers=modifierNode.addComponent(SplineModifiers);
        modifiers.spline=spline;
        const key=(progress:number,speed:number,width:number):SplineModifierKey=>{
            const value=new SplineModifierKey();
            value.progress=progress;
            value.speed=speed;
            value.width=width;
            return value;
        };
        modifiers.keys=[
            key(0,1,1),key(.35,.45,1.8),key(.65,.45,1.8),key(1,1,1),
        ];
        const road=this.road(spline,2.4);
        road.modifiers=modifiers;
        road.rebuild();
        const follower=this.follower(spline,'Speed-modified Vehicle',
            new Color(250,165,40));
        follower.modifiers=modifiers;
        follower.duration=8;
    }
    private showMorph():void {
        const a=this.spline('10 — Shape A',[
            new Vec3(-9,0,0),new Vec3(-3,0,-5),
            new Vec3(3,0,-4),new Vec3(9,0,0),
        ]);
        const b=this.spline('10 — Shape B',[
            new Vec3(-9,0,0),new Vec3(-3,0,5),
            new Vec3(3,0,4),new Vec3(9,0,0),
        ]);
        const output=this.spline('10 — Morph Output (50%)',[
            new Vec3(-9,0,0),new Vec3(-3,0,0),
            new Vec3(3,0,0),new Vec3(9,0,0),
        ]);
        const driver=this.child(this.node,'Morph Controller');
        const morph=driver.addComponent(SplineMorph);
        morph.sourceA=a;
        morph.sourceB=b;
        morph.outputSpline=output;
        morph.blend=.5;
        morph.updateOnChange=false;
        morph.apply();
        this.road(output,2);
        this.follower(output,'Morph Output Follower',new Color(190,90,245));
    }
    /** Runtime-generated tessellated ribbon is a small, readable input mesh.
     * For real imported model assets use MeshDeform/MeshDeformSetup.ts instead.
     */
    private showMeshDeform():void {
        const spline=this.spline('11 — Deform Mesh Along Curve',[
            new Vec3(-8,0,0),new Vec3(-3,1,-4),
            new Vec3(3,2,4),new Vec3(8,1,0),
        ]);
        const positions:number[]=[],uvs:number[]=[],normals:number[]=[],indices:number[]=[];
        const sections=16;
        for(let i=0;i<=sections;i++){
            const t=i/sections;
            for(const x of [-.35,.35]){
                positions.push(x,0,(t-.5)*3);
                normals.push(0,1,0);
                uvs.push(x>0?1:0,t);
            }
        }
        for(let i=0;i<sections;i++){
            const k=i*2;
            indices.push(k,k+2,k+1,k+1,k+2,k+3);
        }
        const source=utils.createMesh({positions,uvs,normals,indices});
        // Built-in procedural mesh data is runtime-owned; this opt-in flag
        // permits readAttribute()/readIndices() in Creator 3.8.x.
        source.allowDataAccess=true;
        const node=this.child(spline.node,'Deformed Ribbon');
        node.addComponent(MeshRenderer);
        const deform=node.addComponent(SplineMeshDeform);
        deform.spline=spline;
        deform.sourceMesh=source;
        deform.axis=DeformAxis.Z;
        deform.mode=DeformMode.Stretch;
        deform.widthScale=1.5;
        deform.heightScale=1;
        deform.rebuild();
        if(!node.getComponent(MeshRenderer)?.mesh)
            console.warn('[Cocos Splines Example] Mesh Deform preview requires readable mesh data; try the MeshDeformSetup script with an imported mesh (Allow Data Access).');
        this.follower(spline,'Ribbon Route Vehicle',new Color(70,200,220));
    }
    private showTrafficController():void {
        const incoming=this.spline('12 — Incoming Traffic',[
            new Vec3(-9,0,0),new Vec3(-4,0,0),new Vec3(0,0,0),
        ]);
        const left=this.spline('12 — Traffic Exit A',[
            new Vec3(0,0,0),new Vec3(4,0,-3),new Vec3(9,0,-4),
        ]);
        const right=this.spline('12 — Traffic Exit B',[
            new Vec3(0,0,0),new Vec3(4,0,3),new Vec3(9,0,4),
        ]);
        for(const route of [incoming,left,right])this.road(route,1.8);
        const node=this.child(this.node,'Traffic Junction and Signals');
        const junction=node.addComponent(SplineJunction);
        const link=(spline:SplineContainer,progress:number):SplineJunctionLink=>{
            const value=new SplineJunctionLink();
            value.spline=spline;value.progress=progress;
            return value;
        };
        junction.connections=[
            link(incoming,1),link(left,0),link(right,0),
        ];
        const controller=node.addComponent(SplineTrafficController);
        controller.junction=junction;
        const phase=(index:number):SplineTrafficPhase=>{
            const value=new SplineTrafficPhase();
            value.greenExits=[index];
            value.greenSeconds=5;
            value.yellowSeconds=1.5;
            return value;
        };
        controller.phases=[phase(1),phase(2)];
        const conflict=new SplineTrafficConflict();
        conflict.firstExit=1;conflict.secondExit=2;
        controller.conflicts=[conflict];
        controller.allRedSeconds=1;
        controller.adaptiveTraffic=false;
        const follower=this.follower(incoming,'Traffic-aware Follower',
            new Color(255,190,55));
        follower.junctionMode=JunctionMode.RoundRobin;
        follower.loopMode=LoopMode.Once;
        follower.enableTrafficCapacity=true;
        // Signals apply to opted-in followers; read current Stage and
        // remainingSeconds from controller for runtime diagnostics.
        console.log('[Cocos Splines Example] Traffic Controller: initial All Red; exits 1 and 2 alternate Green/Yellow after clearance.');
    }
    private showPrefabSpawning():void {
        const spline=this.spline('13 — Prefab Spawning',[
            new Vec3(-9,0,0),new Vec3(-5,0,-3),
            new Vec3(4,0,3),new Vec3(9,0,0),
        ]);
        this.road(spline,2);
        // A transient runtime Prefab template avoids shipping a baked UUID
        // into another project. For authored content use PrefabSpawningSetup.ts.
        const template=new Node('Runtime Box Prefab Template');
        const renderer=template.addComponent(MeshRenderer);
        renderer.mesh=utils.createMesh(primitives.box({
            width:.6,height:1,length:.6,
        }));
        const material=new Material();
        material.initialize({effectName:'builtin-unlit'});
        material.setProperty('mainColor',new Color(65,200,125));
        renderer.setSharedMaterial(material,0);
        const prefab=new Prefab();
        prefab.data=template;
        const node=this.child(spline.node,'Prefab Scatter Controller');
        const controller=node.addComponent(SplineObjectController);
        controller.spline=spline;
        controller.prefabs=[prefab];
        controller.count=14;
        controller.seed=2026;
        controller.randomPosition=new Vec3(.2,.05,.2);
        controller.randomRotation=new Vec3(0,15,0);
        controller.randomScale=.15;
        controller.spawnOnStart=false;
        const count=controller.spawn();
        if(count===0)
            console.warn('[Cocos Splines Example] Runtime Prefab could not spawn. Use Population/PrefabSpawningSetup.ts with a real .prefab asset.');
    }
    /** Show identical Extrude geometry with and without UV Atlas packing.
     * Both profiles are transient JsonAssets; user-owned source assets are
     * cloned, never edited. The graph and profile are generated by default,
     * so this Gallery mode does not depend on asset-db UUIDs or JSON dragging.
     */
    private showGeometryGraphTriangleUV():void {
        this.showGeometryGraphUVAtlas(true);
    }
    private showGeometryGraphAdvancedAtlas():void {
        this.showGeometryGraphUVAtlas(true,true);
    }
    private showGeometryGraphProfileHoles():void {
        this.showGeometryGraphUVAtlas(false,false,true);
    }
    private showGeometryGraphUVAtlas(triangle=false,advanced=false,hollow=false):void {
        const graphData=this.uvAtlasGraph?.json??{
            version:1,nodes:[
                {id:'source',type:'spline'},
                {id:'extrude',type:'extrude',input:'source',width:2,
                    height:1,profileSlot:0,uvMetersPerRepeat:2,capEnds:true},
                {id:'output',type:'output',input:'extrude'},
            ],output:'output',
        };
        const authored=this.uvAtlasProfile?.json??{
            format:'cocos-splines/profile',version:1,
            points:[
                {x:-.5,y:-.5},{x:.5,y:-.5},
                {x:.5,y:.5},{x:-.5,y:.5},
            ],
            uv:{sideIslandMode:2,uMetersPerRepeat:1.5,
                atlasPacking:true,atlasPadding:.06},
        };
        // A JSON deep clone is intentional: never mutate a project JsonAsset
        // while constructing the transient packed and unpacked variants.
        const base=JSON.parse(JSON.stringify(authored));
        const graphJson=JSON.stringify(graphData);
        if(typeof base!=='object'||!base||!Array.isArray(base.points)||
            !base.uv||typeof base.uv!=='object')
            throw Error('UV Atlas Gallery needs a polygon Profile with UV settings.');
        const variants:[
            string,number,boolean,Color,
        ][]=hollow?[
            ['Solid Profile',-4.7,false,new Color(80,175,240)],
            ['Hollow Profile / Two holes',4.7,true,new Color(250,175,75)],
        ]:triangle?[
            [advanced?'Per-triangle UV / Legacy Atlas':'Quad Islands / Reference',-4.7,false,new Color(80,175,240)],
            [advanced?'Per-triangle UV / Advanced Atlas':'Per-triangle UV / Atlas',4.7,true,new Color(250,175,75)],
        ]:[
            ['UV regular / Quad Islands',-4.7,false,new Color(80,175,240)],
            ['UV Atlas / Packed',4.7,true,new Color(250,175,75)],
        ];
        for(const [label,x,packed,color] of variants){
            const spline=this.spline((hollow?'17':advanced?'16':triangle?'15':'14')+' — '+label,[
                new Vec3(x-3.5,1,-1.2),
                new Vec3(x-1.1,2.3,-3),
                new Vec3(x+1.1,1.6,2.7),
                new Vec3(x+3.5,1,1.2),
            ]);
            const node=this.child(spline.node,'Geometry Graph · '+label);
            const meshRenderer=node.addComponent(MeshRenderer);
            const graph=node.addComponent(SplineGeometryGraphRenderer);
            const profileData=JSON.parse(JSON.stringify(base));
            profileData.uv={...profileData.uv,sideIslandMode:2};
            if(triangle){
                if(packed||advanced)profileData.uv.triangleUnwrap=true;
                else delete profileData.uv.triangleUnwrap;
            }
            if(packed||advanced){
                profileData.uv.atlasPacking=true;
                profileData.uv.atlasPadding=base.uv.atlasPadding??.06;
                if(advanced&&packed){
                    profileData.uv.atlasRotate=true;
                    profileData.uv.atlasPixelPadding=base.uv.atlasPixelPadding??{resolution:1024,pixels:4};
                }else if(advanced){
                    delete profileData.uv.atlasRotate;
                    delete profileData.uv.atlasPixelPadding;
                }
            }else{
                delete profileData.uv.atlasPacking;
                delete profileData.uv.atlasPadding;
                delete profileData.uv.atlasRotate;
                delete profileData.uv.atlasPixelPadding;
            }
            if(hollow){
                profileData.points=[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}];
                profileData.uv={sideIslandMode:2};
                if(packed)profileData.holes=[
                    [{x:-.4,y:-.3},{x:-.4,y:.3},{x:-.1,y:.3},{x:-.1,y:-.3}],
                    [{x:.1,y:-.3},{x:.1,y:.3},{x:.4,y:.3},{x:.4,y:-.3}],
                ];
                else delete profileData.holes;
            }
            const transientProfile=new JsonAsset();
            transientProfile.json=profileData;
            graph.spline=spline;
            graph.graphJson=graphJson;
            graph.useGraphAsset=false;
            graph.profileAssetA=transientProfile;
            graph.rebuildOnChange=false;
            const material=this.uvAtlasPreviewMaterial??new Material();
            if(!this.uvAtlasPreviewMaterial){
                material.initialize({effectName:'builtin-unlit'});
                material.setProperty('mainColor',color);
            }
            graph.material=material;
            try{
                graph.rebuild();
                if(!meshRenderer.mesh)
                    console.warn('[Cocos Splines Example] UV Atlas graph did not output a mesh: '+label);
            }catch(error){
                console.warn('[Cocos Splines Example] UV Atlas graph failed ('+label+'):',error);
            }
        }
        if(hollow){console.log('[Cocos Splines Example] Solid vs two-hole Profile Extrude.');return;}
        console.log('[Cocos Splines Example] '+(advanced?'GeometryGraphAdvancedAtlas':triangle?'GeometryGraphTriangleUV':'GeometryGraphUVAtlas')+
            (advanced?': Left = legacy triangle Atlas, Right = advanced Atlas':': Left = Quad Islands, Right = '+(triangle?'triangle UV Atlas':'quad UV Atlas'))+
            '. Add a checker material to see UV0; no JSON assets are required.');
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
