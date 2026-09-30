"""Bake only the existing AFT emissive material, using the unmodified source camera/UVs.
Web field-drive presentation, not an assertion about StarCraft propulsion physics.
No new geometry, source texture painting, or real-time mesh is used.
"""
import bpy, json
from pathlib import Path
R=Path.cwd(); O=R/'output/spear-of-adun-art/native-field-v09'; O.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(R/'output/spear-of-adun-art/modules-v01/modular-master.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene; s.frame_set(0); s.use_nodes=False
materials=set(); sources=[]
for o in s.objects:
 if o.type!='MESH':continue
 selected=o.get('module_owner')=='AFT' and o.get('role','HULL')=='HULL'
 o.hide_render=not selected; o.visible_camera=True; o.is_holdout=False
 if selected:
  sources.append(o.name)
  materials.update(m for m in o.data.materials if m and m.use_nodes)
for m in materials:
 nodes,links=m.node_tree.nodes,m.node_tree.links
 bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
 source=bsdf.inputs['Emission Color']; assert source.is_linked,m.name
 emitter=nodes.new('ShaderNodeEmission');links.new(source.links[0].from_socket,emitter.inputs['Color']);emitter.inputs['Strength'].default_value=1
 out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output)
 links.new(emitter.outputs[0],out.inputs['Surface'])
s.render.engine='CYCLES';s.cycles.samples=64;s.cycles.use_denoising=False;s.cycles.seed=37
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
s.render.resolution_x=1024;s.render.resolution_y=2048;s.render.resolution_percentage=100;s.render.use_border=False;s.render.use_crop_to_border=False;s.render.film_transparent=True
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA'
s.render.filepath=str(O/'native-emission.png');bpy.ops.render.render(write_still=True)
(O/'source.json').write_text(json.dumps({'source':'output/spear-of-adun-art/modules-v01/modular-master.blend','objects':sources,'materials':[m.name for m in materials],'method':'existing Emission Color node through unchanged camera and UVs','renderSize':[1024,2048],'cropAuthoringBox':[196,720,316,1001]},indent=2))
print('NATIVE_FIELD_BAKED',sources,flush=True)
