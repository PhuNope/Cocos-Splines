# Create a runnable Example Gallery in Cocos Creator

After running **Extension → Cocos Splines → Install Examples**:

1. Wait for Asset DB to finish compiling ExampleGallery.ts. Ensure Cocos-Gizmos is installed.
2. Create/open an empty **3D Scene** in the Editor.
3. Choose **Extension → Cocos Splines → Create Example Gallery in Scene**.
4. A Spline Example Gallery node appears in the Hierarchy with CocosSplinesExampleGalleryV2.
5. Select the node, set the **Example** enum, press **Ctrl/Cmd + S** to save the Scene, then press **Play**.
6. Edit the enum to switch examples. The scene retains the Gallery component but demo geometry is created during Play.

The button does **not** overwrite/create a .scene asset in Assets. Creator owns its own Scene serialization. Repeating the action selects the existing gallery instead of adding duplicates.

If the component has not compiled yet, Install Examples will keep all already installed project files. Wait for compilation (check Console) then click Create Example Gallery again.

**Example choices:** Follower, Road, Extrude, Junction, Proximity, Positioner, Projector, Triggers, Modifiers, Morph, MeshDeform, TrafficController, PrefabSpawning, **GeometryGraphUVAtlas**, **GeometryGraphTriangleUV**, **GeometryGraphAdvancedAtlas**. UV Atlas creates two Graph Extrude meshes during Play using temporary JSON defaults; Triangle UV mode splits each face into its own UV0 island. A checker Material reveals differences in UV mapping. Feature-specific editable scripts are installed under Train/, Road/, Extrude/, Junction/. Full physics and prefab acceptance requires Creator 3.8.8 native smoke tests.

**Safety:** The action only modifies the currently open Scene after explicit invocation. One Editor snapshot on success. If component creation fails, it attempts to remove only its newly created node in the same Scene. The installer never overwrites user-edited assets or their .meta UUIDs.

Reinstalling Examples upgrades only the unmodified, byte-identical older Gallery script while retaining its .meta UUID. Customized Gallery scripts are preserved; merge the new enum/method manually if you edited yours. Do not delete a script referenced by saved Scenes. See README.md.
