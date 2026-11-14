# Spline Cocos — breaking clean rebuild charter

**Decision:** 2026-11-14. Owner explicitly authorizes removal of all legacy compatibility, previous component UUID/.meta identities, old menu/Inspector code, and migration logic when these constrain the new architecture.

**Development branch:** `v2.0.0`. GitHub test artifacts only; do not create tags or GitHub Releases until the owner explicitly approves.

## No compatibility debt
- Legacy `Splines.SplineContainer`, `Splines.SplineKnot`, `Splines.SplineRoad`, `Splines.SplineExtrude` and 0.9.x scene serialization are **not** a compatibility target.
- New component `SplinesV2.SplinePath` owns authored spline data. Road, Extrude, Deform, Junction, Placement and future followers are consumers. Separate imported or shared mesh assets stay output resources.
- A UUID/meta is necessary for each **new** TypeScript asset in Cocos Creator, but UUIDs from the legacy codebase are not reused. Delete/suppress old files from the final package.
- Ship only `assets/splines-v2` in the test ZIP, with v2-only `dist/v2/clean-main.js`, `dist/v2/clean-scene.js`, a minimal Inspector UI and v2-only Editor message manifest. Legacy source may remain in Git history but must never load in the installation.

## Intended architecture

```text
SplinePath
  Knot / Tangent / curve type / closed / topology
  arc-length cache + parallel-transport frames + distance queries
  Gizmos v3 edit sessions, native Scene HUD and revision notifications
            |
       Spline consumer graph
  +---------+-----------+------------+-------------------+
  | Road    | Extrude   | MeshDeform | Junction/Network  |
  | width   | profile   | source UVs | exact cut profiles|
  | curb/UV | normals   | repeat     | trim + connection |
  | sidewalk| material  | bend       | markings          |
  +---------+-----------+------------+-------------------+
            |
     deterministic MeshData V2
            |
  Temp Scene Preview / glTF Bake / Collider Adapter / Runtime Data
```

**Source of truth:** knot transforms belong to the Path; no Road-owned duplicate Knot list. Source-spline revisions invalidate consumers, not editor viewport redraw alone. Handle start/update/end/cancel (Cocos-Gizmos branch `v3`) must yield deterministic preview and correct Escape rollback.

## Implementation plan / gates

| Step | Work | Acceptance |
|---|---|---|
| A. Clean installable extension | New main/scene entrypoints, no old assets/meta/menus/Inspector registrations | ZIP unpack has no `assets/splines`, no `Splines.*` classes in manifest; clean action smoke |
| B. Authoritative Path & Gizmos | Move knots, topology, tangent controls, change tracking and gizmo ownership to Path | Road/Extrude/Deform get the identical path snapshot; Undo/Cancel and delta notifications tested |
| C. Independent mesh generators | Remove inheritance `Extrude extends Road` and `MeshDeform extends Road`; add common MeshGenerator/BuildCoordinator | Consumer-specific properties only; same mesh pipeline and Bake; no hidden geometry generation in Play |
| D. Road geometry modernization | Stable constant-width fillets, adaptive continuous fallback, source mesh bending, no overlapping/folded triangles, continuous UV U/V | Exact three-knot and hairpin regression, seams and UV0/UV2, glTF checks |
| E. Junction & terrain networking | Road trim, exact profile and material seams, sidewalk boundaries, Terrain adapter, markings, lane graph | 3/4-way + elevation/crossfall tests, no cracks or inversions, real Creator Scene smoke |
| F. Editor production readiness | Scene Gizmos, direct Node Transform, Undo/Redo, save/reopen, collider, UV2/lightmap, recipe demos | Cocos Creator 3.8.x visual/manual validation |
| G. Release preparation | Documentation, migration-free clean install instructions, beta and RC | **Only** after owner approves tag/release |

## Current verified scope

A is implemented at the **packaging and Editor entrypoint level**, with automated tests. B is partially implemented: `SplinePathV2` can feed linked Roads, while older Road-local Knot controls remain in the code temporarily and a Road still owns edit handles. C–F are not completed by the clean ZIP. It is **not** yet a full redesign of all geometry features.

## External library references

- **Cocos-Gizmos branch `v3`** is directly accessible and has been inspected for `onGizmoHandles`, `onGizmoChanged`, `Gizmos3D.move`, indexed Vec3 handles and HUD.
- **ToolBuddy.zip** and **SplineArchitect.zip** were supplied earlier in the wider project, but their raw ZIP files are not currently mounted or returned by this conversation's file/library lookup. Do not pretend to have re-read them during this checkpoint. Re-attach them to permit a line-by-line feature extraction, algorithm comparison, and documentation of their reusable ideas; no proprietary source should be copied blindly.

The project deliberately prioritizes safe geometry, independent components, and clean Editor behavior over old-scene compatibility.
