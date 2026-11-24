# Unreleased — Phase 3.8d1 Placement Reason Statistics (V2 Preview)

- Added on-demand **Analyze Placement** in SplineObjectController Inspector: exact totals, Accepted/Rejected and Surface/Collider/Peer/Exclusion/Density/Spacing counts, with up to three rejected indexes per reason.
- Summarizes the authoritative non-destructive preview before any Scene mutation, independent of sampled Gizmo marker count. Read-only Editor→Scene IPC has no snapshot/Undo/Respawn and returns a small bounded payload.
- Added defensive summary validation, textContent-only UI, request guard, strict native acceptance checklist and Core/IPC/Inspector regression.
- Native Cocos Creator 3.8.8 smoke tests remain pending; no tag/release.

# Unreleased — Phase 3.8d Placement Debug Gizmos (V2 Preview)

- Added optional selected-only Placement Debug Gizmos for SplineObjectController, registered through official Cocos-Gizmos v3 decorator with the drawer isolated under Editor.
- Extracted the exact, non-destructive placement preflight shared by Respawn and preview so diagnostic World centers and acceptance match actual placement. No Scene mutation or instantiate during preview.
- Added pure stage attribution for missing surface, Collider, Peer, Exclusion, Density and Spacing filters. Rejection callback is opt-in and does not alter legacy deterministic plan result or candidate indexes.
- Added bounded preview markers (8–256), optional conservative footprint spheres, reason colors, revision-based cache, Inspector fields, regression tests and native Editor acceptance notes.
- Native Cocos Creator 3.8.8 Editor, Prefab/Undo and performance validation remains pending; no tag/release.

# Unreleased — Phase 3.8c2b2b2 Shared Occupancy (V2 Preview)

- Added opt-in **Avoid Peer Population** with explicit Node references to earlier-priority SplineObjectControllers, a published conservative sphere radius per controller and optional World-space peer clearance.
- New pure spatial-hash filter operates on previously spawned peer-root children, preserves stable original candidate indexes and runs before Density/Min World Spacing. Priority must strictly increase to avoid mutual dependency cycles; peers are never mutated or spawned.
- Strict same-Scene, active peer, duplicate/self, priority, finite radius and generated-root preflight occurs before deleting own instances. Rebuild On Change tracks peer World positions and published radius only while enabled.
- Added Inspector controls, strict math/component mock regression and Vietnamese setup/Editor checklist. Auto batch scheduling and precise persisted per-instance occupancy remain future work; native Cocos 3.8.8 validation pending. No tag/release.

# Unreleased — Phase 3.8c2b2b1 Auto Prefab Footprint (V2 Preview)

- Added opt-in automatic conservative prefab sphere footprint from serialized `Prefab.data` static MeshRenderer bounds / Box-, Sphere-, Capsule- and MeshCollider bounds across nested Node hierarchies. No temporary instantiate, changes to prefab assets or source Knot data.
- Per-candidate radius accounts for selected weighted/uniform variant, prefab-local hierarchy, parent World affine stretch, scaleMultiplier, seeded random scale and Modifiers.scale; new precise filter overload accepts validated radius arrays.
- Unsupported/unreadable geometry, huge/cyclic hierarchies and oversize radii reject Respawn before clearing previously generated instances. Manual radius remains default when disabled.
- Added Inspector flag, offline Creator types, pure/controller regression and native Editor checklist. No automatic animated mesh bounds or multi-controller occupancy; no tag/release.

# Unreleased — Phase 3.8c2b2a MeshCollider BVH Population (V2 Preview)

- Added an opt-in static non-convex MeshCollider triangle BVH contact filter for SplineObjectController with manual sphere footprint, clearance and double-sided surface tests (face, edge and vertex), reusing SplineAnimate mesh reading and World transform adapters.
- Supports radius=0 point-on-triangle contact and BVH pruning. MeshCollider data validation failures, unreadable/convex meshes or bounds mismatches retain conservative World AABB fallback.
- Added per-Collider weak BVH cache keyed by mesh identity/hash, pose, center and bounds and opt-in Inspector flag; disabled by default, no source Knot/Mesh/Prefab mutation.
- Added pure and mocked integration regressions and documentation. Mesh-solid occupancy, automatic prefab bounds and native Editor 3.8.8 validation remain pending. No tag/release.

# Unreleased — Phase 3.8c2b1 OBB/Capsule Population Clearance (V2 Preview)

- Added opt-in **Use Precise Obstacle Shapes** and a manual spherical **Placement Footprint Radius** on SplineObjectController (only with Avoid Obstacle Colliders enabled).
- Valid BoxCollider OBB and CapsuleCollider shapes reuse strict world-space conversion adapters from SplineAnimate and exact center-to-shape sphere tests; mismatched/unsupported shapes fall back to conservative AABB.
- Placement shape filtering runs before density/World spacing and before instance cleanup, preserving previous population on invalid active bounds or radius. Legacy AABB path is unchanged when toggled off.
- Added standalone pure tests and mocked controller regression for rotated OBB overreject, Capsule ends, radius, fallback, signature and opt-out. Native Creator 3.8.8 validation pending.
- MeshCollider BVH and automatic prefab bounds intentionally remain unimplemented; no tag/release.

# Unreleased — Phase 3.8c2a Surface / Terrain Conform (V2 Preview)

- Added opt-in Physics 3D downward raycasts against explicit active target Collider/TerrainCollider components for prefab population. Closest valid target hit, slope threshold, normal offset and drop/keep missing-hit policy; unlisted hits cannot be used.
- Optional local-Up alignment to the hit normal with the spline's World forward projected onto the tangent plane, preserving deterministic jitter and variant seed selection.
- Surface projection is validated and planned before cleanup/instantiation; the resulting World centers are passed to Collider avoidance, Density, Exclusions and World Spacing, then reused exactly at spawn.
- Added Inspector settings, pure math, TypeScript Physics stubs, regression coverage and Vietnamese Creator acceptance notes. This is not accurate Mesh BVH/OBB collision detection.
- Native Cocos Creator 3.8.8 Physics, Terrain, Prefab and Undo/Redo smoke tests remain pending. No tag/release.

# Unreleased — Phase 3.8c1 Collider-aware Population and Weighted Variants (V2 Preview)

- Added explicit Collider World-AABB center clearance for prefab population: opt-in list of up to 64 active colliders, conservative sphere-to-AABB overlap and world-unit clearance, tested on final spline-frame placement after noise/jitter.
- Added opt-in weighted prefab selection with zero-weight exclusion, strict length/finite validation and deterministic seed/index sampling; unweighted legacy selection is unchanged.
- Obstacle candidates are removed before density/World spacing so blocked spots cannot reserve space. Invalid active bounds/weights fail during preflight before clearing saved spawned instances.
- Added Inspector controls, pure math and component regressions, Cocos offline Node type and native acceptance checklist. Detailed 3D physics overlap/terrain conform not yet supported.
- Native Cocos Creator 3.8.8 smoke tests remain pending. No tag or release.

# Unreleased — Phase 3.8b Advanced Population Rules (V2 Preview)

- Added opt-in density masks keyed by normalized arc, seed-stable candidate thinning, open/closed exclusion intervals and World-center minimum spacing after final modifiers/noise/jitter.
- Dense/partial mask operations keep original candidate indexes and prefab variant/random channels, so thinning never causes jitter reshuffles. Closed density masks interpolate periodically; wrapped exclusion intervals apply across seam.
- Pure `SplinePopulationMath` validates rules, dimensions and 2048 planned candidate positions before clearing previous object population. Spacing uses a 3D spatial hash; excludes center overlap only, not collider geometry.
- Added Inspector properties, revision-aware runtime regeneration, standalone pure/component regression suite and setup/acceptance guide. Disabled by default; no Knot/mesh/source changes.
- Native Creator 3.8.8 regression, Prefab/Undo and GitHub Actions artifact verification pending; no tag/release.

# Unreleased — Phase 3.8a Deterministic Noise Layers (V2 Preview)

- Added opt-in serialized SplineNoise layers (frequency, octaves, persistence, phase, individual seed, amplitude and open-end fade), with stable hash interpolation, normalized octave weights and exact closed-loop 0/1 seam.
- ObjectController can explicitly reference SplineNoise for spline-frame population offsets; no Noise reference preserves previous placement, source geometry remains immutable.
- Added Add Noise Layers menu + SplineContainer button, idempotent component creation, standalone Noise Inspector, runtime type/meta registration, new tests and Vietnamese setup/acceptance guide.
- Native Creator 3.8.8 smoke tests, Undo/Redo and nested Prefab serialization remain pending. No tag/release.

# Unreleased — Phase 3.7b Versioned JSON Geometry Round-trip (V2 Preview)

- New strictly versioned `cocos-splines/geometry` v1 text serializer/parser with bounded validation, local 3D/XY2D/XZ2D, closed/reversed, samplesPerCurve, root local transform and resolved cubic geometry.
- Editor export uses an isolated read-only Scene method, preserving effective evaluated Bézier controls; import creates a NEW sibling spline with Broken tangents, no source/Prefab edits, and one snapshot on success.
- Original Unity JSON importer is unchanged. Authoring-level Knot modes, rotations, nested tangent handle Nodes and asset/component references are intentionally not serialized in the geometry schema.
- Regression suite covers closed spline cubic control points, 2D hidden-axis rejection, malformed JSON/schema/transform, Editor set-property contracts, snapshot failure cleanup and non-mutating export. Native Creator 3.8.8 smoke testing still required; no tag or release.

# Unreleased — Phase 3.7a SVG Path Interoperability (V2 Preview)

- Added strict editor-independent SVG Path converter (`src/SplineSvgConverter.js`). Imports M/L/H/V/C/S/Q/T/Z commands (absolute and relative), converting straight lines and quadratic curves to exact cubic Bézier handles; rejects arc commands, multiple subpaths and transforms rather than misinterpreting geometry.
- **Import SVG as new XY2D Spline** creates a sibling Node hierarchy with Broken-mode knots and parent-local tangent vectors. SVG Y-down converts to Cocos Y-up; an explicit units-per-pixel setting is available. No destructive edit of the current spline. Partial pre-snapshot failures attempt to remove only the newly created root.
- **Export selected spline to SVG text** is a read-only Scene query through `getNaturalResolvedKnots()`, preserving resolved cubic controls for XY2D/XZ2D and natural knot order. Exports an SVG path, viewBox, and easy-to-copy Inspector textarea.
- Bounded 200 KB SVG input/output, max 256 segments and coordinate limits; no script or external reference execution. Regression tests cover relative/smooth curves, closing seam, round-trip geometry, validation, Inspector/Editor IPC, snapshot and rollback contracts.
- Native Cocos Creator 3.8.8 scene, Undo/Redo, Prefab, SVG screenshot and Gizmos acceptance remains pending. No tag or release.

# Unreleased — Phase 2.19 Non-Destructive Spline Resampling

- Added **Resample Spline · new copy** to SplineContainer Inspector, with target Knot count (open 2–128 / closed 3–128) or maximum nominal arc spacing, Local/World length metric and explicit maximum estimated deviation.
- New pure TypeScript `SplineResampleMath` fits cubic Bezier spans by least squares over arc-distance samples of the ORIGINAL curve. Generates Broken tangent pairs at evenly spaced arc targets, measures the maximum correspondence deviation at 49 samples/span and refuses the plan if that sample estimate exceeds tolerance. The value is not a mathematically certified continuous Hausdorff bound.
- Generates a separate sibling SplineContainer, preserving the original spline, Knot nodes, handles and Prefab Instance data. Reuses official Scene Editor create-node/create-component/set-property, checks original source revision/transforms/hierarchy before creation and before snapshot, and requests one final snapshot on success. On failure, best-effort cleanup removes the newly constructed spline only when the original Scene identity remains current.
- Copies the source root local position/rotation/scale and spline closed/dimension/samplesPerCurve settings; source reversed traversal is materialized as new natural Knot hierarchy (`reversed=false` on the copy).
- World option uses the original Container affine matrix for both sampling distances and deviation metric, supporting non-uniform scale. Tangent vectors remain in the new Container's local coordinates; 2D projections remain in their authored plane.
- Does **not** copy per-Knot rotations, arbitrary Knot child Nodes, bound Road/MeshDeform components, junction links or the source Prefab's identity; the generated sibling is intentionally independent. No destructive Knot deletion/replacement or unreliable external Prefab edits.
- New regression tests cover count/spacing, curved/straight/closed splines, World metric, error rejection, generated Inspector controls, one-snapshot sibling creation, source untouched, failure cleanup and stale source fingerprint.
- Native Creator 3.8.8 structural Undo/Redo and Prefab override behavior still require a real Editor smoke test. No tag or GitHub Release; preview branch only.

# Unreleased — Phase 2.18 Closed / World Arc Distribution

- Supports cyclic contiguous selections and full-loop distribution, deterministic seam anchor, local/world arc metric on original Bezier geometry, 2D hidden-axis preservation and metric-aware preflight. Bounded LUT sampling.

# Unreleased — Phase 2.17 Local Arc Distribution

- Redistribute interior Knots along the original open spline's local arc using the runtime evaluator; fixed endpoints, contiguous enabled selection, reverse traversal, planar constraints and revision preflight. Reuses batch position history. Not shape-preserving resampling.

# Unreleased — Phase 2.16 Axis Distribution

- Added Distribute marked to Batch Knot Tools; deterministic axis spacing with fixed extremes, Local/World and planar constraints, existing batch transaction and rollback. Not arc-length resampling. Regression tests cover planner, Inspector and Editor message flow.

# Unreleased — Phase 2.15 Scene Lease / Async Editor IPC Invalidation

- Added `SplineGizmoSceneLease`: immutable Scene hierarchy identity captured when a Knot Gizmo gesture begins, including ancestor/root Node object identities and validity. This detects Scene unload/reload, nested Prefab editing-root replacement and ancestor reparenting even when a newly opened Scene reuses UUIDs.
- Group Move, Knot Rotate and Tangent Move validate the captured lease at gesture update/end and during async serialized Editor operations. A stale gesture cancels without requesting a snapshot or restoring old Nodes into a different Scene.
- Serialized Group and Knot writers now guard **before and after** each asynchronous `scene:set-property`, `scene:query-node` (Tangent component index) and `scene:snapshot`, and before rollback. If an old request completes after unload, they abort without issuing further set-property/rollback to the now-current Scene.
- The existing per-SplineContainer history gate still releases only after the in-flight operation handles success/error; Scene Lease prevents an obsolete commit from contaminating a newer Scene.
- Regression coverage includes a fake Scene with nested Prefab ancestors, same-UUID root replacement, delayed query/set-property/snapshot, active Group Move unload/cancel and normal successful commits.
- **Limit:** requests ALREADY submitted to the Editor cannot be forcibly cancelled by this feature. It prevents follow-up requests and wrong-Scene rollback; it does not guarantee Creator will not process an already in-flight request after a Scene switch. Native Undo stack, actual Prefab override serialization and Scene teardown timing still require Creator 3.8.8 manual acceptance.
- Preview code on `v2` only; no tag or GitHub Release.

# Unreleased — Phase 2.14 Serialized Gizmo History Concurrency & Revision Recovery

- Added `SplineGizmoHistoryGate`, an Editor-only WeakMap keyed by SplineContainer Node. Prevents overlapping serialized Scene transactions across distinct Knot drawers on the same spline.
- Group Move, Tangent Move and Knot Rotate now claim the same per-spline lock at `begin`. A blocked native Gizmo gesture aborts before its computed property can be mutated; handles are hidden while a prior gesture's serialized commit is pending.
- The lock is released only after the Editor request succeeds or **all asynchronous rollback/error handlers finish**, not merely when the user releases the mouse. Cancel, stale input and no-op release immediately.
- The gate is scoped to each SplineContainer, so independent splines remain editable concurrently. No global Editor listener, polling, temporary Node or private Undo API.
- Commit completion invalidates the **original** SplineContainer's arc-length cache even if the edited Knot was deleted/reparented. Road/Extrude/MeshDeform already watch `getRevision()` in their `update()` loops, so existing revision tracking can pick up native Undo/Redo or rollback results on the next Editor update.
- Added regression tests for two drawers racing while Scene snapshot IPC is delayed, lock ownership, async rollback-before-unlock, Cancel, no-op and independent splines.
- **Limits:** Node tests do not prove Cocos Creator 3.8.8 reliably dispatches redraw/Undo events, preserves Nested Prefab overrides or groups native Undo history into one user-visible step. Manual Editor validation remains mandatory.
- Preview code on `v2`; no tag or GitHub Release.

# Unreleased — Phase 2.13 Serialized Tangent / Knot Rotate History

- Converted individual Knot Tangent Move and Knot Rotate Gizmos to `history:'external'`, matching the single-owner Group Move design. Requires a Cocos-Gizmos v3 preview exposing `Gizmos3D.supportsExternalHistory`.
- Implemented `SplineGizmoKnotHistory`: an editor-only, isolated writer for **real serialized fields**. When dragging an AutoSmooth tangent into Broken, it writes `__comps__.<index>.mode`, `tangentIn`, `tangentOut`, and changed tangent-handle Node `position` as appropriate, with `record:false`.
- Knot Rotate commits the affected Node **local quaternion** through `scene:set-property(path:'rotation', type:'cc.Quat')`, even when the Gizmo interacts in World Euler space and its parent is transformed.
- All changed fields in a gesture are sent through Scene property messages before **one** `scene:snapshot`; no-op / Cancel do not request a snapshot.
- Added real-component-index lookup via `scene:query-node`, validation against stale Scene and reparented/deleted handle Nodes, strict partial-write rollback, and quaternion sign-equivalence for no-op detection.
- Added tests for TangentMode materialization, two tangents, tangent handle position, rotation, failed writes/snapshot, late query-node result, stale hierarchy, exact paths, and native-hook suppression by the matching Gizmos v3 preview.
- This is an Editor property pathway intended to preserve Prefab Instance overrides without altering internal prefab metadata. **Native Creator 3.8.8 Undo/Redo, Nested Prefab overrides and actual override persistence still require live acceptance testing**; CI cannot certify them.
- No legacy callbacks, tags or GitHub Releases were added. Preview code on `v2` only.

# Unreleased — Phase 2.12 Multi-Knot Undo Owner / Prefab-Safe Scene Writes

- New opt-in `history:'external'` Cocos-Gizmos v3 handle descriptor suppresses native SelectGizmo onControlBegin/Update/End/Cancel for computed Move ports while continuing the official onGizmoChanged begin/update/end/cancel callbacks and repaint. Other Gizmos retain native handling by default.
- 3D, XY2D and XZ2D multi-Knot Group Move now require `Gizmos3D.supportsExternalHistory`. The owning Splines transaction writes the REAL serialized `Node.position` for each changed Knot through `Editor.Message.request('scene','set-property',{record:false,...})` and requests exactly one `scene/snapshot` after successful batch writes.
- This Editor property pathway is intended to let Cocos Creator track Prefab Instance overrides, instead of snapshotting an editor-only computed group property. No private prefab metadata or temporary Scene nodes are modified.
- Extracted `SplineGizmoGroupHistory` for typed prevalidation, exact-node targeting, no-op handling, rejecting stale or reparented nodes, fail-closed partial writes and reverse serialized rollback when a write/snapshot fails.
- Added mocked integration regression tests for 3D/2D Group Move, property paths, one snapshot, cancellation, partial write failure, stale edits, rejected snapshot and reparenting.
- **Important:** native Cocos Creator 3.8.8 Undo stack grouping, serialized Prefab overrides, save/reopen behavior and native Scene-Gizmos event ordering are NOT yet certified by Node mocks. Verify in an actual editor copy of the Scene.
- Existing individual Knot Tangent/Rotate gestures still use their previous snapshot path; this phase focuses on group transforms. Both plugins are preview builds; no tags or GitHub Releases.

# Unreleased — Phase 2.11 Container-local 2D Gizmo Frames

- Updated Cocos-Gizmos v3 development dependency to use an opt-in `frameNode` Move handle reference. SplineContainer's Node now provides the true coordinate origin and rotated/scaled local axis basis for multi-Knot XY2D and XZ2D Group Move.
- Added non-serialized `SplineKnot.editorGroupLocalPosition` Vec3 port that reads/writes Node local positions and clamps the dimension's hidden axis.
- XY2D Group Move uses X/Y/XY; XZ2D uses X/Z/XZ; both are now framed in the Container's local plane, instead of displaying World-axis handles and projecting the drag afterwards.
- Gizmo renderer, picking and Move solver receive the same reference frame through Cocos-Gizmos' new `Gizmos3D.supportsMoveFrameNode` capability. No temporary Nodes, component rotation changes, legacy Gizmos callbacks or serialized duplicate position fields.
- The original 3D World Group Move, normal tangent/rotation handles, Undo snapshot lifecycle and Cancel/rollback continue unchanged.
- When an older Gizmos extension does not support `frameNode`, the 2D Group Move handles fail closed rather than misleading the user with World-axis visuals. Install the matching Cocos-Gizmos v3 preview build to test this phase.
- Automated tests cover local port hidden-axis locking, filtered 2D axes, matching root frame reference, rotated/non-uniformly scaled ancestors, no-op, Cancel and snapshot failure. Native Editor mouse picking, Undo history and Prefab overrides still require live Creator 3.8.8 validation.
- Preview changes pushed to `v2`, no tag or GitHub Release.

# Unreleased — Phase 2.10 2D Multi-Knot Group Move

- Added Group Move Gizmos to XY2D and XZ2D SplineContainer editor modes using official Cocos-Gizmos v3 handles.
- XY2D uses Gizmos2D Move X/Y/XY, falling back to filtered 3D handles if Gizmos2D is unavailable. XZ2D exposes only 3D X/Z/XZ handles.
- Converted dragged World position into Container local space with `inverseTransformPoint`. All selected Knot positions are derived from an immutable local baseline, with the inactive local axis preserved independently for every Knot.
- Respects parent rotation, translation and nonuniform scale; does not modify unrelated Knots, opposite spline, or tangent data.
- Reuses existing shared Gizmo gesture transactions: Cancel/Esc restores local positions; one snapshot is requested on changed End, none on no-op/invalid selection, and failed snapshot rolls back.
- Includes pure dimension-constraint tests and mocked Scene Gizmos tests for tilted/scaled containers, both 2D dimensions, redo-safe baseline, Cancel, no-op, rejection and mid-gesture dimension switches.
- Numeric Inspector Local/World rules are unchanged (2D remains Local-only); this slice adds a **Scene Gizmo** gesture, not 2D World numeric alignment.
- Manual Cocos Creator 3.8.8 testing still required for handle picking, tilted parent UX, native Undo/Redo and prefab overrides. No tag or GitHub Release; `v2` preview only.

# Unreleased — Phase 2.9 Gizmo Scene / Selection Invalidation

- A unified Gizmo transaction now accepts an optional live Scene validity guard. Invalid gestures cancel before committing: no Scene snapshot or false Undo history entry.
- Knot drawers detect deselection, membership changes in a 3D multi-Knot group, deleted/disabled Knot, disabled SplineContainer, reparented group Knot, deleted tangent-handle Node and missing Editor Selection API after a known selection.
- Performs validation in official Cocos-Gizmos v3 begin/update/end and redraw hooks instead of private Cocos Editor event listeners or polling.
- Restores surviving knots still under their original parent, without mutating deleted or reparented nodes. Async snapshot failure cannot rollback an invalidated/changed Scene context.
- Prevents stale drawers from rendering handles for disabled/deleted Knot components.
- Added tests for selection changes both at End and redraw, reparenting, deletion, component disable, stale async snapshots and transaction guard behavior.
- Native Editor Undo stack and Prefab overrides still require **live Creator 3.8.8 smoke tests**. This phase does not claim they are certified.
- Preview code pushed only to `v2` — no tag or GitHub Release.

# Unreleased — Phase 2.8 Shared Gizmo Gesture Transactions

- Refactored Knot tangent Move, Knot Rotate, and 3D selected Knot Group Move to use a single editor-only SplineGizmoEditTransaction abstraction.
- Preserves existing official Cocos-Gizmos v3 handle registration and begin/update/end/cancel callbacks. No additional serialized properties, transform proxies, nodes or legacy API.
- Captures immutable before-state per gesture. Cancel/Escape restores exactly the affected tangent/mode, Knot world rotation or selected group positions.
- On End, tests the actual relevant state and requests one Scene snapshot only when the gesture changed something; duplicate End and no-op do not request snapshots.
- Handles synchronous/async rejected snapshots with guarded rollback. If a newer gesture or external Scene change has occurred, emits a warning rather than overwriting newer edits.
- Added regression tests for failure rollback across Group/Tangent/Rotate and standalone async gesture lifecycle, no-op, cancellation and stale state.
- **Native Creator 3.8.8 Undo/Redo, prefab serialization and the plugin's native hook/snapshot interaction remain unverified in the live Editor.** Automated tests only validate request semantics and rollback.
- Changes remain on `v2`; no tag or GitHub Release.

# Unreleased — Phase 2.7 Knot Batch Transaction Hardening

- Extracted reusable editor-only `SplineBatchEditTransaction` coordinator to keep Scene writes, verification, native snapshot request and rollback separate from Knot math and Inspector UI.
- Added read-only `queryKnotBatchState` Scene service, validating direct Knot children and reporting actual Node position/local quaternion.
- Before mutating, compare the current Node data to the planned baseline; stale edits abort without writing or making a snapshot.
- After setting properties, read back every selected Knot: silently ignored/partial Scene writes now trigger reverse-order rollback rather than false success.
- Exactly one snapshot is requested after successful verification. Rejected or thrown snapshot requests trigger rollback; `undefined` is treated as possible success for Creator IPC.
- Added focused tests for snapshot errors, mutation-then-throw, stale inputs, no-op state, quaternion sign equivalence, and Scene read-back contracts.
- Native Cocos Creator 3.8.8 Undo/Redo, prefab overrides, and changes done by Gizmos drag still require manual verification. **No claim of native Undo/Redo correctness based on Node mocks.**
- Code pushed to `v2`; no tag or GitHub Release.

# Unreleased — Phase 2.6 3D Collider & Terrain Surface Snap

- Added explicitly typed MeshRenderer vs Physics Collider surface targets in the SplineContainer Inspector.
- Added physics raycast support for Box/Sphere/Capsule/Cylinder/Cone/Mesh/Terrain/Plane/Simplex 3D Colliders with Cocos Creator 3.8 `PhysicsSystem.raycast`; no readable mesh data or Allow Data Access required on this path.
- Filters every raycast result against only the selected node's Collider components; nearer colliders on other objects cannot change the snap target.
- TerrainCollider relies on enabled 3D Physics backend in the Editor Scene. Returns an actionable error when unavailable or when the selected Collider has no hit.
- Can align Knot Up to the normalized hit normal where supported. Mesh-only smoothing is disabled for Collider targets. Original CPU MeshRenderer path stays intact.
- Preserved fail-closed no-hit behavior, batch validation and rollback with one Scene snapshot per successful edit.
- Renamed the Editor message `list-surface-meshes` to `list-surface-targets`, and Scene methods to `listSurfaceTargets` / `snapToSurfaceTarget`. Updated integration tests.
- Tests cover exact-target filtering, active Physics, invalid normals, Collider/Mesh co-location and rollback. Native Creator 3.8.8 physics backend, Scene picking and Undo/Redo still require manual validation.
- No tag and no GitHub Release; `v2` preview build only.

# Unreleased — Phase 2.5 Crease-aware Surface Normal Smoothing

- Added opt-in normal smoothing to Surface Snap when Align Knot +Y is active, with a validated 0–89° crease-angle control (60° default).
- Built area-weighted adjacent-face normals per shared vertex and barycentric interpolation at the hit; uses World-space transformed geometry, without modifying mesh source or raycast positions.
- Preserves hard edges across split indices, ignores unstable adjacent faces, retains all-or-nothing planning and atomic position/rotation snapshot/rollback.
- Added math, Scene contract and Inspector wiring tests; legacy flat-normal and position-only defaults remain unchanged.
- Manual Cocos Creator 3.8.8 Gizmos, prefab and native Undo/Redo testing is outstanding. No tag or GitHub Release created.

# Unreleased — Phase 2.4 Surface Normal Alignment

- Added opt-in **Align Knot +Y to surface normal** in Surface Snap. Default is disabled to preserve existing geometry and behavior.
- Compute upward triangle normals in World space and stable Knot local quaternions using parent orientation, preserving World forward heading where possible.
- Extend surface batch commits/rollback to include actual Node `rotation` property alongside `position`, including rotation-only edits and no-op detection.
- Validate steep surfaces and invalid rotation data before any Scene write; new regressions cover inverted winding, parent rotations, Scene service, combined snapshot and rollback.
- Knots with knot-space tangents or tangent-handle Nodes can change spline curvature when rotated; Editor integration and Undo/Redo still need live validation.
- Changes pushed directly to `v2`; no tag or GitHub Release.

# Unreleased — Phase 2.3 Surface Snap (MeshRenderer)

- Added downward World-Y surface snapping for selected 3D Knots against an explicitly chosen readable MeshRenderer, with no physics Collider dependency.
- Inspector enumerates eligible mesh targets outside the SplineContainer, validates raycast height/depth and provides a Snap to Surface action.
- Supports translated/rotated/non-uniformly scaled meshes with CPU triangle raycasts, and converts snapped world hits into spline-local Knot positions.
- All-or-nothing batch planning, one Scene snapshot for changes, rollback on partial Scene write errors, and 20,000-triangle / 64-knot caps.
- Source mesh data is never modified; only normal RGB32F single-submesh MeshRenderers with Allow Data Access are supported in this slice.
- Added standalone geometry tests, batch edit integration tests and Scene service contract tests. Native Editor Undo/Redo and prefab cases still require manual smoke tests.
- Development stays on `v2`; no tag or GitHub Release.

# Unreleased — Phase 2.2b Interactive multi-knot Gizmos

- Added a Cocos-Gizmos v3 World Move handle for multi-selected 3D knots in the same SplineContainer, anchored on first selected Knot in natural hierarchy order.
- Drag updates the group's Node world positions from an immutable baseline, preventing cumulative drift. Cancel/Escape rolls back all positions; successful end requests one Scene snapshot; no-op never snapshots.
- Added snapshot requests for changed computed tangent/rotation editing ports on Gizmo end. Native Creator Undo/Redo behavior still requires a live smoke test.
- Added mock regression tests for selection scoping, cancellation and no-op, including cross-spline and 2D safeguards.
- No tag or GitHub Release. Every validated v2 commit produces a test ZIP artifact.

# Unreleased — Phase 2.2a World-space Knot tools

- Local/World coordinate space in SplineContainer Batch Knot Tools.
- World-space grid snap and World X/Y/Z alignment for 3D splines under rotated/translated/nonuniformly scaled parents.
- Numeric group Move marked by Delta X/Y/Z. 2D axes are constrained to their authored local plane.
- Added a read-only Scene worldMatrix query and singular-transform validation.
- Extended regression tests for world transforms, partial-failure rollback and no-op.
- Native Creator Undo/Redo and Scene picking still require manual testing. No tag or release created.

# Unreleased — Phase 2.1 Batch Knot Editing

- Added multi-select via Inspector Knot marks and Scene selection.
- Added local grid snap and axis alignment for marked/selected Knot nodes, respecting XY2D and XZ2D dimensions.
- Added one Scene snapshot per batch, validation, no-op suppression and best-effort rollback on partial failures.
- Added pure placement math and Node regression integration tests. Live Cocos Creator Editor Undo/Redo and Scene selection still require manual testing.

# Unreleased — Phase 1.3 Mesh and Modifiers Gizmos

- Migrated Road/Extrude/MeshDeform/JunctionMesh/ObjectBender wireframes and Modifiers visual guides into dedicated Editor drawer classes using the upstream registerGizmos decorator.
- Core/SplineMeshGizmos is now pure geometry data construction, with rendering in Editor/SplineMeshDrawers.
- Removed direct onDrawGizmosSelected methods from all six migrated components and updated coverage.
- Live Editor verification is still required; Node CI does not certify Cocos Scene rendering.

# Unreleased — Phase 1.2 Core Gizmos v3 drawers

- Migrated SplineContainer and SplineKnot Gizmo draw callbacks into Editor-only drawers registered with upstream Cocos-Gizmos decorator from the read-only AssetDB mount.
- Added computed editor tangent/world-rotation properties, direct Move/Rotate handles and cancel restoration.
- Added Node mock loader and offline TypeScript declarations for tests; Cocos Editor must load the actual v3 module.
- Manual Scene/Undo/build validation is outstanding, and other mesh/modifier gizmos will migrate in Phase 1.3.

# Unreleased — Phase 1 legacy API cleanup

- Removed compatibility `rebuild()` aliases from `SplineInstantiate` and `SplineObjectController`; use `respawn()`.
- Updated runtime tests and added an API regression guard.
- Added a migration guide and Unity reference parity roadmap. Gizmos decorator refactor is scheduled for Phase 1.2 and is **not** included in this commit.

# 0.9.12 — Junction Mesh Road-Matched UV

- Added opt-in `SplineJunctionMesh.uvMode = RoadMatched` and `uvBlendStart` Inspector controls. `WorldProjected` stays the default for existing scenes.
- Junction patch uses **actual asphalt edge positions and UVs** from each linked `SplineRoad` mesh at outer and inner rings. Matches `Length Along U/V`, UV flips, offsets, width tiles, Road width modifiers and corner trim, with integer phase unwrapping for Repeat textures.
- An inner fan blends the incompatible orientations of multiple Road branches without internal UV cuts. UV edge continuity needs the same shared Material + Repeat wrapping, with straight/smooth roads near connection endpoints.
- Added fallback to legacy projected UV if any Road cannot be matched. Diagnostics only in Scene Editor.
- Known limitation: different lane markings from three or more Road branches can still warp near the center; not a Boolean road union or automatic marking remover.
- Added geometry, runtime component, editor and documentation regression tests.

# 0.9.11 — Editor-only warnings

- Component diagnostic `console.warn` messages are emitted only in the Cocos Scene Editor (`EDITOR_NOT_IN_PREVIEW`), never in Play/Preview or runtime builds.
- Keep `console.error` for actual callback failures.
- Added regression test for Editor-only Road tight-bend warning and a scan to keep future component warnings Editor-only.

## 0.9.10 — Road sharp-bend corner join and inner-edge trim
- Added SplineRoad Corner Mode: Legacy (default, unchanged scenes) / JoinAndTrim. Mitered section joins connect offset edge lines at local corners to reduce outside gaps. When the local bend radius is smaller than the road half-width, the inside profile is smoothly compressed to avoid folded/inverted inner-road triangles. Works with shoulder, curb, thickness, material, and U/V road UV orientation.
- Corner Trim Safety (default 0.93, range 0.5–0.99) controls how much inner curvature clearance to retain. The method preserves source UVs and triangle indexing; compacting the inner width may compress the asphalt texture at extreme bends.
- Tested right/left 90° joins, a radius-2 arc with width 6, flat and pitched sections, open endpoints, and loop seams. It is not a Boolean polygon union; near-180° hairpins, overlapping distant segments or 3D road intersections still require redesigned path/Junction geometry.
- New settings are opt-in so existing scenes retain their geometry; runtime TS UUIDs preserved. No physical Editor validation yet.

## 0.9.9 — Stable world-space mesh frames for steep splines
- A shared continuous (parallel-transport) spline frame field fixes 180-degree right/up flips when a 3D spline is steep, loops, or its up hint becomes nearly tangent to the path.
- Used by SplineRoad, SplineExtrude, SplineMeshDeform and SplineObjectBender; improved support for rotated/non-uniformly scaled source nodes, and closed-loop seam continuity.
- Added a warning for extremely tight Road bends: if road half-width exceeds bend radius, the inside edge may self-intersect independently of the frame problem.
- SplineJunctionMesh remains a planar XZ junction overlay, not a grade-aware 3D mesh; Spline2DPath is Canvas Graphics rather than 3D mesh extrusion.
- New steep-grade, banking, closed seam and Road/Extrude component tests; runtime UUIDs unchanged. Live Cocos Editor rendering still needs validation.

## 0.9.8 — Road UV orientation
- SplineRoad supports Length Along U (horizontal source textures) or Length Along V (legacy/vertical) with continuous world-distance tiling.
- Added width UV tiling, flip across/along, and UV U/V offsets. All defaults preserve existing road texture orientation and appearance.
- Road Inspector, HTML docs, UV math and mock component regression tests updated.
- No changes to existing script UUIDs; development branch only.

## 0.9.7
- Visualize SplineModifiers with selected-only Gizmos: offset trajectory, configurable width guides, speed-colored key markers, optional roll/scale key axes.
- Full Vietnamese modifier guide: per-field semantics, interpolation, consumer mapping, code/API, vehicle speed, road widening, lane change and prefab scale examples.
- Gizmo unit tests and Inspector regression checks; previous script UUIDs preserved.

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
