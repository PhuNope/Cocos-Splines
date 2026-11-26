# Cocos Splines

Cocos Splines is an Inspector-driven spline extension for **Cocos Creator >= 3.8.2**. It supports spline editing, runtime followers, junction routing and procedural geometry. All editing tools are available from the Inspector; no standalone spline panel is required.

## Installation

Place the extension at `<project>/extensions/cocos-splines`, enable it from the Extension Manager, and allow the Asset DB to import its TypeScript components.

## Included components

- **Core:** SplineContainer, SplineKnot, SplinePosition modes (Normalized Distance, Distance, Bezier t).
- **Movement & events:** SplineAnimate, SplineJunction, SplineTrigger, SplinePositioner, SplineProjector, SplineLengthMonitor.
- **Geometry:** SplineRoad, SplineExtrude, Spline2DPath, SplineMeshDeform, SplineJunctionMesh.
- **Distribution & deformation:** SplineInstantiate, SplineObjectController, SplineObjectBender, SplineMorph, SplineModifiers.

`SplineAnimate.splineOffset` is relative to the current spline frame. `junctionOffsetBlendDistance` (default 1 world unit) preserves world position at a Junction and eases toward the new spline's offset. Set it to `0` for immediate switching. `constantSpeedWithOffset` can be enabled to maintain near-constant world-space speed, including while blending.

### Shared Geometry Graph Assets — Phase 4.2b (v2 preview)

SplineGeometryGraphRenderer now supports **native Cocos Creator `JsonAsset`** via `Use Graph Asset` + `Graph Asset`. Multiple renderers may reference the same read-only JSON graph asset while retaining independent spline frames, mesh output, and their previous local `graphJson`. The graph's **content** participates in the rebuild revision, not only its UUID. The Inspector has **Export JSON**, **Import JSON → Local**, **Copy Asset to Local** and **Refresh Asset View**; asset mode is read-only in the canvas, so Visual Graph edits never silently mutate a shared file. Export uses exclusive non-overwriting writes, while Import validates the typed DAG before native serialized Scene commits, with rollback on failure. [Shared Graph Assets guide](docs/PROCEDURAL_GEOMETRY_GRAPH_ASSETS_V2_VI.md).

### Visual Geometry Graph Inspector — Phase 4.2a (v2 preview)

**SplineGeometryGraphRenderer** now includes a scrollable **Visual Geometry Graph** canvas in its existing Inspector: drag cards to arrange them, click typed `path`/`mesh` sockets to reconnect nodes, insert/remove Offset and Width transforms, and edit typed parameters. The canvas updates **graphJson** via Cocos 3.8's native `ui-prop` `change-dump`; node arrangement is persisted independently as **graphLayoutJson**, so moving cards never changes tessellation or invalidates cached spline frames. Graph edits are validated first (limits, ports, cycles, orphans); failed edits do not rewrite scene data. Still based on V1's **single Spline → optional transforms → Ribbon → Output** pipeline; shared graph assets and branching are future iterations. See [Visual Geometry Graph guide](docs/PROCEDURAL_VISUAL_GRAPH_V2_VI.md).

### Procedural Geometry Graph — Phase 4.1 (v2 preview)

**SplineGeometryGraphRenderer** adds a bounded, typed spline-to-mesh DAG on a dedicated MeshRenderer Node. The V1 JSON graph supports `spline` (stable path frames) → optional `offset` / `width` nodes → `ribbon` → `output`, with strict path/mesh ports, dependency ordering, cycle detection and per-node dirty propagation/cache. Ribbon geometry reuses **SplineRoadMath** tessellation, UV, normals and caps; graph execution does not modify Knot, Spline, Road or original Mesh assets. The Inspector provides a JSON editor and **Rebuild Graph** button; an optional Cocos-Gizmos v3 selected wireframe previews generated geometry. Invalid graph/rebuild failure keeps the prior owned mesh. This is **the typed foundation**, not a visual drag-and-drop node canvas yet. See [Geometry Graph V2 guide](docs/PROCEDURAL_GEOMETRY_GRAPH_V2_VI.md).

### Multi-key Width Curves — Phase 4.3g2b2b2b2c2b2c (v2 preview)

Geometry Graph Width nodes optionally support **2–16 keys** keyed by normalized physical arc distance. In Visual Graph, select a Width node and click **Enable Multi-key Width Curve** to convert an existing Start/Mid/End taper without changing its geometry. Insert/delete interior keys, edit numeric progress/scale, or drag the SVG handles; drag preview does not write Scene data until release, which requests one native Inspector property commit. Linear and Smoothstep interpolation are preserved; closed splines require matching end scales. Existing graphs without `widthKeys` are unchanged. [Vietnamese guide](docs/GEOMETRY_GRAPH_MULTI_KEY_WIDTH_V2_VI.md). Native Cocos Creator 3.8.8 Editor/Prefab/Undo acceptance remains pending.

### Profile UV Edge/Quad Islands — Phase 4.3g2b2b2b2c2b2d (v2 preview)

Authored Profile JsonAsset supports optional `uv.sideIslandMode` with **0 Continuous (legacy default)**, **1 Edge Islands** (UV U restarts per cross-section side without changing geometry) and **2 Quad Islands** (each side-span quad gets independent U/V vertices, preserving visual geometry/normals/caps). A draft-only **Side UV islands** dropdown in the authored Profile Inspector offers native profile draft Undo/Redo and explicit checksum-guarded Save; installed examples show both modes. Normalized U fills each island; metric Side U and Follow Frame Scale remain opt-in. Quad Islands use extra side vertices, limited to the same 65,536-vertex graph mesh budget. See [Profile UV Islands guide](docs/GEOMETRY_GRAPH_PROFILE_UV_ISLANDS_V2_VI.md); native Cocos Creator 3.8.8 acceptance remains pending.

### World-space Profile UV Density — Phase 4.3g2b2b2b2c2b2e (v2 preview)

Authored Profile JsonAssets can now opt in with `uv.uWorldSpace: true` plus `uv.uMetersPerRepeat` to compute **side UV U from real world-space profile edge lengths**, including output Node nonuniform scale/shear, spline taper and authored edge weights. Renderer provides its local→world linear matrix; path V already uses world arc distance and is deliberately never scaled twice. Works with continuous, Edge and Quad Islands; cap UV and source geometry stay unchanged. In **Authored Profile Editor**, select **World-space side U (Node scale)** in an unsaved draft and explicitly Save Profile JSON to commit. See [usage and limitations](docs/GEOMETRY_GRAPH_WORLD_UV_V2_VI.md). Native Cocos Creator 3.8.8 GPU/Prefab validation remains pending.

### Authored Profile UV0 Atlas Packing — Phase 4.3g2b2b2b2c2b2f (v2 preview)

Authored Profile JsonAsset v1 supports optional `uv.atlasPacking: true` with `uv.atlasPadding` (0–0.2, default 0.04). The deterministic Core grid packs **side + individual cap UV0 islands** into [0,1] with per-cell gutter and one uniform global scale, preserving topology/normals and avoiding overlap. Mode 0 packs the whole side perimeter, mode 1 packs each edge strip, mode 2 packs each spline-side quad. Existing profiles remain untouched by default. Edit via **Authored Profile Editor → Pack UV0 islands into atlas / Atlas padding** with draft Undo/Redo and explicit guarded Save. Examples include `UVAtlasProfile.json`; [Vietnamese atlas guide](docs/GEOMETRY_GRAPH_PROFILE_UV_ATLAS_V2_VI.md). Native 3.8.8 UV/PBR/Prefab testing pending; texture baking and per-triangle unwrap remain future work.

### Compact Inspector copy — v2

Component inspectors now show field controls and action/status UI without long embedded roadmap paragraphs. The 20 generated custom inspectors, Spline Container, Geometry Graph node/property editor and authored Profile editor were cleaned; runtime component tooltips are kept brief (up to 100 characters). Behavior and serialized properties are unchanged. See [Inspector copy cleanup](docs/INSPECTOR_COMPACT_COPY_V2_VI.md).

### Placement Statistics — exact Inspector reason counts (v2 preview)

SplineObjectController Inspector now includes an on-demand **Analyze Placement** button. It returns exact totals, accepted/rejected counts and the seven reason categories from the same non-mutating preview used by Respawn, plus up to three rejected candidate indexes for each category. The full plan (up to 2048 candidates) is counted even if Debug Gizmos draws only 8–256 markers. Analyze does not spawn, clear, mutate Scene objects or make an Undo snapshot; the Inspector displays an explicit **manual snapshot** that you can refresh after edits. See [Placement Statistics guide](docs/POPULATION_PLACEMENT_SUMMARY_V2_VI.md).

### Placement Debug Gizmos for Object Controllers (v2 preview)

An opt-in **Placement Debug Gizmos** group in SplineObjectController draws colored World-space candidate markers **when selected**, using the same non-destructive placement preflight as Respawn. Colors: green accepted, orange missing surface, red Collider, purple peer occupancy, grey exclusion, yellow density, blue World spacing. Preview records the **first** rejection reason, preserves seed/index and original Knot/Mesh/Prefab assets, and draws at most 256 reason-aware sampled markers. Draw estimated footprint spheres optionally. Cocos-Gizmos v3 is required; disabled by default. See [Placement Debug Gizmos guide](docs/POPULATION_DEBUG_GIZMOS_V2_VI.md).

### Shared Occupancy between multiple Object Controllers (v2 preview)

SplineObjectController → **Shared Occupancy · opt-in** filters final candidate centers against already spawned children of explicit peer Controller Nodes. Assign strictly increasing **Occupancy Priority** (e.g. first 0, second 1), spawn lower priority first, set conservative **Shared Occupancy Radius** on both controllers, and optional **Peer Occupancy Clearance**. No peer is ever respawned or modified. The new spatial hash keeps original candidate indexes and works after Save/Reopen using spawnedRoot children, but only captures World center + manually published sphere radius (not exact mesh overlap). Read-only peer validation happens before cleanup; disabled by default. See [Shared Occupancy guide](docs/POPULATION_SHARED_OCCUPANCY_V2_VI.md).

### Automatic static prefab footprint for placement (v2 preview)

SplineObjectController → **Auto Prefab Footprint** (requires Collider Avoidance + Precise Obstacle Shapes) derives an opt-in conservative sphere radius per selected prefab, from static MeshRenderer mesh bounds and supported Collider shapes across the prefab's nested Node hierarchy. Per-candidate radius accounts for prefab/parent scale, ScaleMultiplier, random scale and Modifiers. Missing/unsupported geometry fails preflight without deleting existing instances. Manual radius and legacy population remain unchanged when disabled. This is a static bounding sphere, not animated mesh geometry or multi-controller collision. See [Automatic Footprint guide](docs/POPULATION_AUTO_PREFAB_FOOTPRINT_V2_VI.md).

### MeshCollider triangle BVH population placement (v2 preview)

SplineObjectController now supports **Use Mesh Collider BVH** inside opt-in Precise Obstacle Shapes. It reuses the strict static World triangle BVH previously built for SplineAnimate, to evaluate sphere-footprint contact against readable non-convex 3D MeshColliders; convex/unreadable/unsupported geometry falls back conservatively to World AABB. BVHs are cached per Collider/mesh hash/pose. This checks double-sided triangle SURFACES, not enclosed-solid occupancy or the exact prefab shape. Disabled by default. See [Mesh BVH guide](docs/POPULATION_MESH_BVH_V2_VI.md).

### Precise OBB/Capsule obstacle placement (v2 preview)

SplineObjectController → **Collider obstacle avoidance** optionally enables **Use Precise Obstacle Shapes**. Valid BoxCollider OBB and CapsuleCollider world shapes are checked with a **manual spherical prefab footprint radius** + clearance; unsupported or mismatched Collider transforms conservatively fall back to the engine World AABB. Off by default; no changes to legacy population, Knot or source prefab. This is center-sphere placement clearance, not automatic prefab mesh collision or full Physics overlap. See [Precise Obstacle guide](docs/POPULATION_PRECISE_OBSTACLES_V2_VI.md).

### Surface / Terrain Conform for object population (v2 preview)

SplineObjectController now has optional **Surface / Terrain Conform** using Cocos Physics 3D downward raycasts against **explicit assigned Collider/TerrainCollider targets**. The nearest valid hit places a prefab center at the surface plus a normal offset, with an optional up-normal rotation while preserving projected spline forward. Missing hits can be dropped or left unprojected. Projection is performed before obstacle / World spacing filters, and preflight failures do not destroy previous objects. Disabled by default with no Physics queries. See [Surface Conform guide](docs/POPULATION_SURFACE_CONFORM_V2_VI.md). Native Creator 3.8.8 acceptance remains pending.

### Weighted Prefabs and explicit Collider avoidance (v2 preview)

SplineObjectController supports **Use Prefab Weights** with one nonnegative weight per prefab slot, and **Avoid Obstacle Colliders** (up to 64 explicitly assigned Collider worldBounds AABBs with World-unit clearance). Both are opt-in and preserve legacy seed/jitter/variant selection when disabled. Candidate positions are tested after Modifiers/Noise/Jitter and before Density/World Spacing; invalid bounds/weights fail preflight without clearing previous spawned objects. Collider avoidance is **conservative AABB center clearance**, not full mesh collision or terrain conform. See [setup and acceptance](docs/POPULATION_COLLIDERS_WEIGHTS_V2_VI.md).

### Advanced population density masks (v2 preview)

SplineObjectController → **Advanced Population · opt-in** lets you filter deterministic Count/Distance candidates by uniform **Density**, linear **Density Keys** over normalized arc progress, **Exclusion intervals** (closed-spline wrap supported), and **Min World Spacing** among final prefab centers after modifiers/noise/jitter. Candidate indexes remain unchanged, so filtering never reshuffles prefab variants or random offsets. Validation happens before clearing previously spawned instances; invalid rules do not delete the old population. **Disabled by default**, preserving existing scenes. This is center spacing, not collider collision avoidance. See [Advanced Population guide](docs/ADVANCED_POPULATION_V2_VI.md).

### Seeded Noise Layers for object population (v2 preview)

Add **Spline Noise Layers** from the Extensions menu or SplineContainer Inspector. The opt-in `SplineNoise` Component exposes up to 16 deterministic multi-octave layers (`frequency`, `octaves`, `persistence`, `phase`, `seed`, `amplitude`, `fadeEnds`). Output is a Right/Up/Forward displacement sampled at normalized spline progress; closed loops tile continuously at the seam. Assign `SplineNoise` to **SplineObjectController → Noise** to offset generated prefab instances. With the field empty, legacy population is identical. No Knot, Road or source Mesh geometry changes. See [Noise Layers guide](docs/NOISE_LAYERS_V2_VI.md). Native Creator 3.8.8 validation remains pending.

### Versioned spline JSON round-trip (v2 preview)

SplineContainer Inspector → **Cocos Splines JSON · Round-trip (V1)** exports exact **resolved** local Bézier controls and root local transform, plus dimension (3D/XY2D/XZ2D), Closed, Reversed, and Samples Per Curve. Import always creates a NEW sibling spline. The original spline/Prefab is not modified; previous Unity JSON import remains separate and unchanged. Converted Knots use **Broken** tangents (geometry remains the same, original tangent authoring modes/handle Nodes are not cloned). Only geometry and root local transform are included—no Road/Junction/Prefab/component references. Same-parent import preserves World placement; cross-parent import is local-relative. See [JSON guide](docs/JSON_INTEROP_V2_VI.md). Native Editor 3.8.8 Undo/Redo and prefab smoke tests still required.

### SVG path interoperability (v2 preview)

SplineContainer Inspector → **SVG Path · Import / Export (2D)** accepts one SVG `<path>` or plain `d` commands M/L/H/V/C/S/Q/T/Z (absolute or relative). SVG Y-down is converted to Cocos XY2D Y-up. Import generates a **new sibling spline** and never rewrites the source; choose Units per SVG pixel. Export reads the spline’s **resolved natural cubic controls**, producing local-space SVG text for XY2D or XZ2D; no file write is performed. SVG arcs (`A`), `transform`, multiple paths and other SVG shapes are rejected explicitly. Full native Creator 3.8.8 validation is pending. See `docs/SVG_INTEROP_V2_VI.md`.

## Documentation

Start at [`docs/index.html`](docs/index.html) for the multi-page guide, Inspector usage, API references and TypeScript examples.

## Compatibility notes

The extension declares a minimum editor version of `>=3.8.2`. Automated tests cover TypeScript and a mocked Cocos runtime; full Cocos Creator Editor validation, including older 3.8.x patch versions, has not been performed. Mesh bending currently targets readable static meshes; junction patches are planar XZ surface patches. Collider and Particle tools are not included.

Licensed under MIT.

### Mesh Gizmos and Morph coordinate space

Selected mesh generators (Road, Extrude, MeshDeform, JunctionMesh, ObjectBender) can show a bounded wireframe when Cocos-Gizmos is installed. `SplineMorph.space` now supports `World` (legacy default) and `Local` (source-local knot/control-point blending).


### Prefab spawners (0.9.5)
`SplineInstantiate` and `SplineObjectController` offer Inspector **Spawn**, **Respawn**, **Clear Spawned**, and **Spawn On Start**. A saved generated root skips automatic Play spawns. ObjectBender supports **KeepHierarchy** or **SequentialMeshes** with **Part Gap**. See `docs/pages/objects.html` and `docs/pages/bender.html`.

### Physically sized railway tiles (v0.9.6)

`SplineMeshDeform`: select **Repeat** → **Repeat Layout: Source Length** → **Tile Length: 0 (Auto)** → **UV Mode: KeepOriginal** for imported meshes with UV atlases. The last instance is geometrically cropped to fit a non-integer path length (interpolating UV0/normals); full instances keep their authored dimensions. Old Count mode is still supported and remains the serialized default. See `docs/pages/deform.html`.

### SplineModifiers Gizmos & examples

Select SplineModifiers with Cocos-Gizmos installed to preview cyan Offset trajectories, green Width multipliers, key markers colored by Speed, and optional Scale/Roll axes. The gizmo guides do not alter a mesh or move knots. See [`docs/pages/length-modifiers.html`](docs/pages/length-modifiers.html) for Inspector, API and worked examples (vehicle slowdowns, road widening, lane changes and object scaling).

### Road UV orientation (v0.9.8)

SplineRoad can map spline distance along **U** (horizontal road images) or **V** (vertical road images, legacy default). Set `uvDirection`, `uvMetersPerRepeat`, `uvWidthTiles`, optional reverse-axis toggles, and U/V offsets in the Inspector. Configure the texture sampler for Repeat wrapping on the longitudinal axis. No source image rotation needed. See `docs/pages/road.html`.

### Steep 3D spline geometry (v0.9.9)
Road, Extrude, MeshDeform and ObjectBender use continuous frames to avoid abrupt section flips near vertical tangents. Road warns when sharp bends can self-overlap; JunctionMesh remains a surface patch intended for approximately coplanar junctions. See `docs/pages/road.html`.

### Sharp road corners (v0.9.10)

`SplineRoad` → **Sharp Corners** → **Corner Mode = Join And Trim** joins outside edge offsets with miters and smoothly trims inner corners where road width exceeds bend radius. Existing scenes default to Legacy. Not a general 3D mesh Boolean union. See `docs/pages/road.html`.

### Junction Mesh Road-Matched UV (v0.9.12)

`SplineJunctionMesh` → **UV Mode = Road Matched** samples the actual asphalt edge vertices and UV0 coordinates from each connected `SplineRoad` and blends directions only near the junction center. Set **UV Blend Start = 0.55** and assign the **same shared Material** to all Road meshes and the junction; texture samplers must use **Repeat U/V**. Supports both longitudinal UV axes, reverse, offset, tiling and variable Road width. Legacy `World Projected` remains the default. The center still distorts painted lane markings; no mesh Boolean or automatic marking removal. See [`docs/pages/junction-mesh.html`](docs/pages/junction-mesh.html).

### Breaking API cleanup (Phase 1)

`SplineInstantiate.rebuild()` and `SplineObjectController.rebuild()` have been removed. Use `respawn()` to replace their generated instances or `spawn()` to preserve existing ones. Geometry components' canonical `rebuild()` functions are unchanged. See [migration notes](docs/LEGACY_MIGRATION_VI.md) and [Unity parity roadmap](docs/UNITY_PARITY_ROADMAP_VI.md).

### Cocos-Gizmos v3 dependency (development branch)

The spline core drawers import the upstream `registerGizmos` decorator via `db://cocos-gizmos/RegisterGizmos` (Cocos-Gizmos v3.0.3+ must be installed/enabled). Selected knots offer two interactive tangent Move handles and a rotation handle. See [integration notes](docs/GIZMOS_V3_INTEGRATION_VI.md); native Undo/Redo and Cocos Creator Editor 3.8.8 still require manual verification.

### Editor-only mesh and modifier drawers

Road/Extrude/MeshDeform/JunctionMesh/ObjectBender and Modifiers now use standalone Cocos-Gizmos v3 drawers. Geometry preview caches stay with their owning Components and are exposed via read-only methods; drawing is no longer implemented by runtime Components. Cocos Creator live smoke tests remain required.

### Phase 2.1 — Batch Knot Editor (development)

Mark knots in the SplineContainer Inspector and use **Select in Scene**, **Snap marked** or **Align marked**. Snap uses container-local grid units and respects 2D dimensions. See [Vietnamese editor guide](docs/SPLINE_EDITOR_PHASE2_VI.md). Node CI covers math, batch snapshots, validation and rollback; native Cocos Creator Editor Undo/Redo must still be tested.

### V2 test builds (not releases)

Active development branch: [`v2`](https://github.com/PhuNope/Cocos-Splines/tree/v2). Every successful push to `v2` runs validation and publishes a downloadable ZIP under [GitHub Actions artifacts](https://github.com/PhuNope/Cocos-Splines/actions/workflows/ci-release.yml). The artifact is named `cocos-splines-v2-<full commit SHA>`, and contains the installable `cocos-splines-v2-<short SHA>.zip`.

To test, open the latest successful **v2** workflow run, download its Artifact, unzip that GitHub artifact, then extract the nested extension ZIP into `<your-project>/extensions/` to obtain `extensions/cocos-splines/package.json`. Enable `Cocos-Gizmos v3.0.3+` first, then enable Cocos-Splines in Extension Manager.

To build locally after `npm run build`, run `npm run package:preview`. The preview packager does **not** create Git tags or GitHub Releases. **No release/tag is authorized until explicitly approved by the owner.** Preview outputs are identified by commit SHA; `package.json` version remains unchanged until release authorization.

Automated validation does not replace testing inside Cocos Creator 3.8.x, especially Gizmos interactions, native Undo/Redo and prefab serialization.

### V2 Phase 2.2a — World knot positioning (preview)

Batch Knot Tools now offers **Local / World** for 3D curves with correctly transformed nested rotation/nonuniform scale, plus **Move marked** by numeric Delta X/Y/Z. XY2D/XZ2D remain constrained to local editing to avoid invalid off-plane placements. See [editing guide](docs/SPLINE_EDITOR_PHASE2_VI.md). This is not yet interactive multi-knot dragging and does not certify native Editor Undo/Redo.

### V2 Phase 2.2b — Interactive group move preview

Select multiple 3D Knot nodes belonging to one SplineContainer in the **Batch Knot Tools → Select in Scene** action. A single group Move Gizmo appears at the first selected Knot's world position: drag to translate the selected knots without moving unrelated knots. Escape restores the group. On release, a Scene snapshot is requested. Creator 3.8.8's actual native Undo/Redo, mouse picking and prefab behavior remain to be manually verified; see [Vietnamese editor guide](docs/SPLINE_EDITOR_PHASE2_VI.md).

### V2 Phase 2.3 — Mesh Surface Snap (preview)

In SplineContainer Inspector → Batch Knot Tools, mark 3D Knots, click **Refresh meshes**, select a readable MeshRenderer outside the spline and **Snap to Surface**. A CPU World-Y raycast lands knots on the triangle mesh without Physics Collider. Requires imported mesh **Allow Data Access**, single submesh and RGB32F position attributes; max 20,000 triangles and 64 knots. Missing ray hits abort the entire batch. See [guide](docs/SPLINE_EDITOR_PHASE2_VI.md). Live Creator Editor Undo/Redo, asset import variations and prefab overrides still need testing.

### V2 Phase 2.4 — Surface normal alignment (preview)

Surface Snap now optionally aligns the selected Knots' **local +Y** axis with the upward mesh surface normal while attempting to preserve their existing world forward heading. The checkbox is **off by default**, and position-only snapping remains unchanged. Rotation changes may affect knot-local tangent curves; see [Vietnamese editor guide](docs/SPLINE_EDITOR_PHASE2_VI.md). Requires real Cocos Editor testing for native Undo/Redo and Prefab overrides.

### V2 Phase 2.5 — Smooth surface normal alignment (preview)

Surface Snap now offers **Smooth normals on shared mesh vertices**, enabled only when **Align Knot +Y** is on. The default is **off**, with an optional crease-angle threshold (0–89°, default 60°). It reduces Knot rotation discontinuities between neighboring triangles that share vertex indices; split UV/hard-edge vertices remain sharp. The smoothing never alters hit positions. See [Vietnamese editor guide](docs/SPLINE_EDITOR_PHASE2_VI.md). Native Creator Editor smoke tests still required.

### V2 Phase 2.6 — Collider/Terrain Surface Snap (preview)

Surface Snap can now target an explicit **(mesh)** MeshRenderer or **(collider)** 3D Physics Collider (including TerrainCollider, when supported by the selected Physics backend). Collider raycasts use Cocos Creator's PhysicsSystem, filter hits to only the selected target, and do not require mesh Allow Data Access. Smooth normals remain mesh-only; position and optional hitNormal rotation use the existing atomic batch workflow. See [Phase 2 editor guide](docs/SPLINE_EDITOR_PHASE2_VI.md). Test in an actual Creator 3.8.8 Scene before using for production terrain. `list-surface-meshes` was renamed to `list-surface-targets` in the developing `v2` branch.

### V2 Phase 2.7 — Verified batch editing (preview)

All Inspector batch Knot operations use an isolated transaction coordinator: read Scene transform state before editing to avoid overwriting stale data, apply edits via official Scene property messages, read back results, then request one native Scene snapshot. Failed writes, mismatched read-back and rejected snapshots trigger best-effort reverse rollback. Unit tests cover these paths; **Creator Editor native Undo/Redo is not certified until verified in a real 3.8.8 scene**. See [test checklist](docs/SPLINE_EDITOR_PHASE2_VI.md).

### V2 Phase 2.8 — Shared Gizmo transaction lifecycle (preview)

Knot tangent Move, Knot Rotate and 3D multi-Knot Group Move now share `SplineGizmoEditTransaction` for baseline capture, cancel restoration, no-op detection, one requested Scene snapshot on completed edits, and guarded rollback when a snapshot request fails. This uses the existing official Gizmos v3 `begin/update/end/cancel` lifecycle rather than an extra legacy handle system. **Automated tests do not certify native Editor Undo/Redo or prefab overrides**; test in a real Creator 3.8.8 Scene before production use.

### V2 Phase 2.9 — Gizmo invalidation safety (preview)

Knot Group Move, Tangent and Rotate transactions now cancel when Scene context changes while dragging (selection, reparent, deleted Knot, disabled component, changed group membership). Surviving group members in the original spline are restored; reparented objects are not overwritten. Guarded async failures do not revert newer changes. No polling or legacy Editor API is introduced. Validate native Undo/Redo and Prefab overrides in Creator 3.8.8 before using in production; see [editor checklist](docs/SPLINE_EDITOR_PHASE2_VI.md).

### V2 Phase 2.10 — Multi-Knot Group Move in 2D (preview)

The Editor Group Move handle now works for multi-selected Knots on **XY2D** (X/Y/XY handles) and **XZ2D** (X/Z/XZ handles), alongside the existing 3D Group Move. Dragging is converted to SplineContainer-local coordinates, so the hidden 2D axis and every Knot's relative offset are preserved, including under rotated or non-uniformly scaled Containers. Cancel restores the group; valid End requests one Scene snapshot. Note: with a heavily tilted Container, World-axis handle visuals can differ from the actual projected local-plane motion. [Editor test guide](docs/SPLINE_EDITOR_PHASE2_VI.md). Native Undo/Redo is not certified without Creator testing.

### V2 Phase 2.11 — Container-local Group Move handles

XY2D and XZ2D multi-Knot Group Move now uses the **SplineContainer local coordinate frame** for the rendered arrows, drag planes, picking and position changes, including rotated and nonuniformly scaled Containers. This requires the **matching Cocos-Gizmos v3 development preview** with `Gizmos3D.supportsMoveFrameNode`; the original v3.0.3 stable ZIP does not include this feature. Install/update **Gizmos first**, then the Cocos Splines `v2` preview. Older Gizmos builds hide only the unsupported 2D Group Move, rather than showing incorrect World axes. 3D Group Move and individual Tangent/Rotate tools remain available. See [Vietnamese test checklist](docs/SPLINE_EDITOR_PHASE2_VI.md).

### V2 Phase 2.12 — One history owner for multi-Knot Group Move (preview)

Multi-Knot 3D/XY2D/XZ2D Group Move no longer relies on native SelectGizmo history for a computed group property. The matching **Cocos-Gizmos v3 development preview** exposes `supportsExternalHistory` and `history:'external'`; Splines writes each affected **serialized Node.position** through the official Scene Editor set-property message with `record:false`, then requests a **single** Scene snapshot after all writes succeed. Prevalidation, partial-write rollback, no-op and stale-context protections are covered by automated tests. This is intended to preserve Prefab Instance overrides, but native 3.8.8 Editor Undo/Redo and Prefab apply/revert still require manual validation. See [Vietnamese acceptance checklist](docs/SPLINE_EDITOR_PHASE2_VI.md). Install Gizmos first, then Splines.

### V2 Phase 2.13 — Serialized Knot Tangents and Rotation (preview)

Individual Knot Tangent Move and Rotate Gizmos now share the same **external-history ownership** as multi-Knot Group Move. The Editor writes the real `SplineKnot.mode`, `tangentIn/out`, tangent handle Node positions, or `Node.rotation` (local quaternion) via official `scene:set-property` messages with `record:false`, followed by one snapshot after a completed change. Cancel and failed commits restore previous data. Install the matching Cocos-Gizmos v3 preview (supportsExternalHistory) first. Native Undo grouping and Prefab Instance overrides must still be verified in Creator 3.8.8. See [Vietnamese Phase 2 guide](docs/SPLINE_EDITOR_PHASE2_VI.md).

### V2 Phase 2.14 — Serialized Gizmo history gate (preview)

Knot Group Move / Tangent / Rotate now share an Editor-only per-SplineContainer history gate: another Knot drawer in the **same spline** cannot begin a drag while a previous `scene:set-property`/snapshot/rollback is pending. A different SplineContainer is unaffected. Cancel and no-op release immediately; async rejected snapshots release only after rollback. When a transaction settles, the original SplineContainer's revision cache is invalidated; Road/Extrude/MeshDeform's existing update-time revision signatures can then rebuild from the actual Knot state (including native Undo/Redo). See [Vietnamese test guide](docs/SPLINE_EDITOR_PHASE2_VI.md). Requires the matching Cocos-Gizmos v3 preview with `supportsExternalHistory`. Native Undo/Redo and Prefab overrides remain unverified in a real Creator 3.8.8 Editor.

### V2 Phase 2.15 — Scene Lease for stale Editor IPC

The Knot Gizmos history pipeline now captures an immutable hierarchy **Scene Lease** at drag begin. If the Scene is unloaded, a nested Prefab editor root is replaced or an ancestor is reparented, pending Group/Tangent/Rotate serialization checks the lease before and after each Editor IPC operation and refuses further property writes, snapshot or cross-Scene rollback. An already submitted IPC request cannot be revoked; this prevents **subsequent** wrong-Scene requests. Regression tests cover delayed `query-node`, `set-property`, snapshot, active drag cancellation and same-UUID root replacement. Requires the existing matching Cocos-Gizmos v3 preview; no Gizmos upgrade is needed for this phase. [Creator acceptance instructions](docs/SPLINE_EDITOR_PHASE2_VI.md).

### V2 Phase 2.19 — Resample Spline (create new copy)

Open **SplineContainer Inspector → Resample Spline · new copy**. Choose `Knot count` or `Max spacing`, a Local/World arc metric and a maximum *sample-estimated* geometry deviation. The tool fits Broken-mode cubic Bezier tangents to the original curve sampled at even arc distances and creates a **new sibling SplineContainer**, leaving all source Knots and Prefab instances unchanged. It refuses a plan whose sampled deviation exceeds the tolerance. Supports open/closed 3D/XY2D/XZ2D and non-uniformly scaled Containers; the source root's local transform is copied. Individual Knot rotation/child handles/attached generators are not copied; this is a geometry resample, not a full prefab clone. Native Editor Undo/Redo remains to be validated in Creator 3.8.8. See [Vietnamese editor guide](docs/SPLINE_EDITOR_PHASE2_VI.md).
