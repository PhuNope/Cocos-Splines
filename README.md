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
