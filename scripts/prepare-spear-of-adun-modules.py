"""Partition the authored Adun into five geometry-owned modules, not rectangular crops.

Original polygons, UVs, corner Color, split normals, and skin weights are conserved.
A source material mesh can span several modules; ownership follows its connected
pieces, or existing face edges under the rear center armor for the continuous bridge.
This authoring master and the image-space anchors are NOT runtime hull definitions.
"""
import hashlib
import json
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path.cwd();OUT=ROOT/'output/spear-of-adun-art/modules-v01';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'output/spear-of-adun-art/xl-fit-v01/four-tier-fit.blend'
regions=json.loads((ROOT/'output/spear-of-adun-art/mount-layout-v01/source-regions.json').read_text(encoding='utf-8'))
fit=json.loads((ROOT/'output/spear-of-adun-art/weapon-fit-v01/weapon-fit.json').read_text(encoding='utf-8'))
plan=json.loads((ROOT/'docs/spear-of-adun-installation-plan-v06.json').read_text(encoding='utf-8'))
bpy.ops.wm.open_mainfile(filepath=str(SOURCE),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.frame_set(0);s.use_nodes=False;bpy.context.view_layer.update()
cam=s.camera;unit=cam.data.ortho_scale/1024
anchors={'CORE':[256,500],'FORE':[256,230],'PORT':[156,785],'STARBOARD':[356,785],'AFT':[256,800]}
collections={}
for module in anchors:
    col=bpy.data.collections.new('Module_'+module);s.collection.children.link(col);collections[module]=col
archive=bpy.data.collections.new('Unsplit source backups - hidden');s.collection.children.link(archive)


def move_collection(obj,col):
    for old in list(obj.users_collection):old.objects.unlink(obj)
    col.objects.link(obj)


def pixel(point):
    uv=world_to_camera_view(s,cam,point);return (uv.x*512,(1-uv.y)*1024)


def mesh_bvh(objects):
    vertices=[];faces=[];owners=[]
    deps=bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        e=obj.evaluated_get(deps);m=e.to_mesh();m.calc_loop_triangles();off=len(vertices)
        vertices.extend(e.matrix_world@v.co for v in m.vertices)
        for t in m.loop_triangles:faces.append(tuple(off+i for i in t.vertices));owners.append(obj)
        e.to_mesh_clear()
    return BVHTree.FromPolygons(vertices,faces,all_triangles=True),owners


def components(obj):
    m=obj.data;parent=list(range(len(m.vertices)))
    def find(a):
        while parent[a]!=a:parent[a]=parent[parent[a]];a=parent[a]
        return a
    def join(a,b):parent[find(a)]=find(b)
    known={}
    for v in m.vertices:
        key=tuple(round(x,5) for x in v.co)
        if key in known:join(v.index,known[key])
        else:known[key]=v.index
    for p in m.polygons:
        for i in p.vertices[1:]:join(p.vertices[0],i)
    groups={}
    for p in m.polygons:groups.setdefault(find(p.vertices[0]),[]).append(p.index)
    return list(groups.values())


def owner_faces(obj,row):
    if row['category']=='ROTATING_CORE':return {'CORE':list(range(len(obj.data.polygons)))}
    if row['category']=='FORE_MECHANISM' or row['boundsPx'][3]<340:return {'FORE':list(range(len(obj.data.polygons)))}
    if obj.name in ['Object_33','Object_57','Object_69']:return {'CORE':list(range(len(obj.data.polygons)))}
    if obj.name in ['Object_59','Object_63']:return {'AFT':list(range(len(obj.data.polygons)))}
    uv={v.index:pixel(obj.matrix_world@v.co) for v in obj.data.vertices}
    result={}
    for group in components(obj):
        indices={i for p in group for i in obj.data.polygons[p].vertices}
        lo=min(uv[i][0] for i in indices);hi=max(uv[i][0] for i in indices)
        if obj.name=='Object_93' and lo<210 and hi>302:
            # Keep every triangle intact. Joint follows original mesh edges,
            # behind/through the already-existing center armor, not an image cut.
            for face_id in group:
                poly=obj.data.polygons[face_id]
                x=sum(uv[i][0] for i in poly.vertices)/len(poly.vertices)
                owner='PORT' if x<210 else 'STARBOARD' if x>302 else 'AFT'
                result.setdefault(owner,[]).append(face_id)
        else:
            middle=(lo+hi)/2
            owner='PORT' if middle<220 else 'STARBOARD' if middle>292 else 'AFT'
            result.setdefault(owner,[]).extend(group)
    return result


def split_copy(obj,face_ids,module):
    src=obj.data;faces=[src.polygons[i] for i in sorted(face_ids)]
    vertices=sorted({i for p in faces for i in p.vertices});mapping={old:new for new,old in enumerate(vertices)}
    normals=[tuple(n.vector) for n in src.corner_normals]
    mesh=bpy.data.meshes.new(module+'_'+obj.name)
    mesh.from_pydata([tuple(src.vertices[i].co) for i in vertices],[],[[mapping[i] for i in p.vertices] for p in faces])
    for mat in src.materials:mesh.materials.append(mat)
    for a,b in zip(mesh.polygons,faces):a.material_index=b.material_index;a.use_smooth=b.use_smooth
    loops=[i for p in faces for i in p.loop_indices]
    for source in src.uv_layers:
        layer=mesh.uv_layers.new(name=source.name)
        for dst,idx in enumerate(loops):layer.data[dst].uv=source.data[idx].uv
    for source in src.color_attributes:
        color=mesh.color_attributes.new(name=source.name,type=source.data_type,domain=source.domain)
        domain=loops if source.domain=='CORNER' else vertices if source.domain=='POINT' else None
        assert domain is not None, source.domain
        for dst,idx in enumerate(domain):color.data[dst].color_srgb=source.data[idx].color_srgb
    mesh.color_attributes.render_color_index=src.color_attributes.render_color_index
    mesh.color_attributes.active_color_index=src.color_attributes.active_color_index
    mesh.normals_split_custom_set([normals[i] for i in loops])
    copied=obj.copy();copied.name=module+'_'+obj.name;copied.data=mesh;collections[module].objects.link(copied)
    copied.vertex_groups.clear()
    for group in obj.vertex_groups:copied.vertex_groups.new(name=group.name)
    for dst,idx in enumerate(vertices):
        for group in src.vertices[idx].groups:copied.vertex_groups[group.group].add([dst],group.weight,'REPLACE')
    assert len(copied.vertex_groups)==len(obj.vertex_groups)
    assert copied.matrix_world==obj.matrix_world
    # Keep exact face mapping for reproducibility and geometry conservation proof.
    copied['source_object']=obj.name;copied['module_owner']=module;copied['asset_role']='HULL'
    return copied,vertices,sorted(face_ids)


s.render.engine='CYCLES';s.render.resolution_x=512;s.render.resolution_y=1024;s.render.resolution_percentage=100
s.render.use_border=False;s.render.use_crop_to_border=False;s.render.film_transparent=True
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.image_settings.color_depth='8'
s.cycles.samples=192;s.cycles.seed=37;s.cycles.use_denoising=True;s.cycles.use_animated_seed=False
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
# Reference must be rendered from this exact source before touching ownership.
s.render.filepath=str(OUT/'before-split.png');bpy.ops.render.render(write_still=True)
source_faces=0;output_faces=0;records=[];created=[];maps=[]
for row in regions['objects']:
    obj=bpy.data.objects[row['object']];parts=owner_faces(obj,row);source_faces+=len(obj.data.polygons)
    all_ids=[i for ids in parts.values() for i in ids]
    assert len(all_ids)==len(set(all_ids))==len(obj.data.polygons)
    assert set(all_ids)==set(range(len(obj.data.polygons)))
    if len(parts)==1:
        module=next(iter(parts));move_collection(obj,collections[module]);obj['module_owner']=module;obj['asset_role']='HULL';obj['source_object']=obj.name
        created.append(obj);records.append({'object':obj.name,'sourceObject':obj.name,'owner':module,'faces':len(obj.data.polygons),'split':False,'role':'HULL'})
        output_faces+=len(obj.data.polygons)
    else:
        for module,ids in parts.items():
            new,indices,face_ids=split_copy(obj,ids,module);created.append(new);output_faces+=len(new.data.polygons)
            maps.append({'source':obj.name,'target':new.name,'vertexIndices':indices,'faceIndices':face_ids})
            records.append({'object':new.name,'sourceObject':obj.name,'owner':module,'faces':len(ids),'split':True,'role':'HULL'})
        obj.hide_render=True;obj.hide_set(True);move_collection(obj,archive)
assert source_faces==output_faces
# Existing authored seats/heads remain separate assets, not burned into a hull sprite.
for row in fit['sites']:
    module='PORT' if row['tag']=='L' else 'FORE'
    for role,key in [('MOUNT_BASE','fixedObjects'),('WEAPON_HEAD','headObjects')]:
        for name in row[key]:
            obj=bpy.data.objects[name];move_collection(obj,collections[module]);obj['module_owner']=module;obj['asset_role']=role
            records.append({'object':name,'sourceObject':None,'owner':module,'faces':len(obj.data.polygons),'split':False,'role':role})
    for name in [row['root'],row['pivot']]+row['muzzles']:
        bpy.data.objects[name]['module_owner']=module
for name in ['XL_SpineSaddle','XL_AxialCollimator','XL_ExposedAperture']:
    obj=bpy.data.objects[name];move_collection(obj,collections['FORE']);obj['module_owner']='FORE';obj['asset_role']='INTRINSIC_XL'
    records.append({'object':name,'sourceObject':None,'owner':'FORE','faces':len(obj.data.polygons),'split':False,'role':'INTRINSIC_XL'})
for name in ['XL_FixedOpticalSpine','XL_ActualApertureMuzzle']:bpy.data.objects[name]['module_owner']='FORE'
# Match every existing support ray to the actual post-split owner, not a guessed side label.
bpy.context.view_layer.update();bvh,owners=mesh_bvh(created);up=cam.matrix_world.to_quaternion()@Vector((0,0,1))
mounts=[]
# One perimeter probe straddled a neighboring module at each original rear seat.
# Move only these four authoring candidates in this new master, not the old plan/save.
anchor_overrides={'AFT_SHOULDER_PORT':[206,724],'AFT_SHOULDER_STARBOARD':[306,724],
                  'STERN_GUARD_PORT':[219,830],'STERN_GUARD_STARBOARD':[293,830]}
for source_site in plan['sites']:
    site={**source_site,'imageAnchorPx':anchor_overrides.get(source_site['id'],source_site['imageAnchorPx'])}
    x,y=site['imageAnchorPx']
    origin=cam.matrix_world@Vector(((x/512-.5)*cam.data.ortho_scale/2,(.5-y/1024)*cam.data.ortho_scale,0))
    hit=bvh.ray_cast(origin,-up,1000);assert hit[0] is not None,site['id']
    obj=owners[hit[2]];module=obj['module_owner'];cx,cy=anchors[module]
    expected='FORE' if site['role'].startswith(('BOW','FORE')) else 'AFT' if site['role'] in ['STERN_GUARD','AFT_SHOULDER'] else 'PORT' if site['id'].endswith('_PORT') else 'STARBOARD'
    assert module==expected,(site['id'],module,expected,obj.name)
    marker=bpy.data.objects['MountCandidate_'+site['id']];marker['module_owner']=module
    marker.matrix_world.translation=hit[0]
    marker['surface_object']=obj['source_object']
    bpy.context.view_layer.update()
    mounts.append({'id':site['id'],'owner':module,'size':site['size'],'imageAnchorPx':[x,y],
                   'sourceCandidateImageAnchorPx':source_site['imageAnchorPx'],'bearingRadiusPx':site['bearingRadiusPx'],
                   'moduleLocalForwardRightSourcePx':[cy-y,x-cx],'supportObject':obj.name,'sourceSurface':obj['source_object']})
mounts.append({'id':'FORE_PROJECTOR','owner':'FORE','size':'EXTRA_LARGE','imageAnchorPx':[256,262],
               'moduleLocalForwardRightSourcePx':[-32,0],'supportObject':'Object_47','sourceSurface':'Object_47','binding':'BUILT_IN_UNIQUE_WEAPON'})
for module,(x,y) in anchors.items():
    empty=bpy.data.objects.new('ModuleAnchor_'+module,None);collections[module].objects.link(empty)
    empty.matrix_world=Matrix.Translation(cam.matrix_world@Vector(((x/512-.5)*cam.data.ortho_scale/2,(.5-y/1024)*cam.data.ortho_scale,-10)))
    empty.empty_display_type='PLAIN_AXES';empty.empty_display_size=.15;empty['authoring_image_anchor_only']=True
    empty['module_owner']=module;empty['runtime_pivot_approved']=False
archive.hide_render=True
report={'schemaVersion':1,'stage':'FIVE_MODULE_GEOMETRY_AUTHORING_NOT_RUNTIME','sourceBlend':str(SOURCE.relative_to(ROOT)).replace('\\','/'),
        'sourceBlendSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'sourceImageSize':[512,1024],
        'modules':[{'id':m,'authoringImageAnchorPx':xy,'imageSpaceOffsetForwardRightPx':[anchors['CORE'][1]-xy[1],xy[0]-anchors['CORE'][0]],'runtimePivotApproved':False} for m,xy in anchors.items()],
        'objects':records,'mounts':mounts,'sourceFaces':source_faces,'partitionedSourceFaces':output_faces,
        'sourcePolygonsAddedOrRemoved':0,'sourceGeometryModified':False,'runtimeRegistered':False,
        'newDamageSurfacesAuthored':False,'ringsOwner':'CORE',
        'pending':['joint appearance after removal','animation and geometry preservation','2D layer composition across ring poses','damaged interface art','runtime module definitions and fire control']}
(OUT/'module-face-map.json').write_text(json.dumps(maps),encoding='utf-8')
(OUT/'module-master.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'modular-master.blend'))
s.render.filepath=str(OUT/'assembled.png');bpy.ops.render.render(write_still=True)
(OUT/'SOURCE-LICENSE.txt').write_bytes((SOURCE.parent/'SOURCE-LICENSE.txt').read_bytes())
print('FIVE_MODULE_MASTER_CREATED',source_faces,'source faces',len(records),'owned meshes',flush=True)
