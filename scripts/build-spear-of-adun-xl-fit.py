"""XL fixed optical spine + existing articulated fore shroud; offline Web design.
The original 12 control segments are ONE mechanism, not 12 slots. No runtime ID.
"""
import hashlib
import json
import math
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path.cwd();OUT=ROOT/'output/spear-of-adun-art/xl-fit-v01';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'output/spear-of-adun-art/weapon-fit-v01/weapon-fit.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.frame_set(0);s.use_nodes=False;bpy.context.view_layer.update()
rig=next(o for o in s.objects if o.type=='ARMATURE')
cam=s.camera;q=cam.matrix_world.to_quaternion();unit=cam.data.ortho_scale/1024
right,forward,up=[q@Vector(v) for v in [(1,0,0),(0,1,0),(0,0,1)]]
regions=json.loads((ROOT/'output/spear-of-adun-art/mount-layout-v01/source-regions.json').read_text(encoding='utf-8'))
rows={r['object']:r for r in regions['objects']}
col=bpy.data.collections.new('XL fixed optical spine - Web authored');s.collection.children.link(col)


def geometry(names):
    vertices=[];faces=[];owners=[]
    for name in names:
        e=bpy.data.objects[name].evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();m.calc_loop_triangles();off=len(vertices)
        vertices.extend(e.matrix_world@v.co for v in m.vertices)
        for t in m.loop_triangles:faces.append(tuple(off+i for i in t.vertices));owners.append(name)
        e.to_mesh_clear()
    return BVHTree.FromPolygons(vertices,faces,all_triangles=True),owners


bvh,owners=geometry(rows)
origin=cam.matrix_world@Vector((0,(.5-262/1024)*cam.data.ortho_scale,0))
hit=bvh.ray_cast(origin,-up,1000)
assert hit[0] is not None and owners[hit[2]]=='Object_47', 'XL must seat on the real fixed central spine'
anchor=hit[0];source=rows['Object_47'];assert source['category']=='FIXED_HULL' and len(source['activeGroups'])==1
root=bpy.data.objects.new('XL_FixedOpticalSpine',None);col.objects.link(root)
root.parent=rig;root.parent_type='BONE';root.parent_bone=source['activeGroups'][0]
basis=Matrix.Identity(4)
for i,axis in enumerate([right,forward,up]):basis.col[i]=(*(axis*unit),0)
basis.translation=anchor;bpy.context.view_layer.update();root.matrix_world=basis;bpy.context.view_layer.update()
root['size']='EXTRA_LARGE';root['binding']='BUILT_IN_UNIQUE_WEAPON';root['aim']='HULL_FIXED_FORWARD'
root['runtime_registered']=False
materials={key:bpy.data.materials[name] for key,name in [('gold','Web mount - muted source-compatible gold'),('edge','Web mount - chamfer gold'),('dark','Web mount - recessed graphite'),('blue','Web optic - restrained khaydarin blue'),('core','Web optic - exposed aperture')]}


def mesh(name,verts,faces,mats):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);col.objects.link(obj);obj.parent=root
    for name in mats:data.materials.append(materials[name])
    obj['provenance']='Web authored fixed emitter, not an official model weapon identification'
    return obj


# Narrow conforming feet on the original central support, not a second generic turret.
outline=[(-1.6,-5),(1.6,-5),(2.0,1),(1.5,4),(-1.5,4),(-2.0,1)]
points=[];supports=[]
for x,y in outline:
    p=anchor+right*(x*unit)+forward*(y*unit)+up*10
    h=bvh.ray_cast(p,-up,20);assert h[0] is not None and owners[h[2]]=='Object_47'
    z=(h[0]-anchor).dot(up)/unit
    points.append((x,y,z-.08));supports.append(z)
# The spine has a raised central ridge: perimeter-only sampling misses it.
for ix in range(-4,5):
    for iy in range(-10,25):
        x,y=ix*.5,iy*.5
        h=bvh.ray_cast(anchor+right*(x*unit)+forward*(y*unit)+up*10,-up,20)
        if h[0] is not None:
            supports.append((h[0]-anchor).dot(up)/unit)
top=max(supports)+.65;n=len(points)
verts=points+[(x,y,top) for x,y in outline]
faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
seat=mesh('XL_SpineSaddle',verts,faces,['gold'])
# An elongated collimator, supported at its rear; forward overhang is intentional.
poly=[(-1.5,-4),(1.5,-4),(2.25,6),(1.65,12),(-1.65,12),(-2.25,6)]
n=len(poly);verts=[(x,y,top+.05) for x,y in poly]+[(x*.78,y,top+1.4) for x,y in poly]
faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
body=mesh('XL_AxialCollimator',verts,faces,['dark','edge'])
for face in body.data.polygons:
    if face.index>=2:face.material_index=1
# Front-facing terminal surface is the actual aperture. This is not the rig pivot.
x=1.1;y0=7.5;y1=12.4;z=top+1.5;tip=z+1.45
verts=[(-x,y0,z),(x,y0,z),(x*.8,y1,z),(-x*.8,y1,z),(0,y0+1,tip),(0,y1,tip)]
optic=mesh('XL_ExposedAperture',verts,[(0,3,2,1),(0,1,4),(0,4,5,3),(1,2,5,4),(3,5,2)],['blue','core'])
optic.data.polygons[-1].material_index=1
muzzle=bpy.data.objects.new('XL_ActualApertureMuzzle',None);col.objects.link(muzzle);muzzle.parent=root
muzzle.location=(0,y1+.01,z+1.45/3);muzzle['direction_local']=[0,1,0]
new_head=[body.name,optic.name]
all_objects=[r['object'] for r in regions['objects']]
report={'schemaVersion':1,'stage':'OFFLINE_XL_INSTALLATION_SAMPLE','size':'EXTRA_LARGE',
 'mechanism':'FORE_PROJECTOR','binding':'BUILT_IN_UNIQUE_WEAPON','mountType':'HARDPOINT',
 'weaponId':None,'runtimeRegistered':False,'artFitAccepted':False,'mountCount':1,'sourceControlSegmentCount':12,
 'sourceImageSize':[512,1024],'root':root.name,'sourceSurface':'Object_47','parentBone':root.parent_bone,
 'imageAnchorPx':[256,262],'modelWorldAnchor':list(anchor),'muzzle':muzzle.name,
 'muzzleRootLocalPx':list(muzzle.location),'rayLengthPx':1200,
 'geometryAdded':[seat.name,body.name,optic.name],
 'sourceModelGeometryModified':False,'canonWeaponClaimed':False,
 'design':'Fixed spine supplies one forward aperture; original 12-piece shroud deploys independently. No giant rotary disc.',
 'samples':[],'maxRootDrift':0,'maxMuzzleDrift':0,'headHullIntersections':[],'blockedMuzzles':[]}
s.frame_set(0);bpy.context.view_layer.update();rest_root=root.matrix_world.copy();rest_muzzle=muzzle.matrix_world.translation.copy()
# Check the full existing fore action at its export sampling rate + multiple core phases.
for frame in list(range(0,91,2))+[375,750,1125,1500,1875,2250,2625,3000]:
    s.frame_set(frame);bpy.context.view_layer.update()
    hull,hull_owners=geometry(all_objects)
    head,_=geometry(new_head)
    overlap=head.overlap(hull)
    if overlap:report['headHullIntersections'].append({'frame':frame,'objects':sorted({hull_owners[b] for _,b in overlap})})
    point=muzzle.matrix_world.translation
    direction=(root.matrix_world.to_3x3()@Vector((0,1,0))).normalized()
    for kind,tree in [('hull',hull),('own-head',head)]:
        h=tree.ray_cast(point+direction*unit*.02,direction,unit*1200)
        if h[0] is not None:report['blockedMuzzles'].append({'frame':frame,'kind':kind,'distancePx':h[3]/unit})
    report['maxRootDrift']=max(report['maxRootDrift'],max(abs(a-b) for ar,br in zip(root.matrix_world,rest_root) for a,b in zip(ar,br)))
    report['maxMuzzleDrift']=max(report['maxMuzzleDrift'],(point-rest_muzzle).length)
    uv=world_to_camera_view(s,cam,point)
    report['samples'].append({'frame':frame,'muzzleImagePx':[uv.x*512,(1-uv.y)*1024]})
report['sampledGeometryPassed']=not report['headHullIntersections'] and not report['blockedMuzzles'] and report['maxRootDrift']<1e-5 and report['maxMuzzleDrift']<1e-5
report['continuousCollisionProof']=False
(OUT/'xl-fit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
assert report['sampledGeometryPassed'], json.dumps({k:report[k] for k in ['headHullIntersections','blockedMuzzles']})
s.frame_set(0);bpy.context.view_layer.update()
s.render.use_border=False;s.render.use_crop_to_border=False;s.render.resolution_x=512;s.render.resolution_y=1024;s.render.resolution_percentage=100
s.render.film_transparent=True;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.image_settings.color_depth='8'
s.cycles.samples=192;s.cycles.seed=37;s.cycles.use_denoising=True;s.cycles.use_animated_seed=False
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'four-tier-fit.blend'))
# Reopen verifies saved parentage and aperture coordinates, not only live memory.
bpy.ops.wm.open_mainfile(filepath=str(OUT/'four-tier-fit.blend'),load_ui=False,use_scripts=False);s=bpy.context.scene;s.frame_set(42);bpy.context.view_layer.update()
assert bpy.data.objects[report['root']].parent_bone==report['parentBone']
assert (bpy.data.objects[report['muzzle']].matrix_world.translation-rest_muzzle).length<1e-5
s.frame_set(0);s.render.filepath=str(OUT/'four-tier-installed.png');bpy.ops.render.render(write_still=True)
s.render.use_border=True;s.render.use_crop_to_border=True
s.render.border_min_x=192/512;s.render.border_max_x=320/512
s.render.border_min_y=1-336/1024;s.render.border_max_y=1-192/1024
s.render.resolution_percentage=400
for frame,name in [(0,'closed'),(42,'deployed'),(60,'charged'),(90,'recovered')]:
    s.frame_set(frame);s.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
(OUT/'SOURCE-LICENSE.txt').write_bytes((ROOT/'output/spear-of-adun-art/weapon-fit-v01/SOURCE-LICENSE.txt').read_bytes())
report['savedMasterReopenedAndBindingsVerified']=True
report['blendSha256']=hashlib.sha256((OUT/'four-tier-fit.blend').read_bytes()).hexdigest()
(OUT/'xl-fit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('XL_FIT_RENDERED',len(report['samples']),'poses',flush=True)
