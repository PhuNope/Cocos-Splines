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
