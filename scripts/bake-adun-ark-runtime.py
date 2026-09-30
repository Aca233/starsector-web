"""Bake real per-module RGBA/depth plus scene references for offline 2D layering.

Depth is an authoring input, NOT a runtime 3D model or procedural game effect.
The master, old v05 assets and game code are never modified.
"""
import argparse
import json
import sys
from pathlib import Path
import bpy
import numpy as np

ROOT = Path.cwd()
SRC = ROOT / 'output/spear-of-adun-art/modules-v01'
OUT = ROOT / 'output/spear-of-adun-art/ark-runtime-v06'
parser = argparse.ArgumentParser()
parser.add_argument('--frames', default='0,42,750,1500,2250')
parser.add_argument('--scale', type=int, default=2)
parser.add_argument('--samples', type=int, default=192)
parser.add_argument('--removals', action='store_true')
parser.add_argument('--removal-frames', default='0,42,1500')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
data = json.loads((SRC/'module-master.json').read_text(encoding='utf-8'))
bpy.ops.wm.open_mainfile(filepath=str(SRC/'modular-master.blend'), load_ui=False, use_scripts=False)
s=bpy.context.scene
objects=[bpy.data.objects[r['object']] for r in data['objects']]
hull=[bpy.data.objects[r['object']] for r in data['objects'] if r['role']=='HULL']
modules=[m['id'] for m in data['modules']]
for o in objects:
    o.hide_render=o not in hull; o.visible_camera=True; o.is_holdout=False
s.render.resolution_x=512*args.scale;s.render.resolution_y=1024*args.scale;s.render.resolution_percentage=100
s.render.film_transparent=True;s.render.engine='CYCLES'
s.cycles.samples=args.samples;s.cycles.seed=37;s.cycles.use_animated_seed=False;s.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.image_settings.color_depth='8'
s.use_nodes=True
nodes,links=s.node_tree.nodes,s.node_tree.links;nodes.clear()
bpy.context.view_layer.use_pass_z=True
rl=nodes.new('CompositorNodeRLayers');combined=nodes.new('CompositorNodeComposite')
links.new(rl.outputs['Image'],combined.inputs['Image'])
depth_file=nodes.new('CompositorNodeOutputFile');depth_file.format.file_format='OPEN_EXR'
depth_file.format.color_depth='32';depth_file.format.color_mode='RGB';depth_file.format.exr_codec='ZIP'
links.new(rl.outputs['Depth'],depth_file.inputs[0])

frames=list(range(96))
static={}
for frame in frames:
    source_frame=frame*3000/96
    s.frame_set(int(source_frame),subframe=source_frame%1);bpy.context.view_layer.update()
    folder=OUT/f'frame-{frame:04d}';folder.mkdir(parents=True,exist_ok=True)
    depth_file.base_path=str(folder)
    for module in modules:
        if module!='CORE' and frame>0:
            import shutil
            for suffix in ('.png','-depth.npy'):shutil.copyfile(OUT/'frame-0000'/(module+suffix),folder/(module+suffix))
            continue
        for o in hull:o.hide_render=o['module_owner']!=module;o.visible_camera=True
        depth_file.mute=False;depth_file.file_slots[0].path=f'depth-{module}-'
        s.render.filepath=str(folder/f'{module}.png');bpy.ops.render.render(write_still=True)
        path=folder/f'depth-{module}-{int(source_frame):04d}.exr'
        image=bpy.data.images.load(str(path),check_existing=False)
        w,h=image.size[:];pixels=np.empty(w*h*image.channels,dtype=np.float32);image.pixels.foreach_get(pixels)
        z=np.flipud(pixels.reshape(h,w,image.channels)[:,:,0]).copy()
        np.save(folder/f'{module}-depth.npy',z);bpy.data.images.remove(image)
    (folder/'bake.json').write_text(json.dumps({'frame':frame,'sourceFrame':source_frame,'scale':args.scale,'size':[512*args.scale,1024*args.scale],
        'samples':args.samples,'unarmed':True,'lighting':'isolated module self-shadowing; no stale foreign shadows'},indent=2),encoding='utf-8')
    print('ARK_RUNTIME_FRAME',frame,flush=True)

