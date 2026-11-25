# Cocos Splines — Examples (V2 preview)

Installed from **Extension → Cocos Splines → Install Examples**.

These are **project-owned scripts** (not linked to the extension package). You can edit or remove them freely. Re-running Install Examples **skips existing files**; it never replaces changes or existing .meta UUIDs. This installer does NOT create a .scene/.prefab asset — create your own empty scene first.

## Quick start: 13 runnable examples

1. Make or open a **3D Scene** in Cocos Creator 3.8.x and save it.
2. Once script compilation finishes, choose **Extension → Cocos Splines → Create Example Gallery in Scene**. The Editor creates a Node with **CocosSplinesExampleGalleryV2**; clicking again selects the same Node.
3. Alternatively, create a Node manually and add component **CocosSplinesExampleGalleryV2** from ExampleGallery.ts.
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
| Projector | Find the closest point on the spline from an off-curve source marker |
| Triggers | Event markers at 25%, 50% and 75% of a looping follower trajectory |
| Modifiers | Reusable speed and road-width keyframes shared by a vehicle and its road |
| Morph | Blend two source splines into an independent output spline at 50% |
| MeshDeform | Deform a procedurally subdivided ribbon along a curved spline (imported-mesh workflow also included) |
| TrafficController | Two alternating signal phases, with all-red clearance at a three-way junction |
| PrefabSpawning | Deterministic distribution of runtime prefab copies along a spline (or bind authored .prefab files) |

The gallery creates nodes only in **Play mode**; the generated nodes are ephemeral and not saved in your scene. To save editable examples permanently, use the extension's menu/Inspector actions to create spline nodes in Edit Mode and reconstruct the chosen setup.

## Additional feature-specific scripts

These scripts demonstrate serialized-component workflows where you provide references in the Inspector:

- **Road/RoadUvSetup.ts** — switch road UV direction / tiling.
- **Extrude/ExtrudeTubeSetup.ts** — configure an extruded tube.
- **Junction/JunctionRoadPatchSetup.ts** — bind a three-way junction and road-patch mesh (assign references, then call configure).
- **Train/TrainSingleSpline.ts** — locomotive + spaced SplinePositioner wagons.
- **Train/TrainRouteConsist.ts** — cars follow a multi-spline route history.
- **MeshDeform/MeshDeformSetup.ts** — configure a readable, subdivided imported Mesh; supports Stretch/Repeat.
- **Traffic/TrafficSignalsSetup.ts** — bind a 3-link Junction to two non-overlapping traffic phases.
- **Population/PrefabSpawningSetup.ts** — bind actual project .prefab assets to a seeded, runtime-only spline population.
- **GeometryGraph/BasicRibbonGraph.json** — complete typed v1 graph connecting Spline → Offset → Width → Ribbon → Output. Add `Splines.SplineGeometryGraphRenderer` to a Node with MeshRenderer, assign an existing SplineContainer, copy this JSON into `Graph Json`, then press **Rebuild Graph**.
- **GeometryGraph/BasicTubeGraph.json** — alternative typed v1 graph connecting Spline → Offset → Width → Tube → Output. Radius 0.75, 16 radial segments, caps for open splines and repeatable UVs; attach it as a Shared JsonAsset or copy its content to local `graphJson`. The installer never overwrites either example file.
- **GeometryGraph/BasicProfileExtrudeGraph.json** — typed Extrude graph using a concave U Channel profile (width 1.5, height 1, capped ends). Add a Geometry Graph Renderer and assign the JSON as a Shared Graph Asset or copy it into local Graph JSON. The installer skips existing files, preserving edited profiles.
- **GeometryGraph/AuthoredProfileExtrudeGraph.json** — V2 graph with two Extrude outputs, each using a separate author-owned profile polygon. Assign **Profile Asset A** to `GeometryGraph/Profiles/LProfile.json` (concave L) and **Profile Asset B** to `GeometryGraph/Profiles/OctagonProfile.json` (beveled octagon), then enable **Render All Outputs** for two material primitives on one MeshRenderer. Extrude node **Profile Asset Slot** chooses A/B/C or **Built-in preset**; the graph JSON stores only slot numbers, never polygon buffers or asset UUIDs. Profile files require format `cocos-splines/profile` v1 with 3–16 normalized CCW `{x,y}` points, without holes, collinear/overlapping edges or self-intersections. Re-running Install Examples never overwrites a user-edited profile.
- **GeometryGraph/UVIslandExtrudeGraph.json** — optional Profile Extrude graph v1. Assign either **UVEdgeIslandProfile.json** or **UVQuadIslandProfile.json** to Profile Asset A. The first mode restarts U on every profile edge without topology change; the second restarts U/V per spline-side quad, duplicating only side UV vertices. Authored Profile Editor → Side UV islands edits unsaved draft; Save Profile JSON requires confirmation. See `docs/GEOMETRY_GRAPH_PROFILE_UV_ISLANDS_V2_VI.md`.
- **GeometryGraph/Profiles/UVEdgeIslandProfile.json** — square authored Profile with `uv.sideIslandMode: 1`, normalized U in [0,1] for each side and continuously repeated V.
- **GeometryGraph/Profiles/UVQuadIslandProfile.json** — square Profile with `uv.sideIslandMode: 2`, metric U (1.5 m/repeat) and Frame Scale follow; every spline-span side quad has a separate UV island. No UV atlas packing.
- **GeometryGraph/Profiles/UVSeamProfile.json** — optional UV0 authoring demo (square, seam edge index 2, per-edge UV weights 1/2/1/1). Assign to Profile Asset A or B on an authored Extrude renderer; select its matching edge in Authored Profile Editor to change Edge UV weight or Set UV seam. The optional uv object only redistributes side-band U in [0,1]; UV V remains spline distance, cap UVs remain profile-local x/y. Original L/Octagon profiles without uv retain their previous mapping and are never overwritten on reinstall.
- **GeometryGraph/TaperWidthExtrudeGraph.json** — distance-based Width Node taper example. Start multiplier 1, Mid .35, End 1 with Smoothstep. Assign `GeometryGraph/Profiles/UVTaperProfile.json` to Profile Asset A and use this Graph JSON in your renderer to see both mesh taper and physical UV U per section. Closed loops are safe only if Start/End match. Mid/End can be left blank in Visual Graph Inspector for legacy fixed-width/automatic midpoint behavior.
- **GeometryGraph/Profiles/UVTaperProfile.json** — use an authored Extrude with variable spline widthFactor, assign the new JsonAsset to Profile Asset A/B/C and compare enabled `uv.uFollowFrameScale` against nominal UV. U follows each local spline frame's section scaling; external Node world-space scaling is not compensated. Cap UV and mesh topology are unchanged.
- **GeometryGraph/Profiles/UVMetricProfile.json** — optional metric UV0 tiling example using `uv.uMetersPerRepeat: 1.5`. Assign to Profile Asset A or B, then inspect **Side U meters/repeat** in Authored Profile Editor. U repeats every 1.5 nominal meters along weighted perimeter at the Extrude Width/Height setting. V still comes from Extrude `uvMetersPerRepeat` along the spline; polygon cap UVs and normal/topology are unchanged. Clear the field or click **Use Normalized U** to restore old [0,1] perimeter U. No automatic Scene/asset mutation; Save requires confirmation.
- **Profile Library new asset / draft export (Inspector)** — select a template and click **Create Preset JSON…** (works without an opened Profile draft). With an opened and edited Profile, use **Export Draft As New JSON…** to preserve original source. Both use native Save + confirmation, create a brand-new `.json` only inside Project/assets (no overwrite), and require manually assigning the new JsonAsset to Profile Asset A/B/C; no Scene/Prefab write or draft loss.
- **Profile Library (Inspector)** — assign one of the existing Profile JsonAssets to Slot A/B/C, click Edit Profile Asset…, choose Rectangle / Beveled / U Channel / L Section / Octagon / UV Seam Example from the Profile Library dropdown, and click Load Preset into Draft. Undo/Redo applies to drafts only. To persist, click Save Profile JSON… and confirm; otherwise Discard Draft. Profile Library does not create or overwrite project assets automatically.
- **GeometryGraph/BasicMeshDeformGraph.json** — typed Mesh Deform graph with a subdivided Box Shell (16 source segments repeated 4 times), bent along the selected Spline. This first graph version uses safe built-in mesh presets; imported Mesh asset binding remains a separate future phase. The installer never overwrites custom presets.
- **GeometryGraph/ImportedMeshDeformGraph.json** — typed Graph V1 with a `meshAsset` node connected to `meshDeform.meshInput`. Assign a readable imported Mesh (one submesh, 4096 vertices maximum) to the `Source Mesh` property of `SplineGeometryGraphRenderer`; enable **Allow Data Access** in the Mesh import settings. Each renderer binds its own Source Mesh, even when referencing the same graph JsonAsset. This JSON sample does not contain mesh vertex data or a hardcoded asset UUID.
- **GeometryGraph/MultiMaterialOutputsGraph.json** — opt-in Graph V2 with **three Output Nodes in one MeshRenderer**: `outputExtrude` (Material slot 0 / Material), `outputRoad` (slot 1 / Material B), `outputTube` (slot 2 / Material C). Assign a SplineContainer and a MeshRenderer to one Node, select the graph JsonAsset, enable **Render All Outputs**, and assign the materials on that renderer. **Output ID is ignored in this mode**; the sorted output IDs determine stable primitive/material indices. One Mesh asset is generated with three submesh primitives, with no child Nodes added. Turn Render All Outputs off to return to single-output mode.
- **GeometryGraph/SubMeshSelectionGraph.json** — opt-in V2 example for a single imported FBX/Mesh with **two submeshes**. Assign the same readable Mesh asset to `Source Mesh` and `Source Mesh B` on two `SplineGeometryGraphRenderer` nodes, set native **Source Submesh** = 0 and **Source Submesh B** = 1, then select `outputA` and `outputB` respectively. Each renderer outputs exactly one material-independent submesh; assign its Material in the renderer or the MeshRenderer. No generated children or multiple material primitives are created in one renderer.
- **GeometryGraph/SourceLengthTrimGraph.json** — imported Mesh Deform graph with **Source Length / Trim Last Tile**. Set **Source Mesh** to a readable one-submesh asset; its longitudinal Z bounds define the physical repeat length (tileLength = 0). Only the last partial tile is geometrically cropped, not stretched, and UV Mode = Original preserves imported UV islands. Set tileLength to an explicit local-unit length if mesh import units differ from graph path units. This example does not include or modify an FBX Mesh asset.
- **GeometryGraph/DualMeshAxisGraph.json** — opt-in V2 two-output Mesh Deform graph with separate imported Mesh Slot A (X longitudinal axis) and Slot B (Y longitudinal axis). Assign two readable Mesh assets to **Source Mesh** and **Source Mesh B** on each renderer, and set each renderer's Output ID to `outputA` or `outputB`. Slot C is available for a third mesh source. It never writes imported asset data into the JSON.
- **GeometryGraph/MultiOutputRoadTubeGraph.json** — opt-in **Graph V2** with two mesh branches from one spline. Assign this same JsonAsset to two separate `SplineGeometryGraphRenderer` Nodes that share a `SplineContainer`, then set the first renderer's `Output ID` to `outputRoad` and the second to `outputPipe`. Each Node needs its own MeshRenderer; no child nodes are created automatically. Leave Output ID blank to use `outputRoad` by default. Use the Inspector's **＋ Output Branch / Set Default Output / Remove Output** actions to modify local V2 graph nodes or explicitly edit a shared asset draft.

The Gallery's MeshDeform and PrefabSpawning modes use **temporary runtime-only assets**. For production-like meshes and prefab distribution, assign your imported mesh and authored prefab assets with the new setup scripts. Advanced cases (Collider backends, Noise and full Traffic validation) still require Editor and backend checks. Read the extension documentation for full configuration.

## Safety and limitations

- The installation folder is **assets/CocosSplinesExamples** (visible in the Assets panel after Asset DB refresh).
- No existing project Scene, Node, asset, Prefab, .meta or user script is modified by the installer.
- Generated procedural meshes and unlit box materials are intentionally simple teaching visuals.
- Proximity prediction is NOT a physical collision or multiplayer safety solver.
- Test Editor save/reopen, native preview and physics backend behavior on your own Creator 3.8.8 installation. The GitHub offline tests do not certify native rendering.

## One-click Editor Gallery node (V2)

After the examples compile, open an existing 3D Scene and choose
**Extension → Cocos Splines → Create Example Gallery in Scene**.
The extension adds one native Gallery component Node, takes one Scene snapshot,
then selects it. Set Example mode, **Save Scene**, and Play. Re-running
selects the existing Gallery. Details:
`CREATE_GALLERY_IN_SCENE.md`.

### Updating an existing Gallery installation

Install Examples always **skips existing files** to preserve your edits and Cocos-generated .meta UUIDs. Consequently, a pre-existing ExampleGallery.ts will retain its older set of modes, even after installing this newer extension.

For an existing project, prefer comparing the bundled new ExampleGallery.ts to your project copy and merging new enum modes/methods manually. To replace a clean, unreferenced Gallery script, back up your project first and remove only that script, then run Install Examples again. **Deleting a script referenced by saved Scenes may break component references**, so do not delete your live Gallery script without a backup and migration plan. New projects receive all ten modes immediately.

### Imported asset workflows (13-mode Gallery)

**Mesh Deformation**: Press Play in MeshDeform mode to see a procedural ribbon input mesh deformed along a curved spline. To test an imported rope/pipe model instead, create a SplineContainer and a Node with MeshRenderer + SplineMeshDeform, then attach `CocosSplinesMeshDeformExampleV2` and bind its three Inspector references. Enable **Allow Data Access** on the imported Mesh, and subdivide the mesh along its Z axis.

**Traffic Controller**: TrafficController mode creates an incoming route, two outgoing routes, two exclusive green phases (exit 1 and 2), yellow and all-red clearance. A follower must enable **Traffic Capacity** to obey traffic signals. For your own Junction, use `CocosSplinesTrafficSignalsExampleV2` with three ordered links and an assigned controller.

**Prefab Spawning**: The Gallery builds a transient runtime Prefab template and scatters up to 14 instances; it writes **no .prefab asset**. For actual asset selection, assign one or more .prefab files to `CocosSplinesPrefabSpawningExampleV2` and a SplineObjectController. The controller owns only the runtime-created instances and clears them on disable.
