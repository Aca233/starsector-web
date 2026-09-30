"""Author and bake two hull-mounted drive collars with the source camera/material palette.
Web adaptation, not a claim that these drive collars exist in the original game model.
"""
import bpy, json, math
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view
R=Path.cwd(); O=R/'output/spear-of-adun-art/drive-v08'; O.mkdir(parents=True,exist_ok=True)
source=R/'output/spear-of-adun-art/modules-v01'
bpy.ops.wm.open_mainfile(filepath=str(source/'modular-master.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.frame_set(0);s.use_nodes=False;bpy.context.view_layer.update()
rows=json.loads((source/'module-master.json').read_text())['objects']
hull=[bpy.data.objects[r['object']] for r in rows if r['role']=='HULL']
aft=[o for o in hull if o.get('module_owner')=='AFT']
cam=s.camera; unit=cam.data.ortho_scale/1024; q=cam.matrix_world.to_quaternion(); up=q@Vector((0,0,1)); direction=-up
verts=[];faces=[];deps=bpy.context.evaluated_depsgraph_get()
for o in aft:
 e=o.evaluated_get(deps);m=e.to_mesh();m.calc_loop_triangles();offset=len(verts);verts.extend(e.matrix_world@v.co for v in m.vertices);faces.extend(tuple(offset+i for i in t.vertices) for t in m.loop_triangles);e.to_mesh_clear()
bvh=BVHTree.FromPolygons(verts,faces,all_triangles=True)
def origin(x,y):return cam.matrix_world@Vector(((x/512-.5)*cam.data.ortho_scale/2,(.5-y/1024)*cam.data.ortho_scale,0))
def mat(name,color,metal=.35,rough=.6,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission;return m
gold=mat('Drive - source palette gold',(.23,.17,.066));edge=mat('Drive - chamfer',(.33,.245,.10));dark=mat('Drive - inset cavity',(.018,.035,.05),.35,.5);blue=mat('Drive - pale ceramic',(.22,.43,.61),.18,.4,.35);light=mat('Drive - aperture',(.38,.66,.82),.05,.35,.9)
new=[]; emit=[]
def prism(name,poly,z0,z1,parent,material):
 n=len(poly);vs=[(x,-y,z0) for x,y in poly]+[(x,-y,z1) for x,y in poly];fs=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);s.collection.objects.link(o);o.parent=parent;o.data.materials.append(material);b=o.modifiers.new('Physical bevel','BEVEL');b.width=min(.6,(z1-z0)*.3);b.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');new.append(o);return o
report=[]
for i,x in enumerate([244,268]):
 y=946;hit=bvh.ray_cast(origin(x,y),direction,1000)
 assert hit[0] is not None, ('No actual aft plating at drive seat',x,y)
 anchor=hit[0];root=bpy.data.objects.new('ArkDrive'+str(i),None);s.collection.objects.link(root);root.matrix_world=Matrix.Translation(anchor)@q.to_matrix().to_4x4()@Matrix.Diagonal((unit,unit,unit,1))
 # A long tapered collar follows the stern blade; the lower end is deliberately open.
 prism('DriveHull'+str(i),[(0,-30),(-7,-19),(-10,4),(-9,21),(9,21),(10,4),(7,-19)],-.5,1.3,root,gold)
 prism('DriveWell'+str(i),[(-5,-10),(-7,5),(-7,23),(7,23),(7,5),(5,-10)],1.2,1.5,root,dark)
 for side in [-1,1]:
  prism('DriveCheek'+str(i)+str(side),[(side*7,-14),(side*10,4),(side*10,23),(side*7,23),(side*5,-5)],1.2,3.0,root,edge)
 prism('DriveCap'+str(i),[(0,-25),(-4,-15),(0,-7),(4,-15)],1.4,2.4,root,blue)
 throat=prism('DriveEmitter'+str(i),[(-6,5),(-6,22),(6,22),(6,5)],1.6,1.85,root,light);emit.append(throat)
 for yy in [-4,1]:prism('DriveLouver'+str(i)+str(yy),[(-6,yy),(6,yy),(6,yy+1.3),(-6,yy+1.3)],1.5,2.0,root,gold)
 bpy.context.view_layer.update();p=root.matrix_world@Vector((0,-22,1.8));uv=world_to_camera_view(s,cam,p)
 report.append({'seat':[x,y],'exit':[uv.x*512,(1-uv.y)*1024],'nozzleWidth':12,'surfaceWorld':list(anchor),'authored':True})
s.render.engine='CYCLES';s.cycles.samples=128;s.cycles.use_denoising=True;s.cycles.seed=37
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
s.render.resolution_x=1024;s.render.resolution_y=2048;s.render.resolution_percentage=100;s.render.use_border=False;s.render.use_crop_to_border=False;s.render.film_transparent=True;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA'
for o in s.objects:
 if o.type=='MESH':o.hide_render=o not in new;o.visible_camera=True;o.is_holdout=False
s.render.filepath=str(O/'collars.png');bpy.ops.render.render(write_still=True)
# Exact aperture silhouettes; emitted light has no circular primitive or noise fallback.
for o in new:o.hide_render=o not in emit
for o in emit:
 m=bpy.data.materials.new(o.name+' light-only');m.use_nodes=True;n=m.node_tree.nodes;n.clear();e=n.new('ShaderNodeEmission');e.inputs['Color'].default_value=(.35,.62,.85,1);e.inputs['Strength'].default_value=1;out=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(e.outputs[0],out.inputs[0]);o.data.materials.clear();o.data.materials.append(m)
s.render.filepath=str(O/'apertures.png');bpy.ops.render.render(write_still=True)
for o in hull+new:o.hide_render=False
s.render.filepath=str(O/'assembly.png');bpy.ops.render.render(write_still=True)
(O/'calibration.json').write_text(json.dumps({'source':'modular-master.blend','canvas':[512,1024],'sourceScale':2,'ports':report},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(O/'drive-collars.blend'))
print('DRIVE_BAKED',json.dumps(report),flush=True)
