"""Bake the real source emission map through v12's unchanged camera, rig and UVs.
Emissive-only passes: no invented lines/noise, no lighting rebake, no game registration.
"""
from pathlib import Path
import bpy,json,math
from mathutils import Matrix
R=Path.cwd();O=R/'output/spear-of-adun-art/system-emission-v18';O.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(R/'output/spear-of-adun-art/material-bake-v12/material-master.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.frame_set(0);s.use_nodes=False
hull=[o for o in s.objects if o.type=='MESH' and o.get('role','HULL')=='HULL' and o.get('module_owner')]
for o in s.objects:
 if o.type=='MESH':o.hide_render=o not in hull;o.visible_camera=True;o.is_holdout=False
for m in {m for o in hull for m in o.data.materials if m and m.use_nodes}:
 nodes,links=m.node_tree.nodes,m.node_tree.links
 bs=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
 if not bs:raise RuntimeError('Unrecognized source material '+m.name)
 emitter=nodes.new('ShaderNodeEmission');source=bs.inputs['Emission Color']
 if source.is_linked:links.new(source.links[0].from_socket,emitter.inputs['Color'])
 else:emitter.inputs['Color'].default_value=source.default_value
 emitter.inputs['Strength'].default_value=1
 out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output);links.new(emitter.outputs[0],out.inputs['Surface'])
s.render.engine='CYCLES';s.cycles.samples=16;s.cycles.use_denoising=False;s.cycles.seed=37;s.cycles.use_animated_seed=False
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
s.render.resolution_x=1024;s.render.resolution_y=2048;s.render.resolution_percentage=100;s.render.use_border=False;s.render.use_crop_to_border=False;s.render.film_transparent=True
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA'
def render(name,owner):
 for o in hull:o.hide_render=o['module_owner']!=owner
 s.render.filepath=str(O/name);bpy.ops.render.render(write_still=True)
for owner in ['PORT','STARBOARD','AFT','FORE']:render(owner+'.png',owner)
for i in range(96):
 f=i*3000/96;s.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update();render(f'core-{i:02d}.png','CORE');print('EMISSION_CORE',i,flush=True)
s.frame_set(0);bpy.context.view_layer.update();rig=next(o for o in s.objects if o.type=='ARMATURE')
basis={b.name:b.matrix_basis.copy() for b in rig.pose.bones};rig.animation_data_clear()
for name,value in basis.items():rig.pose.bones[name].matrix_basis=value
bpy.context.view_layer.update()
controls=['Ctrl_Gun_Lower_L_12','Ctrl_Gun_Lower_R_7','Ctrl_Gun_Lower_Wing_L_13','Ctrl_Gun_Lower_Wing_R_14']
base={name:rig.pose.bones[name].matrix.copy() for name in controls};world={name:rig.matrix_world@v for name,v in base.items()}
pivots={side:(rig.matrix_world@rig.pose.bones[name].head).copy() for side,name in [('L','Ctrl_Gun_Lower_L_12'),('R','Ctrl_Gun_Lower_R_7')]}
poses=[(0,0),(6,1),(12,3),(18,5),(24,7),(30,9),(36,11),(42,12),(48,12),(54,12),(60,12),(66,12),(72,10),(78,7),(84,3),(90,0)]
for i in range(46):
 f=i*2;lo=max(j for j,p in enumerate(poses) if p[0]<=f);a=poses[lo];b=poses[min(lo+1,len(poses)-1)];q=0 if a[0]==b[0] else (f-a[0])/(b[0]-a[0]);angle=a[1]+(b[1]-a[1])*q
 for name in controls:rig.pose.bones[name].matrix=base[name]
 bpy.context.view_layer.update()
 for name in controls:
  side='L' if '_L_' in name else 'R';pivot=pivots[side];delta=Matrix.Translation(pivot)@Matrix.Rotation(math.radians(angle)*(1 if side=='L' else -1),4,'Z')@Matrix.Translation(-pivot)
  rig.pose.bones[name].matrix=rig.matrix_world.inverted()@delta@world[name];bpy.context.view_layer.update()
 render(f'fore-{i:02d}.png','FORE');print('EMISSION_LANCE',i,flush=True)
(O/'complete.json').write_text(json.dumps({'source':'material-bake-v12/material-master.blend','method':'original Emission Color, unchanged UV/camera/rig; depth clipping deferred to packing','coreFrames':96,'lanceFrames':46,'size':[1024,2048],'samples':16},indent=2))
