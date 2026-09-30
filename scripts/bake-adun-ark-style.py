"""Bake one consistent material treatment for every existing ark pose.
Depth is rendered separately by bake-adun-ark-style-depth.py at the same resolution.
Nothing is registered in the game until pack-adun-ark-style.py completes.
"""
from pathlib import Path
import bpy,json,sys,shutil,math,hashlib
from mathutils import Matrix
R=Path.cwd();sys.path.insert(0,str(R/'scripts'))
from adun_ark_material_style import configure
SRC=R/'output/spear-of-adun-art/modules-v01';O=R/'output/spear-of-adun-art/material-bake-v12'
O.mkdir(parents=True,exist_ok=True)
(O/'bake-complete.json').unlink(missing_ok=True)
for folder in O.glob('frame-[0-9]*'):(folder/'bake.json').unlink(missing_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SRC/'modular-master.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.frame_set(0);configure(s)
data=json.loads((SRC/'module-master.json').read_text());rows=[r for r in data['objects'] if r['role']=='HULL'];names={r['object'] for r in rows}
hull=[bpy.data.objects[r['object']] for r in rows]
for o in s.objects:
 if o.type=='MESH':o.hide_render=o.name not in names;o.visible_camera=True;o.is_holdout=False
# The packed source carries unchanged original UV textures.
s.render.filepath=str(O/'study-final.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(O/'material-master.blend'))
for frame in range(96):
 f=frame*3000/96;s.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
 folder=O/f'frame-{frame:04d}';folder.mkdir(exist_ok=True)
 for owner in ['PORT','STARBOARD','AFT','CORE','FORE']:
  if owner!='CORE' and frame>0:shutil.copyfile(O/'frame-0000'/f'{owner}.png',folder/f'{owner}.png');continue
  for o in hull:o.hide_render=o['module_owner']!=owner
  s.render.filepath=str(folder/f'{owner}.png');bpy.ops.render.render(write_still=True)
 (folder/'bake.json').write_text(json.dumps({'frame':frame,'sourceFrame':f,'size':[1024,2048],'scale':2,'samples':192,'styleVersion':12,'depthSource':'bake-adun-ark-style-depth.py; full-resolution camera ray depth'}))
 print('STYLE_HULL',frame,flush=True)
# Main gun, same authority-driven 46 authored poses as v10, matching frame-zero shading.
s.frame_set(0);bpy.context.view_layer.update()
for o in hull:o.hide_render=o['module_owner']!='FORE'
rig=next(o for o in s.objects if o.type=='ARMATURE');basis={b.name:b.matrix_basis.copy() for b in rig.pose.bones};rig.animation_data_clear()
for name,value in basis.items():rig.pose.bones[name].matrix_basis=value
bpy.context.view_layer.update()
controls=['Ctrl_Gun_Lower_L_12','Ctrl_Gun_Lower_R_7','Ctrl_Gun_Lower_Wing_L_13','Ctrl_Gun_Lower_Wing_R_14']
base={name:rig.pose.bones[name].matrix.copy() for name in controls};world={name:rig.matrix_world@v for name,v in base.items()}
pivots={side:(rig.matrix_world@rig.pose.bones[name].head).copy() for side,name in [('L','Ctrl_Gun_Lower_L_12'),('R','Ctrl_Gun_Lower_R_7')]}
bs=next(n for n in bpy.data.materials['Material.011'].node_tree.nodes if n.type=='BSDF_PRINCIPLED');emission=bs.inputs['Emission Strength'];energy0=emission.default_value
poses=[(0,0,1),(6,1,1),(12,3,1),(18,5,1),(24,7,1),(30,9,1),(36,11,1),(42,12,1),(48,12,1.7),(54,12,2.5),(60,12,3.5),(66,12,1.5),(72,10,1),(78,7,1),(84,3,1),(90,0,1)]
for i in range(46):
 f=i*2;lo=max(j for j,p in enumerate(poses) if p[0]<=f);a=poses[lo];b=poses[min(lo+1,len(poses)-1)];q=0 if a[0]==b[0] else (f-a[0])/(b[0]-a[0]);angle=a[1]+(b[1]-a[1])*q;energy=a[2]+(b[2]-a[2])*q
 for name in controls:rig.pose.bones[name].matrix=base[name]
 bpy.context.view_layer.update()
 for name in controls:
  side='L' if '_L_' in name else 'R';pivot=pivots[side];delta=Matrix.Translation(pivot)@Matrix.Rotation(math.radians(angle)*(1 if side=='L' else -1),4,'Z')@Matrix.Translation(-pivot)
  rig.pose.bones[name].matrix=rig.matrix_world.inverted()@delta@world[name];bpy.context.view_layer.update()
 emission.default_value=energy0*energy;bpy.context.view_layer.update()
 s.render.filepath=str(O/f'fore-{i:02d}.png');bpy.ops.render.render(write_still=True)
 print('STYLE_LANCE',i,flush=True)
(O/'bake-complete.json').write_text(json.dumps({'version':12,'sourceBlendSha256':hashlib.sha256((SRC/'modular-master.blend').read_bytes()).hexdigest(),'styleScriptSha256':hashlib.sha256((R/'scripts/adun_ark_material_style.py').read_bytes()).hexdigest(),'hullPoses':96,'lancePoses':46,'geometryChanged':False,'rigChanged':False,'uvChanged':False,'shaderDetail':'existing albedo relief and bevel; no invented noise','sourceView':[s.camera.data.ortho_scale,list(s.camera.location),list(s.camera.rotation_euler)]},indent=2))
print('STYLE_ALL_BAKED',flush=True)
