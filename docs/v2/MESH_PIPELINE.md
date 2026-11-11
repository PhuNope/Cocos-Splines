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
