"""Offline depth evidence for module visual sublayers (no source mutation)."""
import json
from collections import Counter
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path.cwd()
SRC = ROOT / 'output/spear-of-adun-art/modules-v01'
OUT = ROOT / 'output/spear-of-adun-art/module-layers-v01'
OUT.mkdir(parents=True, exist_ok=True)
data = json.loads((SRC / 'module-master.json').read_text(encoding='utf-8'))
bpy.ops.wm.open_mainfile(filepath=str(SRC / 'modular-master.blend'), load_ui=False, use_scripts=False)
s = bpy.context.scene
cam = s.camera
records = [r for r in data['objects'] if r['role'] == 'HULL']
modules = [m['id'] for m in data['modules']]
unit = cam.data.ortho_scale / 1024
right = cam.matrix_world.to_quaternion() @ Vector((1,0,0))
forward = cam.matrix_world.to_quaternion() @ Vector((0,1,0))
direction = cam.matrix_world.to_quaternion() @ Vector((0,0,-1))
origin0 = cam.matrix_world.translation - right * unit * 256 + forward * unit * 512
results = []
for frame in (0,42,750,1500,2250):
    s.frame_set(frame); bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    bvhs = {}
    for module in modules:
        vertices, faces, names = [], [], []
        for record in records:
            if record['owner'] != module: continue
            obj = bpy.data.objects[record['object']].evaluated_get(deps)
            mesh = obj.to_mesh(); mesh.calc_loop_triangles(); start = len(vertices)
            vertices.extend(obj.matrix_world @ v.co for v in mesh.vertices)
            for tri in mesh.loop_triangles:
                faces.append(tuple(start+i for i in tri.vertices)); names.append(record['object'])
            obj.to_mesh_clear()
        bvhs[module] = (BVHTree.FromPolygons(vertices,faces,all_triangles=True),names)
    owners, objects = Counter(), Counter()
    for y in range(1,1024,2):
        for x in range(1,512,2):
            origin = origin0 + right * unit * x - forward * unit * y
            hits = []
            for module,(bvh,names) in bvhs.items():
                hit = bvh.ray_cast(origin,direction,1000)
                if hit[0] is not None: hits.append((hit[3],module,names[hit[2]]))
            hits.sort()
            for i,a in enumerate(hits):
                for b in hits[i+1:]:
                    owners[(a[1],b[1])] += 1
                    objects[(a[1],a[2],b[1],b[2])] += 1
    result={'frame':frame,'frontBackModulePairs':[{'front':a,'back':b,'samples':n} for (a,b),n in owners.most_common()],
            'frontBackObjectPairs':[{'frontModule':a,'frontObject':b,'backModule':c,'backObject':d,'samples':n} for (a,b,c,d),n in objects.most_common()]}
    results.append(result)
    print('DEPTH_FRAME',frame,json.dumps(result['frontBackModulePairs']),flush=True)
(OUT/'depth-evidence.json').write_text(json.dumps({'sampleStride':2,'results':results},indent=2),encoding='utf-8')
