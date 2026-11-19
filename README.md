# Cocos Splines v2.0.0 — clean development branch

An independent spline authoring and procedural geometry extension for
**Cocos Creator 3.8.8**. The historical 0.9.x components, commands, Inspector
panels, migration code and tests were removed from this **breaking** branch.

**Required Editor dependency:** install and enable
[Cocos-Gizmos v3 (>=3.0.2)](https://github.com/PhuNope/Cocos-Gizmos)
**before** installing Cocos Splines. Each Scene Drawer uses the
official `@registerGizmos` decorator from
`db://cocos-gizmos/RegisterGizmos`. No SDK is copied.

## Components

| Component | Purpose |
|---|---|
| `Spline.Path` | Shared pure CCClass Knot records and spline interpolation |
| `Spline.Road` | Constant width / fillet / adaptive road profile / markings / UV |
| `Spline.Extrude` | Independent profile sweep |
| `Spline.MeshDeform` | Authored source-mesh deformation and UV preservation |
| `Spline.Junction` | Independent 3/4-way trimmed road intersection |
| `Spline.Follower` | Distance/time traversal, Clamp / Loop / PingPong, banked orientation |
| `Spline.Projector` | Closest point in world metric, optionally snap a Node |

Every component consumes `Spline.Path`; none creates child Knot Nodes.
Road, Extrude, Deform and Junction share a safe temporary-preview / explicit
Bake workflow. Projector and Follower never overwrite a Baked Mesh.

## Test and installation

Run `npm run build && npm run check:v2 && npm run check:v2-editor &&
npm run verify && npm test && npm run pack:v2-test`.
Commits containing `[test-build]` on `v2.0.0` stage a downloadable
Actions ZIP, **not a GitHub Release**.

See [architecture](docs/v2/ARCHITECTURE.md),
[Gizmos registration](docs/v2/GIZMOS_ARCHITECTURE.md),
[unity parity and gap audit](docs/v2/UNITY_FEATURE_GAP.md) and
[native Creator testing](docs/v2/TEST_BUILD.md).

**Breaking:** 0.9.x Scenes and serialized class IDs are not migrated.
Native Undo/Prefab, mouse picking and Road/Junction material seams need
verification in the actual Windows Creator 3.8.8 Editor. Headless tests
cannot certify those behaviors.
