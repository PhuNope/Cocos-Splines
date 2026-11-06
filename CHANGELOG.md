## 0.9.6 — Physical-size mesh repeat and atlas-safe UV
- SplineMeshDeform Repeat Layout adds SourceLength: derives tile count from source mesh longitudinal bounds, optional Tile Length override in world units, clips the final tile instead of stretching all tiles.
- Partial source triangles interpolate authored UV0 and smooth normals, preserve UV islands under KeepOriginal; generated PBR tangents are recomputed.
- Count mode remains the default to preserve existing serialized scenes and has unchanged behavior.
- Improved world-length sampling accuracy for curved source splines.
- Updated Inspector and HTML manual with FBX railway guidance, and added non-integer fit/UV atlas regression tests.

## 0.9.5
- Added Inspector Spawn/Respawn/Clear Spawned for SplineInstantiate and SplineObjectController, with serialized generated-root ownership and spawnOnStart duplicate prevention.
- Preserved the legacy rebuild() API as an alias for respawn(). Manual instances are not destroyed on Play/disable.
- Added ObjectBender layout modes KeepHierarchy (default) and SequentialMeshes with Part Gap to arrange coincident mesh parts.
- Expanded HTML docs for spawner lifecycle and overlapping MeshRenderers.

## 0.9.4 — Mesh Gizmos and Morph Space

- Optional selected wireframe gizmos for SplineRoad, SplineExtrude, SplineMeshDeform, SplineJunctionMesh, and SplineObjectBender. Bounded edge sampling and no new renderer/material instances.
- SplineMorph.space = World (default, compatible) / Local (source-local control points, independent of source Node world transforms).
- Updated Inspector, HTML docs and regression tests.
- Junction Offset Blend Distance accepts values above 1 (world distance along destination), with a warning in docs for short destination spans.

## 0.9.3
- Sửa Inspector của SplineAnimate: hiện `Junction Offset Blend Distance` đã có trong runtime.
- Bổ sung `SplineUpMode.TargetLocal` và `upReference` tùy chọn để điều khiển hướng Up theo local object hoặc Node tham chiếu.
- Mở rộng tài liệu HTML: ý nghĩa Junction Preserve/Forward/Backward, Morph world-space position/shape, Up Mode Target Local.
- Giữ tương thích khai báo Cocos Creator >= 3.8.2 và giữ UUID script.

# Changelog

## 0.9.2

- Smooth `SplineAnimate.splineOffset` when changing splines at a Junction. `junctionOffsetBlendDistance` controls transition length (default 1 unit; 0 for immediate change). Blended path participates in world-distance constant-speed sampling when enabled.
- Keep manual `setCurrentSpline()` and explicit `seek()` immediate; preserve JunctionMode Off behavior and backwards routing.
- Simplify the multi-page HTML docs: remove Git / release workflow, offline/Internet wording and version-specific fix history. Document the Junction offset blend.
- Declare Cocos Creator Editor compatibility `>=3.8.2` in the extension manifest; automated tests do not guarantee live compatibility on every older editor version.
- Add Junction offset regression tests for both travel directions and disabled smoothing.

# v0.9.1 — Offset travel speed, Morph Preview and HTML documentation

- **SplineAnimate:** Added `constantSpeedWithOffset` (defaults `true`). With nonzero Spline Offset or keyed Modifier Offset, a cached world-space arc-length lookup maps eased elapsed time to the actual follower trajectory. Linear Easing now keeps approximately constant physical speed on bends; Speed mode measures units/second on the offset path, Time mode still takes the requested duration.
- Trigger and Junction markers remain at normalized *centerline* arc positions. `seekDistance`, `seekAtT` and `setCurrentSpline` map back to the correct centerline progress while compensation is active. Disabling compensation preserves the old centerline-speed behavior.
- **SplineMorph:** After Restore while Preview In Editor remains ON, changes to Blend or source reactivate preview; no further change leaves the output restored, without the old permanent lock.
- **Documentation:** 20-page Vietnamese offline HTML documentation set at `docs/index.html`, with individual pages for every major system, API reference, TypeScript examples, troubleshooting and Git workflow.
- New runtime regression tests for real offset world-space step uniformity (Speed and Time), reverse mapping, and Morph Restore -> Blend -> Preview off.
- Unchanged UUIDs for existing runtime scripts; no main branch release is triggered from dev.

---

# v0.9.0 — Advanced spline tools (dev)

- Added keyed SplineModifiers (offset, scale, speed, width, roll) with deterministic interpolation.
- Added multi-prefab SplineObjectController with Count/Distance distribution and deterministic jitter.
- Added SplineObjectBender for CPU deformation of readable static mesh renderers under one model hierarchy, with reversible Editor preview.
- Added SplineMorph to blend separate source splines into an output SplineContainer, restoring originals after preview.
- Added SplineJunctionMesh for non-watertight planar XZ road-junction fill geometry.
- Connected modifier speed/offset/roll to SplineAnimate, modifier width to SplineRoad.
- Added Inspector sections and menu actions without standalone panels.
- Added geometry/mock regression tests. Legacy UUIDs unchanged. Collider/Particle deferred.

## 0.8.0 — Dreamteck-inspired spline utilities

- New `SplinePositioner`: place at normalized arc progress, absolute spline-local distance or geometric t; follow another Node's nearest position on the spline with longitudinal offset; explicit Editor preview/restore.
- New `SplineProjector`: stable world-space closest-point query under nonuniform scale, optional marker snap, radius enter/exit events, opt-in continuous On Project events, selected gizmo.
- New `SplineLengthMonitor`: threshold crossing/growing/shrinking events in gameplay; length inspection in Editor.
- New `SplineAnimate.splineOffset` (X right / Y up / Z forward) without changing existing `worldOffset` or serialized data.
- Inspector-only editor integration: new buttons in Container, custom inspectors, optional Cocos-Gizmos markers, no standalone panel.
- Source package and regression tests for 0.8 features; 16 prior runtime script UUIDs preserved; no live Creator validation yet.

## 0.7.5 — Shared Material binding and live Inspector synchronization

- All mesh-producing components (`SplineRoad`, `SplineExtrude`, `SplineMeshDeform`) explicitly use `renderer.setSharedMaterial(asset, 0)` rather than the deprecated alias. No implicit MaterialInstance is created by the spline runtime for user-assigned `.mtl` assets.
- Synchronize the material reference independently of geometry rebuild, even when `rebuildOnChange` is disabled; recognize replaced Material objects with the same UUID.
- Clearing the component's previously assigned material now releases that renderer binding; preserve a material assigned directly to MeshRenderer when the component's material field is empty.
- Keep default fallbacks unique to each component, and avoid rewriting the road fallback color every frame. Clean up fallback references on destruction.
- Geometry signatures no longer include custom Material asset UUID: changing only the Material does not rebuild GPU meshes.
- Mock regression tests cover two spline nodes referencing the exact same Material, updates, reassignment and clearing. Runtime TypeScript UUIDs unchanged; no scene migration required. Actual Cocos Editor reimport behavior still requires live testing.

## 0.7.4 — MeshDeform builtin-standard lighting / normal-map fix (Cocos 3.8.8)

- **Smooth imported normals:** where a readable source mesh has supported NORMAL attributes, retain its authored smoothing while bending and transforming into the spline frame. Avoid faceted/inconsistent lighting from averaging face normals at UV seams. Fall back to recomputing normals for unsupported/missing source formats.
- **Generate `vec4` tangents:** derive tangent vectors and handedness from FINAL deformed positions + UVs, including UV Distance mode, for tangent-space normal maps on `builtin-standard`. Degenerate cap UVs get finite perpendicular fallback.
- **Flip Faces:** still flips both winding and normals; it never changes the Material asset. For Axis Y, normally keep Flip Faces OFF since parity correction already applies.
- Maintain all runtime script UUIDs and scene serialization from 0.7.3; add geometry regression for normals, tangents, UV, Stretch/Repeat and Face Flip.
- Verified offline TypeScript/tests; actual Cocos Creator 3.8.8 screenshot rendering must be validated in the user's project.

## 0.7.3 — MeshDeform front-face / inward normal fix (Cocos 3.8.8)

- Fix `SplineMeshDeform` for **Axis X** and **Axis Y**: the source-to-spline basis has negative determinant for both axes, so copying triangle indices made triangles face inward/backwards after deform. Flip each triangle's winding automatically on X/Y **before** generating vertex normals; Axis Z remains unchanged.
- Add serialized `Flip Faces` override in MeshDeform Inspector for meshes whose source winding differs from the standard. This flips indices and resulting normals together, not just lighting normals.
- Applies to Stretch, Repeat and segmented meshes; keeps the source mesh, existing vertex positions, UV coordinates, and UUIDs unchanged. Existing scene/prefab components automatically receive default `flipFaces = false`.
- Add winding regression tests for all three axes, Repeat, and manual inversion. Verified with TypeScript/mock tests; test in actual Cocos Creator 3.8.8 Editor and device builds before production.

## 0.7.2 — Cocos 3.8.8 MeshDeform FormatInfo hotfix

- Fix **false `Source POSITION format UNSUPPORTED`**: Cocos 3.8.8 `Mesh.readAttributeFormat()` returns a `gfx.FormatInfo` **object** with `.name`, not the `gfx.Format` enum integer used in v0.7.1 comparisons.
- Resolve `FormatInfo.name`, numeric/string formats and the primitive's actual vertex-bundle attribute format (no wrong assumption that primitive index equals vertex bundle index).
- Support 32-bit signed/unsigned integer POSITION/UV0 as well as existing float and 16-bit formats, preserving correct IEEE half-float decoding. Unsupported normalized/packed attributes fail clearly rather than producing corrupt geometry.
- Add engine-faithful runtime mock regression tests for all three format lookup methods; preserve **all existing runtime UUIDs** and serialized fields.

## 0.7.1 — Junction routing hotfix

- Fixed `SplineAnimate.junctionMode = Off` incorrectly switching to another spline when `SplineJunction.onReach` called `follower.requestJunctionExit(...)`.
- `requestJunctionExit()` now only controls routing in `Manual` mode. `First Other` and `Round Robin` select their own exits. `On Reach` events continue firing in all modes.
- No runtime TypeScript or `.meta` UUID changes; no serialization migration.
- Manual calls to `setCurrentSpline()` from *other scripts* can still change spline regardless of Junction Mode, by design.


## v0.7.0 — Knot edit mode, MeshDeform packed-position support, XY2D tangents

- `SplineKnot.editTangentHandles` toggles **always-visible curve + tangent arms** for knots with referenced handle Nodes without mutating `SplineContainer.showGizmosAlways`. Turning it off keeps handle Nodes/curve geometry intact. Selecting a knot always forces tangent visualization even if `showGizmos` and `showTangentGizmos` are both disabled.
- Add **Edit Tangent In / Edit Tangent Out** in Knot Inspector. They enable editing and single-select a child handle Node (move with W). Container inline knot editor also displays **Edit Handles** for knots with handles. Creating handles automatically enables knot-local editing.
- Fix XY2D tangents: selected knot draws 2D tangent lines/points regardless of global toggles, plus a Gizmos3D overlay/fallback for Scene setups where Gizmos2D Graphics are not visible (e.g. no Canvas).
- Fix MeshDeform source POSITION formats: accept **RGB32F, RGB16F, RGB16I, RGB16UI** as in Cocos-Gizmos DrawMesh v2.0.3. Optional UV0 accepts RG32F/RG16F/RG16I/RG16UI; RGB16F and RG16F are decoded from IEEE-754 half bits. Unsupported formats still return an explicit warning; source must be readable and single-submesh.
- Added offline runtime/Inspector/2D-gizmo/mesh-format regression tests; **all 15 existing v0.6 TypeScript UUIDs preserved**. The additional pure mesh reader script has its own UUID.


## 0.6.0 — Coordinate modes + Junction tutorial

- Add `SplinePositionMode` (Normalized Distance / Distance / Spline T) with arc-length conversion and clamp guards.
- Trigger and Junction links accept absolute distance or cubic t; marker positions resolve dynamically when spline length changes. Event payloads include normalized progress, distance and t.
- Animate Start and Preview can seek via distance/t; new public APIs `seekDistance`, `seekAtT`, `setCurrentSplineAtDistance`, `currentDistance`, `currentT`.
- Road, Extrude, Instantiate and Mesh Deform support Start/End range by distance or t, leaving old normalized values as default.
- Inspector conditionally shows the active input controls; scene preview applies the chosen distance/t.
- Add Vietnamese Junction guide with 3-way routing, manual callback, events, and common issues.
- All v0.5 runtime TypeScript UUIDs unchanged. New pure conversion module has its own .meta UUID.


## v0.5.0
- Optional Cocos-Gizmos integration for curve, knot, tangent, Trigger and Junction previews; add real movable tangent-handle nodes from Knot inspector.
- 2D spline plane evaluation (XY2D/XZ2D), Canvas Graphics path and 2D follower orientation.
- Imported mesh bending/stretch/repeat component with UV length mapping. Rope texture shader is packaged separately, not mounted in extension.
- Preserve existing runtime UUIDs and no standalone spline panel. Add offline geometry and editor tests.



## v0.4.0 — 2026-11-05

- **Road Builder (Scene + Inspector):** menu Create Road Spline, Container Inspector Add Road, new `SplineRoad` child renderer. Road profile includes asphalt width/taper, sloped shoulders, curbs, base thickness, capped ends, UV along distance and knot bank/roll. No custom panel.
- **SplineTrigger:** normalized distance event markers, forward/backward filter, workOnce/oncePerFollower, Cocos EventHandler and node.emit payload.
- **SplineJunction:** configurable multi-link route connections and entry/exit events; `SplineAnimate` follows Off/FirstOther/RoundRobin/Manual mode.
- **SplineAnimate:** traversal events for start/end and crossing a junction in the same frame, editor preview never triggers gameplay events.
- Added API examples, offline tests for road/trigger/junction, UUID files for new scripts; previous six runtime UUIDs preserved.
- Limitation: road mesh is procedural (not a persistent `.mesh` asset) and junction does not weld road geometry. No live Editor 3.8.8 test.


## v0.3.0 — 2026-11-05

### Fixes
- Fix **Select Knot / Select Container** accidentally multi-selecting: clear the `node` selection before selecting a target.
- Replace deprecated `renderer.getMaterial(0)` with `renderer.getSharedMaterial(0)` in SplineExtrude.
- Keep knot list editable while buttons are clicked; avoid re-rendering focused input widgets.
- Fix imported knot rotation editor path: set `eulerAngles` instead of sending Vec3 to Quaternion `rotation`.

### Unity-inspired additions
- `SplineContainer` Inspector: De Casteljau **Split After**, Move Up/Down, Reverse Direction; Native scene snapshots.
- Split geometry preserves cubic Bezier shape for closed/open, Manual/AutoSmooth, converts affected tangent modes to Broken.
- `SplineKnot`: optional `tangentsInKnotSpace` property; Unity JSON imports enable it, existing v0.2 knots retain old behavior.
- `SplineAnimate`: EaseIn/EaseOut/SmootherStep, World/Spline Up mode, forward axis ±X/±Y/±Z and rotation offset; conditional native Inspector fields.
- `SplineExtrude`: normalized partial Start/End range, end-radius taper and Flip Normals.
- `SplineInstantiate`: Count/Distance distribution, partial Start/End, reproducible Seed/Random Offset, Position/Rotation Offset and Scale Multiplier.
- More geometry, inspector, selection and runtime mocks; preserved six existing runtime `.meta` UUIDs.

### Limitations
- Not a complete Unity Splines port; no mesh profile, multi-spline container, linked knots or scene-native drag handles overlay.
- No live Cocos Creator 3.8.8 editor/device test; validate on a sample project before production.

## v0.2.0
- Inline Container Inspector and stable native Animate Inspector, edit preview and restore, preserved UUIDs.

## v0.1.0
- Spline geometry, runtime Animate, Extrude, Instantiate and Editor tools.

## 0.8.1
- Runtime subscribe/unsubscribe APIs for Junction, Trigger, Animate boundaries, Projector, and Length Monitor.
- Main branch release workflow; dev-only development.
