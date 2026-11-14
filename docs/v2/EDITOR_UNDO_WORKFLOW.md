# Editor Undo/Redo and serialized Knot authoring — v2 alpha

Branch: `v2.0.0`. Development test ZIP only, not a release.

## How the Path Inspector writes topology edits

SplinePath owns a Cocos-serializable `SplineKnotRecordV2[]`:
local Vec3 position, tangent mode, in/out handles, tension and Roll.

For the **Add, Insert After, Duplicate, Remove and Up/Down** buttons:

1. Main process queries the selected node's current Creator 3.8
   `query-node` dump; each array element keeps its CCClass and nested
   IProperty type metadata.
2. `PathV2Dump.js` computes a **pure JSON copy** of the resulting
   array. It does not mutate the active Scene or create Knot Nodes.
3. The extension submits exactly one
   `scene.set-property({uuid, path:'__comps__.N.knots',
   dump:typedArray, record:true})` request.
4. It updates `gizmoKnotIndex` via its own queried property type with
   `record:false`. The selection is not a second Undo step.
5. A lightweight Scene method calls `SplinePathV2.onRestore()`
   **only for topology changes** to refresh linked temporary previews.
   Selecting a Knot merely changes handles; it does not rebuild Road,
   Extrude and Mesh Deform meshes.

This replaces the previous `execute-scene-script('editV2Path')` approach,
which mutated Knot records **before** a snapshot was requested. That
old path could fail to preserve the pre-edit value for Editor Undo.

The array command is one recorded Creator property edit, keeping all
per-Knot handles, bank angles and record metadata together. Failed or
invalid operations must not modify the Scene; move-outside-range is a
no-op. The Planner enforces 128 Knot maximum and two-Knot minimum
when deleting. New records derive from Creator's `elementTypeData`
template when available.

The custom Inspector's actual `ui-prop` fields still use Cocos's own
property commit flow, rather than a custom uncontrolled input.

## Restore and Preview

`SplinePathV2.onRestore()` clears stale references to a previous
dragged Knot, tangent handles, Roll HUD target and Path Euler rotation
gesture. This matters if Creator replaces the serialized Knot records
on undo/reload; a subsequent Gizmos drag must target the newly
restored records, not detached JavaScript objects.

Linked Road/Extrude/MeshDeform consumers receive one forced preview
refresh. `SplineMeshGeneratorV2.onRestore()` also unsubscribes its old
Path Source and rebinds the newly restored one, or displays the saved
Baked Mesh if the linked Path has been removed. A recovered preview
does not overwrite the imported Baked Mesh.

## Creator 3.8.x manual acceptance

1. Create one Path with two Vec3 Knot records and one linked Road.
   Add, Insert After, Duplicate, reorder, and delete Knots.
2. After each **one** operation, press Ctrl+Z. Verify all positions,
   tangent modes, both handles, Roll and order return exactly. Press
   Ctrl+Shift+Z to redo each operation.
3. Switch between the Inspector Knot cards without changing geometry.
   Selecting a Knot should not create new Road meshes nor add another
   Undo entry.
4. Save Scene, close it, reopen it. Confirm serialized Path values,
   custom Inspector cards, active selection and linked Road preview.
5. Drag active Knot, a secondary Knot and Bézier tangent; Escape
   must rollback. Test native Ctrl+Z/Ctrl+Shift+Z after a completed
   drag. The SDK's computed proxy field may not be recorded by
   Creator as an actual nested serialized property: this remains a
   **separate certification blocker**.
6. Drag Roll HUD, commit, Undo, Redo, Escape; distinguish changes in
   the Scene's serialized Knot array from the computed roll proxy.
7. Change Road's Path Source to another Path, Undo and Redo. Preview
   must follow the restored path and the saved Baked Mesh must remain
   unchanged.
8. Repeat on prefab instances and duplicated Paths. Check Editor's
   Scene dirty indicator and whether Prefab overrides are correctly
   recorded.

CI verifies the typed dump planner, history **replay simulation**,
Scene message wiring, Path onRestore stale-target cleanup and generator
relinking with Cocos mocks. It cannot certify actual Creator Undo/Redo,
Prefab override handling, Scene saving, native Gizmos history or
mouse picking. Treat the features above as an **alpha implementation**.

See [Pure Vec3 authoring](PURE_VEC3_KNOTS.md),
[Rotate and bank](ROTATE_AND_BANK.md) and [status](STATUS.md).
