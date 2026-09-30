"""Discrete real-model fit audit. Not a continuous collision or gameplay proof."""
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path.cwd()
OUT=ROOT/'output/spear-of-adun-art/weapon-fit-v01'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'weapon-fit.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene
report=json.loads((OUT/'weapon-fit.json').read_text(encoding='utf-8'))
regions=json.loads((ROOT/'output/spear-of-adun-art/mount-layout-v01/source-regions.json').read_text(encoding='utf-8'))
unit=report['unitWorldPerPixel']


def geometry(names):
    verts=[];faces=[];owners=[]
    deps=bpy.context.evaluated_depsgraph_get()
    for name in names:
        o=bpy.data.objects[name].evaluated_get(deps)
        m=o.to_mesh();m.calc_loop_triangles();start=len(verts)
        verts.extend(o.matrix_world@v.co for v in m.vertices)
        for t in m.loop_triangles:
            faces.append(tuple(start+i for i in t.vertices));owners.append(name)
        o.to_mesh_clear()
    return BVHTree.FromPolygons(verts,faces,all_triangles=True),owners


result={'schemaVersion':1,'runtimeRegistered':False,'continuousCollisionProof':False,
        'sourceFrameSamples':[0,42,375,750,1125,1500,1875,2250,2625,3000],
        'yawSampleStepDegreesMaximum':2,'rayLengthSourcePixels':1200,'sites':[]}
s.frame_set(0);bpy.context.view_layer.update()
rest={row['site']:bpy.data.objects[row['root']].matrix_world.copy() for row in report['sites']}
per_site={row['site']:{'site':row['site'],'tag':row['tag'],'poseCount':0,'headHullIntersectionPoses':[],
                       'blockedMuzzles':[],'maxFixedMatrixDrift':0,'maxPivotProjectionDriftPx':0,
                       'muzzleLocalPx':{},'yawRangeDegrees':[row['yaw']-row['halfArc'],row['yaw']+row['halfArc']]}
          for row in report['sites']}
for frame in result['sourceFrameSamples']:
    s.frame_set(frame);bpy.context.view_layer.update()
    hull,owners=geometry([r['object'] for r in regions['objects']])
    for row in report['sites']:
        r=per_site[row['site']]
        root=bpy.data.objects[row['root']]
        pivot=bpy.data.objects[row['pivot']]
        original=rest[row['site']]
        r['maxFixedMatrixDrift']=max(r['maxFixedMatrixDrift'],max(abs(a-b) for ar,br in zip(original,root.matrix_world) for a,b in zip(ar,br)))
        uv=world_to_camera_view(s,s.camera,pivot.matrix_world.translation)
        r['maxPivotProjectionDriftPx']=max(r['maxPivotProjectionDriftPx'],abs(uv.x*512-row['sourceImageAnchorPx'][0]),abs((1-uv.y)*1024-row['sourceImageAnchorPx'][1]))
        low,high=r['yawRangeDegrees']
        count=math.ceil((high-low)/2)
        for i in range(count+1):
            yaw=low+(high-low)*i/count
            pivot.rotation_euler.z=-math.radians(yaw)
            bpy.context.view_layer.update()
            head,_=geometry(row['headObjects'])
            overlap=head.overlap(hull)
            if overlap:
                r['headHullIntersectionPoses'].append({'frame':frame,'yaw':round(yaw,3),'hullObjects':sorted({owners[b] for _,b in overlap})})
            for name in row['muzzles']:
                muzzle=bpy.data.objects[name]
                r['muzzleLocalPx'][name]=list(muzzle.location)
                point=muzzle.matrix_world.translation
                direction=(pivot.matrix_world.to_3x3()@Vector((0,1,0))).normalized()
                for kind,bvh in [('hull',hull),('own-head',head)]:
                    hit=bvh.ray_cast(point+direction*unit*.02,direction,unit*result['rayLengthSourcePixels'])
                    if hit[0] is not None:
                        r['blockedMuzzles'].append({'frame':frame,'yaw':round(yaw,3),'muzzle':name,'kind':kind,'distancePx':round(hit[3]/unit,4),'object':owners[hit[2]] if kind=='hull' else None})
            r['poseCount']+=1
        pivot.rotation_euler.z=-math.radians(row['yaw'])
        bpy.context.view_layer.update()
result['sites']=list(per_site.values())
result['sampledGeometryPassed']=all(not r['headHullIntersectionPoses'] and not r['blockedMuzzles'] and r['maxFixedMatrixDrift']<1e-5 and r['maxPivotProjectionDriftPx']<.01 for r in result['sites'])
(OUT/'geometry-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':result['sampledGeometryPassed'],'sites':[{k:v for k,v in r.items() if k not in ['headHullIntersectionPoses','blockedMuzzles']}|{'headHullIntersections':len(r['headHullIntersectionPoses']),'blockedMuzzles':len(r['blockedMuzzles']),'firstOverlap':r['headHullIntersectionPoses'][:1],'firstBlock':r['blockedMuzzles'][:2]} for r in result['sites']]},indent=2),flush=True)
if not result['sampledGeometryPassed']:
    raise RuntimeError('Geometry check failed; read report before rendering/delivering')
