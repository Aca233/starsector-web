"""Produce registered 2D art passes from the approved Adun material direction.
Offline art only: no runtime edits, inferred gun slots, or generated geometry.
"""
import json
from pathlib import Path
import bpy

root = Path.cwd()
out = root / 'output/spear-of-adun-art/production-v01'
out.mkdir(parents=True, exist_ok=True)
source = root / 'output/spear-of-adun-art/material-study-v02/material-study.blend'
bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
scene = bpy.context.scene
scene.frame_set(0)
scene.camera = bpy.data.objects['axis-plus-z']
assert scene.camera.data.type == 'ORTHO'
assert (scene.render.resolution_x, scene.render.resolution_y) == (512, 1024)
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.engine = 'CYCLES'
scene.cycles.samples = 192
scene.cycles.use_denoising = True
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'OPTIX'
scene.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'
# A half-pixel physical bevel in the normal shader reveals existing plate thickness;
# vertices, silhouette, source UVs and painted surface pattern remain unchanged.
beveled = []
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        continue
    n = nodes.new('ShaderNodeBevel')
    n.label = 'Existing geometry edge definition / no geometry change'
    n.inputs['Radius'].default_value = .0045
    n.samples = 4
    if bsdf.inputs['Normal'].is_linked:
        links.new(bsdf.inputs['Normal'].links[0].from_socket, n.inputs['Normal'])
    links.new(n.outputs['Normal'], bsdf.inputs['Normal'])
    beveled.append(mat.name)

core_names = {'Object_7', 'Object_9', 'Object_11', 'Object_13'}
fore_names = {'Object_15'}
rig_helpers = {b.custom_shape for rig in scene.objects if rig.type == 'ARMATURE'
               for b in rig.pose.bones if b.custom_shape}
parts = {'fixed-structure': [], 'core-mechanism': [], 'fore-rig-assembly': []}
for obj in scene.objects:
    if obj.type != 'MESH' or obj in rig_helpers:
        continue
    index = 2 if obj.name in core_names else 3 if obj.name in fore_names else 1
    obj.pass_index = index
    parts[['fixed-structure','core-mechanism','fore-rig-assembly'][index - 1]].append(obj.name)
assert len(parts['core-mechanism']) == 4 and len(parts['fore-rig-assembly']) == 1
layer = bpy.context.view_layer
layer.use_pass_object_index = True
layer.use_pass_emit = True
layer.use_pass_normal = True
layer.use_pass_diffuse_color = True
layer.use_pass_z = True
if hasattr(layer, 'use_pass_ambient_occlusion'):
    layer.use_pass_ambient_occlusion = True
# These are source-selection mattes, not independent ready-to-rotate gun sprites.
scene.use_nodes = True
nodes, links = scene.node_tree.nodes, scene.node_tree.links
nodes.clear()
rl = nodes.new('CompositorNodeRLayers')
composite = nodes.new('CompositorNodeComposite')
links.new(rl.outputs['Image'], composite.inputs['Image'])
files = nodes.new('CompositorNodeOutputFile')
files.base_path = str(out)
files.format.file_format = 'PNG'
files.format.color_mode = 'BW'
files.format.color_depth = '8'
files.file_slots.clear()
for index, name in enumerate(['fixed-structure', 'core-mechanism', 'fore-rig-assembly'], start=1):
    mask = nodes.new('CompositorNodeIDMask')
    mask.index = index
    mask.use_antialiasing = True
    links.new(rl.outputs['IndexOB'], mask.inputs['ID value'])
    multiply = nodes.new('CompositorNodeMath'); multiply.operation = 'MULTIPLY'
    links.new(mask.outputs['Alpha'], multiply.inputs[0])
    links.new(rl.outputs['Alpha'], multiply.inputs[1])
    slot = files.file_slots.new('mask-' + name + '-')
    links.new(multiply.outputs[0], files.inputs[-1])

scene.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
scene.render.image_settings.color_depth = '16'
scene.render.image_settings.exr_codec = 'ZIP'
scene.render.filepath = str(out / 'art-layers.exr')
bpy.ops.render.render(write_still=True)
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.image_settings.compression = 100
scene.render.filepath = str(out / 'hull-powered.png')
bpy.data.images['Render Result'].save_render(scene.render.filepath, scene=scene)
# Preserve an editable approved-palette scene with real material/ID/lighting passes.
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'art-production.blend'))
# Separately bake a real no-emission state, rather than drawing a fabricated glow.
scene.use_nodes = False
original_strengths = []
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            sock = n.inputs['Emission Strength']
            original_strengths.append((sock, sock.default_value))
            sock.default_value = 0
scene.render.filepath = str(out / 'hull-unpowered.png')
bpy.ops.render.render(write_still=True)
for sock, value in original_strengths:
    sock.default_value = value
report = {
    'stage': 'P6 art production candidate; not game-integrated',
    'approvedDirection': 'material-study-v02 (user accepted)',
    'sourceBlend': str(source), 'resolution': [512,1024], 'sourceFrame': 0,
    'geometryModified': False, 'sourceTexturesModified': False, 'aiUsed': False,
    'edgeTreatment': {'method': 'Blender Bevel normal shader', 'radiusSourceUnits': .0045, 'samples':4,'materials':beveled},
    'parts': parts, 'partClassificationsAreSourceRigNotCanonWeaponCounts':True,
    'mattesAreVisibleSelectionsNotCompleteDetachedObjects':True,
    'animation': {'coreSource': 'longitudinal-axis source rig rotation', 'cannotRotateAsFlatTurret': True,
                  'runtimeFramesProduced': False},
    'states': ['hull-powered.png','hull-unpowered.png'],
    'gameAssetsChanged':False,
    'pending': ['hidden surfaces / occluder completion for detachable mechanisms','weapon behavior and mount evidence','gameplay calibration','in-game art verification'],
}
(out / 'production-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('ART_PRODUCTION_COMPLETE', out)
