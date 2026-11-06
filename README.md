
## v0.9.0 — Dreamteck-inspired extension tools (dev)

Added **SplineModifiers**, **SplineObjectController**, **SplineObjectBender**, **SplineMorph**, and **SplineJunctionMesh** (XZ surface patch). Modifiers can drive Animate speed/offset/roll, Road width and Object Controller scale/offset. All controls are in Inspector; no spline panel.

Detailed Vietnamese instructions: [docs/Dreamteck_Advanced_v090_VI.md](docs/Dreamteck_Advanced_v090_VI.md). Git workflow (dev → manual main merge → CI release): [docs/GITHUB_WORKFLOW_VI.md](docs/GITHUB_WORKFLOW_VI.md).

**Limitations:** Junction Mesh is a non-watertight top patch; ObjectBender supports only readable static mesh renderers; Morph requires a separate output curve. Collider and Particle tools are intentionally deferred. Live Cocos Creator 3.8.8 Editor validation remains necessary.

# Cocos Splines v0.8.0 — Dreamteck-inspired spline tools

New runtime components: `SplinePositioner`, `SplineProjector`, `SplineLengthMonitor`. The `SplineContainer.projectWorld(worldPoint, samples?)` API performs world-space nearest-point projection; the `SplineAnimate.splineOffset` property places followers relative to the spline frame. Runtime classes are read-only asset-db mounted and their Inspector controls are built into Cocos's Inspector (no separate editor panel).

See `docs/Dreamteck_Features_VI.md` for detailed configuration, behavior and limitations. This implementation is independent TypeScript inspired by Dreamteck features; it does not ship Dreamteck code. Existing runtime component script UUIDs are retained for upgrade compatibility.

### v0.7.3 MeshDeform face orientation fix

With an imported mesh whose long axis is X or Y, the existing deformation axis mapping reverses orientation (negative determinant). MeshDeform now reverses triangle winding for these axes before recomputing normals. Axis Z is unchanged. `Flip Faces` in the component Inspector explicitly toggles the final winding for source meshes with unusual face orientation. The geometry, UVs, and existing UUIDs remain unchanged. For a capsule oriented on Y use Axis=Y and leave Flip Faces off; click Rebuild Mesh. Confirm in Cocos Creator 3.8.8 Editor for your imported asset.

## v0.7.2 — Fix imported Mesh format detection in Cocos 3.8.8

`Mesh.readAttributeFormat()` returns a `FormatInfo` **object** (not a numeric `gfx.Format` enum). v0.7.1 compared object against numeric enum constants, so readable POSITION assets falsely failed with `UNSUPPORTED`. MeshDeform now resolves `.name`, accepts legacy numeric formats, and falls back to the primitive's actual `vertexBundelIndices` descriptor. No runtime UUIDs or serialized component fields were changed.

If Source Mesh still fails, enable **Allow Data Access** and reimport; truly unsupported compressed/normalized formats now report their actual names instead of the misleading generic `UNSUPPORTED`. See `README_VI.md`.

# Cocos Splines v0.7.0 — Cocos Creator 3.8.8

## v0.7.0 — Knots, 2D gizmos, MeshDeform formats

- On `SplineKnot`, click **Create Tangent Handles** then use **Edit Tangent Handles** in Inspector to turn persistent tangent editing on/off. **On** draws the curve/tangents regardless of Container `showGizmos`/`showGizmosAlways`/`showTangentGizmos`; **Off** only stops the permanent drawing; selecting Knot still draws both tangent arms. The actual handle Node positions are never changed by this toggle.
- **Edit Tangent In / Edit Tangent Out** buttons single-select the target child Node and automatically enable editing. Use Move (`W`) to drag; select the Knot again to switch off editing.
- Selected knots in **XY2D** draw tangent lines/points via Gizmos2D with a Gizmos3D fallback. Cocos-Gizmos 2.0.3+ remains an optional extension; there is no built-in interactive primitive editor.
- `SplineMeshDeform` supports imported **RGB32F/RGB16F/RGB16I/RGB16UI** source POSITION attributes, and **RG32F/RG16F/RG16I/RG16UI** UV0 (optional). Ensure import **Allow Data Access** is enabled. Only one non-skinned submesh is currently supported.
- Existing 15 v0.6.0 runtime TypeScript asset UUIDs remain unchanged. Test against live Cocos Creator 3.8.8 before production use.

## v0.6.0 — Position modes

`SplineTrigger`, `SplineJunctionLink`, `SplineAnimate` start/preview, and Start/End ranges for `SplineRoad`, `SplineExtrude`, `SplineInstantiate`, `SplineMeshDeform` support **Normalized Distance** (default / legacy), **Distance** (spline-local units) and **Spline T** (cubic parameter). See [`docs/Junction_Position_VI.md`](docs/Junction_Position_VI.md) for the complete **Junction** tutorial, event callbacks and API examples. Existing script UUIDs are preserved.


A Unity Splines–inspired **Cocos Creator project extension** with inline Inspector editing. Built from the v0.2.0 plugin without changing the six existing runtime script UUIDs, while adding new scripts with unique UUIDs. Does not include or redistribute Unity source code.

## Installation / upgrade

1. Back up the Cocos project, especially its scenes and prefabs, and close Cocos Creator.
2. Remove the **old** `<project>/extensions/cocos-splines` folder (do not keep two copies).
3. Unzip `cocos-splines-0.7.0.zip` into `<project>/extensions/` so that the manifest is at `<project>/extensions/cocos-splines/package.json`.
4. Open Cocos Creator 3.8.8, enable/reload `cocos-splines` from Extension Manager → Project and allow it to reimport scripts.
5. Test your existing splines, **save and reopen** a scene/prefab, and test the browser/native Preview.

## Editor workflow

- **Extensions → Cocos Splines → Create Spline** creates a container, extrude renderer and four editable knot child nodes.
- **Extensions → Cocos Splines → Create Road Spline** creates a spline with a separate Road child. The same function is available as **Add Road** in the SplineContainer Inspector for existing paths. No code is needed to model the roadway.
- **Add Trigger** creates an event marker; **Add Junction** creates a cross-spline connection manager. Both are editable in Inspector.
- Select the container in Hierarchy, then edit **all knots in the Cocos Inspector**; there is no standalone editing panel.
- Use **Select** to select **only** the target knot; click the **W** move gizmo in the Scene view to move the knot.
- **Split after** inserts a knot at the midpoint of the next cubic segment using the De Casteljau algorithm, preserving the existing curve. In AutoSmooth/Linear/Mirrored/Continuous modes it converts affected knots to Broken, which is necessary to preserve the curve.
- **↑ / ↓** reorders knots; **Reverse direction** changes playback direction without changing knot order.
- **Split** currently does not support endpoints that use referenced tangent handle Nodes. Remove those references first.
- Use **Refresh mesh** if the mesh preview does not update automatically.
- **Import Unity Splines JSON** is inside the container Inspector (creates a sibling spline). `docs/UnitySplineJsonExporter.cs` provides a Unity editor exporter for the first spline.

## Components

| Component | Highlights |
|---|---|
| `SplineContainer` | 3D cubic Bezier, AutoSmooth / Linear / Mirrored / Continuous / Broken, closed/reversed, arc-length, tangent/up/rotation, nearest position, split editing tools. |
| `SplineKnot` | Knot as a direct child Node; optional tangent handle Nodes and per-knot `editTangentHandles`; `tangentsInKnotSpace` optional (true for imported Unity knots, false for v0.2 compatibility). |
| `SplineAnimate` | Time/Speed, Once/Loop/PingPong, 5 easing modes, axis alignment (`forwardAxis`, `upMode`), rotation/world offsets, editor scrub preview and restore. |
| `SplineExtrude` | Tube mesh with end caps, UV, partial normalized distance range, start/end radius taper, flip normals, material override, shared-material API. |
| `SplineInstantiate` | Runtime prefab distribution by count or fixed distance, partial range, closed-loop endpoint handling, deterministic seeded offsets, rotation/scale offsets. |
| `SplineRoad` | **Road surface, not tube**: width/end width, shoulders, curbs, depth, watertight ends, texture UV along distance, bank with knot roll. Live Editor rebuild. Own MeshRenderer, not shared with SplineExtrude. |
| `SplineTrigger` | Event marker at normalized arc length, Forward/Backward/Both, work once/per follower, Cocos EventHandler + `spline-trigger` Node event. |
| `SplineJunction` | Connect SplineContainers at chosen progress positions. Follower routing: Off / FirstOther / RoundRobin / Manual; On Reach & On Switch callbacks. |

## Known limitations

- Still **not a full Unity Splines / Dreamteck port**: one spline per container, no automatic intersection welding, per-knot width/road painted lane lines, editable arbitrary mesh profile, GPU/jobs acceleration, full interactive tangent handle overlay, collider generation, automatic scene-level prefab preview, or all animation variants. Junctions connect follower routes, **not** road geometry.
- Road and Extrude meshes are generated in Editor/runtime, and are **not saved** as imported `.mesh` assets. Road does not generate colliders or navmesh. Runtime prefab instances are not baked into editor scenes.
- `SplineAnimate.method=Speed` uses **container-local spline length** and does not compensate for arbitrary nonuniform world scale.
- Imported Unity knot rotations are applied to Cocos Euler angles; test handedness and orientation visually if the scene uses rotations or flips.
- Changing structural knot operations uses a Cocos scene snapshot. Keep a project backup and check Undo/Redo plus prefab editing on your particular 3.8.8 installation.
- TypeScript and editor tests run with mocked engine/editor APIs; **not live-tested** in the actual Cocos Creator 3.8.8 Editor or all native targets.

See [README_VI.md](README_VI.md) for road creation steps, trigger/junction setup and Vietnamese upgrade notes. The Dreamteck ZIP is used as a design reference only; no third-party sources are embedded.

## Source build

```bash
npm run build
npm run check:runtime
npm test
npm run verify
npm run package
```

The extension follows the runtime `contributions.asset-db.mount` and editor `dist` structure of [cocos-flexalon](https://github.com/PhuNope/cocos-flexalon). Runtime imports from project scripts are available under `db://cocos-splines/splines/...` once Cocos has indexed the mounted assets.


## v0.5.0 — 2D, optional Gizmos and imported mesh deformation

- **Gizmos:** Optional [Cocos-Gizmos](https://github.com/PhuNope/Cocos-Gizmos) integration via `onDrawGizmos[Selected]`. `SplineContainer` shows curve/knots/tangents; selected Trigger/Junction show markers. No gizmo runtime bundled. Select a knot and use **Create Tangent Handles** to create real movable child Nodes (stock W gizmo).
- **2D:** `SplineContainer.dimension` (`Space3D` default, `XY2D`, `XZ2D`), `Spline2DPath` for Canvas/RenderRoot2D `Graphics`, `SplineAnimate.orient2D` for sprite rotation. Menu **Create 2D Spline**.
- **Mesh deformation:** `SplineMeshDeform` bends readable imported one-submesh Mesh along the curve, optionally repeating the mesh. Properties support source axis, range, cross-section scales, UV original/continuous/distance. Requires mesh `Allow Data Access`. Rope texture material is user-owned; example shader is a **separate download**, never mounted in the spline extension.
- **Compatibility:** all runtime component UUIDs from v0.4.0 retained. New components have pinned UUID metadata. Existing closed/reversed/spline data defaults unchanged.

Install: replace `<Project>/extensions/cocos-splines` with the folder in the release ZIP. See `README_VI.md` for step-by-step guidance.

Tests cover offline math and Editor mocks, not a live Cocos Creator 3.8.8 project or shader compiler.
