# Cocos Splines — Examples (V2 preview)

Installed from **Extension → Cocos Splines → Install Examples**.

These are **project-owned scripts** (not linked to the extension package). You can edit or remove them freely. Re-running Install Examples skips existing files except known, byte-identical legacy Gallery and Train scripts. It never overwrites user changes or existing .meta UUIDs. This installer does NOT create a .scene/.prefab asset — create your own empty scene first.

## Cocos Creator 3.8.8 Train script fix

Run Install Examples again to upgrade unmodified TrainSingleSpline.ts and TrainRouteConsist.ts in place. For customized copies, import `CCBoolean` from `cc` and use `@property({ type: CCBoolean })` on `wrapClosed`, `backwards`, `loopRoute` and `playOnStart`, preserving their defaults and existing `.meta` files.

## Quick start: 20 runnable examples

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
| GeometryGraphUVAtlas | Two temporary Profile Extrude meshes: regular Quad Islands and UV Atlas packed. No JSON drag/drop required. |
| GeometryGraphTriangleUV | Two temporary Extrude meshes: regular Quad Islands versus each triangle's independent UV0 island packed into Atlas. No JSON drag/drop required. |
| GeometryGraphAdvancedAtlas | Per-triangle UV Atlas with 90-degree rotation and 4 px gutter at 1024 × 1024. No JSON drag/drop required. |
| GeometryGraphProfileHoles | Solid and two-hole Profile Extrude comparison with open interior channels and perforated end caps. No JSON drag/drop required. |
| GeometryGraphMultiContour | One versus three disconnected solid contours along a spline. No JSON drag/drop required. |
| GeometryGraphMultiHollow | Three solid versus three hollow contours, one hole in each. No JSON drag/drop required. |
| GeometryGraphAtlasPriority | Same hollow profile with equal vs weighted outer/inner/cap UV density. No JSON drag/drop required. |

### Geometry Graph Triangle UV — no JsonAsset setup required

Choose **Example → GeometryGraphTriangleUV** and press **Play**. The Gallery creates two Graph Extrude meshes with identical spline/profile geometry: left = regular Quad Islands, right = independent UV for each side/cap triangle packed into an Atlas. Drag a checker Material into **UV Atlas Preview Material** to inspect UV seams. The demo does not mutate source JSON and needs no asset references.

### Geometry Graph UV Atlas — no JsonAsset setup required

Choose **Example → GeometryGraphUVAtlas**, then **Play**. The Gallery creates a spline and **SplineGeometryGraphRenderer** on each side and compares Quad Islands with and without Atlas Packing. Both the graph and Profile are created from built-in defaults matching `GeometryGraph/UVIslandExtrudeGraph.json` and `GeometryGraph/Profiles/UVAtlasProfile.json`; no manual JsonAsset assignment is needed.

The default previews have different unlit colors. For actual texture UV differences, assign the same checker-pattern Material to Gallery's **UV Atlas Preview Material** before Play. You may optionally drag `UVAtlasProfile.json` into **UV Atlas Profile** or `UVIslandExtrudeGraph.json` into **UV Atlas Graph**, but these references are overrides only; the Gallery makes temporary copies and does not write either asset.

To inspect/edit the actual Graph interactively, add a persistent **Splines → Procedural Geometry Graph** component in Edit Mode and assign the shared Graph Asset and Profile Asset A there. The Gallery's objects disappear when Play stops.

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
- **GeometryGraph/Profiles/UVAtlasProfile.json** — opt-in UV0 atlas demo for authored Extrude with `uv.sideIslandMode: 2`, `uv.atlasPacking:true` and 6% per-cell padding. Assign it to Profile Asset A with `UVIslandExtrudeGraph.json`; use the Profile Inspector draft controls **Pack UV0 islands into atlas** / **Atlas padding**. Side quads and endcaps receive nonoverlapping UV0 rectangles in [0,1] with one global UV scale. Native image atlas baking/per-triangle unwrap are not included.
- **GeometryGraph/Profiles/MultiHollowProfile.json** — three independent hollow profiles; run GeometryGraphMultiHollow in the Gallery.
- **GeometryGraph/Profiles/MultiContourProfile.json** — three disconnected CCW exteriors. Choose Gallery GeometryGraphMultiContour and Play, or assign as Profile Asset A.
- **GeometryGraph/Profiles/HollowProfile.json** — two clockwise interior contours inside a CCW exterior. Select Gallery `GeometryGraphProfileHoles` and Play, or assign the JSON to Profile Asset A of a persistent Geometry Graph renderer.
- **GeometryGraph/Profiles/UVAtlasPriorityProfile.json** — outer wall density 2, inner wall 0.5, caps 1. Gallery GeometryGraphAtlasPriority demonstrates the comparison.
- **GeometryGraph/Profiles/UVAdvancedAtlasProfile.json** — triangle UV Atlas with rotation enabled and a 4 px gutter at 1024 × 1024. Select Gallery `GeometryGraphAdvancedAtlas` and Play (no asset references required); optionally assign this Profile to UV Atlas Profile; or edit the asset on a persistent Geometry Graph Renderer. Pixel padding assumes a square texture of the declared resolution.
- **GeometryGraph/Profiles/UVTriangleUnwrapProfile.json** — opt-in per-triangle UV0 islands, each side/cap triangle duplicated into 3 independent vertices and optionally packed into [0,1] with 6% padding. Example Gallery has an automatic **GeometryGraphTriangleUV** Play mode; the file is only for a persistent Profile Asset A workflow. See `docs/GEOMETRY_GRAPH_PROFILE_TRIANGLE_UV_V2_VI.md`.
- **GeometryGraph/Profiles/UVWorldSpaceProfile.json** — optional authored Profile with `uv.uWorldSpace: true` and `uv.uMetersPerRepeat: 1.5`. Assign to Profile Asset A on `UVIslandExtrudeGraph.json`, toggle world/non-world U in Profile Editor, and change the output Node nonuniform scale. World mode derives U from physical edge lengths of the generated mesh after renderer Node scale; spline V already uses physical arc distance. Note: a Profile JsonAsset save is explicit and not tracked by Scene Undo.
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

Install Examples **skips existing files** except a byte-for-byte pristine legacy `ExampleGallery.ts`, which it upgrades in place and preserves the existing `.meta` UUID. User-edited Gallery scripts are always preserved. Consequently, a pre-existing ExampleGallery.ts will retain its older set of modes, even after installing this newer extension.

If the Gallery script is customized, merge the new enum mode and handler manually. **Deleting a script referenced by saved Scenes** can break component references; do not remove and recreate a Gallery script merely to upgrade it.

### Imported asset workflows (20-mode Gallery)

**Mesh Deformation**: Press Play in MeshDeform mode to see a procedural ribbon input mesh deformed along a curved spline. To test an imported rope/pipe model instead, create a SplineContainer and a Node with MeshRenderer + SplineMeshDeform, then attach `CocosSplinesMeshDeformExampleV2` and bind its three Inspector references. Enable **Allow Data Access** on the imported Mesh, and subdivide the mesh along its Z axis.

**Traffic Controller**: TrafficController mode creates an incoming route, two outgoing routes, two exclusive green phases (exit 1 and 2), yellow and all-red clearance. A follower must enable **Traffic Capacity** to obey traffic signals. For your own Junction, use `CocosSplinesTrafficSignalsExampleV2` with three ordered links and an assigned controller.

**Prefab Spawning**: The Gallery builds a transient runtime Prefab template and scatters up to 14 instances; it writes **no .prefab asset**. For actual asset selection, assign one or more .prefab files to `CocosSplinesPrefabSpawningExampleV2` and a SplineObjectController. The controller owns only the runtime-created instances and clears them on disable.

### Geometry Graph Path Processing (V2)

- `GeometryGraph/TransformPathGraph.json`: renderer-local XYZ translation/rotation and uniform path scale.
- `GeometryGraph/NoisePathGraph.json`: seeded Right/Up/Forward noise before Tube generation. Import the JSON or assign it as a shared graph asset on SplineGeometryGraphRenderer. Increase Samples Per Curve for higher frequency/octaves. Zero amplitudes preserve the input exactly; Fade Ends (0–0.5) applies only to open paths. Closed paths use periodic noise and a matching end ring. Noise rebuilds stable world-space basis vectors and sampled arc distance, but does not edit source Knots or guarantee self-intersection-free geometry.

- `GeometryGraph/PathProcessingGraph.json`: Reverse → Clip → Resample → Tube. Clip Start/End are normalized input sampled-arc coordinates (0–1; minimum gap 0.001); a partial closed loop becomes open, full [0,1] is unchanged. Resample Segments (3–1024) redistributes sampled frames at equal input-arc progress and recomputes output world chord length for UV/deform. Lower counts can cut corners; this is not exact Bezier re-fitting. Increase source Samples Per Curve for improved precision; degenerate interpolated frames fail safely.

- `GeometryGraph/ConformPathGraph.json`: assign explicit active same-Scene 3D Collider targets in the renderer's Conform Path targets group, then Rebuild Graph with Physics available. World -Y rays project the sampled centerline, not every profile vertex. Fail on missing hit keeps the previous mesh; Keep source sample preserves the unprojected point. Surface normal is a stable-frame up hint, not an exact vertex-normal constraint. Use manual Rebuild Graph after terrain/mesh edits with unchanged World bounds. Increase Samples Per Curve for terrain detail. Native Creator validation pending.

- `GeometryGraph/MultiSplineGraph.json`: assign Spline A (`spline`) and Spline B (`splineB`) in Geometry Graph Renderer. Select Output A/B or enable Render All Outputs for distinct material submeshes. Add Spline Output creates an independent source + generator + output branch using the next free A/B/C slot. Existing Output Branch continues sharing its input path. Each source is sampled in World space and transformed to the same output local space; only changed source slots resample. Missing referenced slots fail safely; unreferenced slots are ignored. No multi-input merging yet.

- `GeometryGraph/MergePathGraph.json`: assign Spline A and B with adjacent open endpoints. Merge Path joins A end to B start (or B reversed/nearest), welds endpoints within 1e-5 World units or inserts a straight connector within Max Gap, and rejects joins exceeding Max Angle. Use Clip for closed inputs and Resample if the combined count exceeds 1025 frames. Add Merge Path creates a free source slot or uses the currently selected distinct Path source. Removing the merge keeps A and prunes unused B dependencies. This is sampled concatenation, not Bezier filleting or spline asset modification.

- `GeometryGraph/MergeMeshGraph.json`: Ribbon + offset Tube on a shared spline → Merge Mesh → Output. Two generated Mesh inputs concatenate positions/normals/UVs unchanged, offset B indices and use one output material. No welding, Boolean operations or per-input material preservation. Use separate V2 outputs for different materials. Merge Mesh uses a manual/explicit output material even with imported material auto-binding enabled. Combined geometry must fit 65536 vertices and 393216 indices. Select an existing distinct mesh generator to use it as B, or Add Merge Mesh on an output with a single generator to create a second generator on its path. Remove Merge Mesh retains A and prunes unused dependencies.

Visual Graph Auto Layout: nodes are arranged left-to-right by dependency depth, with separate vertical rows for branches and merged inputs. Existing saved manual positions remain unchanged until Auto Layout is pressed; newly inserted nodes avoid saved cards. Find node scrolls to and selects any node, including in read-only shared graphs. Branch toolbar operations follow the selected node's reachable output; shared nodes prefer the default when reachable, otherwise the first output by ID. Select the output explicitly to choose a specific branch. Layout is separate from graph JSON and never triggers geometry recomputation.

- `GeometryGraph/ProfileKeysGraph.json`: assign `Profiles/KeySquareProfile.json` as Profile Asset A and `Profiles/KeyWideProfile.json` as B. Enable Profile Keys in Extrude node, then add/remove keys and choose normalized progress and asset slot. Keys select the latest slot at each existing sample (Step), not a smooth morph. Adjacent sample rings remain connected; increase Samples Per Curve for finer key timing. Use simple CCW polygons with matching vertex counts and corresponding point indices; custom UV, holes and extra contours are not supported for keys yet. Closed paths require matching first/last slots. Existing single-profile graphs are unchanged. All referenced assets are validated and revision-tracked even if a key is not reached by a sample.

- `GeometryGraph/ProfileMorphGraph.json`: assign KeySquareProfile A and KeyWideProfile B, choose Profile Interpolation (Step/Linear/Smoothstep). Smoothstep eases into/out of every key. Continuous modes insert a ring at missing interior keys and a midpoint when a changing interval lacks interior samples. These are interpolated sampled path frames, not exact Bézier evaluations. Increase source Samples Per Curve or use Resample for finer morphs; the 1025-frame cap includes inserted rings. Invalid sampled polygons fail atomically. Matching vertex indices and simple polygons are still required; this does not certify continuous nonintersection between rings or automatically match points. Existing Step graphs retain their original geometry sampling.

- `GeometryGraph/ContourMorphGraph.json`: assign `Profiles/ContourMorphA.json` and `Profiles/ContourMorphB.json` to slots A/B. Keyed extrusion supports compatible holes and disconnected solids (including their holes) in Step/Linear/Smoothstep modes. Match the number/order of solid parts, holes within each part, vertex count, winding and intended corresponding point indices. Each sampled section must remain a valid polygon domain; invalid intermediate sections fail without replacing the previous mesh. Every loop has its own normalized perimeter U; caps triangulate the actual first/last sections. Custom keyed UV metadata and automatic vertex correspondence are not supported in this slice. No guarantee against intersections between sampled rings; increase sampling for complex transitions.
