"""Prepare a native-model fore mechanism fit, offline; no inferred weapon slots."""
import json
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path.cwd()
OUT = ROOT / 'output/spear-of-adun-art/fore-installation-v01'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'output/spear-of-adun-art/production-v01/art-production.blend'), load_ui=False, use_scripts=False)
scene = bpy.context.scene
scene.frame_set(0)
scene.use_nodes = False  # Never run the earlier scene's file-output compositor.
scene.render.engine = 'CYCLES'
scene.render.resolution_x = 512
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.cycles.samples = 256
scene.cycles.seed = 37
scene.cycles.use_animated_seed = False
scene.cycles.use_denoising = True
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'OPTIX'
scene.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.image_settings.compression = 100
fore = bpy.data.objects['Object_15']
rig_helpers = {bone.custom_shape for rig_obj in scene.objects if rig_obj.type == 'ARMATURE' for bone in rig_obj.pose.bones if bone.custom_shape}
for helper in rig_helpers:
    helper.hide_render = True
meshes = [o for o in scene.objects if o.type == 'MESH' and not o.hide_render and o not in rig_helpers]
others = [o for o in meshes if o != fore]
assert len(meshes) == 45, len(meshes)
assert len(fore.data.vertices) == 2432
original = {o.name: (o.hide_render, o.visible_camera, o.is_holdout) for o in meshes}

def restore():
    for o in meshes:
        o.hide_render, o.visible_camera, o.is_holdout = original[o.name]

def render(name):
    scene.render.filepath = str(OUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)

# Record source control groups, rigid weights, actual face membership and projected pivots.
groups = {g.index: g.name for g in fore.vertex_groups}
weights = {}
for v in fore.data.vertices:
    weights[v.index] = [(groups[g.group], g.weight) for g in v.groups if g.weight > .0001]
face_groups = {}
mixed_faces = []
for face in fore.data.polygons:
    names = {name for i in face.vertices for name, weight in weights[i]}
    if len(names) == 1:
        name = next(iter(names))
        face_groups[name] = face_groups.get(name, 0) + 1
    else:
        mixed_faces.append(face.index)
rig = next(m.object for m in fore.modifiers if m.type == 'ARMATURE')
pivots = {}
for name in sorted({n for w in weights.values() for n, _ in w} | {'Ctrl_Gun_Master_15'}):
    bone = rig.pose.bones[name]
    world = rig.matrix_world @ bone.head
    uv = world_to_camera_view(scene, scene.camera, world)
    pivots[name] = {'pixel': [uv.x*512, (1-uv.y)*1024], 'world': list(world),
                    'parent': bone.parent.name if bone.parent else None,
                    'rotationMode': bone.rotation_mode,
                    'constraints': [c.type for c in bone.constraints]}

# Geometry-derived metrics: source UV seams can make a closed visual surface appear topologically open.
mesh = fore.data
edge_faces = {}
for face in mesh.polygons:
    indices = list(face.vertices)
    for a, b in zip(indices, indices[1:] + indices[:1]):
        key = tuple(sorted((a, b)))
        edge_faces[key] = edge_faces.get(key, 0) + 1

render('assembled-reference')
# Actually remove the selected mechanism to expose only real underlying source surfaces.
fore.hide_render = True
render('hull-without-fore')
restore()
# Complete part, including surfaces hidden in the assembled view. Keep other surfaces
# in indirect/shadow rays for coherent installed lighting, but remove them from camera rays.
for obj in others:
    obj.visible_camera = False
render('fore-complete')
restore()
# Holdout renders encode the real assembled visibility, not a guessed 2D layer order.
for obj in others:
    obj.is_holdout = True
render('fore-visible')
restore()
# The hull behind the part is held out; the remaining hull is a real foreground source.
fore.is_holdout = True
render('hull-visible')
restore()

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'fore-installation.blend'))
report = {
    'stage': 'P6 source-native fore mechanism fit; no runtime integration',
    'sourceBlend': 'output/spear-of-adun-art/production-v01/art-production.blend',
    'resolution': [512, 1024], 'frame': 0,
    'camera': {'name': scene.camera.name, 'type': scene.camera.data.type,
               'orthoScale': scene.camera.data.ortho_scale,
               'matrixWorld': [list(r) for r in scene.camera.matrix_world]},
    'sourceObject': fore.name, 'sourceVertexCount': len(mesh.vertices),
    'sourceFaces': len(mesh.polygons), 'rigidControlFaceCounts': face_groups,
    'mixedControlFaceCount': len(mixed_faces),
    'singleUnitWeightVertexCount': sum(len(w) == 1 and abs(w[0][1] - 1) < 1e-5 for w in weights.values()),
    'sourceBoundaryEdgeCountBeforeUVSeamWelding': sum(n == 1 for n in edge_faces.values()),
    'sourceBonePivots': pivots,
    'generatedGeometry': False, 'modifiedSourceMesh': False,
    'canonMuzzlesVerified': False, 'canonFireArcVerified': False,
    'rigBoneNamesDoNotProveWeaponCount': True,
    'motionPolicy': 'Integrated source mechanism; no free-aim 2D turret rotation inferred.',
    'indirectLighting': 'fore-complete keeps hull in indirect/shadow rays; hull-without-fore removes part entirely.',
    'pending': ['verify static layered reconstruction and AA seams', 'weapon role/muzzles/arc evidence',
                'pose-dependent shadow/occlusion if an authored motion is later made', 'runtime calibration and fit test'],
    'gameAssetsChanged': False
}
(OUT / 'installation-source-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('FORE_INSTALLATION_RENDER_COMPLETE', str(OUT), flush=True)

