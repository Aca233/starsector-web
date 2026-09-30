"""Verify saved geometry/animation ownership, then render module removal and separation.
This is a Blender art/attachment check, never an in-game destruction test.
"""
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path.cwd();OUT=ROOT/'output/spear-of-adun-art/modules-v01'
data=json.loads((OUT/'module-master.json').read_text(encoding='utf-8'))
maps=json.loads((OUT/'module-face-map.json').read_text(encoding='utf-8'))
plan=json.loads((ROOT/'docs/spear-of-adun-installation-plan-v06.json').read_text(encoding='utf-8'))
source_sites={r['id']:r for r in plan['sites']}
bpy.ops.wm.open_mainfile(filepath=str(OUT/'modular-master.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.use_nodes=False;s.frame_set(0);bpy.context.view_layer.update()
records={r['object']:r for r in data['objects']}
objects=[bpy.data.objects[name] for name in records]
cam=s.camera;unit=cam.data.ortho_scale/1024;up=cam.matrix_world.to_quaternion()@Vector((0,0,1))
right=cam.matrix_world.to_quaternion()@Vector((1,0,0));forward=cam.matrix_world.to_quaternion()@Vector((0,1,0))
report={'schemaVersion':1,'runtimeRegistered':False,'modelReopened':True,'maxVertexErrorWorld':0,
        'sourceFaceCount':data['sourceFaces'],'targetFaceCount':data['partitionedSourceFaces'],
        'verifiedSplitObjects':len(maps),'testedFrames':[0,42,90,375,750,1500,2250,3000],
        'mountFootprintSamples':[],'sourceAttributesPreserved':True,'sourceWeightsPreserved':True}
# Compare UV/color/group weights on the actual reopened file, not construction counters.
for row in maps:
    a=bpy.data.objects[row['source']];b=bpy.data.objects[row['target']]
    for dst,src in enumerate(row['vertexIndices']):
        assert (b.data.vertices[dst].co-a.data.vertices[src].co).length<1e-7
        wa=[(a.vertex_groups[g.group].name,round(g.weight,6)) for g in a.data.vertices[src].groups]
        wb=[(b.vertex_groups[g.group].name,round(g.weight,6)) for g in b.data.vertices[dst].groups]
        assert wa==wb,(row['target'],dst)
    loops=[i for f in row['faceIndices'] for i in a.data.polygons[f].loop_indices]
    for uv in a.data.uv_layers:
        copied=b.data.uv_layers[uv.name]
        assert all((copied.data[d].uv-uv.data[i].uv).length<1e-7 for d,i in enumerate(loops))
    for color in a.data.color_attributes:
        ids=loops if color.domain=='CORNER' else row['vertexIndices']
        copied=b.data.color_attributes[color.name]
        assert all(max(abs(x-y) for x,y in zip(copied.data[d].color_srgb,color.data[i].color_srgb))<1e-6 for d,i in enumerate(ids))
    normals_a=a.data.corner_normals;normals_b=b.data.corner_normals
    normal_error=max((normals_b[d].vector-normals_a[i].vector).length for d,i in enumerate(loops))
    # Blender re-encodes custom normals in each split mesh; allow <0.115 degrees.
    assert normal_error<.002,(row['target'],normal_error)
    report['maxNormalVectorError']=max(report.get('maxNormalVectorError',0),normal_error)


def coords(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
    result=[e.matrix_world@v.co for v in m.vertices];e.to_mesh_clear();return result


def geometry():
    vertices=[];faces=[];owners=[]
    for obj in objects:
        if records[obj.name]['role']!='HULL':continue
        e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();m.calc_loop_triangles();start=len(vertices)
        vertices.extend(e.matrix_world@v.co for v in m.vertices)
        for tri in m.loop_triangles:faces.append(tuple(start+i for i in tri.vertices));owners.append(obj['module_owner'])
        e.to_mesh_clear()
    return BVHTree.FromPolygons(vertices,faces,all_triangles=True),owners


rest_ring={n:coords(bpy.data.objects[n]) for n in ['Object_7','Object_9','Object_11','Object_13']}
report['ringMovementAtFrame750']={}
for frame in report['testedFrames']:
    s.frame_set(frame);bpy.context.view_layer.update()
    for row in maps:
        a=coords(bpy.data.objects[row['source']]);b=coords(bpy.data.objects[row['target']])
        error=max((b[i]-a[j]).length for i,j in enumerate(row['vertexIndices']))
        report['maxVertexErrorWorld']=max(report['maxVertexErrorWorld'],error)
    if frame==750:
        for n,points in rest_ring.items():report['ringMovementAtFrame750'][n]=max((a-b).length for a,b in zip(points,coords(bpy.data.objects[n])))
    bvh,owners=geometry()
    for site in data['mounts']:
        if site['id'] not in source_sites:continue
        r=site['bearingRadiusPx'];x,y=site['imageAnchorPx']
        points=[(a*.5,b*.5) for a in range(-2*r,2*r+1) for b in range(-2*r,2*r+1) if a*a+b*b<=4*r*r]+[(math.cos(i*math.tau/64)*r,math.sin(i*math.tau/64)*r) for i in range(64)]
        hits={}
        for dx,dy in points:
            origin=cam.matrix_world@Vector((((x+dx)/512-.5)*cam.data.ortho_scale/2,(.5-(y+dy)/1024)*cam.data.ortho_scale,0))
            hit=bvh.ray_cast(origin,-up,1000)
            owner=owners[hit[2]] if hit[0] is not None else 'EMPTY'
            hits[owner]=hits.get(owner,0)+1
        report['mountFootprintSamples'].append({'id':site['id'],'frame':frame,'expectedOwner':site['owner'],'probeCount':len(points),'hits':hits})
assert report['maxVertexErrorWorld']<1e-5
assert all(v>.1 for v in report['ringMovementAtFrame750'].values()),'Central ring animation must survive partitioning'
report['mixedModuleBearings']=[r for r in report['mountFootprintSamples'] if r['hits']!={r['expectedOwner']:r['probeCount']}]
report['geometryPassed']=True
report['mountOwnershipPassed']=not report['mixedModuleBearings']
(OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
assert report['mountOwnershipPassed'],str(report['mixedModuleBearings'][:4])
# One scene, one camera, same quality for reference and all isolation/removal states.
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
s.cycles.samples=192;s.cycles.seed=37;s.cycles.use_animated_seed=False;s.cycles.use_denoising=True


def restore():
    for obj in objects:obj.hide_render=False;obj.visible_camera=True;obj.is_holdout=False


def render(name):
    s.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)


s.frame_set(0);bpy.context.view_layer.update()
for module in ['CORE','FORE','PORT','STARBOARD','AFT']:
    restore()
    for obj in objects:
        if obj['module_owner']!=module:obj.visible_camera=False
    render(module+'-complete')
    restore()
    for obj in objects:
        if obj['module_owner']!=module:obj.is_holdout=True
    render(module+'-visible')
    if module!='CORE':
        restore()
        for obj in objects:
            if obj['module_owner']==module:obj.hide_render=True
        render('without-'+module)
restore()
for frame in [42,750]:
    s.frame_set(frame);bpy.context.view_layer.update();render('assembled-frame-'+str(frame))
restore();s.frame_set(0);bpy.context.view_layer.update()
for obj in objects:
    if records[obj.name]['role']!='HULL':obj.hide_render=True
render('hull-unarmed')
for module in ['CORE','FORE','PORT','STARBOARD','AFT']:
    for obj in objects:
        if records[obj.name]['role']=='HULL':obj.visible_camera=obj['module_owner']==module
    render('hull-'+module)
restore()
# Exploded view uses real evaluated geometry snapshots at rest, not moving UVs or
# corrupting the original source rig with per-module transform hacks.
exploded=bpy.data.collections.new('Exploded review snapshots - NOT saved to master');s.collection.children.link(exploded)
offsets={'CORE':(0,0),'FORE':(0,-80),'PORT':(-70,30),'STARBOARD':(70,30),'AFT':(0,95)}
deps=bpy.context.evaluated_depsgraph_get();snapshots=[]
for obj in objects:
    e=obj.evaluated_get(deps);mesh=bpy.data.meshes.new_from_object(e,preserve_all_data_layers=True,depsgraph=deps)
    new=bpy.data.objects.new('Review_'+obj.name,mesh);exploded.objects.link(new);new.matrix_world=e.matrix_world.copy()
    dx,dy=offsets[obj['module_owner']];new.matrix_world.translation+=right*dx*unit-forward*dy*unit
    snapshots.append(new)
for obj in objects:obj.hide_render=True
s.render.resolution_x=640;s.render.resolution_y=1280;cam.data.ortho_scale=unit*1280
render('exploded')
print('MODULE_GEOMETRY_VERIFIED_AND_RENDERED',json.dumps({'maxVertexErrorWorld':report['maxVertexErrorWorld'],'mounts':len(data['mounts']),'poses':len(report['testedFrames'])}),flush=True)
