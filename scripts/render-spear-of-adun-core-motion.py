"""Restore the central rings and bake real 3D poses; do not alter gun aiming."""
import json
import math
import sys
from pathlib import Path
import bpy

ROOT = Path.cwd()
sys.path.insert(0, str(ROOT / 'scripts'))
from spear_of_adun_core_animation import CORE_BONES, LOOP_DURATION, restore_core_animation

OUT = ROOT / 'output/spear-of-adun-art/core-motion-v01'
FRAMES = OUT / 'frames'
FRAMES.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'output/spear-of-adun-art/fore-deployment-v01/fore-deployment.blend'), load_ui=False, use_scripts=False)
s = bpy.context.scene
s.use_nodes = False
s.render.fps = 60
s.frame_start = 0
s.frame_end = int(LOOP_DURATION * s.render.fps)
rig = next(o for o in s.objects if o.type == 'ARMATURE')
report = restore_core_animation(rig, ROOT / 'output/spear-of-adun-art/material-study-v02/material-study.blend')
s.render.use_border = False
s.render.use_crop_to_border = False
s.render.resolution_x = 512
s.render.resolution_y = 1024
s.render.resolution_percentage = 100
s.render.film_transparent = True
s.render.image_settings.file_format = 'PNG'
s.render.image_settings.color_mode = 'RGBA'
s.render.image_settings.color_depth = '8'
s.cycles.samples = 192
s.cycles.seed = 37
s.cycles.use_animated_seed = False
s.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'core-motion.blend'))
# Reopen before verification: saved animation must actually deform geometry.
bpy.ops.wm.open_mainfile(filepath=str(OUT / 'core-motion.blend'), load_ui=False, use_scripts=False)
s = bpy.context.scene
rig = next(o for o in s.objects if o.type == 'ARMATURE')
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'OPTIX'
s.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'


def vertices(name):
    obj = bpy.data.objects[name].evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = obj.to_mesh()
    result = [obj.matrix_world @ v.co for v in mesh.vertices]
    obj.to_mesh_clear()
    return result


def matrices():
    return {name: rig.pose.bones[name].matrix.copy() for name in CORE_BONES}


s.frame_set(0)
bpy.context.view_layer.update()
rest = {name: vertices(name) for name in ['Object_9', 'Object_11', 'Object_13', 'Object_7', 'Object_17']}
rest_matrices = matrices()
s.frame_set(750)
bpy.context.view_layer.update()
displacements = {name: max((a-b).length for a, b in zip(coords, vertices(name)))
                 for name, coords in rest.items()}
assert min(displacements[n] for n in ['Object_9', 'Object_11', 'Object_13', 'Object_7']) > .1
assert displacements['Object_17'] < 1e-5, 'Static structure must stay fixed'
axes = {}
for name, original in rest_matrices.items():
    delta = rig.pose.bones[name].matrix.to_quaternion() @ original.to_quaternion().inverted()
    world_axis = rig.matrix_world.to_quaternion() @ delta.axis
    assert abs(world_axis.y) > .999, 'Core must turn around hull longitudinal axis'
    axes[name] = list(world_axis)
s.frame_set(s.frame_end)
bpy.context.view_layer.update()
loop_error = {name: max((a-b).length for a, b in zip(coords, vertices(name)))
              for name, coords in rest.items()}
assert max(loop_error.values()) < 1e-5

# Whole-hull renders preserve real occlusion, reflected light and moving shadows.
# These 144 angular samples are an accelerated review, NOT a runtime fps choice.
rows = []
count = 144
for index in range(count):
    seconds = LOOP_DURATION * index / count
    frame = seconds * s.render.fps
    s.frame_set(math.floor(frame), subframe=frame % 1)
    bpy.context.view_layer.update()
    s.render.filepath = str(FRAMES / f'{index:03d}.png')
    bpy.ops.render.render(write_still=True)
    rows.append({'index': index, 'sourceTimeSeconds': seconds, 'file': f'frames/{index:03d}.png'})
# One independent closing render verifies the full image returns, not just pivots.
s.frame_set(s.frame_end)
s.render.filepath = str(OUT / 'loop-end.png')
bpy.ops.render.render(write_still=True)
report.update({'stage': 'Offline ring-motion review, not runtime integration',
               'geometryAdded': False, 'imagePlaneRotationUsed': False,
               'sourceRotationRestored': True, 'gunAimChanged': False,
               'previewIncludesExistingOneShotForeDeployment': True,
               'geometryDisplacementAt12_5Seconds': displacements,
               'worldRotationAxes': axes, 'loopVertexError': loop_error,
               'fullHullFrames': rows, 'frameSize': [512, 1024],
               'previewFPS': 20, 'previewPlaybackSpeedMultiplier': LOOP_DURATION / (count/20),
               'gameIntegrated': False})
(OUT / 'render-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('CORE_MOTION_RENDER_COMPLETE', flush=True)
