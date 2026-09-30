"""Bake normalized real model weapon heads/seats; no runtime meshes."""
import bpy, json, math
from pathlib import Path
from bpy_extras.object_utils import world_to_camera_view
R=Path.cwd(); O=R/'output/spear-of-adun-art/ark-weapons-v06'; O.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(R/'output/spear-of-adun-art/weapon-fit-v01/weapon-fit.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.use_nodes=False;s.frame_set(0)
s.render.engine='CYCLES';s.cycles.samples=128;s.cycles.use_denoising=True
p=bpy.context.preferences.addons['cycles'].preferences;p.compute_device_type='OPTIX';p.get_devices()
for d in p.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in p.devices) else 'CPU'
s.render.resolution_x=1024;s.render.resolution_y=2048;s.render.resolution_percentage=100
s.render.use_border=False;s.render.use_crop_to_border=False;s.render.film_transparent=True
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA'
rows=json.loads((R/'output/spear-of-adun-art/weapon-fit-v01/weapon-fit.json').read_text())['sites']
def xy(o):
 v=world_to_camera_view(s,s.camera,o.matrix_world.translation);return [v.x*512,(1-v.y)*1024]
report={}
for row in rows:
 bpy.data.objects[row['pivot']].rotation_euler.z=0;bpy.context.view_layer.update()
 anchor=xy(bpy.data.objects[row['pivot']]);muzzles=[xy(bpy.data.objects[n]) for n in row['muzzles']]
 report[row['tag']]={'anchor':anchor,'muzzles':muzzles}
 for kind,key in [('head','headObjects'),('seat','fixedObjects')]:
  for o in s.objects:
   if o.type=='MESH':o.hide_render=o.name not in row[key];o.visible_camera=True;o.is_holdout=False
  s.render.filepath=str(O/(row['tag']+'-'+kind+'.png'));bpy.ops.render.render(write_still=True)
(O/'calibration.json').write_text(json.dumps(report,indent=2))
print('ARK_WEAPONS_BAKED',flush=True)
