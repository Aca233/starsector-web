"""Bake a normal-size 2D hull from the verified Blender study, without runtime 3D.
This only writes an art candidate. It does not migrate mounts or change game assets.
"""
import argparse
import json
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--blend', required=True)
parser.add_argument('--report', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source = Path(args.blend).resolve()
report = json.loads(Path(args.report).read_text(encoding='utf-8'))
output = Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
scene = bpy.context.scene
scene.frame_set(0)
scene.camera = bpy.data.objects['axis-plus-z']
assert scene.camera.data.type == 'ORTHO'
scene.render.resolution_x = 512
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.pixel_aspect_x = 1
scene.render.pixel_aspect_y = 1
height = report['bounds'][1][1] - report['bounds'][0][1]
# Keep source geometry unmodified. Fit it with 24px transparent padding at each end.
scene.camera.data.ortho_scale = height * 1024 / (1024 - 48)
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.image_settings.compression = 100
scene.render.filepath = str(output / 'hull.png')
scene.render.engine = 'CYCLES'
scene.cycles.samples = 128
scene.cycles.use_denoising = True
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'OPTIX'
scene.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'
bpy.context.view_layer.update()
origin = world_to_camera_view(scene, scene.camera, Vector((0, 0, 0)))
frame = scene.camera.data.view_frame(scene=scene)
units_per_pixel = (max(v.y for v in frame) - min(v.y for v in frame)) / 1024
bpy.ops.render.render(write_still=True)
metadata = {
    'version': 1,
    'status': 'art-only; pending gameplay mount and pivot calibration',
    'sourceBlend': str(source),
    'sourceModel': 'Catholomew / Spear of Adun - Protoss - Starcraft 2 / CC BY-NC 4.0',
    'image': 'hull.png', 'width': 512, 'height': 1024, 'projection': 'ORTHO',
    'forwardInImage': 'up', 'sourceFrame': 0,
    'sourceModelOriginPx': [origin.x * 512, (1 - origin.y) * 1024],
    'sourceUnitsPerPixel': units_per_pixel,
    'originIsNotGameplayPivot': True,
    'geometryChanged': False, 'sourceMaterialsChanged': False, 'aiUsed': False,
    'requiresRuntime3D': False, 'mountsMigrated': False, 'gameAssetsChanged': False,
    'cameraPosition': list(scene.camera.location),
    'cameraRotationEuler': list(scene.camera.rotation_euler),
    'cameraOrthoScale': scene.camera.data.ortho_scale,
    'samples': scene.cycles.samples,
}
(output / 'sprite-metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
print('SPRITE_BAKE_COMPLETE', output)
