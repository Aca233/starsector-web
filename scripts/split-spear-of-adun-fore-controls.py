"""Split source-rigid fore control segments without inventing geometry or gun slots."""
import bpy
import json
from pathlib import Path
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path.cwd()
OUT = ROOT / 'output/spear-of-adun-art/fore-installation-v01'
bpy.ops.wm.open_mainfile(filepath=str(OUT / 'fore-installation.blend'), load_ui=False, use_scripts=False)
scene = bpy.context.scene
scene.use_nodes = False
scene.frame_set(0)
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'OPTIX'
scene.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'

fore = bpy.data.objects['Object_15']
mesh = fore.data
source = json.loads((OUT / 'installation-source-report.json').read_text(encoding='utf-8'))
assert source['mixedControlFaceCount'] == 0
assert source['singleUnitWeightVertexCount'] == len(mesh.vertices)
# Underlay preserves the mounted part's real shadow and interreflection at this pose.
fore.visible_camera = False
scene.render.filepath = str(OUT / 'hull-mounted-underlay.png')
bpy.ops.render.render(write_still=True)
fore.visible_camera = True

collection = bpy.data.collections.new('Fore control segments - NOT weapon slots')
scene.collection.children.link(collection)
names = {g.index: g.name for g in fore.vertex_groups}
vertex_group = {v.index: next(names[g.group] for g in v.groups if g.weight > .999) for v in mesh.vertices}
normal_data = [tuple(n.vector) for n in mesh.corner_normals]
segments = []
for group_name in sorted(source['rigidControlFaceCounts']):
    faces = [p for p in mesh.polygons if vertex_group[p.vertices[0]] == group_name]
    indices = sorted({v for p in faces for v in p.vertices})
    old_to_new = {old: new for new, old in enumerate(indices)}
    target_mesh = bpy.data.meshes.new('AdunFore_' + group_name)
    target_mesh.from_pydata([tuple(mesh.vertices[i].co) for i in indices], [],
                           [[old_to_new[i] for i in p.vertices] for p in faces])
    for material in mesh.materials:
        target_mesh.materials.append(material)
    for target_face, source_face in zip(target_mesh.polygons, faces):
        target_face.material_index = source_face.material_index
        target_face.use_smooth = source_face.use_smooth
    for source_uv in mesh.uv_layers:
        uv = target_mesh.uv_layers.new(name=source_uv.name)
        for target_face, source_face in zip(target_mesh.polygons, faces):
            for dst, src in zip(target_face.loop_indices, source_face.loop_indices):
                uv.data[dst].uv = source_uv.data[src].uv
    # glTF Color is part of the material, not optional metadata. Preserve corner
    # color and its render selection, otherwise split pieces render incorrectly dark.
    for source_color in mesh.color_attributes:
        color = target_mesh.color_attributes.new(name=source_color.name, type=source_color.data_type, domain=source_color.domain)
        if source_color.domain == 'CORNER':
            mapping = [i for p in faces for i in p.loop_indices]
        elif source_color.domain == 'POINT':
            mapping = indices
        else:
            raise ValueError('Unsupported source color domain: ' + source_color.domain)
        for dst, src in enumerate(mapping):
            color.data[dst].color_srgb = source_color.data[src].color_srgb
    target_mesh.color_attributes.render_color_index = mesh.color_attributes.render_color_index
    target_mesh.color_attributes.active_color_index = mesh.color_attributes.active_color_index
    normals = [normal_data[i] for p in faces for i in p.loop_indices]
    target_mesh.normals_split_custom_set(normals)
    obj = fore.copy()
    obj.data = target_mesh
    obj.name = 'AdunFore_' + group_name
    collection.objects.link(obj)
    # Replacing .data clears copied vertex groups in Blender. Recreate the actual
    # name/weights on the new mesh; a matching static render cannot prove skinning.
    obj.vertex_groups.clear()
    group = obj.vertex_groups.new(name=group_name)
    group.add(list(range(len(indices))), 1.0, 'REPLACE')
    bound_vertices = sum(len(v.groups) == 1 and v.groups[0].group == group.index
                         and abs(v.groups[0].weight - 1) < 1e-6 for v in target_mesh.vertices)
    assert bound_vertices == len(indices)
    # Object copy preserves transforms, armature modifier and parent.
    assert obj.matrix_world == fore.matrix_world
    assert len(obj.data.polygons) == source['rigidControlFaceCounts'][group_name]
    pivot = source['sourceBonePivots'][group_name]
    obj['source_control'] = group_name
    obj['not_a_weapon_slot'] = True
    segments.append({'object': obj.name, 'control': group_name,
                     'vertices': len(indices), 'boundVertices': bound_vertices, 'faces': len(faces), 'sourcePivot': pivot,
                     'uvPreserved': True, 'vertexColorsPreserved': True, 'customCornerNormalsCopied': True})

assert sum(s['faces'] for s in segments) == len(mesh.polygons)
assert sum(s['vertices'] for s in segments) == len(mesh.vertices)
fore.hide_render = True
fore.hide_set(True)
scene.render.filepath = str(OUT / 'split-geometry-reference.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'fore-segmented.blend'))
source['segments'] = segments
source['topologyConservation'] = {'sourceVertices': len(mesh.vertices), 'splitVertices': sum(s['vertices'] for s in segments),
                                 'sourceFaces': len(mesh.polygons), 'splitFaces': sum(s['faces'] for s in segments)}
source['segmentCountIsNotWeaponCount'] = True
(OUT / 'segmentation-report.json').write_text(json.dumps(source, ensure_ascii=False, indent=2), encoding='utf-8')
print('FORE_SEGMENTATION_COMPLETE', flush=True)
