import bpy,sys,json
from pathlib import Path
R=Path.cwd();sys.path.insert(0,str(R/'scripts'))
from adun_ark_material_style import configure
O=R/'output/spear-of-adun-art/material-bake-v12';O.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(R/'output/spear-of-adun-art/modules-v01/modular-master.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.frame_set(0)
data=json.loads((R/'output/spear-of-adun-art/modules-v01/module-master.json').read_text());hull={r['object'] for r in data['objects'] if r['role']=='HULL'}
for o in s.objects:
 if o.type=='MESH':o.hide_render=o.name not in hull;o.visible_camera=True;o.is_holdout=False
configure(s)
s.render.filepath=str(O/'study-final.png');bpy.ops.render.render(write_still=True)
print('MATERIAL_STUDY_READY',flush=True)
