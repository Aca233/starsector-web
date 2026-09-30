"""Re-bake the existing Web-authored fore mechanism onto the CURRENT module master.
Original geometry/UVs/camera, original four named control bones. No runtime mesh.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix
R=Path.cwd();O=R/'output/spear-of-adun-art/lance-motion-v10';O.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(R/'output/spear-of-adun-art/modules-v01/modular-master.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.frame_set(0);s.use_nodes=False
source=json.loads((R/'output/spear-of-adun-art/modules-v01/module-master.json').read_text())
selected={r['object'] for r in source['objects'] if r['role']=='HULL' and r['owner']=='FORE'}
for o in s.objects:
 if o.type=='MESH':o.hide_render=o.name not in selected;o.visible_camera=True;o.is_holdout=False
rig=next(o for o in s.objects if o.type=='ARMATURE');basis={b.name:b.matrix_basis.copy() for b in rig.pose.bones};rig.animation_data_clear()
for name,value in basis.items():rig.pose.bones[name].matrix_basis=value
bpy.context.view_layer.update()
names=['Ctrl_Gun_Lower_L_12','Ctrl_Gun_Lower_R_7','Ctrl_Gun_Lower_Wing_L_13','Ctrl_Gun_Lower_Wing_R_14']
base={name:rig.pose.bones[name].matrix.copy() for name in names};world={name:rig.matrix_world@v for name,v in base.items()}
pivots={side:(rig.matrix_world@rig.pose.bones[name].head).copy() for side,name in [('L','Ctrl_Gun_Lower_L_12'),('R','Ctrl_Gun_Lower_R_7')]}
mat=bpy.data.materials['Material.011'];bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');emission=bsdf.inputs['Emission Strength'];assert not emission.is_linked;base_emission=emission.default_value
s.render.engine='CYCLES';s.cycles.samples=192;s.cycles.use_denoising=True;s.cycles.seed=37;s.cycles.use_animated_seed=False
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
s.render.resolution_x=1024;s.render.resolution_y=2048;s.render.resolution_percentage=100;s.render.use_border=False;s.render.use_crop_to_border=False;s.render.film_transparent=True;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA'
poses=[(0,0,1),(6,1,1),(12,3,1),(18,5,1),(24,7,1),(30,9,1),(36,11,1),(42,12,1),(48,12,1.7),(54,12,2.5),(60,12,3.5),(66,12,1.5),(72,10,1),(78,7,1),(84,3,1),(90,0,1)]
frames=[]
for i in range(46):
 f=i*2
 lo=max(j for j,p in enumerate(poses) if p[0]<=f);a=poses[lo];b=poses[min(lo+1,len(poses)-1)];q=0 if a[0]==b[0] else (f-a[0])/(b[0]-a[0]);angle=a[1]+(b[1]-a[1])*q;energy=a[2]+(b[2]-a[2])*q
 for name in names:rig.pose.bones[name].matrix=base[name]
 bpy.context.view_layer.update()
 for name in names:
  side='L' if '_L_' in name else 'R';pivot=pivots[side];delta=Matrix.Translation(pivot)@Matrix.Rotation(math.radians(angle)*(1 if side=='L' else -1),4,'Z')@Matrix.Translation(-pivot)
  rig.pose.bones[name].matrix=rig.matrix_world.inverted()@delta@world[name];bpy.context.view_layer.update()
 emission.default_value=base_emission*energy;bpy.context.view_layer.update()
 s.render.filepath=str(O/f'fore-{i:02d}.png');bpy.ops.render.render(write_still=True)
 frames.append({'index':i,'angle':angle,'emissionMultiplier':energy});print('LANCE_BAKED',i,flush=True)
(O/'source.json').write_text(json.dumps({'source':'modules-v01/modular-master.blend','canonicalAnimation':False,'controls':names,'objects':sorted(selected),'frames':frames},indent=2))
