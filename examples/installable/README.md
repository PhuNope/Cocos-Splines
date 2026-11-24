# Cocos Splines — Examples (V2 preview)

Installed from **Extension → Cocos Splines → Install Examples**.

These are **project-owned scripts** (not linked to the extension package). You can edit or remove them freely. Re-running Install Examples **skips existing files**; it never replaces changes or existing .meta UUIDs. This installer does NOT create a .scene/.prefab asset — create your own empty scene first.

## Quick start: 6 runnable examples

1. Make a new **3D Scene** in Cocos Creator 3.8.x and save it.
2. Create an empty node named **Spline Example Gallery**.
3. Once script compilation finishes, add component **CocosSplinesExampleGalleryV2** (from ExampleGallery.ts) to that node.
4. Set **Example** to one of the choices below, then press **Play**. The component creates a Camera, Light, Splines, procedural meshes and sample objects **at runtime only**. Return to Edit Mode and switch the enum to view another.
5. Keep the installed **Cocos Splines** and **Cocos-Gizmos** extensions enabled. If your scene already has a Main Camera, disable it or the generated Examples Camera while testing.

| Example enum | What it demonstrates |
| --- | --- |
| Follower | AutoSmooth knots, animated target, spline evaluation and gizmo-friendly route |
| Road | Procedural wide road with shoulders and a moving vehicle |
| Extrude | Curved tube generated from an editable spline path |
| Junction | Three spline branches and a FirstOther route switch |
| Proximity | Two crossing followers with opt-in 3D swept proximity and velocity prediction |
| Positioner | Static positioning of three markers at arc progress 20%, 50%, 80% |

The gallery creates nodes only in **Play mode**; the generated nodes are ephemeral and not saved in your scene. To save editable examples permanently, use the extension's menu/Inspector actions to create spline nodes in Edit Mode and reconstruct the chosen setup.

## Additional feature-specific scripts

These scripts demonstrate serialized-component workflows where you provide references in the Inspector:

- **Road/RoadUvSetup.ts** — switch road UV direction / tiling.
- **Extrude/ExtrudeTubeSetup.ts** — configure an extruded tube.
- **Junction/JunctionRoadPatchSetup.ts** — bind a three-way junction and road-patch mesh (assign references, then call configure).
- **Train/TrainSingleSpline.ts** — locomotive + spaced SplinePositioner wagons.
- **Train/TrainRouteConsist.ts** — cars follow a multi-spline route history.

Not every feature is a one-click scene. Advanced cases (Mesh Deformation, Traffic Controller, Collider backends, Noise, Prefab spawning) require assets and Editor references not included in this starter pack. Read the extension documentation for full configuration.

## Safety and limitations

- The installation folder is **assets/CocosSplinesExamples** (visible in the Assets panel after Asset DB refresh).
- No existing project Scene, Node, asset, Prefab, .meta or user script is modified by the installer.
- Generated procedural meshes and unlit box materials are intentionally simple teaching visuals.
- Proximity prediction is NOT a physical collision or multiplayer safety solver.
- Test Editor save/reopen, native preview and physics backend behavior on your own Creator 3.8.8 installation. The GitHub offline tests do not certify native rendering.
