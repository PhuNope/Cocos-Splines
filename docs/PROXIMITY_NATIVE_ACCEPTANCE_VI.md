# Cocos Splines V2 — Proximity native acceptance & profiling (Creator 3.8.8)

**Status:** Manual native validation pending. Headless Node.js tests and CI are not substitutes for running Cocos Creator with the project's actual physics backend.

## 1. Environment record

Before testing, write down Creator version (target 3.8.8), platform (Editor Preview / Web / native build), physics backend, operating system, CPU/GPU, canvas frame cap, target FPS, dependency versions, plugin commit SHA and test scene revision. Verify the Cocos Gizmos dependency is installed. Perform the same sequence on each backend used by the project; do not assume identical shape scale semantics.

## 2. Minimal reproducible scene

Create a 3D scene with a SplineContainer (straight line, bent section and cross-spline junction) and two SplineAnimate followers with distinct Target nodes. First leave all proximity options disabled to confirm baseline traversal. Then enable **Enable Proximity Avoidance** on both and set Radius and Safety Gap explicitly. Test with 16 samples; repeat with 2 and 64 samples on sharp bends. Enable **Proximity Predict Agents** and use a 0.25-second horizon, testing zero, approaching, receding, side-crossing and opposite-heading velocity.

Use visually distinct, temporary nodes to show follower positions. Do not add a Rigidbody unless the test intentionally compares the physics response: this feature performs admission/preview avoidance, not physical collision resolution.

### Collider matrix

| Shape | Setup | Expected behavior to inspect |
|---|---|---|
| Sphere/manual | Radius 0.5 on both followers | Static separation; blocked/cleared events only on state changes |
| BoxCollider / World AABB | Rotation and local center offset | AABB fallback matches reported worldBounds |
| BoxCollider / OBB opt-in | Rotated long/flat box; nonuniform orthogonal scale | Collision at narrow box geometry, less false-positive at AABB corners |
| CapsuleCollider | X, Y, Z directions; shifted center, uniform scaling | Contacts with cylindrical body and end caps; unsupported/sheared transforms fall back |
| MeshCollider | Indexed, non-convex, readable mesh asset (Allow Data Access) | Double-sided triangle contacts; BVH cache stable when mesh/transform stable |
| MeshCollider fallback | Convex mode, unreadable, oversized or unsupported mesh | Safe World AABB or manual sphere fallback, no missing obstacle/crash |

For each case, compare stationary and moving obstacle scenarios, seek and pause/resume, disable/enable, destroy, changing Target, and scene unload/reload. Verify that invalid bounds and expired references never leave ghost obstacles. Pay special attention to mesh center offsets, submeshes, transform changes, and backend-specific worldBounds inflation.

## 3. Prediction acceptance

1. Move follower A and B toward each other on the same path; confirm the measured velocity and the earlier predicted stop versus static mode.
2. Move A and B across perpendicular splines at the same height and repeat with a bridge at Y=3. Confirm vertical separation is respected.
3. Move an agent rapidly into the search volume from outside. Verify Broadphase candidates include the approaching agent.
4. Pause, seek, teleport and change splines. Verify the old velocity is cleared before the next query.
5. Test low and high frame intervals, high scene density, and sudden turn/acceleration. Note that linear prediction is **not** guaranteed under nonlinear motion or unordered client updates.
6. Disable all opt-in proximity toggles, reopen the scene, and verify that the original behavior is preserved.

### Advanced acceleration and rotation-envelope acceptance (preview)

With both followers explicitly enabling **Proximity Predict Agents**, separately toggle **Proximity Predict Acceleration** and **Proximity Predict Rotation Envelope**. The two advanced fields must remain OFF for existing serialized scenes.

1. Run a straight follower at two controlled speeds over successive frames; check that acceleration is unavailable after the first observed frame, then becomes the delta of World velocity divided by frame seconds. Invalid/out-of-range acceleration must not persist.
2. Apply acceleration towards and away from a crossing follower, repeat with minimum 2 and maximum 64 sweep samples. For a constant-acceleration path the inflated chord prediction must not miss contact even with two samples; it can report an earlier stop.
3. Rotate a non-spherical BoxCollider/OBB around its World orientation while a follower passes near its swept area. With rotation-envelope ON, check for conservative bounding-sphere blocking. With OFF, verify the existing narrowphase remains unchanged. This is *not* an exact rotated OBB/Mesh sweep and may cause false positive stops.
4. Repeat with offset child colliders and dynamically updated MeshCollider geometry. The envelope follows the **registered World shape center** and does not model orbiting a remote pivot exactly; record any observed discrepancy.
5. Pause, seek, reverse, teleport, disable and switch splines after measuring acceleration/angular speed. Verify registry resets all advanced motion fields. Reload the scene, change opt-in switches at runtime and ensure stale prediction cannot reappear.
6. Record accelerated candidate and rotational-envelope candidate counts plus prediction horizon in telemetry. Compare Editor Preview and target-platform builds; neither physics authority nor client/server synchronization is implied.

## 4. Profiling workflow

### Headless (CI / local Node.js)

Run:

```bash
npm install --no-save --no-package-lock --ignore-scripts typescript@5.9.3
npm run profile:proximity
```

The script checks complexity ceilings deterministically and writes `builds/proximity-profile-v2.json`. It logs p95 **Node.js runtime observations only**, not Editor frame time. The CI workflow uploads the JSON separately from the ZIP preview. Inspect `lastCandidates`, `lastBvhNodes`, `lastTriangleTests`, `lastFallback` and `lastPredictedCandidates`.

### Creator 3.8.8 query timing

During a representative gameplay session, the project can opt in at runtime to the existing `SplineProximityRegistry` singleton (use the correct relative import from the project's scripts):

```ts
splineProximityRegistry.startProfiling(() => performance.now(), 2048);
// Run at the target frame rate under the chosen physics backend.
const partial = splineProximityRegistry.getProfilingSummary();
// After the capture:
const result = splineProximityRegistry.stopProfiling();
console.log(JSON.stringify(result, null, 2));
```

The profiler is **OFF** by default; its ring buffer is bounded and `clear()` resets samples. This timer covers only `SplineProximityRegistry.limit()`. For full-frame cost, also use the Creator Profiler and capture total frame CPU, graphics/GPU, memory, allocations, GC and physics. In particular, a moving MeshCollider can rebuild its BVH outside the measured `limit()` duration, so do not attribute that cost to the limit-timer alone.

Collect at least three comparable runs each with 100 / 500 / 1,000 agents, before and after enabling prediction and with a representative static mesh. Record p50/p95/max, fallback rate, candidate-pruning fraction, BVH node visits, triangle tests, memory growth over 2 minutes and frame-rate stability. Decide performance budgets from the *actual target hardware*, not generic CI latency values. If a large velocity horizon expands the query beyond the cell budget, fallback is correct but may be expensive; record it rather than suppressing it.

## 5. Acceptance gates and remaining blockers

- Headless CI must pass TypeScript, verify, regression, deterministic proximity complexity gates, and ZIP preview packaging.
- Native Creator 3.8.8 scene must save/reopen, instantiate, and survive component enable/disable without stale registry state. Validate actual 3D Collider.worldBounds semantics per backend and visible Gizmos/Inspector options.
- Compare Physics backend contact shapes with the geometry used by SplineProximity for Box, Capsule, and Mesh, including scales, convex settings and transformed children. Document disagreements instead of silently claiming parity.
- Measure representative load with Editor Preview and a target-platform build; require an owner-approved latency/memory budget before treating performance as production-ready.
- Native Undo/Redo, Prefab overrides and physical collision resolution are **not** certified by these headless tests. Multiplayer server authority and acceleration/rotation-aware prediction remain separate roadmap items.

Capture screenshots, CI URL, performance JSON, backend settings and scene/package revision with each acceptance report. Do not create tags or Releases until the owner explicitly approves.
