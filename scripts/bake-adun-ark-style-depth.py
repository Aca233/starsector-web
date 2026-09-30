"""Full-resolution depth for v12. Never upscale the old 512x1024 depth masks."""
import bpy,json,sys,numpy as np
from pathlib import Path
R=Path.cwd();O=R/'output/spear-of-adun-art/material-bake-v12';S=R/'output/spear-of-adun-art/modules-v01'
O.mkdir(parents=True,exist_ok=True)
for folder in O.glob('frame-[0-9]*'):(folder/'depth-ready.json').unlink(missing_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(S/'modular-master.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;data=json.loads((S/'module-master.json').read_text());hull=[bpy.data.objects[r['object']] for r in data['objects'] if r['role']=='HULL'];names={o.name for o in hull}
for o in s.objects:
 if o.type=='MESH':o.hide_render=o.name not in names;o.visible_camera=True;o.is_holdout=False
s.render.engine='CYCLES';s.cycles.samples=1;s.cycles.use_denoising=False;s.cycles.seed=37
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
s.render.resolution_x=1024;s.render.resolution_y=2048;s.render.resolution_percentage=100;s.render.use_border=False;s.render.use_crop_to_border=False;s.render.film_transparent=True
mat=bpy.data.materials.new('Depth-only neutral override');mat.use_nodes=True
ns=mat.node_tree.nodes;ns.clear();e=ns.new('ShaderNodeEmission');out=ns.new('ShaderNodeOutputMaterial');mat.node_tree.links.new(e.outputs[0],out.inputs['Surface']);bpy.context.view_layer.material_override=mat
s.use_nodes=True;s.node_tree.nodes.clear();rl=s.node_tree.nodes.new('CompositorNodeRLayers');bpy.context.view_layer.use_pass_z=True
out=s.node_tree.nodes.new('CompositorNodeOutputFile');out.format.file_format='OPEN_EXR';out.format.color_depth='32';out.format.color_mode='RGB';out.format.exr_codec='ZIP';s.node_tree.links.new(rl.outputs['Depth'],out.inputs[0])
import shutil
for frame in range(96):
 f=frame*3000/96;s.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update();folder=O/f'frame-{frame:04d}';folder.mkdir(exist_ok=True);out.base_path=str(folder)
 for owner in ['PORT','STARBOARD','AFT','CORE','FORE']:
  target=folder/f'{owner}-depth-hi.npy'
  if owner!='CORE' and frame>0:shutil.copyfile(O/'frame-0000'/f'{owner}-depth-hi.npy',target);continue
  for o in hull:o.hide_render=o['module_owner']!=owner
  out.file_slots[0].path='hi-depth-'+owner+'-';bpy.ops.render.render()
  im=bpy.data.images.load(str(folder/f'hi-depth-{owner}-{int(f):04d}.exr'),check_existing=False);w,h=im.size[:];pixels=np.empty(w*h*im.channels,dtype=np.float32);im.pixels.foreach_get(pixels);z=np.flipud(pixels.reshape(h,w,im.channels)[:,:,0]).copy();assert z.shape==(2048,1024);np.save(target,z);bpy.data.images.remove(im)
 (folder/'depth-ready.json').write_text(json.dumps({'size':[1024,2048],'frame':frame,'sourceFrame':f,'actualRayDepth':True}))
 print('DEPTH_READY',frame,flush=True)
print('STYLE_DEPTH_COMPLETE',flush=True)
