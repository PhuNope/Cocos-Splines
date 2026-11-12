# Mesh Pipeline 2 — foundation (development, v2.0.0)

This pure TypeScript pipeline is the **engine-independent intermediate geometry representation**. It is not yet wired to `SplineRoad`, `SplineExtrude`, Cocos MeshRenderer or AssetDB. The v0.9.12 components remain a reference until the new v2 components replace them.

## Contract

- `src-v2/geometry/MeshData.ts`: `buildMeshV2(input, options?)` accepts **one array of vertices** and ordered triangle-list **submeshes**, each with an integer `materialSlot`. All vertex attributes are per-vertex: positions (XYZ), UV0 (XY), optional UV2 (XY), optional normals (XYZ), optional tangents (XYZW). Output is typed arrays and per-submesh Uint16/Uint32 index buffers.
- Default normals are area-weighted across submeshes and default tangents are Gram–Schmidt orthogonalized with UV0 sign in `tangent.w`. Supplied normals/tangents are normalized/reorthogonalized. Degenerate triangles and UVs produce finite deterministic fallback tangent/normal; they do **not** magically repair bad topology. Duplicate authored vertices for hard edges, UV discontinuities or mirrored-UV handedness boundaries.
- `src-v2/geometry/MeshProcessing.ts`: `inspectMeshV2` returns diagnostics **without printing during Play**. `splitMeshV2(mesh, maxVertices=65535)` remaps each chunk to at most 65,535 unique vertices while preserving the triangle order, submesh/material grouping, UV0/UV2, normals and tangent sign. Border vertices may be duplicated between chunks.
- `buildMeshColliderDataV2` extracts local-space triangle soup and material slots and skips zero-area triangles. **This is not a registered physics collider.** A later Editor/runtime bridge must create and dispose the correct Cocos physics resources.
- `src-v2/geometry/MeshBuildPlan.ts`: `createMeshBuildPlanV2` exposes per-chunk single-material draw-parts, 64-bit FNV-1a content fingerprints and output mode metadata. The fingerprint is a **change detector**, not a security checksum. Changing topology, material slots, UV2 or sourceRevision changes the expected fingerprint.

## Example

```ts
import {buildMeshV2} from './src-v2/geometry/MeshData';
import {createMeshBuildPlanV2} from './src-v2/geometry/MeshBuildPlan';

const mesh = buildMeshV2({
    positions:[
        {x:0,y:0,z:0}, {x:1,y:0,z:0},
        {x:1,y:0,z:1}, {x:0,y:0,z:1}
    ],
    uv0:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],
    uv2:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],
    submeshes:[
        {materialSlot:0,indices:[0,2,1]},  // asphalt
        {materialSlot:1,indices:[0,3,2]}   // pavement
    ]
});
const plan = createMeshBuildPlanV2(mesh,{mode:'baked',sourceRevision:'road-width:6'});
// plan.parts: independent single-material primitives with preserved UV2.
// An Editor adapter must write actual .mesh assets and save references before Play.
```

## Generation policy

| Output mode | Geometry updates | Play behavior | Persistence |
|---|---|---|---|
| `dynamic` | Requested explicitly or by runtime owner | May rebuild on Play by opt-in component behavior | Managed temporary mesh; release on disable/destroy |
| `manual` | Inspector **Rebuild** button | **Never rebuild on Play** | Requires stored mesh asset/reference |
| `baked` | Inspector **Bake** button | **Never rebuild on Play** | Requires AssetDB-backed .mesh and serialized reference |

These are **contracts for future components**. A `MeshBuildPlanV2` does not bake anything by itself and cannot persist scene data.

## Cocos Creator 3.8 integration boundary

Cocos `utils.createMesh` accepts an individual primitive geometry (positions, normals, UV0 and tangents), but one primitive is not a full multi-material mesh. The adapter must map `materialSlot` to a real shared Material, retain submesh order, and explicitly map **UV2** to the correct Cocos secondary UV vertex attribute (not silently discard it). The `parts` in the build plan can be used with one renderer/mesh per material draw-part initially, or a native multi-primitive Mesh packing adapter can be added once tested in Creator.

Do not copy/paste a second material or create a separate Material instance for each chunk; materials should be shared by slot. The current pipeline does **not** include an AssetDB writer or guarantee physics collider runtime performance.

### Required Cocos integration tests (pending)

1. One mesh with 2 material slots, UV0/UV2 and normal mapping, save/reopen scene.
2. A long winding road and helix with over 65,535 vertices, correct lightmap UV2 and no 16-bit index overflow.
3. Manual/Baked: verify **zero mesh generation in Play**, even after scene reload; Dynamic: verify old GPU meshes destroyed.
4. Collider physics cook and teardown, material sharing and edit-mode-only warnings.
5. Verify actual Cocos 3.8.x `Mesh` attribute layout and AssetDB serializer before enabling baked exports.

## Cocos v2 Road bridge (prototype)

- Add `SplinesV2.SplineRoad` to a Node with a MeshRenderer. Assign ordered knot Nodes in the Inspector (positions are transformed to the Road node's local coordinates).
- **Rebuild preview** creates transient meshes, never a persisted asset. Dynamic creates and releases temporary meshes in Play. Temporary child renderers are flagged DontSave/HideInHierarchy in Editor.
- **Bake glTF asset** exports a content-fingerprinted `.gltf` to `db://assets/SplineV2_...gltf` through `asset-db` main-process messages. It contains actual primitive geometry, UV0/UV2, normals, tangent handedness and material indices.
- **Important manual step:** after Creator imports the glTF, expand it under Assets, drag the generated `.mesh` subasset into **Baked Mesh**. Choose **Manual** or **Baked**. Both modes only read this saved Mesh during Play and do not run `generate()`.
- **Check bake status** compares geometry fingerprints and reports if the exported content is stale or the Mesh reference is missing. Bake does not overwrite existing assets, change material asset references, or automatically assign an imported subasset.
- First-pass strip does **not** yet join road corners, produce curbs, perform junction Boolean trim, or guarantee nonoverlapping UV2 lightmap atlases. Actual Creator 3.8.x import/save-reload remains an integration gate.

### Dynamic UV2 and Play lifecycle validation

- The Dynamic geometry adapter writes UV2 as a Cocos `customAttributes` attribute with `gfx.AttributeName.ATTR_TEX_COORD1` and `gfx.Format.RG32F` (the correct secondary-UV vertex semantic); glTF Bake writes `TEXCOORD_1`.
- `tests/v2-road-play-mode.test.cjs` compiles and exercises `SplineRoadV2` against Cocos mocks: Manual and Baked never invoke geometry generation in Play, Dynamic meshes are disposed, scene meshes are not destroyed, and Editor-only commands reject Play calls. A real Creator project test remains required.

## v2 Road profile / tube and automatic asset binding (next milestone)

- `ProfileSweep.ts` implements piecewise cross-section sweeps along rotation-minimizing spline frames. Road geometry adds shoulder and curb bands with **shared material slots**: asphalt 0, shoulder 1, curb 2. Each band has independent vertices for hard edges/UV seams.
- `SplineExtrudeV2` uses the same base rendering/persistence component with circle profile, adjustable radius/sides and convex end caps. It supports steep/helical paths. An over-wide tube can still geometrically self-intersect; no Boolean solver is included.
- Bake asks AssetDB for the imported `.gltf`'s `subAssets`. Only **exactly one** asset of type `cc.Mesh` is eligible. It sets the native scene dump `bakedMesh` field by UUID, then saves its fingerprint, URL and Baked mode via scene messages. No UUID guesses or runtime loading.
- If the glTF import is still pending or has ambiguous Mesh subassets, the Inspector reports the pending asset and exposes **Bind Imported Mesh** retry. Existing linked Mesh and its fingerprint are left untouched until a verified binding succeeds.
- Bake fingerprints and pending pointers are separate. Changes to spline/source while importing prohibit automatic binding of stale geometry. Previous glTF assets are never overwritten.
- The scene reference is tested by a serializable dump mock and Play mode generator mocks. **Actual Creator 3.8.x import, serialization and scene reload must still be verified on an installed Editor.** Do not claim production-ready baking yet.

## UV0 Longitudinal Axis: U / V

Road V2 and Extrude V2 both expose `uvLongitudinalAxis` in the Inspector (native enum **V** / **U**), next to `uvMetersPerRepeat`.

- **V (default, legacy v2 behavior):** UV0 U = across the road / cross-section (0..1), UV0 V = distance along spline ÷ `uvMetersPerRepeat`. Set texture wrap/address mode **Repeat V**.
- **U:** UV0 U = distance along spline ÷ `uvMetersPerRepeat`, UV0 V = across the road / cross-section (0..1). Set **Repeat U** for road images designed to run horizontally (along texture X).
- `uvMetersPerRepeat = 5` gives one repetition every five spline units regardless of selected axis. This is **texture UV0 only**, not a scene/world X/Y rotation.
- UV2 is **unchanged** when switching between U and V. For the tube `capEnds` use independent planar UV0 mapping on end faces.
- Switching the enum changes the generated geometry fingerprint. For Manual/Baked click **Bake glTF Asset** again; Dynamic rebuilds at next Play enable, and Editor can click **Rebuild Preview**. The material's texture sampler must be set to Repeat on the corresponding axis. A clamp sampler will not tile.
- UV0 tangents and handedness are regenerated from the chosen mapping, including shoulder/curb material bands and tube surfaces.

## Road V2: local corner JoinAndTrim

- **Corner Mode** in Road Inspector defaults to `JoinAndTrim`; `Legacy` keeps the old perpendicular sampled rings for comparisons.
- The Road strip and the Road shoulder/curb profile now share `RoadCorners.ts`: chord-based outside miter joins and a monotonic, smooth compression of the **inside** of each sharp bend. Settings are `cornerTrimSafety` (default 0.9) and `cornerMiterLimit` (default 2.5).
- Mesh UV0 is **based on the original untrimmed profile**, preserving U/V longitudinal tiling, with UV2 unchanged by the corner option.
- In the Inspector, **Rebuild Preview** replaces the visible Mesh temporarily; **Show Baked Mesh** removes the preview and restores the saved asset. A successful Bake or Bind also attempts to show the saved asset.
- **Check Bake Status** reports pinched local sections in the Inspector without Play-mode console warnings.
- This is **local bend correction**, not polygon clipping/CSG for two independent roads or for full 3D self-intersections. Extremely tight hairpins, crossing roads and helix turns still need geometry diagnostics and/or Junction Mesh v2. Never claim globally self-intersection-free road geometry.
- If a scene previously baked the old ribbon, it must be re-baked after enabling JoinAndTrim. Compare JoinAndTrim and Legacy on a safe duplicate Scene, not production data.

### Concave quad triangulation and clearance warning

The road section triangulator now checks face orientation against generated normals for each quad. When the inner edge becomes concave, it switches the diagonal rather than rendering an inverted triangle. In the rare crossed/degenerate case, only front-facing triangles are emitted. Both RoadStrip and material-banded RoadProfile share the same function; Tube Extrude remains unchanged.

The Editor-only **Check Bake Status** and **Rebuild Preview** messages also inspect distant centreline sections with a bounded 3D proximity check. A 'potential nonlocal overlap' warning means two parts of the same Road come closer than its width, so local trim **cannot** safely union them. Use a dedicated Junction Mesh, reduce width or redesign the loop. Elevated crossings separated in 3D should not be treated as intersections solely from the XZ projection.

## Road v2: resolving actual planar self-overlap (U-turn)

The earlier JoinAndTrim reduces local inner corner foldover but cannot remove a wide Road surface covering itself. **Resolve Planar Overlaps** now defaults to enabled in the Road V2 Inspector. A separate, pure TypeScript `RoadOverlapClip.ts` performs a first-surface-wins *triangle union*: spatially query previous Road triangles, subtract overlapping nearly coplanar regions, and triangulate the exposed polygons with interpolated UV0/UV2 and normals. This is different from culling back-faces: it removes duplicate coplanar Road area so textures are not drawn twice.

Material slots remain independent, with earlier asphalt faces taking precedence where cross-section bands overlap. Existing bake fingerprints update after geometry changes. The exported glTF is generated from the resolved mesh, exactly like Dynamic previews. **Show Baked Mesh** still restores a saved asset when necessary.

Limits: this is not road intersection topology generation, a full 3D Boolean, or a guarantee of seamless lane markings. First-surface-wins can leave a *texture direction seam* at the cut boundary. Height-separated overpasses, vertical walls, very steep banking and tube Extrude are left alone; non-planar intersections must be handled using junction geometry. The resolver has explicit performance caps; in extreme cases it returns the input mesh and reports that the safety limit was reached, rather than hanging the Editor.

In **Rebuild Preview** / **Check Bake Status** the Inspector reports how many source triangles were clipped. Warnings remain Editor-only, not Play runtime logs. To compare visually, disable `resolvePlanarOverlaps` and rebuild; enable and rebuild again. A previously saved Baked mesh requires a fresh Bake.

## UV0 continuity after planar Road clipping (v2 test)

The original Road v2 planar resolver removed double-covered triangles but kept the losing triangle's source UV0 on the new cut boundary. When the preserved and removed branches had different UV0 coordinates, this introduced visible texture discontinuities, even though the surface was no longer overlapping.

**Stitch Cut UV** now defaults to enabled when **Resolve Planar Overlaps** is enabled. It uses the surviving face's UV0 at each cut boundary, choosing one whole-tile phase for the entire cut edge (when the sampler is set to Repeat), and reconciles the co-located polygon-piece vertices within the same material slot. Outside cut boundaries it retains the existing spline-distance UV mapping from the legacy Road style. The operation does **not** change positions, triangle indices, material slots, or UV2; UV0 edits cause Baked fingerprints to change.

This fixes arbitrary UV phase breaks at coplanar cut edges. It **does not** make all road markings continuous through a genuine fork or crossover: the two branches can have incompatible longitudinal directions. For painted lane markings that must turn or merge through a junction, use an intersection-specific marking/decal mesh and material. Texture UV0 continuity (same sample at one point) and continuity of the *direction* of markings are different constraints; this renderer cannot solve both at a real crossroads without a junction-aware texture layout.

For debugging, compare **Stitch Cut UV** enabled versus disabled while keeping **Resolve Planar Overlaps** enabled, then click **Rebuild Preview**. Make sure texture U/V address modes are **Repeat**, and re-Bake saved meshes after changing the option. The stitching affects Road strip and Road profile (including shoulder/curb where material slots match), not Tube Extrude. Diagnostics are Editor-only.

## Continuous Road Surface: no cut UVs in a narrow hairpin

The previous `Resolve Planar Overlaps` + `Stitch Cut UV` pipeline cannot preserve directional road stripes through a wide, self-overlapping U-turn: it performs a triangle union, which necessarily discards portions of the *original spline UV mapping* and leaves a transition between incompatible texture directions.

New **Surface Mode = Continuous** (default for the v2 Cocos Road component) builds a **single uncut spline ribbon** with exactly one longitudinal UV progression and a smooth per-ring cross-section. It does **not** call the planar polygon clipping/UV stitching pipeline, even if the older checkboxes are enabled. The pure Road builders retain their default `clip` mode for legacy programmatic callers; the Cocos Inspector explicitly selects Continuous.

The geometry of a road of fixed `Width=4` cannot remain an injective strip where the centreline U-turn arms are only 2 units apart. To keep the UVs and road marking unbroken, the Continuous mode narrows the **inside cross-section near close arms**. A spatial neighbour check creates asymmetric safe widths, avoiding height-separated crossings; a forward/backward Lipschitz envelope makes the width change gradually instead of introducing sharp steps. It leaves full width on unconstrained straight sections. Initial controls: `Clearance Safety=0.35`, `Width Slope=0.65`. Increasing the clearance factor may bring back overlapping strips; if preserving full width is necessary, move the knots farther apart or increase the turn radius.

- **U/V Longitudinal UV Axis** and **UV Meters Per Repeat** work exactly as before; UV0 is generated once per spline frame, never reprojected after a triangle cut.
- **UV2 remains separate**, and glTF Bake uses the same continuous mesh as Editor Preview/Dynamic.
- Profile roads with Shoulder/Curb scale every profile band consistently so stripes and material boundaries stay attached to the same spline frame.
- **Surface Mode = Clip Overlaps** remains available for comparisons or intentionally unioned overlapping polygons; only in that mode are **Resolve Planar Overlaps** and **Stitch Cut UV** consulted.
- Editor diagnostics report constrained frame count and minimum effective width ratio; there is no new Play-mode logging.
- This is not a proof of self-intersection-free geometry for arbitrary loops, bridges, coincident centreline crossings, very steep banked roads, or full Junctions. A geometrically impossible sharp turn may still need knot edits, a separate junction mesh or authored lane markings. No claim of a perfect constant-width U-turn is made.

## Actual user 3-knot turn: preserve centre marking and smooth inner radius

Regression uses the exact Knot local positions seen in Cocos Creator:
- K0 = (-1.701, 0, -7.206)
- K1 = (-3.869, 0, 3.720)
- K2 = (5.820, 0, 4.347)
- Centripetal, Width=4, Sample Step=0.25, UV Longitudinal Axis=U, Corner Mode=JoinAndTrim,
  Surface Mode=Continuous, Clearance Safety=0.98, previous Width Slope=2.

The prior Continuous road only fitted widths based on *proximity of distant arms*. This 3-knot turn does not require distant-arm collision to be visibly broken: the inside offset reverses when the half-width exceeds the **local curvature radius**. The original per-ring exponential corner trim produced a sharp wedge; with two vertices per ring, asymmetric narrowing additionally displaced the UV midline away from the spline centre.

The updated Continuous solver accepts per-ring `RoadCornerSectionV2` radius limits, constrains the inside half-width to 0.35 times its safe local limit, then applies a conservative **rounded minimum envelope** over distance. Its effective `Width Slope` is capped at **0.25**, including old Scenes where the serialized value was higher (e.g. 2). It deliberately narrows the inside lane when geometry cannot support a constant Width. The Editor-only status reports radius-limited ring count and slope safety capping.

Continuous `RoadStrip` now writes **left, centre, right** vertices per sample, with UV0 across = 0, 0.5, 1. The centre UV is exactly on the spline centreline, not at the geometrically displaced midpoint of the asymmetric edges. RoadProfile also adds an asphalt centre vertex when Continuous is selected. This preserves centre dashed marking and outer painted lines without Boolean cuts. UV2 remains a distinct channel; both U/V axis modes and glTF Bake use identical coordinates. The existing programmatic/Inspector Clip mode remains unchanged, and Tube Extrude is not affected.

**Limitation:** local width fitting is not topology-aware CSG for arbitrary splines, road networks or overlapping branches at different heights. It may temporarily narrow a two-lane road too much; in that case revise Knot positions or increase bend radius. The safety slope cap is intentional to prevent reintroducing stepped lane stripes.

## Road v2 adaptive sampling, UV across compensation and optional separate markings

A field-wiring error was found in `SplineRoadV2.generate()`: the **plain Road strip branch** passed `cornerMode` but omitted `surfaceMode`, `clearanceSafety`, `widthSlope` and the continuous report callback. Because `buildRoadStripV2()` defaults to `clip` for pure callers, an Inspector reading **Surface Mode = Continuous** could still generate the **old clipping pipeline**, which explains repeated UV breaks in the user's road screenshots. Both plain Road and RoadProfile now forward the same complete options.

### Adaptive mesh subdivision

Borrowing the *technique*, not code, from ToolBuddy/Curvy's angle-based sampling, `SplineFramesV2` adds **opt-in** `maxAngleDegrees` and `maxChordError`. It recursively bisects any sample interval whose tangent turn or midpoint-to-chord deviation is too large, while keeping original distance samples, orientation transport, closed-loop correction and a hard maxFrames cap. The Cocos v2 Road defaults to **Adaptive Sampling = on**, `Max Turn Angle Degrees = 6`, `Max Chord Error = 0.03`, with `Sample Step` still the maximum distance per base segment. Other users of SplineFrames retain their old behavior unless they opt in. RoadStrip and RoadProfile use the **same adaptive frame table** for geometry, inside-radius width fitting and UV0, preventing ring-count mismatches.

### UV cross-width mode

**UV Cross Mode** has two options. **Legacy** (default) keeps UV0 across the full texture range 0..1 so prepainted edge/center stripes remain attached to their existing material UV coordinates. **Physical** computes UV0 across from physical lateral width rather than stretching the whole texture into a narrowed bend. It maintains texel density but **can move or hide the painted stripes embedded in the asphalt texture**. Both modes preserve longitudinal U/V-axis selection, distance-based tiling, UV2 and glTF Bake.

These choices solve *different problems*: texture stretch and line-marking placement. No UV projection can guarantee perfect constant-width markings on an impossibly tight turn without changing the road shape or adding separate geometry.

### Road marking mesh (experimental, opt-in)

**Generate Markings** creates asphalt-independent line geometry on the exact Continuous spline frames and fitted width. Solid edge strips (material slot **4**) and regularly spaced dashed center strips (slot **3**) follow the real spline; dashes are split at exact distance-based boundaries even between samples. `Marking Line Width`, `Marking Dash Length` and `Marking Dash Gap` are exposed in the Inspector. Marking geometry is raised a small amount to avoid Z-fighting and is appended as additional mesh submeshes, with UV0/UV2 and glTF Bake support. Disabled by default so existing asphalt textures containing road paint are not double-painted.

For this mode, use a **plain asphalt Material in slot 0**, an opaque **white Material in slot 3**, and an opaque **yellow Material in slot 4**. Slots 1 and 2 remain Shoulder and Curb. If the asphalt texture already includes lane markings, disable Generate Markings or change it to an unpainted asphalt texture.

**Limitations:** Markings are simple extruded ribbons and are not a junction/lane topology solver. They may converge or shrink on very narrow or extreme bends; raised paint is not a physics collider. UV2 remains deterministic, not lightmap-unwrapped. Generated mesh Play behavior follows Dynamic/Manual/Baked existing lifecycle; no additional log is emitted during Play. Mesh-source deformation mode (SplineArchitect-style) remains a separate future component until verified in actual Cocos Creator.

### Regression and compatibility

`tests/v2-road-play-mode.test.cjs` now explicitly verifies Inspector Continuous is forwarded to plain Road (3 ring vertices rather than 2 for the Clip mode). `tests/v2-adaptive-uv.test.cjs` covers adaptive tangent bounds and UV0/UV2 on exact knots K0(-1.701,0,-7.206), K1(-3.869,0,3.72), K2(5.82,0,4.347). `tests/v2-road-markings.test.cjs` checks dashed/solid material groups and glTF export. Real Cocos 3.8.x Scene visual validation remains required.

## Road V2 Constant Width Fillet (new test mode)

The earlier Continuous solver preserved UV0 but squeezed the inner Road width, visibly deforming the asphalt and painted markings. Clip Overlaps removed geometry and broke directional texture; those modes remain for compatibility but are not the new default.

**Constant Width** (Cocos `Surface Mode` enum value 2, default on NEW components) replaces guide-knot corners with circular tangent fillets whose minimum radius is `(width/2 + shoulderWidth + curbWidth) * Fillet Radius Scale`. The default scale is 1.35. Cubic Bezier arc segments with precisely aligned handles maintain tangent continuity at every connection to a straight Road section. The component does NOT apply the legacy JoinAndTrim offset compression, width-fitting, planar mesh clipping, or UV stitching in this mode. Every cross-section remains the full specified width and U/V longitudinal texture mapping advances strictly by actual generated centerline arc length. Road centerline/UV row remains exactly the generated spline center.

This mode **moves the actual centerline away from interior guide Knot positions**. It is a rounded polyline guided by the Knot sequence, rather than a Catmull-Rom curve interpolating every original Knot. The existing Interpolation dropdown is therefore interpreted as the source guide sequence; Bezier with handles is not supported by this mode and returns an informative error. Endpoints of open paths remain fixed. Curvature radius and path deviation can be inspected in Editor after Preview / Check Bake Status.

Controls: `Fillet Radius Scale` default 1.35 (must be >1.01), `Fillet Arc Angle Degrees` default 4, and `Fillet Chord Error` default 0.015. These arc-geometry controls are separate from `Adaptive Sampling`; the generated tangent Bezier arcs already have fine control segments, so global adaptive subdivision is intentionally skipped in Constant Width mode to avoid excess frames at joint parameters. `Sample Step` still limits ring spacing. UV Cross Mode Physical and Legacy use the same uncompressed width; no forced UV rescaling is applied.

**Cannot be geometrically guaranteed for arbitrary Knots:** If adjacent input segments cannot fit the requested minimum radius, Preview/Bake reports an Editor error with the Knot indices, available spacing and recommended action (separate knots, reduce Width, or choose Continuous). It does NOT silently lower radius, move endpoints, shrink Width or generate folded triangles. The fillet is local and does not Boolean-union distant self-crossings or junctions; full scene roads can still overlap at unrelated segments. Check overall road network topology separately.

New material slots remain 0=asphalt, 1=shoulder, 2=curb, 3=white dashed markings, 4=yellow continuous edge lines. Optional Generate Markings uses the same full-width tangent frame geometry in Constant Width mode and is off by default. Use blank asphalt if enabling separated marking geometry. Existing scenes with stored Surface Mode 0 stay Continuous until manually changed to **ConstantWidth**; no old enum values or UUIDs are rewritten.

### Verified regression

The sample three Knot positions K0=(-1.701,0,-7.206), K1=(-3.869,0,3.720), K2=(5.820,0,4.347) with Width 4 and Sample Step .25 generated 1 tangent fillet of radius 2.7, 79 cross-section rings / 237 vertices / 312 forward-facing triangles (4 per adjacent ring pair) in the local TypeScript simulation. Every cross-section measured Width 4, with uncut UV0 U/V and UV2, exact centerline anchoring, plus glTF and shoulder/curb/marking tests. Only the scene shown in Cocos Creator can confirm the real shader, texture and Editor visual result.
