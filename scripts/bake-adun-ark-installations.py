"""Bake hull-conforming, per-slot sockets from the v12 material/lighting master.
Only new fixture geometry; original hull, rig, turret and anchor data stay intact.
Run Blender headless; --sites accepts comma-separated layout IDs for art review.
"""
import bpy, json, math, sys, argparse, hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path.cwd(); O=R/'output/spear-of-adun-art/installations-v16';O.mkdir(parents=True,exist_ok=True)
ap=argparse.ArgumentParser();ap.add_argument('--sites');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source=R/'output/spear-of-adun-art/material-bake-v12/material-master.blend'
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.frame_set(0);bpy.context.view_layer.update();s.use_nodes=False
master=json.loads((R/'output/spear-of-adun-art/modules-v01/module-master.json').read_text())
rows=[r for r in master['objects'] if r['role']=='HULL'];hull=[bpy.data.objects[r['object']] for r in rows]
for o in s.objects:
 if o.type=='MESH':o.hide_render=True;o.is_shadow_catcher=False;o.visible_camera=True;o.is_holdout=False
sites={r['id']:r for r in json.loads((R/'output/spear-of-adun-art/mount-layout-v01/calibration.json').read_text())['sites']}
layout=json.loads((R/'src/engine/content/adun-ark-layout.json').read_text());layout=[r for r in layout if r['size']!='EXTRA_LARGE']
unit=s.camera.data.ortho_scale/1024;q=s.camera.matrix_world.to_quaternion()
right,forward,up=[q@Vector(v) for v in [(1,0,0),(0,1,0),(0,0,1)]]
s.render.resolution_x=4096;s.render.resolution_y=8192;s.render.resolution_percentage=100
s.render.use_border=True;s.render.use_crop_to_border=True;s.render.film_transparent=True
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.image_settings.color_depth='8'
s.cycles.samples=192;s.cycles.use_denoising=True;s.cycles.seed=37;s.cycles.use_animated_seed=False
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
# Keep the master's material nodes and lighting, including texture relief/AO.
collection=bpy.data.collections.new('v16 deck sockets');s.collection.children.link(collection)
deps=bpy.context.evaluated_depsgraph_get();meshes={};bvhs={}
for owner in ['FORE','AFT','PORT','STARBOARD']:
 verts=[];faces=[];sources=[]
 for row in rows:
  if row['owner']!=owner:continue
  o=bpy.data.objects[row['object']];e=o.evaluated_get(deps);m=bpy.data.meshes.new_from_object(e,preserve_all_data_layers=True,depsgraph=deps);m.calc_loop_triangles()
  wp=[e.matrix_world@v.co for v in m.vertices];offset=len(verts);verts+=wp
  for t in m.loop_triangles:
   faces.append(tuple(offset+i for i in t.vertices));sources.append((m,tuple(t.loops),tuple(wp[i] for i in t.vertices),m.materials[t.material_index]))
 bvhs[owner]=(BVHTree.FromPolygons(verts,faces,all_triangles=True),sources)

def weights(p,tri):
 a,b,c=tri;v0=b-a;v1=c-a;v2=p-a;d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1);den=d00*d11-d01*d01
 v=(d11*d20-d01*d21)/den;w=(d00*d21-d01*d20)/den;return (1-v-w,v,w)

def sample(owner,origin,x,y):
 hit,n,idx,dist=bvhs[owner][0].ray_cast(origin+right*(x*unit)+forward*(y*unit)+up*10,-up,20)
 if hit is None:raise RuntimeError(f'Unsupported deck footprint: {owner} {x} {y}')
 m,loops,tri,mat=bvhs[owner][1][idx];w=weights(hit,tri)
 uv={layer.name:sum((layer.data[i].uv*weight for i,weight in zip(loops,w)),Vector((0,0))) for layer in m.uv_layers}
 color=tuple(sum(m.color_attributes['Color'].data[i].color[ch]*weight for i,weight in zip(loops,w)) for ch in range(4)) if 'Color' in m.color_attributes else (1,1,1,1)
 return {'height':(hit-origin).dot(up)/unit,'uv':uv,'color':color,'material':mat}

def flat_material(name,rgb,metal,rough):
 mat=bpy.data.materials.new(name);mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return mat
bearingmat=flat_material('v16 non-emissive recessed bearing',(.025,.035,.044),.2,.64)
material_copies={}
def alloy(source):
 if source.name not in material_copies:
  m=source.copy();m.name='v16 deck alloy '+source.name
  bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  # Fixture armor must not duplicate a covered deck light/emitter.
  for link in list(bs.inputs['Emission Color'].links):m.node_tree.links.remove(link)
  bs.inputs['Emission Strength'].default_value=0
  material_copies[source.name]=m
 return material_copies[source.name]

def mesh(name,owner,origin,verts,faces,fixed_material=None):
 samples=[sample(owner,origin,v[0],v[1]) for v in verts]
 data=bpy.data.meshes.new(name);data.from_pydata([origin+right*(x*unit)+forward*(y*unit)+up*(z*unit) for x,y,z in verts],[],faces);data.update()
 obj=bpy.data.objects.new(name,data);collection.objects.link(obj)
 mats=[]
 for p in data.polygons:
  mat=fixed_material or alloy(samples[p.vertices[0]]['material'])
  if mat not in mats:mats.append(mat);data.materials.append(mat)
  p.material_index=mats.index(mat)
 if not fixed_material:
  for uvname in samples[0]['uv']:
   layer=data.uv_layers.new(name=uvname)
   for i,loop in enumerate(data.loops):layer.data[i].uv=samples[loop.vertex_index]['uv'][uvname]
  color=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
  for i,loop in enumerate(data.loops):color.data[i].color=samples[loop.vertex_index]['color']
 bevel=obj.modifiers.new('Physical edge bevel','BEVEL');bevel.width=.08*unit;bevel.segments=2
 obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return obj

report=json.loads((O/'bake.json').read_text()) if (O/'bake.json').exists() else {'version':16,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourcePixelsPerUnit':8,'slots':{}}
selected=set(args.sites.split(',')) if args.sites else {r['id'] for r in layout}
for row in layout:
 if row['id'] not in selected:continue
 id=row['id'];owner=row['owner'];site=sites[id];origin=Vector(site['restWorldAnchor']);tag={'SMALL':'S','MEDIUM':'M','LARGE':'L'}[row['size']]
 radius={'S':3.4,'M':5.7,'L':7.7}[tag]
 outline=[(-.55,-1),(.55,-1),(.94,-.27),(.78,.42),(.32,.95),(-.32,.95),(-.78,.42),(-.94,-.27)]
 border=[]
 for a,b in zip(outline,outline[1:]+outline[:1]):
  for i in range(4):border.append(((a[0]*(1-i/4)+b[0]*i/4)*radius,(a[1]*(1-i/4)+b[1]*i/4)*radius))
 n=len(border);inner=[sample(owner,origin,x*.48,y*.48)['height'] for x,y in border];top=max(inner)+.35
 verts=[]
 for scale,t in [(1,0),(.78,.16),(.60,.78),(.48,1)]:
  for x,y in border:
   x*=scale;y*=scale;z=sample(owner,origin,x,y)['height'];verts.append((x,y,(z+.025)*(1-t)+top*t))
 faces=[]
 for ring in range(3):
  for i in range(n):j=(i+1)%n;faces.append((ring*n+i,ring*n+j,(ring+1)*n+j,(ring+1)*n+i))
 faces.append(tuple(3*n+i for i in range(n)))
 saddle=mesh(id+' saddle',owner,origin,verts,faces)
 # A level dark bearing sunk inside the modeled rim, not a black painted disc.
 verts=[(math.cos(i*math.tau/32)*radius*.40,math.sin(i*math.tau/32)*radius*.40,top+.08) for i in range(32)]
 socket=mesh(id+' bearing',owner,origin,verts,[tuple(range(32))],bearingmat)
 # Raised rear-quarter rim is real geometry, authored separately for foreground.
 vs=[]
 for height,r in [(top,.46),(top+.25,.46),(top+.25,.40),(top+.08,.40)]:
  for i in range(17):angle=math.pi+i*math.pi/16;vs.append((math.cos(angle)*radius*r,math.sin(angle)*radius*r,height))
 fs=[]
 for k in range(3):
  for i in range(16):fs.append((k*17+i,k*17+i+1,(k+1)*17+i+1,(k+1)*17+i))
 lip=mesh(id+' rear bearing guard',owner,origin,vs,fs)
 objects=[saddle,socket,lip]
 for o in hull:o.hide_render=o['module_owner']!=owner;o.is_shadow_catcher=not o.hide_render;o.visible_camera=True
 # A small crop includes all physical shadow support and no opaque hull pixels.
 x,y=row['point'];extent=math.ceil(radius+8);box=[x-extent,y-extent,x+extent,y+extent]
 s.render.border_min_x=box[0]/512;s.render.border_max_x=box[2]/512;s.render.border_min_y=1-box[3]/1024;s.render.border_max_y=1-box[1]/1024
 s.render.filepath=str(O/(id+'-seat.png'));bpy.ops.render.render(write_still=True)
 # Hold out the rest of the fixture so the foreground cannot include hidden
 # backfaces/shaft portions. No receiver/shadow in the foreground pass.
 for o in hull:o.is_shadow_catcher=False;o.is_holdout=True
 saddle.is_holdout=True;socket.is_holdout=True
 s.render.filepath=str(O/(id+'-lip.png'));bpy.ops.render.render(write_still=True)
 for o in hull:o.hide_render=True;o.is_holdout=False
 for o in objects:o.hide_render=True;o.is_holdout=False
 report['slots'][id]={'tag':tag,'owner':owner,'anchor':row['point'],'box':box,'radius':radius,'bearingHeightOverAnchor':top,'surfaceSamples':len(border)*5,'lowerContactOffsetPx':.025,'objects':[o.name for o in objects],'sourceSurface':site['sourceSurface']['object'],'materialNames':[m.name for m in saddle.data.materials]}
 (O/'bake.json').write_text(json.dumps(report,indent=2))
 print('SOCKET_BAKED',id,flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(O/('socket-master-'+('study' if args.sites else 'all')+'.blend')))
print('SOCKET_BAKE_COMPLETE',len(selected),flush=True)
