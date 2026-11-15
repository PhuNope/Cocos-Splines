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
| 11. Editor production hardening | Partial (recordable Knot topology alpha) | Pure Vec3 Path topology now writes Creator typed IProperty array dumps with record:true, with mock history-replay and onRestore consumer-relink tests. Gizmos/Inspector previews remain. Native Undo/Redo, save/reopen, prefab overrides and collider/lightmap still need real Creator certification. |

| 12. Alpha → Beta → RC → Release | Not started | Explicit user approval required before tag or GitHub Release |

**Editor UX fix (2026-11-14):** Spline V2 custom Inspectors no longer show the giant bottom explanation/status log. Button errors and the explicit ConstantWidth fallback notice go to the Editor Console. For a tight 3-Knot ConstantWidth Road that cannot fit its requested tangent radius, the default `Short Knot Mode = Auto Continuous` rebuilds a single continuous UV strip with locally adaptive width instead of failing. `Strict ConstantWidth` preserves the fit error. Auto fallback is **disabled when Junction Start/End Trim or Road Sidewalk is enabled**, because those require a fixed-width seam. Real Creator viewport validation remains pending.

## Current checkpoint

**Checkpoint 9 / 12 (in progress): Road-length Sidewalk V2 (opt-in) now derives left/right slot-5 bands from exact open ConstantWidth Road curb rings, including trimmed endpoints, U/V longitudinal Road texture and per-vertex flat/Terrain height. An opt-in Junction join mode uses the curb-top lateral tangent to align 3D outer endpoint positions and interpolates Repeat-UV U phase between the matched Road cut edges. The clean rebuild does not migrate old Road-local Knot scenes. This is bounded mesh topology only: no automatic road graph/Boolean union, terrain mesh modifications, crossing/accessible ramp certification or actual Cocos Creator visual scene validation.** This is a feature checkpoint, not a percentage of all work. Passing automated CI does **not** constitute real Cocos Creator visual certification.

## Editor Undo-ready Knot topology checkpoint (2026-11-15)

- Custom Path Inspector Add/Insert/Duplicate/Remove/Move buttons now
  plan pure **Creator IProperty/CCClass dumps** and commit the entire
  Knot record array once via `scene.set-property(record:true)`.
  This replaces direct Scene Script mutation plus post-mutation snapshot
  for authored topology; all position, tangent and Roll fields are copied.
- Active Knot selection is a separate non-recorded property change; it
  does **not** rebuild all linked generator previews.
- `SplinePath.onRestore()` drops stale Gizmos/HUD drag targets after
  Undo/reload and forces linked temporary previews. Generators can
  rebind a restored Path Source on their `onRestore()`, dispose stale
  temporary meshes and retain their saved Baked Mesh.
- CI covers typed array-dump mutations and simulated history replay,
  Editor message wiring, restored record identities and generator
  relinking. **Actual Creator history/dirty/Prefab, Scene reopen and
  computed-proxy Gizmos Undo/Redo remain uncertified.**
- [Editor Undo workflow and acceptance](EDITOR_UNDO_WORKFLOW.md).

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

- `SplinePath.knots` now holds pure serialized `SplineKnot[]`
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

- `SplinePath` now stores tangent data directly inside each serialized Vec3 Knot record, with Auto/Free/Aligned/Mirrored modes and visible In/Out handles (selected Path only).
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
- `SplinePath` is now the owning Gizmos edit target. Linked `SplineRoad` hides its old Knot handles and receives Path editor updates via registered consumers. The Path has its own Scene HUD and indexed multi-Knot points.
- The repository still contains historical 0.9.x sources for reference, and the rewritten pure geometry modules are retained. Do not mistake a clean package for completion of all roadmap milestones. Actual Creator 3.8.x Undo/Redo/visual validation is outstanding.
- [Breaking rewrite charter / implementation plan](REBUILD_BREAKING.md).

## Gizmos naming cleanup (2026-11-15)

- Use the plain name **Gizmos** in Inspector labels/tooltips, source identifiers and documentation. The SDK implementation version is not presented as part of the Spline authoring API.
- Rename public `gizmoV3*` fields to `gizmo*`, `showSceneGizmosV3` to `showSceneGizmos`, and the bridge to `SplineGizmoBridge.ts`. The regression ensures no version-branded Gizmos identifiers appear in Spline v2 components/Inspector.
- Keep `Gizmos3D` exactly as the vendor's Scene API global; changing that externally defined name would break integration. This is an intentional breaking rename in the alpha branch, with no legacy alias or old metadata in the clean ZIP.

## Latest editor step (2026-11-14)

- `SplinePath` is the only Knot, interpolation and closed source. Road/Extrude/Deform require `pathSource`; Road's previous self-owned Knot fields and Gizmos callbacks have been removed, not hidden.
- Dragging Cocos-Gizmos handles triggers throttled live **transient** preview updates (default 100 ms). `end`/`cancel` force a final rebuild; invalid in-progress bends leave last valid preview visible. Persisted baked mesh remains unchanged until explicitly rebaked.
- Multiple Roads registered to the same SplinePath receive Editor live-preview invalidations. Validation is from automated Cocos mocks/geometry regression, not visual Cocos Creator 3.8.x certification.
- Extrude/Mesh Deform/Junction now inherit the common independent `MeshGenerator`. Path watches native Node Transform/Inspector changes and forces a settled mesh after idle; regression pass. Cross-Node Undo/Redo and real Scene save/reopen are not yet certified.

## Next recommended implementation

**Checkpoint 9, next:** certify the Road-to-Junction sidewalk seam in a real Creator 3.8.x Scene (including yaw, component import, material slot 5, foot/curb normals, save/reopen, re-Bake and Collider). Then implement network adjacency/automatic snapping, terrain mesh Boolean stitching and corner crossings. Current joins require user-linked 3-/4-way Roads with identical apron configuration and no node scale; banked intersections remain unsupported.

## Non-negotiable release gate

Keep `v2.0.0` as the development branch. No tags and no GitHub Releases without explicit user confirmation. Emit Editor-only warnings, never noisy runtime authoring logs. No automatic migration of legacy UUIDs/scenes.

## Junction Auto Trim planner (2026-11-15)

- Added a read-only world-space 3-/4-way branch scanner and per-Road safe trim proposal, based on nearest open Path endpoint, sampled endpoint direction, adjacent arm angles, Road+curb half-width, minimum cut allowance and remaining length.
- Junction Inspector now has **Check Auto Trim** and **Apply Auto Trim**. Check reports the proposal to the Editor Console, not a persistent bottom log; Apply uses Creator `scene.set-property(record:true)` on each Road's existing Start/End Trim field, then rebuilds only temporary previews. Baked assets and Vec3 Knot records are untouched.
- Strictly rejects duplicate Roads, mismatched `At End`, disconnected or vertically separated endpoints, ambiguous endpoint selections, collinear/near-parallel coincident arms, too-short Roads, non-unit Road scale and invalid values. This is not endpoint snapping or a network graph/Boolean mesh solver.
- Headless unit test covers 3-/4-way plans, randomized branch order, reversed end attachments and invalid cases. **Creator native Undo grouping, real gizmo/Inspector interaction and material seam certification remain pending.**

## Scene Road Network and Pure Vec3 Endpoint Snap (2026-11-15)

- **Experimental alpha.** Junction Inspector now offers **Check Road Network**, **Check Endpoint Snap** and **Apply Endpoint Snap**. No bottom Inspector debug/log panel; diagnostics are written to Editor Console on explicit button actions.
- The read-only network graph scans supported open ConstantWidth Road Paths in the active Scene (bounded to 10000 Nodes/256 Roads) and groups endpoints within strict position + height tolerances, excluding transitive near-point chains. It reports groups without serializing links or changing anything.
- Endpoint Snap uses 3/4 explicitly linked Junction Road branches. It validates correct `At End`, unique Road and Path sources, displacement <= `Endpoint Snap Max Distance`, flat-height tolerance and noncollapsing interior samples. It converts the Junction world center into Path-local coordinates, including rotated/scaled Path Nodes. It **does not** move Nodes or modify other Knots.
- Apply preflights every Path's typed Creator node dump, then records only changed `Spline.Knot.position` values through whole-array `scene.set-property(record:true)` writes. Other serialized values (handles, mode, tension, bank/Roll and unknown metadata) remain untouched. Each Path edit has its own Undo history entry; a multi-Path atomic Undo group is **not** claimed.
- Each Path gets a live preview refresh; the Junction rebuild is attempted, but trim or geometry validation can still refuse an unfinished Junction. Baked Mesh assets are **never** overwritten by Snap; manually rebake later.
- No automatic branch links, topology Boolean union, shared Path multi-road snap, dynamic traffic graph or native Creator Editor certification yet.

## Junction Auto Connect authoring checkpoint (2026-11-15)

- Added **Check Auto Connect** and **Apply Auto Connect** to the Junction-only Inspector. The Scene scan finds nearby open ConstantWidth Roads, chooses their Start/End endpoint within **Auto Connect Search Radius** (default 0.75 world units), sorts candidates by arm heading, and **requires exactly 3 or 4 eligible distinct Road/Path sources**. Ambiguous two-ended Roads, coincident arms, elevation-separated approaches and surplus nearby Roads are rejected instead of guessed.
- Check is read-only and reports component UUIDs, branch orientation, candidate distance and skipped invalid Roads to the Editor Console (no Inspector bottom status/log).
- Apply reads the Junction's own **Creator typed `IProperty` Branches array**, validates that links have not changed since Check, and writes the entire CCClass array once using `scene.set-property(record:true)`. Each Road reference uses the **SplineRoad component UUID**, not its Node UUID. Existing valid branch order, stop-bar and crosswalk flags are preserved; additional links append in deterministic angular order. Stale or out-of-radius linked Roads fail closed.
- Branch-index-dependent `turnGuides` and `curbRamps` block topology-changing Auto Connect; users must remove/remap them first. A no-op link plan does not create an Undo entry.
- After Apply, Junction transient preview attempts a rebuild; missing Junction Trim may prevent geometry generation and is reported only in the Editor Console. Baked meshes and pure Vec3 Knots are not modified. **Auto Connect is not Endpoint Snap or Auto Trim**: use them as separate Inspector actions.
- Geometry planner, Creator dump-transaction planner and mocked Inspector-to-Scene Check/Apply/Undo regression are added to CI and the clean v2 test ZIP. Real Creator 3.8.x component-reference serialization, Prefab overrides, Inspector focus, Undo/Redo and Scene reopen still require native certification.

## Bézier Junction endpoint tangent alignment (2026-11-15)

- New **Check Align Tangents** and **Apply Align Tangents** buttons in Junction Inspector. The algorithm is a read-only world-space planner for exactly 3/4 **distinct open Bezier Path sources** already linked to one Junction, with a center gap within `tangentEndpointTolerance` (default 0.05m). Endpoint Snap must be performed first.
- For Road Start, adjust `Knot[0].handleOut`; for Road End, adjust `Knot[last].handleIn`. The desired tangent points outward from the Junction along the first/last authored Road chord, including mild grades. Maximum handle reach is one-third of the endpoint chord, with the existing active handle magnitude preserved where safe. Steep, vertical, too-short or disconnected branch geometry is rejected.
- Auto tangent modes are **left unchanged** (the existing auto Bezier fallback already follows the adjacent chord). For a misaligned explicit Free/Aligned/Mirrored endpoint, the edited Knot changes to Free and only the active endpoint handle rotates/shortens; unused opposite handle, position, Roll/bank, tension and custom serialized fields stay unchanged.
- Check reports the plan to the **Editor Console only**. Apply preflights typed `IProperty` dumps of all linked Paths, writes one full `knots` array per changed Path through Creator `scene.set-property(record:true)`, then refreshes Road and Junction transient preview. Repeated no-op Apply records nothing; each changed Path is a separate Undo entry, **not an atomic multi-Path transaction**.
- Added pure math, serialization planner and mocked Check/Apply/Undo regressions, plus clean v2 test ZIP wiring. Still needs **actual Cocos Creator 3.8.x** validation of prefab overrides, real Gizmos interaction, surface UV/curb seams and saved scene reload.
- This is **endpoint tangent direction alignment**, not automatic G1/C1 continuity across all branches, source Path topology rewrites, material Boolean mesh stitching, junction banking, or traffic lane routing.


## Junction Road end-ring seam audit (2026-11-15)

- Added **Check Junction Seams** in Junction Patch Inspector. It performs a read-only *CPU geometry* build (not a transient GPU rebuild, Scene component mutation or AssetDB write), then compares every linked trimmed Road end-ring vertex to the generated Junction patch's actual XYZ and UV0. Profile edge duplicates at shoulder/curb material boundaries remain separate; the audit never welds or changes them.
- For **Matched Repeat UV**, a matched Road point is required to have the same UV0 modulo integer U/V tiles. The audit additionally verifies that the entire Road end ring admits **one coherent integer tile offset**, instead of independently shifting each vertex. A per-edge tile jump is detected even when each point individually passes modulo 1.
- The report contains per-branch counts and tile offset, worst position/UV deviation, zero-area triangle count, duplicate/coincident triangles and high-valence edge counts. The last two are **diagnostics only** because complex curb/shoulder splits may be legitimate; they are not evidence of a global CSG mesh manifold.
- **Strict Road Seams** is an opt-in Inspector property (default OFF) that rejects **Editor** Preview and Bake when end-ring XYZ/Matched Repeat UV integrity or non-degenerate triangles cannot be certified. It does not enable this check during gameplay, so there are no new runtime logs or mesh work. It does not alter any authored Road, Knot, UV or saved Baked Mesh.
- **World Projected UV** cannot be called matched Road UV: the check reports a non-certified seam, and strict mode rejects it. A nonzero **Patch Lift** intentionally moves Junction vertices away from their corresponding Road ring and therefore fails exact seam certification.
- New geometry regression tests use actual 3-/4-way trimmed Road Strip and Road Profile meshes (plain asphalt, shoulders and rounded curbs), deliberate Lift/UV corruption, coherent tile translation corruption and degenerate triangle injection. Cocos Creator 3.8.x on-device material/rendering and real Inspector Undo still need manual certification.
- This is a measurable **boundary seam certification step**, not Boolean mesh union, intersection crosswalk/lane continuity or a claim of global watertight multi-surface topology.


## Junction asphalt overlap detection and interior UV smoothing (2026-11-15)

- Added a bounded, deterministic **2.5D asphalt triangle overlap scan** to the Road/Junction Seam Audit. It tests *positive XZ overlap area*, handles either triangle winding and ignores triangles merely sharing an edge or vertex. For overlapping projected triangles it checks interpolated heights so separate elevated surfaces do not count as a 3D overlap. Only the asphalt material slot (0 in Junction V2) participates, not vertical curb walls or painted markings. A 2000-triangle budget prevents unbounded Editor stalls: a budget overrun is reported as **not certified**, never as a false pass.
- The audit report now includes `asphaltOverlapChecked`, `overlappingAsphaltPairs` and `maximumAsphaltOverlapArea`. Opt-in **Strict Road Seams** refuses Editor Preview/Bake when the asphalt overlap scan is incomplete or finds positive-area duplicated/intersecting asphalt triangles. This is an inspection/gate, **not automatic Boolean mesh subtraction/welding**.
- Added `Junction UV Interior Smoothing` (0..0.5, default **0**). For **plain asphalt, Matched Repeat UV only**, it applies one stable angular smoothing step to the inner Junction UV ring. Every Road end-ring XYZ, UV0, saved UV2, actual triangle geometry, indices, and material assignment stay unchanged. This reduces rapid inner-ring UV angular variations while preserving exact Repeat UV at Road boundaries. It may not eliminate every directional pattern mismatch or distortion when four differently oriented Road textures meet.
- Smoothing explicitly rejects profiled shoulder/curb Road junctions and World Projected UV until a profile-aware field can be certified; the default keeps the historical UV layout byte-equivalent. No automatic migration or runtime log is introduced.
- Added pure helper tests, actual 3/4-way Junction mesh/UV/fingerprint regression, polygon-clipped overlap tests (including raised crossings, duplicate triangles, shared edges), and end-ring seam negative cases. CI packages both new modules into the clean v2 test ZIP.
- Remaining: authoring-independent junction triangulation for narrow acute wedges, profile-aware interior UV blending, GPU material/tangent seam evaluation in real Cocos Creator, and native Editor certification of Bake/Prefab override/Undo flows.


## Cocos Creator 3.8.8 — Knot edit serialized Vec3 dump compatibility (2026-11-15)

- Fixed the Path Inspector button crash `SplinePath contains invalid serialized Vec3 Knot records` caused by assuming a single `entry.value.position.value` nesting in all `scene.query-node` results. The original tests only modeled this one form; a differently wrapped (but finite) Vec3 is **not** evidence of damaged knot coordinates.
- A shared pure `PathKnotDumpCodec` now accepts the supported type-preserving shapes (typed IProperty Vec3, direct CCClass position, doubly wrapped class property, direct Knot record, and individually wrapped numeric axes). It mutates **only** the actual vector coordinate values in cloned typed dumps, without flattening or discarding type metadata, tangent offsets, Roll/bank, custom fields, or prefab/Undo property history.
- `PathV2Dump` uses this codec for **Add, Insert, Duplicate, Move, Remove**; **Select** no longer validates the geometry of *other* knots. Invalid records fail before any recorded Scene write and now name the offending Knot index and **shape only**; raw property payloads and numeric values are not logged.
- The Inspector Knot card labels, Junction Endpoint Snap and Junction Bézier Tangent Apply now use the same vector decoder so they cannot disagree about an authored Path's nested Vec3 fields.
- This fix is **not a data migration** and does not replace saved Script component UUIDs or rewrite Scene assets. Native Cocos Creator **3.8.8** acceptance still requires testing with the exact `scene.query-node` dumps from the affected local Scene. CI has synthetic compatibility fixtures and Editor mock flows but no access to that user Scene dump.

## Local mesh generation & concise component rename (2026-11-15)

- Default generator **Coordinate Space = Local**: local Path Vec3 knots become local mesh coordinates; World mode explicitly keeps Path.world → Generator.local mapping. Shared Road/Extrude/Deform base delegates to Path with the selected mode. No Knot Node introduction and no changes to serialized Vec3 values.
- Junction Road end-ring sampling uses the Road's actual generated geometry and its Node World matrix, so endpoint snap/Auto Trim/Auto Connect and generated Junction boundaries remain consistent for Local and World. Tangent alignment and Endpoint Snap change the correct local Knot handles/position based on the Road's coordinate mode.
- Breaking rename removes V2 from **public TS component class/enum names, script file names and registered `@ccclass` identifiers**. New class identities use `Spline.*` to avoid conflicting with earlier `Splines.*` legacy scripts. Existing `SplinesV2.*` serialized scene records are not automatically migrated. Internal geometry/math helpers and test-build action names may still carry V2 for branch provenance; they do not appear as component names or Inspector labels.
- The Inspector header uses clean component names and exposes Coordinate Space for all direct Path consumers. CI uses typed mocks, so validating actual 3.8.8 Prefab/component reattachment, material assignment, UV quality and Undo/Redo remains mandatory.
