"""Render real interpolated bone poses at 30fps into a registered local texture patch."""
import json
import sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path.cwd();OUT=ROOT/'output/spear-of-adun-art/fore-deployment-v01';FRAMES=OUT/'patch-frames'
FRAMES.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(OUT/'fore-deployment.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.use_nodes=False
sys.path.insert(0,str(ROOT/'scripts'))
from spear_of_adun_core_animation import freeze_core_for_isolated_export
# This patch is exclusively the gun state channel. It must not bake unrelated
# core time into each charge pose; the whole-ship master keeps ring motion.
freeze_core_for_isolated_export(next(o for o in s.objects if o.type=='ARMATURE'))
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
s.cycles.samples=192
rect=(192,184,320,344)
s.render.use_border=True;s.render.use_crop_to_border=True
s.render.border_min_x=rect[0]/512;s.render.border_max_x=rect[2]/512
s.render.border_min_y=(1024-rect[3])/1024;s.render.border_max_y=(1024-rect[1])/1024
objects=[o for o in s.objects if o.name.startswith('AdunFore_')]
assert len(objects)==12
for o in objects:
 assert len(o.vertex_groups)==1
 assert all(len(v.groups)==1 and abs(v.groups[0].weight-1)<1e-6 for v in o.data.vertices)
rows=[]
for index,frame in enumerate(range(0,91,2)):
 s.frame_set(frame);bpy.context.view_layer.update();points=[]
 for o in objects:
  obj=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=obj.to_mesh()
  points.extend(world_to_camera_view(s,s.camera,obj.matrix_world@v.co) for v in m.vertices)
  obj.to_mesh_clear()
 bounds=[min(v.x for v in points)*512,(1-max(v.y for v in points))*1024,max(v.x for v in points)*512,(1-min(v.y for v in points))*1024]
 assert rect[0]+4<bounds[0] and rect[1]+4<bounds[1] and bounds[2]<rect[2]-4 and bounds[3]<rect[3]-4,bounds
 s.render.filepath=str(FRAMES/f'{index:03d}.png');bpy.ops.render.render(write_still=True)
 rows.append({'index':index,'sourceFrame':frame,'timeSeconds':frame/60,'file':f'patch-frames/{index:03d}.png','boundsPx':bounds})
assert max(abs(a-b) for a,b in zip(rows[0]['boundsPx'],rows[21]['boundsPx']))>4
assert max(abs(a-b) for a,b in zip(rows[0]['boundsPx'],rows[-1]['boundsPx']))<.01
(OUT/'patch-render-report.json').write_text(json.dumps({'rect':rect,'fps':30,'sourceFPS':60,'durationSeconds':1.5,'frames':rows,'allSegmentsHaveUnitSourceWeights':True,'restReturnsToSameBounds':True,'renderedPosesNotImageMorphing':True,'gameIntegrated':False},indent=2),encoding='utf-8')
print('FORE_PATCH_SEQUENCE_COMPLETE',flush=True)
