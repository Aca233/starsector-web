"""Render the user-supplied glTF in background Blender; no AI or game asset writes.
Run with Blender --background --factory-startup --disable-autoexec --python ... -- ...
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector, Matrix


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--resolution', type=int, default=1400)
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--views', default='axis-plus-z,axis-minus-z,axis-plus-x,oblique-plus-z')
    parser.add_argument('--device', choices=['CPU', 'OPTIX', 'CUDA'], default='OPTIX')
    parser.add_argument('--frame', type=int, default=0)
    parser.add_argument('--exposure', type=float, default=0.5)
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:])


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def main():
    args = arguments()
    source = Path(args.source).resolve()
    out = Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    scene = bpy.context.scene
    scene.frame_set(args.frame)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.resolution_percentage = 100
    scene.render.use_file_extension = True
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = args.exposure
    device_info = []
    if args.device != 'CPU':
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = args.device
        prefs.get_devices()
        for device in prefs.devices:
            device.use = device.type == args.device
            device_info.append({'name': device.name, 'type': device.type, 'enabled': bool(device.use)})
        if not any(d['enabled'] for d in device_info):
            raise RuntimeError('Requested GPU backend unavailable: ' + json.dumps(device_info))
        scene.cycles.device = 'GPU'
    else:
        scene.cycles.device = 'CPU'
    world = bpy.data.worlds.new('Neutral research studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.8, 0.85, 1.0, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.3
    scene.world = world

    dep = bpy.context.evaluated_depsgraph_get()
    points = []
    objects = []
    rig_helpers = {bone.custom_shape for rig in scene.objects if rig.type == 'ARMATURE'
                   for bone in rig.pose.bones if bone.custom_shape is not None}
    for obj in list(scene.objects):
        if obj.type != 'MESH' or obj in rig_helpers:
            continue
        evaluated = obj.evaluated_get(dep)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        verts = [evaluated.matrix_world @ v.co for v in mesh.vertices]
        points.extend(verts)
        lo = [min(v[i] for v in verts) for i in range(3)]
        hi = [max(v[i] for v in verts) for i in range(3)]
        objects.append({'name': obj.name, 'vertices': len(mesh.vertices), 'triangles': len(mesh.loop_triangles),
                        'bounds': [lo, hi], 'materials': [m.name if m else None for m in obj.data.materials],
                        'modifiers': [m.type for m in obj.modifiers]})
        evaluated.to_mesh_clear()
    if not points:
        raise RuntimeError('No mesh vertices imported')
    lo = Vector([min(v[i] for v in points) for i in range(3)])
    hi = Vector([max(v[i] for v in points) for i in range(3)])
    center = (hi + lo) / 2
    span = max(hi - lo)
    images = []
    for image in bpy.data.images:
        if image.source == 'FILE':
            images.append({'name': image.name, 'size': list(image.size), 'loaded': bool(image.has_data),
                           'packed': bool(image.packed_file)})
            if not image.has_data or min(image.size) == 0:
                raise RuntimeError('Missing image data: ' + image.name)
    for name, direction, energy, color in [
        ('Key', (-3, -4, 7), 2.2, (1, .98, .94)),
        ('Fill', (4, 1, 3), .65, (.8, .87, 1)),
        ('Lower fill', (1, -2, -5), 1.5, (1, .96, .88)),
        ('Rim', (1, 4, 3), .8, (.8, .91, 1)),
    ]:
        data = bpy.data.lights.new(name, 'SUN')
        data.energy = energy
        data.color = color
        data.angle = .3
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
        light.location = center + Vector(direction) * span
        aim(light, center)
    views = {
        'axis-plus-z': ((0, 0, 1), (0, -1, 0)),
        'axis-minus-z': ((0, 0, -1), (0, -1, 0)),
        'axis-plus-x': ((1, 0, 0), (0, 0, 1)),
        'axis-minus-x': ((-1, 0, 0), (0, 0, 1)),
        'oblique-plus-z': ((1.25, -1.0, 1.15), (0, 0, 1)),
        'oblique-minus-z': ((1.25, -1.0, -1.15), (0, 0, -1)),
    }
    report = {'blenderVersion': bpy.app.version_string, 'source': str(source),
              'sourceGltfSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'sourceBinSha256': hashlib.sha256(source.with_suffix('.bin').read_bytes()).hexdigest(),
              'frame': args.frame, 'engine': scene.render.engine, 'samples': args.samples,
              'devices': device_info, 'colorManagement': {'transform': scene.view_settings.view_transform,
              'look': scene.view_settings.look, 'exposure': scene.view_settings.exposure},
              'bounds': [list(lo), list(hi)], 'sourceObjects': objects, 'images': images,
              'rigHelpersExcludedFromBounds': sorted(obj.name for obj in rig_helpers),
              'sourceMeshCount': len(objects),
              'geometryModified': False, 'materialNodesModified': False, 'aiUsed': False,
              'gameAssetsChanged': False, 'views': {}}
    cameras = []
    for name in args.views.split(','):
        outward, up_hint = [Vector(v).normalized() for v in views[name]]
        right = up_hint.cross(outward).normalized()
        up = outward.cross(right).normalized()
        projected_x = [(v - center).dot(right) for v in points]
        projected_y = [(v - center).dot(up) for v in points]
        width = max(projected_x) - min(projected_x)
        height = max(projected_y) - min(projected_y)
        target = center + right * ((max(projected_x) + min(projected_x)) / 2) + up * ((max(projected_y) + min(projected_y)) / 2)
        data = bpy.data.cameras.new(name)
        data.type = 'ORTHO'
        data.clip_start = max(span * .001, .001)
        data.clip_end = span * 30
        camera = bpy.data.objects.new(name, data)
        scene.collection.objects.link(camera)
        camera.location = target + outward * span * 4
        camera.rotation_euler = Matrix((right, up, outward)).transposed().to_euler()
        scene.camera = camera
        if width > height:
            res_x = args.resolution
            res_y = max(256, round(args.resolution * height / width))
        else:
            res_y = args.resolution
            res_x = max(256, round(args.resolution * width / height))
        scene.render.resolution_x = res_x
        scene.render.resolution_y = res_y
        data.ortho_scale = 1
        frame = data.view_frame(scene=scene)
        frame_w = max(v.x for v in frame) - min(v.x for v in frame)
        frame_h = max(v.y for v in frame) - min(v.y for v in frame)
        data.ortho_scale = max(width / frame_w, height / frame_h) * 1.10
        scene.render.filepath = str(out / (name + '.png'))
        report['views'][name] = {'projection': data.type, 'position': list(camera.location),
            'rotationEuler': list(camera.rotation_euler), 'up': list(up), 'right': list(right),
            'orthoScale': data.ortho_scale, 'resolution': [res_x, res_y], 'file': scene.render.filepath,
            'worldUnitsPerPixel': data.ortho_scale * frame_w / res_x}
        cameras.append((camera, res_x, res_y))
        (out / 'render-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print('RENDER_VIEW', name, res_x, res_y, 'bounds', list(hi-lo), flush=True)
        bpy.ops.render.render(write_still=True)
    scene.camera, scene.render.resolution_x, scene.render.resolution_y = cameras[0]
    scene.render.filepath = report['views'][cameras[0][0].name]['file']
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'spear-of-adun-model-study.blend'))
    (out / 'render-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('MODEL_STUDY_COMPLETE', out, flush=True)


if __name__ == '__main__':
    main()
