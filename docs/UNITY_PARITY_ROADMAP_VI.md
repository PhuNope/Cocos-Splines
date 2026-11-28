# Kế hoạch Unity parity — Cocos Splines

## Nguồn và giới hạn

- **Dreamteck.zip**: bản gửi có `Splines/Examples` (Following/Junctions/LengthEvents/Projection/RollerCoaster), không chứa Dreamteck runtime core. Đối chiếu theo ví dụ, không suy ra API đầy đủ.
- **SplineArchitect.zip**: có Spline/Segment, SplineConnector, SnapSettings, NoiseLayer/NoiseGroup, Population, Deformation và Editor Handles.
- **ToolBuddy.zip**: có Curvy Splines, Curvy Generator/CG Modules, controllers, JSON/SVG converters, ConformPath và các module processing.
- Chỉ đối chiếu hành vi. Không sao chép code/asset thương mại của Unity.

## Inventory code Cocos hiện tại (0.9.12)

Đã có: `SplineContainer/Knot`, `SplineAnimate`, `SplineJunction`, `SplineTrigger`, `SplinePositioner`, `SplineProjector`, `SplineRoad`, `SplineExtrude`, `SplineMeshDeform`, `Spline2DPath`, `SplineJunctionMesh`, `SplineInstantiate`, `SplineObjectController`, `SplineObjectBender`, `SplineMorph`, `SplineModifiers`. Chức năng hiện diện không đồng nghĩa parity hoàn toàn.

| Reference feature | Gap / next step | Phase |
| --- | --- | --- |
| SplineArchitect Editor handles, rotate, multi-knot selection | Chưa có workflow tương đương hoàn chỉnh | 1–2 |
| SplineArchitect SnapSettings / align / snapping | Thiếu tool tích hợp editor | 2 |
| SplineArchitect Noise/Population | Noise Layers, density masks/exclusions/world spacing, opt-in weighted prefab variants và explicit Collider World AABB avoidance (3.8c1). Còn thiếu terrain conform, Collider OBB/mesh chính xác, population graph | 3–4 |
| SplineArchitect connectors / Curvy connections | Có Junction cơ bản; thiếu network graph operations | 3/5 |
| Curvy JSON/SVG converters | Legacy Unity JSON import + Cocos versioned geometry JSON round-trip 3D/XY2D/XZ2D (preview); SVG single-path import/export 2D. Thiếu SVG multi-path/transform/arc và full component/prefab serialization | 3 |
| Curvy ConformPath, BuildVolumeCaps/Spots | Một phần qua geometry hiện có | 4 |
| Curvy Generator / CG module graph | Chưa có typed module graph + dirty propagation | 4 |
| Curvy advanced controllers | Animate/Positioner mới hỗ trợ một phần | 5 |
| Dreamteck example trains, switching, projection, length events | Kiểm chứng theo workflow ví dụ | 5 |

## Triển khai theo thứ tự phụ thuộc

### Phase 1 — Cleanup & Gizmos architecture

- [x] Slice 1.1: xóa alias `rebuild()` ở hai prefab spawners, cập nhật tests và migration.
- [x] Slice 1.2a: migrate Container/Knot drawers, tangent/rotation gizmo ports (chưa smoke test Editor).
- [ ] Slice 1.2b: tách Gizmos Drawer khỏi Component theo SOLID, dùng `@registerGizmos(Drawer)` Cocos-Gizmos v3. Kiểm tra resolve Asset DB và build Editor/Preview trước khi hard import.
- [ ] Slice 1.3: bỏ direct Gizmos callbacks từng nhóm sau khi chuyển xong; kiểm chứng selection và Undo/Redo.
- **Exit:** `npm test`, `npm run check:runtime`, smoke test Cocos Creator 3.8.8. Không giữ hai cơ chế Gizmos cùng chạy.

### Phase 2 — Spline Editor

- [x] Phase 2.1: Knot mark/select, local grid snap, axis align và batch snapshot (chưa smoke test Editor).
- [x] Phase 2.2a: World snap/align 3D + Local/World group Move bằng delta, kiểm tra affine worldMatrix, giữ 2D constraints.
- [ ] Phase 2.2b: interactive multi-knot drag, native Undo/Redo cho tangent/rotation, snap to surface.

Multi-select, Move/Rotate knots, kéo tangent trực tiếp, insert/split/join, snap grid/surface, align và Undo transaction. **Exit:** curve continuity, knot rotation, 2D/3D drag, undo.

### Phase 3 — Core & interoperability

Deterministic sampling/cache, nearest point, spline data, noise layers, connector graph, JSON/SVG round-trip. **Exit:** numerical and serialization regression tests.

- [x] Phase 3.1 — Network graph + direction-aware shortest routes across existing Junction links, seam support, optional world-gap validation, route preview API and SplineAnimate ShortestRoute (new enum 4; modes 0–3 unchanged).
- [x] Phase 3.2a — Editor Check Connectors (world gap + tangent axis-angle), safe position-only snap of an open spline endpoint to a link, Scene lease/revision preflight, serialized transaction + rollback and regression tests.
- [x] Phase 3.2b1 — G1/C1 endpoint tangent alignment for Broken target knots, including handle-node overrides, Knot rotation, nonuniform scale, Reversed spline side mapping, Scene guard and single-snapshot rollback.
- [x] Phase 3.3 — ShortestRoute On Arrived + opt-in auto-stop at exact normalized arc progress (including same-frame junction switch, reverse, boundary and editor/runtime event subscriptions), with rearm and regression tests.
- [x] Phase 3.4 — Shared bounded graph/route LRU with automatic invalidation on spline getRevision/worldMatrix/active Junction/links, negative-result caching, explicit clear/stats APIs and mock regression coverage.
- [x] Phase 3.5 — Opt-in World-distance shortest routes (sampled cumulative world arc, scale/rotation-aware, bounded 4096 samples/spline), Route Cost Space Inspector, independent world/local cache snapshots and regression tests.
- [x] Phase 3.6a — Route diagnostics (reachable/unreachable/invalid), opt-in per-Junction-exit Max Followers admission, waiting at marker + retry, occupied slot release on lifecycle/teleport, runtime & pure regression tests.
- [x] Phase 3.6b1 — FIFO per-exit admission queues, queue visibility + diagnostics, opt-in congestion-aware alternate path planning, independent route memo keys and runtime regression tests.
- [x] Phase 3.6b2a — Opt-in centerline world-arc headway and soft braking on shared spline, closed seam/reverse/nonuniform-scale support, blocked/cleared events, lifecycle cleanup and regression tests.
- [x] Phase 3.6b2b1 — Manual per-exit Green/Red signal (including unlimited exits), opted-in 0..10 priority admission with FIFO within tier, signal-aware reroute, diagnostics and runtime regression.
- [x] Phase 3.6b2b2a — Opt-in SplineTrafficController with deterministic Green/Yellow/All-Red phase scheduling, explicit conflict-pair validation, manual-state restoration, single-controller lease, runtime lifecycle and mock regression tests.
- [x] Phase 3.6b2b2b1 — Adaptive queue-demand SplineTrafficController with minimum/maximum Green, time-aged demand priority, explicit fixed-mode fallback, bounded dt, Yellow/All-Red safety and regression tests.
- [x] Phase 3.6b2b2b2a — Read-only bounded sampled 3D exit proximity diagnostics (candidate/missing/same-Green/uncertain, Editor Inspector action) and opt-in logical headway Lane ID (0–31) with regression tests.
- [x] Phase 3.6b2b2b2b1 — Opt-in physical lane centers using spline-frame offset and World sweep-sphere proximity against other opt-in followers (including cross-spline), offset-speed integration and mock regression.
- [x] Phase 3.6b2b2b2b2a — Sparse 3D spatial-hash broadphase for opt-in proximity, cached sampled sweep, safe oversized-query fallback, configurable sweep precision and read-only cross-system traffic telemetry with regression tests.
- [x] Phase 3.6b2b2b2b2b1 — Opt-in Cocos 3D Collider.worldBounds-derived conservative bounding-sphere proximity and explicit per-exit World asphalt half-width 3D conflict diagnostics (with vertical clearance), Inspector and mock regression.
- [x] Phase 3.6b2b2b2b2b2a — World-AABB obstacle narrowphase for swept follower spheres; read-only sampled nominal SplineRoad asphalt widths (taper/range/modifiers), auto-by-connection index Inspector and mock regression.
- [x] Phase 3.6b2b2b2b2b2b1 — Explicit stationary World OBB narrowphase for swept spheres, orthonormal basis validation, conservative registry broadphase radius, immutable snapshots and regression coverage. API-only; native Collider auto-adapter remains pending.
- [x] Phase 3.6b2b2b2b2b2b2a — Opt-in 3D BoxCollider World OBB preview adapter in SplineAnimate + Inspector, local center/size and orthogonal nonuniform world scale, bounds consistency check, fallback AABB, mock regression.
- [x] Phase 3.6b2b2b2b2b2b2b1 — Explicit stationary World Capsule narrowphase (swept sphere against cylinder and rounded caps), conservative registry broadphase, copy isolation, regression tests. Fixed BoxCollider Inspector test contract.
- [x] Phase 3.6b2b2b2b2b2b2b2a — Opt-in CapsuleCollider adapter, X/Y/Z and uniform world scale, bounds consistency check, AABB fallback, runtime and Inspector mock coverage. Native backend validation pending.
- [x] Phase 3.6b2b2b2b2b2b2b2b1 — Explicit WORLD mesh triangle swept sphere narrowphase with double-sided face/edge/corner contact, bounded immutable BVH, opt-in SplineProximityRegistry.setMesh and triangle test telemetry. Mock regression coverage; not yet a native MeshCollider adapter.
- [x] Phase 3.6b2b2b2b2b2b2b2b2a — Opt-in 3D MeshCollider → World triangle BVH adapter, supported triangle-list submeshes and half-float position reader, center + affine transform, worldBounds sanity check, convex/readability fallback, cached BVH on unchanged mesh hash/pose and tests.
- [x] Phase 3.6b2b2b2b2b2b2b2b2b1 — Opt-in bounded constant-WORLD-velocity prediction for registered follower shapes; relative-space segment sweeps, motion-expanded broadphase, pause/seek/disable lifecycle, telemetry and offline regression tests.
- [x] Phase 3.6b2b2b2b2b2b2b2b2b2a — Headless profiling harness + deterministic broadphase/BVH complexity gates, opt-in in-runtime limit() sampler (p50/p95, counters), CI JSON artifacts and manual Creator 3.8.8 acceptance checklist. **Native validation NOT executed.**
- [x] Phase 3.6b2b2b2b2b2b2b2b2b2b — Opt-in bounded constant-acceleration relative sweeps with per-segment quadratic chord error, acceleration-expanded broadphase and conservative rotation-envelope collision for non-spherical shapes, Inspector + offline tests. Native 3.8.8 validation pending.
- [ ] Phase 3.6b2b2b2b2b2b2b2b2b2c — Exact rotating geometry narrowphase, native Creator 3.8.8 physics validation/profiling, physical collision resolution and server-authoritative multiplayer traffic.
- [x] Phase 3.2b2a — Explicit Junction target endpoint AutoSmooth/Linear/Mirrored/Continuous → Broken conversion preserving currently evaluated tangents, including Knot-space vectors and handle nodes, read-only Scene planner + fingerprint/transaction, best-effort rollback, single snapshot and regression tests. Native Creator 3.8.8 undo/prefab acceptance pending.
- [x] Phase 3.2b2b1 — Explicit Junction Join → New Spline: two exact endpoints of distinct open source splines, transform-independent WORLD cubic copy into anchor-local space, reversed traversal and one seam Knot, scene/source revision guard, bounded Knot count, rollback on failure and single Editor snapshot. Sources, Junction and prefabs untouched. Pure/Scene/Editor regressions. Native 3.8.8 acceptance pending.
- [x] Phase 3.2b2b2a — Junction multi-link Fan-out Join: one anchor + 2–8 unique exits; one separately generated joined spline per exit under one new group, preserving branch topology without out-and-back geometry; multi-route planner and Scene guard, single snapshot, group-level cleanup, bounded 256-Knot batch, pure math and Editor regression tests. Native 3.8.8 acceptance pending.
- [x] Phase 3.2b2b2b1 — Multi-Junction endpoint-only route join: deterministic minimum-switch BFS over full spline chains across at least two distinct Junctions; up to eight unique open source splines and 128 output knots, World/Local Bezier derivative transforms, source-wide Scene fingerprint, one-snapshot Editor transaction with cleanup, Inspector destination UUID, regression coverage. Native Editor 3.8.8 acceptance pending.
- [x] Phase 3.2b2b2b2a — Optional Join seam treatment Preserve (default), G1 or C1 for two-link, fan-out and multi-Junction Join. Shared pure math, outgoing-only Broken Knot update, immutable source spline, original incoming curve preserved, zero-tangent fail-closed, Inspector mode and regression tests. Native Creator 3.8.8 acceptance pending.
- [x] Phase 3.2b2b2b2b1 — Opt-in Multi-Junction Partial Route Slicing: mid-spline Junction links with explicit anchor start and goal end sides, shortest-switch BFS across monotonic spans of unique open splines, normalized arc-progress → geometric t conversion respecting Reversed, exact de Casteljau cubic trimming, non-destructive Join geometry and Scene lease, bounded output/rollback tests. Native Creator acceptance pending.
- [x] Phase 3.2b2b2b2b2a — Opt-in cost-aware Editor Join routing: Fewest Switches (legacy default), Shortest World Distance and Balanced (world-distance + user-defined penalty per Junction transfer), bounded deterministic route search for Full/Partial paths, sampled world-arc lookup via tAtProgress, estimated costs in transaction result, Scene lease and editor regression tests. Native Creator 3.8.8 acceptance pending.
- [x] Phase 3.2b2b2b2b2b1 — Opt-in Editor route policy filter: Ignore (legacy default), Respect Junction ExitDirection (Preserve/Forward/Backward) and Respect Direction + Green-only snapshot signals (Red/Yellow excluded). Full/Partial, distance/balanced/fewest-switch modes, source Scene lease updated on signal changes, regression Math/Scene/Editor and rollback. No runtime capacity/signal forecast. Native Creator acceptance pending.
- [x] Phase 3.2b2b2b2b2b2a — Opt-in configured-capacity / potential-phase routing: validates per-exit maxFollowers against requested follower count, checks whether any valid SplineTrafficController phase can eventually open Green, supports manual Green fallback for unmanaged Junctions, and invalidates Scene route guards when controller/phase/capacity settings change. Not runtime occupancy or prediction. Pure Math/Scene/Editor regression.
- [ ] Phase 3.2b2b2b2b2b2b — Runtime congestion telemetry bridge/queue forecasting, adaptive sampled world-arc integration and native Creator 3.8.8 Undo/Prefab acceptance.
- [x] Phase 6.1 — Extension menu **Install Examples**: optional project-local examples in assets/CocosSplinesExamples, six runtime gallery modes, reusable Train/Road/Extrude/Junction sample scripts; idempotent, no overwrite, asset-db refresh and security/regression tests. **Native Creator 3.8.8 compile/scene smoke test pending.**
- [x] Phase 6.2 — **Create Example Gallery in Scene** menu: native Editor Scene messages for a compiled Gallery component, duplicate-safe read-only Scene lookup, Scene lease guard, single snapshot, guarded cleanup, project-local quick-start guide and offline Editor regression tests. Saving an actual .scene remains a manual Creator operation; native 3.8.8 smoke test pending.
- [x] Phase 6.3 — Example Gallery 10-feature catalog: four additional runtime demos (Projection, Trigger callbacks, Modifier speed/width, source-to-output Morph), TypeScript static catalog coverage, installation/update safety guide. Native Creator 3.8.8 visual test pending.
- [x] Phase 6.4 — Installable Example Gallery expanded to 13 feature modes (Mesh Deform with procedural input, two-phase Junction Traffic signals, runtime Prefab Spawning), three project-owned imported-asset setup scripts, additive no-overwrite installation, offline TypeScript/catalog tests; native Creator 3.8.8 visual/physics/prefab acceptance pending.
- [ ] Native Creator Editor 3.8.8 Junction array, Prefab, save/reopen and runtime smoke test.

### Phase 3.7a — SVG path import/export (preview)

- [x] Strict single-path SVG d parser: M/L/H/V/C/S/Q/T/Z absolute/relative; convert lines/quadratics to exact cubic Bezier.
- [x] Create NEW sibling XY2D spline from SVG, Y-down mapping, user units-per-pixel, Broken Knot tangents in parent-local space, closed Z seam; best-effort cleanup before snapshot on failure.
- [x] Export XY2D/XZ2D from natural resolved Knot handles (supports AutoSmooth/Linear/Mirrored/Continuous/Broken), readonly Scene query; cubic path and viewBox text in Inspector.
- [x] Limits: 200 KB text, 256 segments; reject SVG transform/arc/geometry collections instead of silently distorting; pure and mocked Editor regression tests.
- [ ] Native Cocos Creator 3.8.8 XY2D spline geometry, prefab and native Undo acceptance; future SVG multiple-path import, arc conversion, transform flattening and JSON export.

### Phase 3.7b — Versioned Cocos JSON Geometry Round-trip (preview)

- [x] Strict `cocos-splines/geometry` v1 schema, bounded 200 KB/256 Knots, finite values, quaternion and planar validation; no arbitrary component/UUID/reference deserialization.
- [x] Read-only Scene export of natural-order **resolved Bézier** controls, closed/reversed, dimension, samplesPerCurve and local Node position/rotation/scale.
- [x] Non-destructive sibling import with explicit `Broken` tangent serialization, single snapshot and best-effort failure cleanup. Same-parent local transform reproduces World placement; different parent may change World placement.
- [x] Separate Inspector controls from legacy Unity JSON import, tests for cubic shape preservation / 3D/XY2D/XZ2D / invalid input / Scene IPC and error paths.
- [ ] Preserve richer authoring metadata (Knot rotations, tangent handles, non-geometry components) only with a separate opt-in schema and Prefab-aware migration.
- [ ] Native Creator Editor 3.8.8 Undo/Redo, Prefab/save-reopen acceptance and full CI verification remain pending.

### Phase 3.8a — Deterministic Noise Layers for Prefab Population (v2 preview)

- [x] Core `SplineNoiseMath`: bounded, stateless seeded 1D multi-octave value noise; integer cycles, normalized octave sum and exact 0/1 seam on closed splines; 16 layers max, finite-property preflight.
- [x] Serializable `Splines.SplineNoise` / `Splines.SplineNoiseLayer` with Editor Inspector settings and a revision signature, default no layers (neutral).
- [x] Optional `SplineObjectController.noise` applies Right/Up/Forward offsets during prefab placement, additive to existing Modifiers/jitter; no source Knot or mesh mutation. Null reference preserves legacy output.
- [x] Extension + Container menu **Add Noise Layers**, duplicate prevention, script availability preflight, one snapshot and installable TS asset UUIDs.
- [x] Automated pure noise, closed seam, disabled/default, input-boundary and mock population/Inspector/Editor regression tests added to v2 CI.
- [ ] Native Cocos Creator 3.8.8 Inspector layer serialization, prefab save/reopen, Gizmos and Undo/Redo acceptance.
- [ ] Next: density masks and interval-based population rules, noise preview Gizmos, optional procedural geometry consumers (none enabled by default).

### Phase 3.8b — Advanced Population Density/Exclusion/World Spacing (v2 preview)

- [x] Pure `SplinePopulationMath` with bounded 2048 candidate count, 64 density keys, 64 exclusion intervals, deterministic stable seed/index hash and strict finite World position validation.
- [x] Linear density masks, circular seam interpolation on closed paths, wrap-over-seam no-spawn intervals, and uniform density × mask thinning.
- [x] World-space center-to-center minimum spacing using spatial hash after Modifiers/Noise/Random Offset, including cross-seam and self-intersecting spline candidates. This is not Collider/OBB overlap prevention.
- [x] Serialized opt-in `SplineObjectController` properties, Inspector fields, revision invalidation, and preflight before deleting previous spawned Nodes. Disabled-by-default legacy placement and original prefab variant RNG index are preserved.
- [x] New deterministic mask, forbidden-range, spacing, invalid-policy, safe-respawn and compatibility regression tests registered in v2 CI.
- [ ] Native Cocos Creator 3.8.8 Inspector/Prefab/Undo/Redo acceptance and CI pass/artifact verification pending.
- [ ] Next: Collider-aware placement + terrain/material density masks, weighted prefab variants, typed procedural population module graph.

### Phase 3.8c1 — Weighted Prefab Variants & Explicit Collider World-AABB Avoidance (v2 preview)

- [x] Strict pure placement utilities: deterministic positive-weight CDF sampler with zero-weight exclusion; World-AABB sphere-center clearance with max 64 boxes and finite-coordinate validation.
- [x] Optional `usePrefabWeights` + `prefabWeights` serialized on ObjectController; unchanged uniform seed channel and order when off; max 128 variant slots when enabled.
- [x] Optional `avoidObstacleColliders` + explicit `obstacleColliders` + `obstacleClearance`; use active Collider.worldBounds only, no scene auto-scan or Physics overlap.
- [x] Candidate positions calculated after Modifiers/Noise/Jitter, obstacles filtered **before** spacing and density planner, stable original indexes; weight/bound preflight before deleting spawned Nodes.
- [x] Inspector groups + conditional controls, offline TypeScript stub update and new placement regression suite registered in v2 CI.
- [ ] Native Creator 3.8.8 Inspector, Prefab, Undo/Redo and build smoke acceptance.
- [x] Phase 3.8c2a: opt-in downward raycast surface/terrain projection on explicitly assigned 3D Physics Colliders, normal-aligned prefab orientation and preflight-safe population planning. Native Creator 3.8.8 still pending.
- [x] Phase 3.8c2b1: opt-in shape-aware population clearance for supported BoxCollider World OBB / CapsuleCollider + manually configured prefab footprint sphere radius; unsupported geometry conservatively falls back to AABB.
- [x] Phase 3.8c2b2a: opt-in static readable non-convex MeshCollider triangle BVH for double-sided sphere footprint surface contact, with conservative AABB fallback and bounded geometry/cache.
- [x] Phase 3.8c2b2b1: opt-in conservative static Prefab.data hierarchy spherical footprint from MeshRenderer and supported Colliders with scale-aware per-candidate narrowphase; fails before clear on missing bounds.
- [x] Phase 3.8c2b2b2: explicit priority-ordered cross-controller shared occupancy using already spawned World centers and published sphere radius; strict same-Scene/ownership validation and deterministic spatial hash, opt-in.
- [ ] Remaining: automated multi-controller batch scheduling, persisted per-instance radii, animated geometry/closed-solid occupancy, per-shape placement and candidate debug Gizmos.

### Phase 3.8c2a — Surface / Terrain Conform for Prefab Population (v2 preview)

- [x] Pure `SplinePopulationSurfaceMath`: validated directional hit projections, normal threshold, normal offset, missing-hit policy, closest explicit valid hit and orthonormal frame basis.
- [x] Optional ObjectController `conformToSurface` with 1–64 explicit active Physics 3D Collider/TerrainCollider targets, World -Y ray Height/Depth, slope threshold, normal offset, optional local-Up surface orientation and missing-hit skip/keep.
- [x] Projection of fully offset/jittered World candidates **before** obstacle, density and World-spacing filters; final projected positions reused at spawn, with no second raycast. Invalid Physics/raycast settings fail before clearing old objects.
- [x] Inspector conditional controls, offline Physics type stubs, runtime/pure regression tests registered in v2 CI, setup and Editor acceptance checklist.
- [ ] Native Cocos Creator 3.8.8 Physics Scene TerrainCollider/Prefab/Undo/Redo acceptance.
- [ ] Follow-ups: exact OBB/Capsule/Mesh overlap, Collider2D/terrain-native projection and performance batching/visual preview.

### Phase 3.8c2b1 — Precise OBB/Capsule Placement (v2 preview)

- [x] Pure `SplinePopulationPreciseMath` sphere-footprint vs validated World OBB / Capsule / AABB, finite/bounded inputs, correct rounded Capsule end tests and inclusive contact.
- [x] `SplineObjectController.usePreciseObstacleShapes` and `placementFootprintRadius` opt in only when Avoid Obstacle Colliders is enabled; no changes to legacy AABB path when off.
- [x] Reuse strict BoxCollider and CapsuleCollider native World adapter functions from SplineAnimate, with conservative World AABB fallback for transform/bounds mismatches and unsupported Mesh/Terrain colliders.
- [x] Rebuild signature considers shape transforms/radius while active; preflight before clear, original candidate indexes and density/spacing order preserved.
- [x] Inspector controls, automated pure/adapter/regression tests, doc and native Editor 3.8.8 acceptance checklist.
- [ ] Native Cocos Creator 3.8.8 acceptance; accurate MeshCollider BVH, prefab geometry bounds and multi-controller occupancy remain future work.

### Phase 3.8c2b2a — MeshCollider BVH for Population (v2 preview)

- [x] Reuse `SplineMeshColliderAdapter` and immutable `SplineProximityMesh` BVH from SplineAnimate for opt-in non-convex, CPU-readable MeshCollider triangle surface tests.
- [x] Add sphere/point static triangle distance query with BVH pruning and radius=0 exact surface touch, double-sided face/edge/vertex contact.
- [x] Extend `SplinePopulationPreciseMath` to handle mesh shapes with strict validation, preserving original AABB/OBB/Capsule cases.
- [x] Optional `SplineObjectController.useMeshColliderBVH`; cache by Collider identity, mesh identity/hash, world pose and bounds; unreadable/convex/unsupported data must fall back to conservative AABB.
- [x] Inspector flag, mock controller/cache/fallback and pure triangle regression, CI registration, native Editor acceptance checklist.
- [ ] Native Creator 3.8.8 MeshCollider import, Prefab/Undo/Redo and performance smoke tests remain pending.
- [ ] Not solid mesh containment; next: prefab bounds inference, occupancy across controllers, more efficient Editor placement previews.

### Phase 3.8c2b2b1 — Auto Static Prefab Footprint (v2 preview)

- [x] Pure `SplinePrefabFootprintMath`: conservative static local AABB/Box/Sphere/Capsule radius, nested local Node position/scale, root translation ignored because ObjectController overwrites World placement, finite/size/cycle preflight.
- [x] Account for affine parent World-matrix stretch and each candidate's scaleMultiplier, seeded randomScale, Modifiers.scale; stable per-variant selection for weighted/uniform prefab distribution.
- [x] Extend precise sphere-to-AABB/OBB/Capsule/Mesh filters with validated per-candidate radii. Auto mode is opt-in, legacy Manual radius is unchanged by default.
- [x] Strict preflight (Prefab.data, readable static Mesh bounds, Collider geometry, hierarchy limits, radius limits) before deleting existing spawned Nodes. Zero-weight unselectable variants do not block valid spawn.
- [x] Inspector conditional Auto flag, offline Creator types, regression tests registered in CI and native 3.8.8 acceptance documentation.
- [ ] Native Creator 3.8.8 prefab Mesh.minPosition/maxPosition, nested transform, save/reopen/Undo/Redo smoke test.
- [ ] Next: explicit cross-controller occupancy and per-instance bounds for animated/skinned or arbitrary shape geometry.

### Phase 3.8c2b2b2 — Explicit Shared Occupancy (v2 preview)

- [x] `SplineSharedOccupancyMath` pure 3D spatial hash: bounded 2.048 candidate/32.768 occupant, finite center/radius/clearance validation, inclusive sphere contact, stable original candidate indexes.
- [x] Opt-in ObjectController `avoidPeerPopulation`, 16 explicit `occupancyPeerNodes`, strict monotonic `occupancyPriority`, published `sharedOccupancyRadius` and consumer `peerOccupancyClearance`; no automatic Scene scans or peer respawns.
- [x] Read-only snapshot of direct children in peer serialized `spawnedRoot`; strict same Scene/active/duplicate/self/priority checks, before any existing own population is cleared.
- [x] Pipeline order Surface Conform → Collider Avoidance → Shared Occupancy → Density/World Spacing; per-candidate Auto Prefab Footprint is reused on the follower when already active.
- [x] Peer node position/radius/priority changes invalidate follower Rebuild On Change signature only while opted in; Inspector conditional controls, mock runtime and pure regressions.
- [ ] Native Cocos Creator 3.8.8 multi-controller Play/Undo/Prefab/save-reopen acceptance and large-scene performance profiling.
- [ ] Later: explicit batch scheduling, serializing exact per-instance footprint radii, preview rejected placements in Gizmos and Phase 4 graph nodes.

### Phase 3.8d — Placement Debug Gizmos (v2 preview)

- [x] One authoritative non-destructive placement preflight shared by Respawn and preview, with exact Noise/Modifier/Surface, Collider, Peer, Density/Exclusion/World Spacing behavior.
- [x] Optional rejection callback in `planPopulation`; immutable `SplinePlacementDiagnostics` attributes the *first* failed stage for every original candidate index. Strict candidate-subset validation prevents misleading visual results.
- [x] Cocos-Gizmos v3 `@registerGizmos(SplinePlacementGizmos)` drawer isolated in Editor folder, selected-only and disabled by default. Color legend covers accepted, surface, collider, peer, exclusion, density, spacing.
- [x] Bounded, reason-aware marker sample (up to 256 drawn from at most 2048 fully planned candidate positions), optional footprint spheres, revision cache and single-warning handling of invalid preview.
- [x] Inspector controls, pure/controller/Gizmos mock regression and Vietnamese setup/acceptance docs.
- [ ] Native Cocos Creator 3.8.8 Editor gizmos/Physics/Undo/Redo/performance smoke tests and visual legend/index labels.
- [x] Phase 3.8d1: exact candidate/reason counters and rejected index examples shown on demand in ObjectController Inspector (read-only).
- [ ] Next: in-Scene index labels and Phase 4 Procedural Geometry Graph.

### Phase 3.8d1 — Placement Summary (v2 preview)

- [x] Pure reason histogram from full, already validated `PlacementDiagnostic[]` (0–2048 candidates), exact Accepted/Rejected totals, and at most three original candidate indexes per rejection class.
- [x] Read-only `SplineObjectController.summarizePlacement()` calls the same non-destructive preflight as Respawn/Gizmos, not a separate approximate planner.
- [x] Scene `queryPlacementSummary(uuid)` and Editor `query-placement-summary` IPC; no Scene snapshot, no Undo entry, no generated nodes or caller mutation.
- [x] Inspector **Analyze Placement** button, explicit manual snapshot, text-only seven-reason count display with bounded examples, defensive result validation and pending-request guard.
- [x] Native 3.8.8 acceptance checklist and offline Core/Scene/Editor/Inspector regression integration.
- [ ] Native Cocos Creator 3.8.8 Inspector, physics and performance smoke acceptance. Future: variant-level histogram, scene marker index labels, CSV export.
- [ ] Next: Phase 4 Procedural Geometry Graph, keeping V2 no-tag/no-release protocol.

### Phase 4 — Procedural geometry

#### Phase 4.1 — Typed Spline Geometry Graph foundation (v2 preview)

- [x] Versioned JSON graph with `spline` / `offset` / `width` / `ribbon` / `output` nodes, typed path/mesh ports, one selected output, strict schema/numeric limits (3–32 nodes).
- [x] Compile by dependency-first traversal; reject unknown node names/types/fields, missing inputs, wrong port types, disconnected nodes and cycles before execution.
- [x] Pure `GeometryGraphRunner` reuses source frames, caches computed node values by parameters/upstream node version and uses atomic cache swap on failure; graph parameter edits dirty only affected downstream nodes.
- [x] Ribbon node reuses canonical `SplineRoadMath.buildRoadGeometry` (UVs, normals, thickness, end caps, winding) rather than duplicate mesh tessellation.
- [x] `SplineGeometryGraphRenderer` uses stable World frames from `SplineWorldFrames`, converts to renderer-local, creates transient meshes with a two-phase commit, and preserves prior output if JSON/geometry/mesh allocation fails. Supports material, Rebuild On Change and selected-only wireframe through Cocos-Gizmos v3 decorator.
- [x] Dedicated JSON Inspector / Rebuild Graph action, native Cocos Creator 3.8.8 acceptance guide and Core/component regression tests in V2 CI.
- [ ] Native Cocos Creator 3.8.8 JSON Inspector, Material, parent scale, closed seam and Undo/Redo smoke tests.
- [x] Phase 4.2a: in-Inspector visual graph canvas with typed path/mesh socket reconnection, Offset/Width insertion/removal, numeric parameter editing, draggable card layout, native dump commits and isolated frame layout serialization.
- [x] Phase 4.2b: shared **native JsonAsset** graph references for multiple GeometryGraphRenderer instances, content-based revision invalidation, bounded non-overwriting JSON export/import and copy-to-local with rollback; shared canvas read-only.
- [ ] Phase 4.2c: native visual editing of shared assets with explicit save intent, asset-db synchronization and UX polish; multi-input/branching and richer auto layout.
- [x] Phase 4.3a: `tube` generator (path→mesh), bounded radius/radialSegments, UV seam/caps, anisotropic and mirrored frame winding, native Inspector Ribbon↔Tube switching, regression tests.
- [x] Phase 4.3b: bounded Profile Extrude generator (Rectangle/Beveled/U Channel preset), concave cap triangulation, hard-edge normals, mirrored/nonuniform winding, UV, typed Inspector selection and installable example JSON; headless regression tests.
- [x] Phase 4.3c: bounded `meshDeform` generator uses standalone CPU deformation kernel with generated Strip/Box Shell presets, arc-distance frame lookup, mirrored winding, typed Inspector and installable example. Imported source Mesh assets remain future work.
- [x] Phase 4.3d: opt-in Geometry Graph V2 with 2–4 typed mesh output branches, per-renderer Output ID selection, shared JsonAsset multi-renderer usage, branch add/default/remove, V1 fallback, atomic per-node cache, headless regression.
- [x] Phase 4.3e: opt-in cold/warm per-node CPU profiler for Geometry Graph v1/v2, isolated diagnostic runner, bounded Inspector report, deterministic timing regressions and safe Scene IPC.
- [x] Phase 4.3f1: typed `meshAsset` → `meshDeform.meshInput` source port, native Source Mesh property per renderer, bounded readable imported Mesh adapter, CPU cache invalidation, Graph Inspector attach/detach, installable example and headless regressions.
- [x] Phase 4.3f2a: 3 native imported Mesh Asset slots (A/B/C), typed slot mapping and isolated cache signatures; Mesh Deform axis X/Y/Z for imported/preset meshes; Visual Graph slot/axis selectors, multi-source example and headless regressions.
- [x] Phase 4.3f2b: opt-in Mesh Deform Source Length repeat/trim (physical tile length or 0=source axis bounds), clipped final triangles, Original/Continuous/Distance UV, graph/Inspector bounds and installable example; legacy Count remains default.
- [x] Phase 4.3g1: opt-in selection of imported FBX submesh 0–3 per native Source Mesh A/B/C slot; indexed read-only Mesh adapter, unique submesh revisions, renderer cache invalidation/rollback, independent multi-output routing and installable example. Still one output mesh / material slot per renderer.
- [x] Phase 4.3g2a: opt-in Render All Outputs for V2 typed graph (2–4 branches), one transient Cocos 3.8 Mesh with distinct submesh primitives and sorted Output Node ↔ Material A/B/C/D slots, native renderer properties, atomic ownership, bounded CPU packing and installable example.
- [x] Phase 4.3g2b1: per-renderer Output ID → Material A/B/C/D ordering override (default alphabetic), native Inspector up/down/reset, shared JsonAsset isolation, invalid-permutation rollback and cached rebuild tests.
- [x] Phase 4.3g2b2a: opt-in FBX/glTF model MeshRenderer shared Material binding for graph meshAsset output branches, indexed source submesh A/B/C, per-slot explicit override precedence, hot material refresh without mesh rebuild, fail-closed mismatch/absent material, atomic Mesh/Material rollback and mocked regression.
- [x] Phase 4.3g2b2b1: author-owned Profile JsonAsset v1 (3–16 simple CCW x/y points), typed Extrude profileSlot A/B/C and visual preset selector, content revision isolation, invalid-asset rollback, installable L/Octagon profiles and mocked Core/Renderer/Inspector regressions.
- [x] Phase 4.3g2b2b2a: in-Inspector Profile SVG editor for existing native JsonAsset A/B/C with selectable/draggable points, bounded numeric input, insert/remove, temporary drafts, explicit confirmation, checksum conflict guard, safe AssetDB refresh and no Scene mutation.
- [x] Phase 4.3g2b2b2b1: edge selection and drag (both endpoints), edge-handle insert (bounded t/offset), optional SVG point/edge drag snap, 32-step draft-only Undo/Redo with one step per drag and save reset, atomic invalid-polygon rollback and automated Inspector/model regression.
- [x] Phase 4.3g2b2b2b2a: authored Profile JsonAsset v1 UV0 seamEdge + per-edge edgeWeights, normalized weighted side perimeter UV, per-renderer/profile-slot cache invalidation, Inspector seam/weight/reset with draft Undo/Redo, insert/remove index migration, strict validation, installable UV example and headless regression tests.
- [x] Phase 4.3g2b2b2b2b1: Profile Library templates (Rectangle, Beveled Rectangle, U Channel, L Section, Octagon, UV Seam Example) selectable in Geometry Graph Inspector; apply to existing JsonAsset draft, one-step Undo/Redo, no Scene mutations, no writes before explicit Save, validation and headless tests.
- [x] Phase 4.3g2b2b2b2b2: V2 preview delivery as a **single GitHub artifact ZIP** (no ZIP-in-ZIP), directly installable extension root, deterministic clean staging, automatic nested-archive rejection and CI package contract test.
- [x] Phase 4.3g2b2b2b2c1: opt-in Profile UV0 nominal side U meters/repeat [0.01,10000], stable seam/weight mapping, backward-compatible normalized mapping, Inspector draft numeric field/reset, polygon/renderer/cache/Undo tests and installable UVMetricProfile example.
- [x] Phase 4.3g2b2b2b2c2a: explicit new Profile Library JsonAsset creation and Export Draft As New JSON via native Save + confirmation; strict project/assets path + symlink + orphan .meta guards, exclusive no-overwrite writes, asset-db refresh, no automatic Scene binding, and model/main/Inspector tests.
- [x] Phase 4.3g2b2b2b2c2b1: optional Profile UV `uFollowFrameScale` per-ring local side-band UV0 physical tiling at widthFactor and frame basis scale, seam/edge weights, bounded geometry regression/Inspector draft Undo/Save and installable taper sample; no change to default legacy UV.
- [x] Phase 4.3g2b2b2b2c2b2a: optional Start/Mid/End Width multiplier curve in typed Geometry Graph (distance-normalized linear/smoothstep), legacy fixed-width unchanged, closed-loop seam validation, Visual Inspector nullable control points, per-frame Extrude/UV integration, cache-isolated regression and installable TaperWidthExtrudeGraph demo.
- [x] Phase 4.3g2b2b2b2c2b2c — Opt-in 2–16 Width keys at normalized physical arc progress, bounded typed V1/V2 schema, strict 0/1 endpoints, ordered-gap and closed-seam validation, legacy Start/Mid/End lossless conversion, linear/smoothstep interpolation with graph-cache isolation, Visual Graph numeric editing and draggable SVG handles (native Inspector commit only on release), plus offline regression tests. Native Creator 3.8.8 acceptance pending.
- [x] Phase 4.3g2b2b2b2c2b2d — Opt-in Profile UV Edge Islands (independent U per profile side, shared geometry) and Quad Islands (per-span face U/V seams with duplicated side vertices), strict runtime + Inspector enum, nominal/metric U, optional frame-local UV, cap isolation, vertex budget preflight, isolated graph cache, draft Undo/Redo, installer examples and regression tests. Native Cocos Creator 3.8.8 validation pending.
- [x] Phase 4.3g2b2b2b2c2b2e — Opt-in authored Profile World-space U texel density. Renderer injects local-to-world linear matrix, pure Core computes per-ring physical profile edge lengths including nonuniform scale/shear and taper without double-scaling world arc V; accepts continuous/edge/quad UV modes, keeps legacy default and cap UVs, bounds malformed/singular transforms, isolates Extrude graph cache, supports draft-only Inspector toggle + Undo/Redo + explicit Save, installable JsonAsset example and regression coverage. Native Cocos Creator 3.8.8 acceptance pending.
- [x] Phase 4.3g2b2b2b2c2b2f — Authored Profile UV0 Atlas Packing: optional strict atlasPacking/atlasPadding [0,0.2], deterministic candidate grid, uniform scaling preserving island U/V aspect/relative density with bounded gutter and nonoverlap, pack single side/edge strips/quad islands including separate endcaps; old UV/topology unchanged by default, no input mutation, native Editor draft controls/history, installed example, cache/geometry/schema regression and CI. Native Creator 3.8.8 acceptance pending.
- [x] Phase 4.3g2b2b2b2c2b2g — Authored Profile Per-triangle UV0 Unwrap: opt-in triangleUnwrap Boolean, each side/cap triangle owns 3 vertices with unchanged geometry/normals/winding and rebased UV origin. Compatible with existing Atlas Packing, continuous/edge/quad modes, world metrics and width taper; 65536 vertex/16384-island preflight; strict JSON, editor draft toggle/Undo/Redo, cache isolation, installable Profile JSON + runnable Gallery comparison (enum 14) and safe pristine Gallery migration. Regression and native 3.8.8 acceptance pending CI/native respectively.
- [x] Phase 4.3g2b2b2b2c2b2h — advanced atlas rotation and pixel gutters: optional proper 90-degree island rotation, stable size-order candidates, uniform fit scale, explicit square resolution and minimum per-side pixel gutter, atomic failure and strict runtime/editor schema, draft controls and regression tests. Native Creator acceptance pending.
- [x] Phase 4.3g2b2b2b2c2b2i — bounded authored Profile polygon holes: one CCW exterior, up to three CW interior contours, strict containment and intersection checks, constrained planar cap triangulation without additional cap vertices, inward-facing hole walls, independent contour UV seams, atlas and triangle unwrap integration, Inspector JSON draft editing and preview, runnable Gallery and example. Native Creator acceptance pending.
- [x] Phase 4.3g2b2b2b2c2b2j — interactive contour editing in authored Profile Inspector: select outer/inner contour, drag points and edges, snap, coordinate fields, insert/remove points, valid hole creation/removal, grouped draft Undo/Redo, outer-only UV seam/weights preserved, collapsed advanced JSON. Native Creator acceptance pending.
- [x] Phase 4.3g2b2b2b2c2b2k — disconnected outer contours: up to three additional CCW solids, disjoint/non-nested validation, independent cap triangulation and UV cap islands, outer contour handles and draft creation/removal, automatic Gallery and installable JSON. Holes remain on primary outer. Native acceptance pending.
- [x] Phase 4.3g2b2b2b2c2b2l — holes per outer solid: aligned outerHoles lists, per-solid validation and cap triangulation, independent cap UV islands, owner-aware contour editing, paired Gallery and installable JSON; regression and native acceptance pending.
- [x] Phase 4.3g2b2b2b2c2b2m — UV atlas relative density priority for outer walls, inner walls and caps, 0.25–4 linear weights; deterministic packing, fractional/pixel gutters and rotation compatible; all-one weights retain previous UVs; draft controls, example and regression coverage. Native acceptance pending.
- [ ] Phase 4.3g2b2b2b2c2b2m+: texture baking and native Creator 3.8.8 PBR/Undo/Prefab/FBX/GPU acceptance.
- [x] Inspector UX cleanup: remove 20 static Inspector footnotes and all verbose inline roadmap/feature paragraphs (including Phase 4.2b shared JsonAsset explanation); trim Spline Container, Visual Graph and Profile Editor helper text and shorten long native component tooltips. No data/API/runtime changes; add template + tooltip regression coverage. Native 3.8.8 visual check pending.
- [x] Example Gallery UV Atlas: append GeometryGraphUVAtlas enum (13, preserving 0–12 Scene values), generate Graph and temporary cloned Profile JsonAssets at Play for side-by-side regular/atlas Extrude, optional author-supplied Profile/Graph/checker Material without modifying assets; safe byte-for-byte legacy ExampleGallery.ts upgrade on Install Examples preserving Cocos .meta UUID and edited projects; catalog/offline TypeScript/installer/runtime mock regression. Native Creator 3.8.8 Play/PBR acceptance pending.
- [ ] Native Cocos Creator 3.8.8 Visual Graph drag/Undo/Redo/Prefab override acceptance.

Road không biến dạng asset nguồn, stable frames, extrusion, caps, terrain conform, mesh/profile/volume, module graph typed IO với cache và dirty propagation. **Exit:** UV, winding, normals, material/source immutability tests.

#### Phase 4.4 — Geometry Graph Processing Nodes

- [x] Phase 4.4a — typed Transform Path node in Graph v1/v2: renderer-local XYZ translation, ordered X/Y/Z Euler rotation in degrees, positive uniform path-only scale about renderer origin; preserve profile size, rotate basis vectors, update sampled world-arc metric, strict bounds and atomic cache behavior. Visual Inspector insertion/removal/reconnection and editable parameters, installable JSON example and offline regression coverage. Native Creator 3.8.8 validation pending.
- [x] Phase 4.4b — typed deterministic Noise Path node (Graph v1/v2): Right/Up/Forward amplitude, bounded integer frequency/octaves/seed, persistence/phase/open endpoint fade, reused SplineNoiseMath and stable World frames, physical sampled distance recomputation, exact closed-loop ring seam, zero-amplitude passthrough, strict schema and failure-safe cache; Visual Inspector, installer examples and offline runtime/model tests. Native 3.8.8 acceptance pending. Transform example also registered in installer.
- [x] Phase 4.4c — typed Reverse, Clip and Resample Path nodes (Graph v1/v2). Reverse flips travel/right basis together; Clip uses normalized sampled arc interval and opens partial closed paths; Resample selects 3–1024 equal-input-arc intervals and recomputes world chord distance, preserves sampled seam, interpolates width and physical basis lengths, rejects degenerate frames. Visual Inspector, cache isolation, strict schema, installable example and offline tests; native 3.8.8 validation pending. No wrapped clip or exact Bezier reconstruction.
- [x] Phase 4.4d — typed Conform Path node with explicit renderer-local Collider references (1–64 active unique same-scene targets), World -Y raycast, normal threshold/offset, Fail/Keep missing policy and surface/source up hints, reusable PopulationSurfaceMath + stable displaced frame builder, sampled world distance, closed seam and atomic mesh failure. Manual rebuild refreshes Physics; live rebuild signature tracks target pose/bounds (same-bounds geometry edits require manual rebuild). Visual Inspector, installer example and headless tests; native Creator 3.8.8 Physics validation pending.
- [x] Phase 4.5a — independent Spline A/B/C slots for Graph V2 (1–3 unique sources, 2–4 outputs), V1 one source (default A, optional B/C). Native component references, per-slot frame revision/cache, typed DAG branch isolation, Visual Graph Add Spline Output and source slot selector, output branch removal/downgrade, explicit missing-source rollback, installable example and offline regression tests. Native Creator 3.8.8 acceptance pending.
- [x] Phase 4.5b — named typed input-port registry (required/optional, Path/Mesh/MeshSource), Core/editor parity, generic dependency traversal, per-port upstream cache keys, cycle/dead-node checks, explicit clicked socket targeting (legacy inference only for unique compatible port), per-socket wire routing, material dependency tracing, conservative shared JSON topology review. Existing serialized input/meshInput unchanged. Regression coverage using current Mesh Deform dual inputs. Merge Path/Mesh nodes and additional same-type ports follow in 4.5c/d; native 3.8.8 validation pending.
- [x] Phase 4.5c — binary Merge Path with named required Path A/B ports, 1–3 sources also allowed in single-output V1. Forward/reverse/nearest B, World gap/angle guard, exact-near weld or bounded straight bridge, shared stable frame rebuild and continuous sampled World UV distance, width preservation (averaged welded ring), open-path only, 1025-frame cap, Visual Graph add/remove/reconnect, installable example and headless regression tests. Fixed 4.5b legacy socket diagnostic; native validation pending.
- [x] Phase 4.5d — binary Merge Mesh with named required Mesh A/B ports, deterministic concatenation in common renderer-local space, preserve position/normal/UV, offset B indices, combined preallocation budgets (65536 vertices / 393216 indices), atomic cache, one output material (no imported material inference for merged branches), Visual Graph add/remove/reconnect, example and headless regression tests. No vertex weld, boolean union or per-input submesh preservation; use separate outputs for multiple materials. Native acceptance pending.
- [x] Phase 4.5e — dependency-layered deterministic Visual Graph layout with parent barycenter ordering, nonoverlapping automatic cards for all 32 nodes, bounded dynamic canvas extents, legacy manual position preservation and collision-free placement of new nodes, named-port wire routing metadata, find/jump-to-node navigation, scroll-aware drag and branch-aware toolbar targeting/selection (shared nodes prefer default output). Auto Layout writes only graphLayoutJson; shared asset layout remains read-only. Offline regression tests; native Creator 3.8.8 acceptance pending.

#### Next Geometry Graph expansion

- [x] Phase 4.6a — Profile Keys: 2–16 normalized sampled-arc keys selecting authored slots A/B/C, step selection per ring, strict matching vertex counts and simple outer polygons, closed first/last slot guard, per-ring perimeter UV, endpoint cap triangulation, transition normals, slot-aware revisions and native inspector key table, shared asset conflict review, installable examples and headless regressions. Native acceptance pending.
- [x] Phase 4.6b — Profile Morphing: Step default (legacy), Linear/Smoothstep via profileInterpolation 0/1/2, normalized sampled-arc correspondence, insert missing key rings and a midpoint for undersampled changing intervals, bounded 1025 frames, per-sampled-polygon validation, slope-aware normals, per-ring perimeter UV, endpoint caps, matching closed seam and revision-aware cache. Inspector mode selector, shared parameter support, installable example and headless regressions. No automatic vertex matching or guarantee against intersections between sampled rings; native validation pending.
- [x] Phase 4.6c1 — compatible ordered contour topology for Step/Linear/Smoothstep Profile Keys: main outer and holes, additional disconnected solids and their holes, strict per-part/per-loop vertex counts, explicit index correspondence, validation of every sampled section including containment/disjointness, per-loop normalized U, independent hole-aware end cap triangulation, closed seam, existing static/simple API compatibility, installer example and offline regressions. Native acceptance pending.
- [x] Phase 4.6c2 — compatible custom UV metadata across keyed profiles: strict identical parsed configuration for all referenced slots, per-section seam/weighted U, metric local/world U and frame scale, continuous/edge/quad islands, triangle unwrap and atlas options, shared morph-aware side sampling, world-matrix cache invalidation, installer example and offline regressions. UV settings themselves do not interpolate; weights/seam still apply only to main outer contour per existing asset schema. Native acceptance pending.
- [x] Phase 4.6d — Extrude profileMaterials mapping (outer/inner/startCap/endCap, optional flattened edgeSlots overrides -1 inherit or 0–3), static and keyed profiles, triangle metadata preserved through UV islands/unwrap, shared vertex bundle per output and grouped index primitives, single selected output or all V2 outputs, deterministic physical A–D material order (output order then used local group ID; max four total), manual mapping JSON Inspector, shared asset conflict tracking, installable example and headless regressions. Merge Mesh retains single-material flattening contract. Native Creator 3.8.8 acceptance pending.
- [x] Phase 4.7a — explicit Mesh Bake to self-contained glTF 2.0 model inside Project/assets, isolated current graph evaluation, local coordinates, output/material group primitives and placeholder materials, bounded binary encoding, exclusive new-file creation, native save/confirmation + AssetDB refresh, no auto-assignment or source/Scene mutation, headless tests. Native importer acceptance pending; original Cocos materials manually reassigned.
- [x] Phase 4.7b — opt-in runtime/Preview static triangle collider generation on an explicit empty same-node MeshCollider (non-convex, zero center, no RigidBody on node/parents). Separate position/index-only mesh, exact Float32 seam welding, degenerate triangle removal, bounded output, ordered multi-output geometry, rollback on bind failure, release on disable/destroy, external meshes preserved, Inspector and offline regressions. Native Physics backend acceptance pending; no Editor serialized mesh writes or dynamic convex cooking.
- [x] Phase 4.7c1 — spatially partitioned Mesh Baking: deterministic centroid median triangle partitions, 256/1024/4096/8192 triangles per mesh, up to 128 meshes, compact local vertex remaps preserving attributes and triangle winding, shared output/group material table, independent glTF nodes/meshes and AABB accessors, aggregate bounded input/binary budgets, Inspector Bake Chunks and offline tests. Native import/culling acceptance pending.
- [x] Phase 4.7c2 — opt-in runtime/Preview child MeshRenderer chunks with centroid partition parity, per-chunk shared vertex/material primitives, exact stream/physical-slot reuse, staged node/mesh ownership and rollback, material/visibility sync, explicit bounds and cleanup on disable/destroy, static collider compatibility, Inspector and offline regressions. Graph evaluation/partition still whole-output; no local spline-segment reevaluation or native performance claim. Edit Mode uses original single renderer. Native culling/ownership acceptance pending.
- [x] Phase 4.7d — opt-in renderer-wide distance-based visual LOD (full/half/quarter path samples, explicit observer Node, nearest sampled source segment world distance, 10% hysteresis, separate per-level graph runners, full-resolution bake/collider and camera-only collision reuse, chunk compatibility, unchanged material groups, Inspector and offline regressions). Conservative supported-node allowlist; unsupported path/mesh operations remain LOD0. No per-chunk LOD, simplification, crossfade or native performance claim. Native acceptance pending.
- [x] Phase 4.7e — optional exact attribute-tuple vertex compaction (no tolerance or face deletion, UV/hard normal seams preserved), standalone binary GLB 2.0 alongside embedded glTF, single/chunk bake options, bounded binary encoding, shared material groups, geometry/size/degenerate diagnostics in export response and extras, exclusive asset write and offline regression coverage. Native GLB import acceptance pending.
- [x] Phase 4.8a — data-only Typed Population Graph v1: bounded versioned JSON, path/candidates/instances ports, topological compilation, cycle/type/disconnected validation, world arc Count distribution, existing density/exclusion/spacing and weighted-prefab policies, immutable compiled plan, deterministic candidate IDs, revision-based atomic node cache and read-only instance descriptors, installable JSON example and headless regression tests. No native spawning yet.
- [x] Phase 4.8b — fixed world-arc Spacing (optional open endpoint), seeded Random, stratified Jitter with 0–1 amplitude, Progress Range candidate masks (closed wrap, open endpoint inclusive), binary-search arc interpolation, independent deterministic distribution streams, stable candidate IDs, bounded 2048 count, cache/rollback regressions and three installable JSON examples. No 2D surface scatter or native spawning yet.
- [x] Phase 4.8c — candidate frame/world Position Offset, seeded local intrinsic XYZ Rotation, uniform positive Scale multiplier, World/Upright/Surface Alignment, existing surface projection and precise obstacle shape filtering (AABB/OBB/capsule/mesh) via revisioned host snapshots; stable IDs, preserved metadata and defensive copies, bounded parameters, atomic cache, installable examples and regression tests. Native host/physics integration and prefab spawning remain Phase 4.8d; fixed spherical footprint is explicit, not auto prefab footprint.
- [x] Phase 4.8d — opt-in Population Graph on existing SplineObjectController, local JSON or JsonAsset, source slots A/B/C, shared world-frame sampling, explicit surface raycast/precise obstacle adapters, prefab slot binding, world position/orientation and authored-scale multiplier, staged instance replacement preserving previous children on preparation failure, existing Spawn/Respawn/Clear/Play lifecycle and accepted-only preview markers, graph-specific Inspector fields, offline regressions. Native Creator acceptance pending; full graph rejection diagnostics and visual editor remain Phase 4.8e.
- [x] Phase 4.8e1 — local visual typed pipeline Inspector: select nodes, replace distribution, insert/remove/reorder compatible candidate stages, structured parameter editing, strict schema/type validation, atomic rewiring and native change-dump commits; shared assets and multi-selection locked, runtime compiler parity and offline Inspector tests. Native editor acceptance pending.
- [x] Phase 4.8e2 — exact first-rejection diagnostics from evaluator stage snapshots (including density policy callback reasons), per-node flow counts and examples, read-only Analyze Placement bridge, existing selected-only gizmos for accepted/rejected markers, cache-safe defensive reports, installable PopulationGraphSetup native example script and regressions. Range uses exclusion color/category; source path omitted in counts. Shared assets remain read-only. Native Creator acceptance and authored .scene assets pending.

### Phase 5 — Runtime networks & controllers

Follower speeds, junction routing, trains/wagons, projection, triggers và connection constraints. **Exit:** deterministic routing/event tests.

- [x] Phase 5.1a — fixed-route SplineTrainController: ordered full spline legs and reverse traversal, single world-arc head, 1–128 independent cars, consistent center spacing, open clamp/stop and continuous loop wrap, endpoint/tangent validation, shared world arc and stable frame cache, runtime seek/play/pause/restart, pose preflight and best-effort rollback, native serialized fields and installable API example. Native Creator acceptance pending.
- [x] Phase 5.1b1 — fixed open route consist-wide admission: explicit endpoint junction link indices, shared SplineTrafficGate FIFO and signals, independent token per route transition, multi-junction retention until tail center plus clearance passes, blocked head stop margin, rollback of newly acquired slots, pause/disable cleanup and guarded initialization. No traffic seeks, live route edits, loop or repeated exit in this slice. Native acceptance pending.
- [x] Phase 5.1b2a — manual dynamic endpoint branching on open routes with traffic enabled, single initial leg, explicit requestJunctionExit, append-only committed route history (max 64 legs), selection replacement cancels queued token, branch locked on admission, cars follow committed history even if exit direction changes, stop at undecided endpoint and explicit finish, admission at stop margin even with small timesteps, rollback and offline tests. Native acceptance pending.
- [x] Phase 5.1b2b1 — fixed cyclic traffic: explicit seam junction, periodic gate occurrence ordering, rebased reservation distances after wrap, bounded one-cycle tick, tail/clearance fit, same-exit prior-lap guard, completed-lap counter and bounded fixed route history; repeated-loop and seam regression tests. Native acceptance pending.
- [x] Phase 5.1b2b2 — dynamic route history compaction: discard fully cleared prefix only after pose and traffic commit; remap occupied/FIFO tokens without reacquiring; retain absolute public distance and expose history origin/discard count; revisit cleared splines with bounded 64-leg active window; repeated cycles and held/queued remap tests. Native acceptance pending. Automatic route planning and physical coupler/bogie/orientation smoothing remain separate extensions.
- [x] Phase 5.2a — itinerary SplineRouteController over existing SplineAnimate planner/arrival/traffic: 1–128 serialized waypoints, normalized/distance/t coordinates, dwell, repeat without teleport, deferred startup, pause/resume/stop, exclusive controller ownership, read-only single waypoint diagnosis, unreachable/external interruption status, lifecycle cleanup and installable example. Native acceptance pending.
- [x] Phase 5.2b — read-only greedy itinerary preview with carried arrival direction (including zero-step legs), repeat return, cumulative distance/cost/switch/dwell totals, optional start preflight, bounded opt-in waypoint retry and explicit replan, no FIFO reset during active traffic wait; pure math and offline runtime regressions. Native acceptance pending; global itinerary optimization and scene gizmo preview remain extensions.
- [x] Phase 5.3a — independent follower Group Controller: shared exclusive route/group lease, batch preflight, deferred start, pause/resume active subset, group runtime speed factor without serialized mutation, live traffic/headway/proximity counts, cleanup and installable example; existing follower motion and traffic retained. Native acceptance pending.
- [x] Phase 5.3b — group formation preview and explicit stopped same-spline non-traffic initialization, normalized/world range and fixed world spacing, wrapped/full closed ranges without duplicate seam, backwards ordering, fit/overlap validation, best-effort pose rollback, centerline gap diagnostics, optional initialization on group start, examples and offline tests. Native acceptance pending; active spacing remains existing headway/proximity rather than forced repositioning.
- [x] Phase 5.4a — opt-in SplineSpeedProfile: spatial rate keys, step/linear/smooth interpolation, overlapping/wrapped rate-cap zones, source filtering, cached validated curves, combined modifier/group playback rate ramp, bounded substeps with existing traversal/traffic authority, lifecycle resets, diagnostic and example. Native acceptance pending.
- [x] Phase 5.4b1 — opt-in sampled World centerline lookahead for upcoming rate-cap zone entries, forward/reverse and closed Loop seam, minimum overlapping approach envelopes, default 0 preserves 5.4a, shared World arc cache, integration regression cases. Dimensionless rate envelope, not a physical acceleration guarantee. Native acceptance pending.
- [ ] Phase 5.4b2 — boundary-aware zone sampling (narrow zones, junction and seam transitions).
- [ ] Phase 5.4b3 — speed profile scene gizmo diagnostics.
- [ ] Phase 5.5 — Lane Changer.
- [ ] Phase 5.6 — Event Track.
- [ ] Phase 5.7 — Object Pooling.

### Phase 6 — Quality & release

Editor 3.8.8 smoke checks, example scenes, docs, performance, breaking-change migration review. Chỉ release khi manual Editor validation hoàn tất.

## Chính sách legacy

Chỉ xóa khi đã xác định call sites, API thay thế, tests và migration. Không tự ý đổi enum/default đã serialize (`cornerMode=Legacy`, `repeatLayout=Count`, `SplineMorph.space=World`...) khi chưa có data migration. Các hàm `rebuild()` tạo geometry vẫn canonical, không phải legacy alias.

### Phase 1.3 — Đã chuyển mesh/modifier drawers

- [x] Road, Extrude, MeshDeform, JunctionMesh, ObjectBender cùng dùng SplineMeshDrawers.
- [x] SplineModifiers vẽ hoàn toàn trong Editor/SplineModifierGizmos.
- [x] Core/SplineMeshGizmos chỉ xây dựng dữ liệu wireframe, không truy cập globalThis.
- [ ] Manual Cocos Creator Scene validation: draw depth, selected components, nested model transforms và Undo/Redo.

### Phase 2.2b — Interactive group Move (preview)

- [x] Thêm Move handle World trên Knot đầu tiên trong nhóm được chọn (Cocos-Gizmos v3; không dùng legacy direct callbacks).
- [x] Dịch nhóm theo cùng delta World, giữ Knot ngoài selection đứng yên, Cancel rollback, no-op không snapshot.
- [x] Node mock tests cho multi-select, bất biến vị trí, nhóm thuộc spline khác và 2D constraints.
- [ ] Native Undo/Redo, prefab overrides và Scene mouse picking cần smoke test Cocos Creator 3.8.8.
- [ ] Surface snap/align, drag nhóm trong XY2D/XZ2D và materialization/migration tangent-handle nodes.

### Phase 2.3 — CPU Surface Snapping (preview)

- [x] Raycast MeshRenderer đích được chọn, World-Y, CPU triangles, hỗ trợ mesh transform và toàn batch rollback/snapshot.
- [x] UI chọn surface target, refresh, cast height/drop; không phụ thuộc Collider hoặc copy Unity code.
- [ ] Surface snapping lên Physics Terrain/Collider tùy chọn, surface normal orientation, 2D projected snap và Cocos Editor 3.8.8 smoke tests.

### Phase 2.4 — Surface Normal Alignment (preview)

- [x] Triangulated World normal với winding correction; từ chối tam giác quá dốc khi Align bật.
- [x] Opt-in checkbox (mặc định tắt); Knot +Y theo normal, giữ hướng heading +Z nhiều nhất có thể.
- [x] Đồng bộ position / local rotation trong một batch, snapshot + rollback, không thay rotation ở chế độ cũ.
- [x] Unit + integration tests cho orientation với parent rotation, rotation-only, cancel khi lỗi.
- [ ] Cocos Editor 3.8.8 smoke tests, bảo toàn hình dạng spline khi dùng Knot-space tangent (hiện cần kiểm tra thủ công).

### Phase 2.5 — Crease-aware Smooth Surface Normals

- [x] Barycentric smoothing normals tại các đỉnh **chung chỉ số** theo trọng số diện tích, có crease threshold 0–89 độ.
- [x] Mặc định tắt; tránh thay đổi path Surface Snap cũ, không tác động vị trí hit.
- [x] Unit tests cho ranh giới tam giác, crease=0, hard seam, mesh nonuniform scale, opt-in và Scene contract.
- [x] Opt-in seam-position adjacency welding (1e-5 World units) for UV-split MeshRenderer vertices; keeps positions, mesh indices and crease guard unchanged. Native Creator 3.8.8 acceptance pending.

### Phase 2.6 — Collider & Terrain support (preview)

- [x] Physics 3D Collider target selection, strict raycast hit isolation, TerrainCollider/primitive Collider support where physics is active.
- [x] No hit => no edit; optional hitNormal orientation, mesh-only smoothing, Node regression/Scene contract tests.
- [ ] Verify 3D Physics Scene behavior and TerrainCollider in Cocos Creator 3.8.8; native Undo/Redo and prefab overrides.

### Phase 2.7 — Transaction Read-back / Undo safety

- [x] Editor-only atomic batch transaction, stale-data guard và Scene transform readback trước/sau khi ghi.
- [x] Snapshot false/throw rollback, reverse property rollback, single snapshot after verify, tests cho partial write/rotation failures.
- [ ] Native Cocos 3.8.8 Undo/Redo thực tế, Prefab overrides và các interactive Gizmos transactions cần live Editor integration.

### Phase 2.8 — Unified Gizmo Transactions (preview)

- [x] Tách lifecycle snapshot/cancel/rollback của Group Move, Tangent và Rotate sang Editor-only SplineGizmoEditTransaction.
- [x] No-op/duplicate End không yêu cầu snapshot; xử lý lỗi IPC đồng bộ và bất đồng bộ, bảo vệ gesture mới và Scene changes.
- [x] Tests với interactive Gizmos mocks cho Cancel, failed snapshot và tự kiểm tra lifecycle.
- [ ] Cocos Creator 3.8.8 native Undo stack, prefab override và tích hợp onControlBegin/End cần kiểm chứng thực tế.
- [ ] Mở rộng backend nếu cần sang native scene undo transaction API chính thức sau khi có kết quả smoke test.

### Phase 2.9 — Gizmo Scene Invalidation (preview)

- [x] Guard selection, group membership, reparent, deleted/disabled Knot and disabled spline at begin/update/end, redraw and pending rollback.
- [x] Restore only surviving group knots still under original parent; avoid stale async rollback and snapshots on invalidated edits.
- [x] Node mock regression tests for selection change, reparent/delete and disabled component.
- [ ] Real Cocos 3.8.8 teardown callbacks, Undo history grouping and prefab overrides require on-device Editor tests.

### Phase 2.10 — Interactive 2D Group Move

- [x] Multi-selected Knot Group Move 2D: XY handles X/Y/XY, XZ handles X/Z/XZ, không tạo Node proxy.
- [x] Local planar delta từ World drag point, giữ nguyên hidden axis, parent rotation/nonuniform scale, Cancel và transaction snapshots.
- [x] Node/planar math tests for XY2D/XZ2D, tilted parent, no-op, snapshot failure and dimension change.
- [ ] Native Cocos Creator 3.8.8 mouse picking/Undo/Redo, prefab overrides, tilted-container local-axis visual fidelity.

### Phase 2.11 — True local-plane Group Move visualization

- [x] Bổ sung `frameNode` vào Cocos-Gizmos v3 (renderer, picking, Move solver cùng local basis).
- [x] XY2D/XZ2D Group Move sử dụng Container-local port + frame, giữ hidden axis và immutable group baseline.
- [x] Có capability check để ẩn handle 2D khi dependency chưa nâng cấp; không thêm legacy code.
- [x] Unit tests frame axes, nonuniform scale/rotation, cancellation/no-op và rollback.
- [ ] Native 3.8.8 Editor mouse picking, one-gesture Undo, Prefab overrides, multi-scene teardown vẫn cần smoke test.

### Phase 2.12 — Single-owner Group History + Prefab-aware Scene path

- [x] Extensible `history:'external'` in Cocos-Gizmos v3: no duplicate native SelectGizmo Undo hooks for computed group ports.
- [x] Real Node.position writes through Editor scene set-property (record:false) and one snapshot per completed changed Group Move.
- [x] Typed, prevalidated group commit, serialized reverse rollback, stale and reparent protection, Node integration regression tests.
- [ ] Real Editor 3.8.8 Undo/Redo one-gesture acceptance, Prefab Instance/nested overrides, apply/revert and on-disk save/reopen validation.
- [ ] Upgrade single-Knot Tangent/Rotate to serialized transaction after Group acceptance.

### Phase 2.13 — Individual Knot Tangent / Rotate serialized history

- [x] Tangent Move external-history path writes component mode and tangentIn/out through scene set-property, plus changed handle Node position.
- [x] Knot Rotate writes Node.rotation local quaternion rather than editor-only World Euler; q/-q equivalence.
- [x] Component index from query-node, one snapshot, no-op/Cancel skip, partial failure rollback and stale handle guards.
- [x] Regression tests for serialized field paths, AutoSmooth→Broken, handle position, local quaternion and IPC failures.
- [ ] Native Creator 3.8.8 Undo one-gesture consistency and Prefab overrides, especially Nested Prefab/handle Nodes.

### Phase 2.14 — Cross-Knot serialized history coordination

- [x] Per-SplineContainer WeakMap history gate for Group/Tangent/Rotate, including different Knot drawer instances.
- [x] Hold through async set-property/snapshot/rollback, release on Cancel/no-op/error.
- [x] Suppress stale handle selection during pending Scene commits; unrelated splines remain independent.
- [x] Invalidate original spline arc LUT on transaction completion; existing road/extrude/deform revision observers can respond after Editor restores state.
- [x] Regression tests for pending snapshot races and rollback-before-release.
- [ ] Native Editor undo-stack grouping, Prefab Instance overrides, Editor update cadence and actual multi-scene lifecycle still need Creator 3.8.8 smoke testing.

### Phase 2.15 — Scene Lease / stale IPC fail-closed

- [x] Capture original SplineContainer→Scene ancestry at Gizmo begin, validate during drag/end and async commit.
- [x] Stop follow-up query/set-property/snapshot/rollback after Scene unload, ancestor reparent or same-UUID nested Prefab root replacement.
- [x] Preserve normal single-snapshot flow while Scene lease remains valid; tests cover delayed IPC and active Group Move invalidation.
- [ ] Actual Creator native Scene-switch cancellation, Undo/Redo history and Nested Prefab override/apply/revert still require live validation.

### Phase 2.16 — Axis Distribution

- [x] Distribute marked Knot coordinates evenly on an active axis, preserving extremes and hierarchy.
- [x] Local/World 3D and Local 2D constraints; shared batch transaction and regression tests.
- [ ] Creator native Undo/Redo and Prefab smoke test; arc-length redistribution is separate.

### Phase 2.17 — Local Arc Distribution

- [x] Distribute interior Knot positions along original local arc, contiguous open spline selection, reversed and 2D constraints.
- [x] Reuse evaluator and batch transaction; geometry revision guard and regression tests.
- [ ] Closed-loop redistribution, World arc metric, shape-preserving resampling and native Creator acceptance.

### Phase 2.18 — Closed / World Arc Distribution

- [x] Closed partial run across seam and full-loop distribution, Local/World metric with transformed chord lengths.
- [x] Runtime metric LUT, revision/order/matrix preflight and planar constraints.
- [ ] Shape-preserving resampling and native Creator acceptance.

### Phase 2.19 — Non-destructive Resample Spline

- [x] Resample with Knot count or target spacing and Local/World arc metric; open/closed and planar geometry supported.
- [x] Fit independent Bezier handles, sample-estimated maximum deviation threshold, bounded 128 new Knots and 65536 source LUT samples.
- [x] Editor creates a separate sibling spline with copied root transform and spline settings; source topology/Prefab untouched, best-effort failure cleanup and source revision checks.
- [x] Pure math and Editor-message integration tests.
- [ ] Certified continuous geometric error bound, native Undo/Redo for structural edits, orientation/child-component copying, destructive source replacement.
- [x] Phase 2.20: Simplify spline greedy (open/closed, local/world metric), giữ endpoint/closed anchor, new sibling copy; sampled tolerance (not certified continuous bound).
- [x] Phase 2.21: retained Simplify Knot names and local rotations via source-index mapping. New Broken tangents stay spline-local; source Prefab handles and arbitrary child components are not cloned.
- [x] Phase 2.22: safe Simplify Knot copying: preserve tension/tangent-space/edit flag, rebuild independent handle nodes and cc.Node references, convert fitted tangents into knot-local coordinates where required, and guard stale source metadata.
- [x] Phase 2.23: whitelist-only Container appearance cloning (Gizmos visibility/color/density), source metadata in topology fingerprint, and per-copy counts of omitted extra components/children. No generic component cloning or source references.
- [ ] Native 3.8.8 acceptance: verify recreated handle refs persist through save/reopen, Prefab overrides and Undo/Redo. Extra components and unrelated child nodes are not copied.
- [ ] Phase 2.20 acceptance: Cocos Creator 3.8.8 Undo/Redo, Prefab overrides, Scene save/reopen; performance on 128 Knot closed splines.

- [x] Native 3.8.8 feedback — Train example Boolean decorator metadata: explicit CCBoolean for wrapClosed, backwards, loopRoute, playOnStart; safe byte-exact installer upgrade preserving UUIDs and user edits; native verification pending.

- [x] Native 3.8.8 feedback — audit all serialized component/example property decorators: CCFloat for prefabWeights and conflictRoadHalfWidths, CCInteger for greenExits, correct stale Train HTML examples; TypeScript AST regression rejects JS primitive constructors, empty decorator calls and ambiguous array/null defaults. Native verification pending.

- [x] Native 3.8.8 feedback — remove redundant scalar ValueType decorator metadata on 20 instantiated Vec3/Color properties across 11 runtime files; preserve tooltip, names, initial values, array/reference metadata and .meta UUIDs. Extend AST property regression with positive and negative fixtures. Native verification pending.
