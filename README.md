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
