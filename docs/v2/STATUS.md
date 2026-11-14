# Cocos Splines v2.0.0 — implementation status

**Updated:** 2026-11-15 (branch `v2.0.0`). This is a **development / test build**, NOT a GitHub Release.

| Milestone | Implementation | Validation / remaining limit |
| --- | --- | --- |
| 1. Core spline / frame / curve caches | Implemented | Core regression exists; extreme cusp/degenerate-frame hardening remains |
| 2. Road surface + extrusion + material bands | Implemented | Road UV, profile, shoulder, curb, multi-material, fingerprints, glTF Bake testable |
| 3. Tight-corner Road algorithm | Implemented | ConstantWidth tangent fillets, Continuous width fit, Clip; exact 3-Knot regression; real Cocos painted-material scene still pending |
| 4. Adaptive sampling + UV modes | Implemented | Angle/chord subdivision, UV U/V, Physical/Legacy, UV2; real material render still pending |
| 5. Source Mesh Deform | Experimental implementation | Read authored UV0/UV2 and multi-submesh, repeat, Bake; real Creator FBX/glTF CPU import and normal-map certification pending |
| 6. Flat 3-/4-way Junction | Implemented (alpha) | Start/End Trim, edge-ring matched UV0, flat asphalt, separate glTF Bake |
| 7. Junction Markings | Implemented (alpha) | Independent stop bars, zebra and explicit visual turn guides; no traffic-rule/arrow solver |
| **8. Flat Junction Shoulder/Curb** | **Implemented this step (alpha)** | Full end-ring shoulder+curb material/UV match, taper into flat junction; needs real Creator shader/scene validation |
| 9. Junction 3D / sidewalks | In progress (Road sidewalk + Junction join alpha) | Opt-in Road-length left/right sidewalk bands from exact trimmed curb rings; Junction can phase-match outer Road sidewalk seams, flat/Terrain samples, UV0/UV2/glTF. Real Cocos 3.8 Editor certification, crossings/CSG and terrain cuts remain |
| 10. Lane graph / traffic tools | Not implemented | Lane arrows, legal turns, collision avoidance, junction signal/priority and vehicle routing |
| 11. Editor production hardening | Partial (Path Bézier tangents alpha) | Path owns Knot position and per-Knot authored In/Out tangent modes with dedicated Gizmos; Road uses Path only. Editor watcher and end/cancel preview validation covered by CI. Real Creator Undo/Redo/save-reopen and collider/lightmap remain. |

| 12. Alpha → Beta → RC → Release | Not started | Explicit user approval required before tag or GitHub Release |

**Editor UX fix (2026-11-14):** Spline V2 custom Inspectors no longer show the giant bottom explanation/status log. Button errors and the explicit ConstantWidth fallback notice go to the Editor Console. For a tight 3-Knot ConstantWidth Road that cannot fit its requested tangent radius, the default `Short Knot Mode = Auto Continuous` rebuilds a single continuous UV strip with locally adaptive width instead of failing. `Strict ConstantWidth` preserves the fit error. Auto fallback is **disabled when Junction Start/End Trim or Road Sidewalk is enabled**, because those require a fixed-width seam. Real Creator viewport validation remains pending.

## Current checkpoint

**Checkpoint 9 / 12 (in progress): Road-length Sidewalk V2 (opt-in) now derives left/right slot-5 bands from exact open ConstantWidth Road curb rings, including trimmed endpoints, U/V longitudinal Road texture and per-vertex flat/Terrain height. An opt-in Junction join mode uses the curb-top lateral tangent to align 3D outer endpoint positions and interpolates Repeat-UV U phase between the matched Road cut edges. The clean rebuild does not migrate old Road-local Knot scenes. This is bounded mesh topology only: no automatic road graph/Boolean union, terrain mesh modifications, crossing/accessible ramp certification or actual Cocos Creator visual scene validation.** This is a feature checkpoint, not a percentage of all work. Passing automated CI does **not** constitute real Cocos Creator visual certification.

## Interactive Roll HUD and bank guide checkpoint (2026-11-15)

- Path's Gizmos HUD now has a signed -180..180° **Knot Roll** slider
  in Knot-editing mode, with native begin/update/end/cancel phases and
  a pinned Knot identity for the entire drag.
- Changes invalidate registered preview consumers during slider
  updates, and force a final rebuild on End/Escape. Escape restores
  the original roll; no Baked mesh is silently rewritten.
- Selected Knot guide draws a banked orange Right crossbar and green
  Up vector at the original source Knot station. This is Scene-only,
  bounded and does not create additional Nodes or change meshes.
- CI checks virtual Cocos HUD events, rollback, topology interaction
  guards, guide visibility/color and Play safety. Actual native
  Editor Undo/Redo and Scene Save/Reopen remain unverified.

## Path Rotate and per-Knot banking checkpoint (2026-11-15)

- Path Inspector now exposes `Gizmos Rotation Mode`: Knots, Planar2D
  (native Z ring) or Spatial3D (native XYZ rings). The underlying SDK
  centers rotation on the selected Path Node, not an individual Knot;
  Euler updates and Escape restore use Cocos Creator Node rotation.
- A serialized `Roll Degrees` value per pure Vec3 Knot is passed into
  the immutable SplineCache and shortest-arc interpolated onto
  rotation-minimizing frames. Road, Extrude and Mesh Deform use the
  banked cross-section; original Path roll survives Road/Deform fillets.
- Regression covers 2D/3D descriptor shapes, snap, Path Euler
  cancellation, banked Road mesh/UV/Bake, closed seam and no frame
  accumulation. Creator Scene interaction, accessibility/sidewalk
  geometry and native Undo/Redo still require verification.
- [Rotate/Bank authoring](ROTATE_AND_BANK.md).

## Pure Vec3 Knot / custom Inspector checkpoint (2026-11-15)

- `SplinePathV2.knots` now holds pure serialized `SplineKnotRecordV2[]`
  (Path-local position, tangent offsets/mode and Catmull tension).
  **No child Knot Nodes, independent tangent records or legacy UUID
  compatibility**.
- Custom Path Inspector provides Add, Insert After, Duplicate, Remove,
  Up/Down, Select and per-Knot native `ui-prop` data fields. Editor
  messages and Scene snapshots wire topology buttons.
- Path Gizmos now edit the value records directly. Escape restores the
  whole Knot record; Road/Junction world endpoints are transformed from
  the Path's local coordinate system. Native Creator save/reopen and
  Undo/Redo remain unverified.
- [Pure Vec3 authoring](PURE_VEC3_KNOTS.md).

## Bézier tangent authoring checkpoint (2026-11-15)

- `SplinePathV2` now stores tangent data directly inside each serialized Vec3 Knot record, with Auto/Free/Aligned/Mirrored modes and visible In/Out handles (selected Path only).
- Handles are relative to each Knot in Path-local coordinates and are transformed correctly into each generator's local mesh coordinates; changes affect actual Road geometry, UV tessellation and explicit glTF Bake.
- Gizmos begin/update/end/cancel supports an explicit tangent-state snapshot. Escape removes newly-created manual records when returning to Auto, or restores the prior mode and offsets, so a canceled drag does not silently freeze future tangents.
- CI covers consumer conversion, modes, reorder, invalid duplicates, Play guard, Editor Inspector watcher, Path-to-Road bake and transient previews. Native Creator Undo/Redo, save/reopen and real mouse picking remain **manual acceptance gates**. [Guide](BEZIER_TANGENTS.md).

## Path-only authoring checkpoint (2026-11-15)

- Road no longer has `knots`, `interpolation`, `closed`, or Road-owned editing handle settings; **Path Source is mandatory**. Junction reads endpoints from linked Roads' Path components.
- SplinePath owns editable Knot Gizmos. Road retains only read-only centerline/edge/trim guides. The Inspector removes old controls.
- Path `update()` performs Editor-only, at-most-50ms Knot identity and world-position observation so native Creator Transform and Inspector edits trigger registered mesh generator previews. After 180ms idle it forces a final rebuild. This is covered by mocked Editor and Play tests; real Creator drag timing and Undo/Redo are not yet certified.
- [SplinePath setup](SPLINE_PATH_V2.md) · [Gizmos](GIZMOS.md).

## Breaking clean rewrite step (2026-11-14)

- The user explicitly authorized dropping legacy `Splines.*`, old component UUID/meta and compatibility/migration code. **The packaged test ZIP** now contains only `assets/splines-v2` and v2-only Editor entrypoints/Inspector/actions, with a self-contained bundle smoke test.
- `SplinePathV2` is now the owning Gizmos edit target. Linked `SplineRoadV2` hides its old Knot handles and receives Path editor updates via registered consumers. The Path has its own Scene HUD and indexed multi-Knot points.
- The repository still contains historical 0.9.x sources for reference, and the rewritten pure geometry modules are retained. Do not mistake a clean package for completion of all roadmap milestones. Actual Creator 3.8.x Undo/Redo/visual validation is outstanding.
- [Breaking rewrite charter / implementation plan](REBUILD_BREAKING.md).

## Gizmos naming cleanup (2026-11-15)

- Use the plain name **Gizmos** in Inspector labels/tooltips, source identifiers and documentation. The SDK implementation version is not presented as part of the Spline authoring API.
- Rename public `gizmoV3*` fields to `gizmo*`, `showSceneGizmosV3` to `showSceneGizmos`, and the bridge to `SplineGizmoBridge.ts`. The regression ensures no version-branded Gizmos identifiers appear in Spline v2 components/Inspector.
- Keep `Gizmos3D` exactly as the vendor's Scene API global; changing that externally defined name would break integration. This is an intentional breaking rename in the alpha branch, with no legacy alias or old metadata in the clean ZIP.

## Latest editor step (2026-11-14)

- `SplinePathV2` is the only Knot, interpolation and closed source. Road/Extrude/Deform require `pathSource`; Road's previous self-owned Knot fields and Gizmos callbacks have been removed, not hidden.
- Dragging Cocos-Gizmos handles triggers throttled live **transient** preview updates (default 100 ms). `end`/`cancel` force a final rebuild; invalid in-progress bends leave last valid preview visible. Persisted baked mesh remains unchanged until explicitly rebaked.
- Multiple Roads registered to the same SplinePath receive Editor live-preview invalidations. Validation is from automated Cocos mocks/geometry regression, not visual Cocos Creator 3.8.x certification.
- Extrude/Mesh Deform/Junction now inherit the common independent `SplineMeshGeneratorV2`. Path watches native Node Transform/Inspector changes and forces a settled mesh after idle; regression pass. Cross-Node Undo/Redo and real Scene save/reopen are not yet certified.

## Next recommended implementation

**Checkpoint 9, next:** certify the Road-to-Junction sidewalk seam in a real Creator 3.8.x Scene (including yaw, component import, material slot 5, foot/curb normals, save/reopen, re-Bake and Collider). Then implement network adjacency/automatic snapping, terrain mesh Boolean stitching and corner crossings. Current joins require user-linked 3-/4-way Roads with identical apron configuration and no node scale; banked intersections remain unsupported.

## Non-negotiable release gate

Keep `v2.0.0` as the development branch. No tags and no GitHub Releases without explicit user confirmation. Emit Editor-only warnings, never noisy runtime authoring logs. No automatic migration of legacy UUIDs/scenes.
