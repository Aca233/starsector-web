"""Model-backed mount-region evidence, never inferred slots from painted circles."""
import json
from pathlib import Path
import bpy
from mathutils.bvhtree import BVHTree
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path.cwd();OUT=ROOT/'output/spear-of-adun-art/mount-layout-v01'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'output/spear-of-adun-art/core-motion-v01/core-motion.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.frame_set(0);bpy.context.view_layer.update()
rig=next(o for o in s.objects if o.type=='ARMATURE')
helpers={b.custom_shape for b in rig.pose.bones if b.custom_shape}
objects=[o for o in s.objects if o.type=='MESH' and not o.hide_render and o not in helpers]
CORE={'Ctrl_Core_Outter_1','Ctrl_Core_Inner_2'}

def ancestry(name):
    b=rig.pose.bones.get(name);chain=[]
    while b:
        chain.append(b.name);b=b.parent
    return chain

def category(name):
    chain=ancestry(name)
    if any(n in CORE for n in chain):return 'ROTATING_CORE'
    if 'Ctrl_Gun_Master_15' in chain:return 'FORE_MECHANISM'
    return 'FIXED_HULL'

rows=[];verts=[];faces=[];owners=[]
for obj in objects:
    active={g.group for v in obj.data.vertices for g in v.groups if g.weight>.001}
    groups=[obj.vertex_groups[i].name for i in sorted(active)]
    categories=sorted({category(name) for name in groups})
    assert len(categories)==1,(obj.name,categories)
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();m.calc_loop_triangles()
    world=[e.matrix_world@v.co for v in m.vertices]
    xy=[world_to_camera_view(s,s.camera,p) for p in world]
    bbox=[min(p.x for p in xy)*512,(1-max(p.y for p in xy))*1024,max(p.x for p in xy)*512,(1-min(p.y for p in xy))*1024]
    row={'object':obj.name,'category':categories[0],'activeGroups':groups,'parentChains':{g:ancestry(g) for g in groups},
         'vertices':len(m.vertices),'triangles':len(m.loop_triangles),'boundsPx':bbox,'materials':[mat.name for mat in m.materials]}
    rows.append(row);offset=len(verts);verts.extend(world)
    for tri in m.loop_triangles:
        faces.append(tuple(offset+i for i in tri.vertices));owners.append(row)
    e.to_mesh_clear()
assert len([r for r in rows if r['category']=='ROTATING_CORE'])==4
bvh=BVHTree.FromPolygons(verts,faces,all_triangles=True)
cam=s.camera;direction=cam.matrix_world.to_quaternion()@Vector((0,0,-1))
height=cam.data.ortho_scale;width=height/2

def origin(px,py):return cam.matrix_world@Vector(((px/512-.5)*width,(.5-py/1024)*height,0))
colors={'FIXED_HULL':(62,204,169),'ROTATING_CORE':(220,132,65),'FORE_MECHANISM':(97,156,248)}
pixels=bytearray();counts={key:0 for key in colors}
for y in range(1024):
    for x in range(512):
        hit=bvh.ray_cast(origin(x+.5,y+.5),direction,1000)
        if hit[0] is None:pixels.extend((0,0,0));continue
        cat=owners[hit[2]]['category'];pixels.extend(colors[cat]);counts[cat]+=1
(OUT/'visible-regions.ppm').write_bytes(b'P6\n512 1024\n255\n'+pixels)
report={'schemaVersion':1,'sourceBlend':'output/spear-of-adun-art/core-motion-v01/core-motion.blend',
        'imageSize':[512,1024],'cameraOrthoScale':height,'objects':rows,'visiblePixelCounts':counts,
        'movingRoots':sorted(CORE),'classificationUsesAncestorChain':True,'webDesignNotCanonSlots':True,'gameIntegrated':False}
(OUT/'source-regions.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('REGIONS',json.dumps({cat:[r['object'] for r in rows if r['category']==cat] for cat in colors}),flush=True)
print('SOURCE_REGION_AUDIT_COMPLETE',flush=True)
