# Cocos Splines 2.0 — architecture (development only)

This is a **breaking, clean rewrite**, not an upgrade that promises to load v0.9.x scenes. No UUID or serialized property compatibility requirement. New algorithms will be implemented in TypeScript; proprietary Unity plugin code is reference material only.

## Subsystems

1. `src-v2/core`: pure TypeScript curve, arc length, adaptive sampling, stable frames, geometry contracts and networking. No Cocos `cc` import.
2. `src-v2/geometry`: pure mesh data, UV/normal/tangent/submesh builders, profiles, road, extrusion and deformation.
3. `assets/splines-v2`: future Cocos runtime bridge components; Inspector-only UI.
4. `src`: editor integration, AssetDB bake actions, Inspector properties, gizmos and build/validation.
5. `tests`: unit, geometry and integration tests; in-editor smoke tests required before stable.

### Layering

Runtime component -> Spline Core -> Geometry builders -> Mesh Pipeline -> Dynamic/Manual/Baked output.
Follower, Junction routing and population depend only on Spline Core, not Mesh Pipeline.

### Branch strategy

- **`v2.0.0`**: primary development branch for rewrite, not a release tag.
- **`main`**: frozen v0.9.12 stable/legacy source until approved change.
- **`dev`**: legacy development history, not v2 target.
- Never create a tag or publish a GitHub Release unless the owner explicitly approves that release.
- GitHub Actions on v2 runs validation only, including build/typecheck/tests; no automatic artifact publishing.

## First bootstrap (current)

- An independent core supporting Linear, cubic Bezier and Catmull-Rom segment evaluation, analytic tangents and adaptive arc length tables.
- Dedicated TypeScript typecheck and deterministic tests.
- Legacy Cocos components are deliberately retained temporarily as a runnable comparison baseline, **not** claimed as v2 implementations.
- `package.json` remains version 0.9.12 until a genuinely usable v2 alpha is integrated; branch naming is not a package version claim.

## Core 2 milestone: cache and frames

- `SplineCurves.ts`: Linear, cubic Bezier, uniform and centripetal Catmull-Rom; arc length error now checks quarter points so midpoint-aligned S curves do not collapse to their chord. Avoid mutating input data mid-evaluation.
- `SplineCache.ts`: clone/freeze knot data to make an explicit authoring-time snapshot; precompute segment ranges and a distance-to-parameter lookup table; rebuild explicitly when the Inspector changes knots.
- `SplineFrames.ts`: parallel transport produces right/up/tangent orthonormal frames for near-vertical splines and helices; correct accumulated loop twist at the seam. Sample a prebuilt frame table at runtime; use maxStep to bound approximation cost.
- V2 core remains engine-independent and is **not yet a Cocos Component**. Frame orientation is not an automatic collision-free mesh guarantee: tight helix pitch and excessive profile width can still self-intersect. Editor-only diagnostics and geometric safety tests are planned.
- CI remains validation only; no tag, artifact or release before owner approval.

## Mesh Pipeline 2 data foundation

- New `src-v2/geometry/MeshData.ts`: stable vertex-array and submesh index layout, material slots, UV0/UV2, area-weighted normals and UV tangents with handedness.
- New `src-v2/geometry/MeshProcessing.ts`: triangle-level chunking with all attributes preserved, geometry diagnostics without Play logging, and local-space collider triangle soup.
- New `src-v2/geometry/MeshBuildPlan.ts`: deterministic mesh+source revision fingerprints and data-only plans for Dynamic/Manual/Baked modes.
- Full guide: [Mesh Pipeline 2](MESH_PIPELINE.md). Still missing a real Cocos Mesh/AssetDB/physics bridge, so it is **not yet a functional bake workflow**.

## Engine bridge experimental vertical slice

The `assets/splines-v2` AssetDB mount mirrors `src-v2/core` and `src-v2/geometry` without changing these pure TypeScript modules. A CI regression checks mirror identity. `SplinesV2.SplineRoad` owns a transient renderer for Dynamic/Editor preview; Manual/Baked only use an imported glTF Mesh subasset. A custom Inspector triggers explicit Rebuild/Bake/Check actions through main -> scene messages. Automatic glTF subasset binding and Cocos Editor smoke validation remain open.

## Geometry and AssetDB binding follow-up

`ProfileSweep.ts` is shared by the v2 road band generator and tube extruder. It stores non-overlapping *material bands*, not guaranteed collision-free road sections or unique lightmap UV atlases. The glTF importer produces a Mesh subasset containing its primitives. `src/v2/EditorAssetBind.js` resolves this imported UUID and writes native scene dumps, with a bounded import wait and explicit retry. No Editor-only log appears at Play, and normal gameplay never invokes AssetDB. Editor integration is unverified until a Creator 3.8.x smoke test on a real scene.
