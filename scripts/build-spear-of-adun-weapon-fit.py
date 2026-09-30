"""Author source-derived L/M/S installed turrets. Offline art, never runtime content.

Run with Blender --background --factory-startup --disable-autoexec --python-exit-code 1
--python scripts/build-spear-of-adun-weapon-fit.py. -- --render also renders review.
Pixels refer to the established 512x1024 orthographic source, not game world units.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path.cwd()
OUT = ROOT / 'output/spear-of-adun-art/weapon-fit-v01'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'output/spear-of-adun-art/mount-layout-v01'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'installation-layout.blend'), load_ui=False, use_scripts=False)
s = bpy.context.scene
s.frame_set(0)
s.use_nodes = False
bpy.context.view_layer.update()
cam = s.camera
unit = cam.data.ortho_scale / 1024
q = cam.matrix_world.to_quaternion()
right, forward, up = [q @ Vector(v) for v in [(1, 0, 0), (0, 1, 0), (0, 0, 1)]]
regions = json.loads((SOURCE / 'source-regions.json').read_text(encoding='utf-8'))
evidence = json.loads((SOURCE / 'calibration.json').read_text(encoding='utf-8'))
sites = {r['id']: r for r in evidence['sites']}
hull = [bpy.data.objects[r['object']] for r in regions['objects']]
collection = bpy.data.collections.new('Web adapted weapon models - L M S fit samples')
s.collection.children.link(collection)


def bvh_for(objects):
    verts, faces = [], []
    deps = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        e = obj.evaluated_get(deps)
        m = e.to_mesh()
        m.calc_loop_triangles()
        offset = len(verts)
        verts.extend(e.matrix_world @ v.co for v in m.vertices)
        faces.extend(tuple(offset + i for i in t.vertices) for t in m.loop_triangles)
        e.to_mesh_clear()
    return BVHTree.FromPolygons(verts, faces, all_triangles=True)


fixed_bvh = bvh_for([bpy.data.objects[r['object']] for r in regions['objects'] if r['category'] == 'FIXED_HULL'])


def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent = parent
    obj.empty_display_size = 1
    return obj


def material(name, color, metal=.35, rough=.6, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    mat['provenance'] = 'Web-authored physical material; not official source artwork'
    return mat


gold = material('Web mount - muted source-compatible gold', (.32, .235, .09))
edge = material('Web mount - chamfer gold', (.44, .325, .135))
dark = material('Web mount - recessed graphite', (.048, .068, .075), .45, .5)
blue = material('Web optic - restrained khaydarin blue', (.07, .32, .7), .2, .33, .45)
core = material('Web optic - exposed aperture', (.28, .68, .95), .1, .3, .9)


def mesh_obj(name, verts, faces, parent, materials):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = parent
    for mat in materials:
        mesh.materials.append(mat)
    obj['provenance'] = 'Web-authored mounting/optical geometry'
    return obj


def prism(name, polygon, bottom, top, parent, mats):
    n = len(polygon)
    verts = [(x, y, bottom) for x, y in polygon] + [(x, y, top) for x, y in polygon]
    faces = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    obj = mesh_obj(name, verts, faces, parent, mats)
    bevel = obj.modifiers.new('Machined edge - physical geometry', 'BEVEL')
    bevel.width = min(.24, (top - bottom) / 4)
    bevel.segments = 2
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj


def surface_height(point, x, y):
    ray = point + right * (x * unit) + forward * (y * unit) + up * 10
    hit = fixed_bvh.ray_cast(ray, -up, 20)
    if hit[0] is None:
        raise ValueError(f'No fixed hull under seat {x}, {y}')
    return (hit[0] - point).dot(up) / unit


def conforming_seat(tag, parent, site, radius):
    # An eight-sided pointed saddle, deliberately NOT a generic oversized disc.
    outline = [(-.55, -.72), (.55, -.72), (.88, -.12), (.72, .50),
               (.32, .88), (-.32, .88), (-.72, .50), (-.88, -.12)]
    polygon = [(x * radius, y * radius) for x, y in outline]
    # Subdivide perimeter and inner rings; every bottom vertex touches the actual hull.
    border = []
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        for i in range(5):
            t = i / 5
            border.append((a[0] * (1-t) + b[0] * t, a[1] * (1-t) + b[1] * t))
    point = Vector(site['restWorldAnchor'])
    rings = [[(x*f, y*f, surface_height(point, x*f, y*f)-.12) for x, y in border] for f in [.25, .5, .75, 1]]
    max_height = max(v[2] for ring in rings for v in ring)
    top = max_height + .75
    n = len(border)
    verts = [(0, 0, surface_height(point, 0, 0)-.12)] + [v for ring in rings for v in ring]
    faces = [(0, 1+(i+1)%n, 1+i) for i in range(n)]
    for k in range(3):
        a, b = 1+k*n, 1+(k+1)*n
        faces.extend((a+i, a+(i+1)%n, b+(i+1)%n, b+i) for i in range(n))
    outer = 1+3*n
    wall = len(verts)
    verts.extend((x*.96, y*.96, top-.32) for x, y in border)
    rim = len(verts)
    verts.extend((x*.87, y*.87, top) for x, y in border)
    for i in range(n):
        j = (i+1)%n
        faces.extend([(outer+i, outer+j, wall+j, wall+i), (wall+i, wall+j, rim+j, rim+i)])
    faces.append(tuple(rim+i for i in range(n)))
    seat = mesh_obj(tag+'_ConformingSaddle', verts, faces, parent, [gold, edge])
    for face in seat.data.polygons:
        if face.index >= n*4 and face.index % 2 == 1:
            face.material_index = 1
    seat['bottom_surface_samples'] = 161
    bearing = [(math.cos(i*math.tau/16)*radius*.52, math.sin(i*math.tau/16)*radius*.52) for i in range(16)]
    socket = prism(tag+'_RecessedBearing', bearing, top-.06, top+.38, parent, [dark])
    return top+.50, [seat, socket]


def donor_piece(name, tag, pivot, scale, source_pivot_y, z_floor):
    src = bpy.data.objects['AdunFore_'+name]
    e = src.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(e, preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
    obj = bpy.data.objects.new(tag+'_SourceShell_'+name, mesh)
    collection.objects.link(obj)
    obj.parent = pivot
    # Transform custom split normals with geometry; UV/Color alone is insufficient.
    # glTF object axes differ from the installed camera-aligned axes.
    factor = scale/unit
    t = Matrix.Identity(4)
    for i, axis in enumerate([right, forward, up]):
        for j in range(3):
            t[i][j] = axis[j]*factor
    t[0][3] = -cam.matrix_world.translation.dot(right)*factor
    t[1][3] = -cam.matrix_world.translation.dot(forward)*factor + (source_pivot_y-512)*scale
    t[2][3] = -z_floor*factor+.70
    transform = t@e.matrix_world
    normal_transform = transform.to_3x3().inverted().transposed()
    normals = [(normal_transform@n.vector).normalized() for n in mesh.corner_normals]
    mesh.transform(transform)
    mesh.update()
    mesh.normals_split_custom_set(normals)
    assert mesh.uv_layers and mesh.color_attributes, f'Source surface attributes lost: {name}'
    obj['source_object'] = src.name
    obj['provenance'] = 'Recomposed source 3D shell; source UV/Color/material preserved; Web weapon design'
    return obj


def optic(tag, parent, x, y0, y1, half_width, z):
    # Crystal is a physically modelled prism terminating in a forward-facing aperture.
    # No painted flash, particles, or emissive ring used to hide fit.
    w = half_width
    verts = [(x-w, y0, z), (x+w, y0, z), (x+w*.72, y1, z), (x-w*.72, y1, z),
             (x, y0+.4, z+1.25*w), (x, y1, z+1.25*w)]
    faces = [(0, 3, 2, 1), (0, 1, 4), (0, 4, 5, 3), (1, 2, 5, 4), (3, 5, 2)]
    obj = mesh_obj(tag+'_Crystal', verts, faces, parent, [blue, core])
    obj.data.polygons[-1].material_index = 1
    muzzle = empty(tag+'_Muzzle', parent)
    muzzle.location = (x, y1+.01, z+1.25*w/3)
    muzzle['direction_local'] = [0, 1, 0]
    muzzle['provenance'] = 'Actual authored front aperture centroid, not source bone pivot'
    return obj, muzzle


configs = [
    {'tag':'L', 'site':'AFT_BATTERY_PORT', 'radius':9, 'scale':.38, 'pivotY':291,
     'shells':['Ctrl_Gun_Lower_L_12','Ctrl_Gun_Lower_R_7'], 'front':29, 'yaw':-35, 'halfArc':30,
     'opticX':[-2.7,2.7], 'opticStart':26, 'opticWidth':.95, 'z':1.3},
    {'tag':'M', 'site':'FORE_SHOULDER_PORT', 'radius':6.3, 'scale':.255, 'pivotY':293,
     'shells':['Ctrl_Gun_Upper_L_11','Ctrl_Gun_Upper_R_6'], 'front':15.5, 'yaw':-25, 'halfArc':35,
     'opticX':[0], 'opticStart':12.8, 'opticWidth':1.25, 'z':1.7},
    {'tag':'S', 'site':'BOW_GUARD_PORT', 'radius':3.7, 'scale':.18, 'pivotY':296,
     'shells':['Ctrl_Gun_Lower_Extra_L_8','Ctrl_Gun_Lower_Extra_R_3'], 'front':4.7, 'yaw':-65, 'halfArc':50,
     'opticX':[0], 'opticStart':3.0, 'opticWidth':.65, 'z':1.0},
]
rows = []
for c in configs:
    tag, site = c['tag'], sites[c['site']]
    marker = bpy.data.objects['MountCandidate_'+c['site']]
    root = empty('Fit_'+tag+'_HullFixed', marker)
    basis = Matrix.Identity(4)
    for i, axis in enumerate([right, forward, up]):
        basis.col[i] = (*(axis*unit), 0)
    basis.translation = Vector(site['restWorldAnchor'])
    bpy.context.view_layer.update()
    root.matrix_world = basis
    bpy.context.view_layer.update()
    height, fixed = conforming_seat(tag, root, site, c['radius'])
    pivot = empty('Fit_'+tag+'_AimPivot', root)
    pivot.location.z = height
    # Snapshot authored donor geometry with source vertex attributes, not source rig controls.
    floor = min((bpy.data.objects['AdunFore_'+n].evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world @ v.co).dot(up)
                for n in c['shells'] for v in bpy.data.objects['AdunFore_'+n].evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices)
    shells = [donor_piece(n, tag, pivot, c['scale'], c['pivotY'], floor) for n in c['shells']]
    r = c['radius']*.50
    y = c['opticStart']+.15
    spine = prism(tag+'_OpticalChassis', [(-r*.65,-r*.60),(r*.65,-r*.60),(r,y*.4),(r*.35,y),(-r*.35,y),(-r,y*.4)], .0, 1.1, pivot, [dark])
    rear = prism(tag+'_RearCowl', [(-r*.85,-r*.6),(r*.85,-r*.6),(r*.55,r*.3),(0,r*.7),(-r*.55,r*.3)], 1, 1.8, pivot, [gold])
    muzzles = []
    optics = []
    for index, x in enumerate(c['opticX']):
        width = c['opticWidth']*1.35
        y0, y1 = c['opticStart']-1.0, c['opticStart']+.7
        collar = prism(tag+str(index)+'_OpticSocket',
                       [(x-width,y0),(x+width,y0),(x+width*.8,y1),(x-width*.8,y1)],
                       c['z']-.6,c['z']+.28,pivot,[gold])
        obj, muzzle = optic(tag+str(index), pivot, x, c['opticStart'], c['front'], c['opticWidth'], c['z'])
        optics.extend([collar,obj])
        muzzles.append(muzzle)
    pivot.rotation_euler.z = -math.radians(c['yaw'])
    root['site_id'] = c['site']
    root['size'] = tag
    root['runtime_registered'] = False
    root['source_pixel_basis'] = 'X=image right; Y=image up/forward; Z=towards camera'
    pivot['angle_convention'] = 'image clockwise yaw; Blender local Z rotation is negative yaw'
    rows.append({**c, 'root':root.name, 'pivot':pivot.name, 'muzzles':[m.name for m in muzzles],
                 'fixedObjects':[o.name for o in fixed], 'headObjects':[o.name for o in shells+[spine,rear]+optics],
                 'sourceImageAnchorPx':site['imageAnchorPx'], 'pivotHeightOverAnchorPx':height,
                 'parentBone':marker.parent_bone, 'surfaceObject':site['sourceSurface']['object']})

s.render.engine = 'CYCLES'
s.render.resolution_x, s.render.resolution_y = 512, 1024
s.render.resolution_percentage = 100
s.render.film_transparent = True
s.render.image_settings.file_format = 'PNG'
s.render.image_settings.color_mode = 'RGBA'
s.render.image_settings.color_depth = '8'
s.render.use_border = False
s.render.use_crop_to_border = False
s.cycles.samples = 192
s.cycles.seed = 37
s.cycles.use_denoising = True
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'OPTIX'
s.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'weapon-fit.blend'))
report = {'schemaVersion':1, 'stage':'OFFLINE_MODELLED_INSTALLATION_SAMPLES', 'sourceImageSize':[512,1024],
          'sourceBlend':'output/spear-of-adun-art/mount-layout-v01/installation-layout.blend',
          'unitWorldPerPixel':unit, 'sites':rows, 'runtimeRegistered':False,
          'canonWeaponsClaimed':False, 'sourceArt':'Catholomew / CC BY-NC 4.0; license copied alongside blend',
          'newGeometry':'Conforming saddles, bearings, optical chassis, cowls, crystals; Web adaptation',
          'pending':['swept hull/head geometry and aperture rays', 'art review', 'rotation sprite lighting policy', 'runtime integration and combat balance']}
(OUT/'weapon-fit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'SOURCE-LICENSE.txt').write_bytes((SOURCE/'SOURCE-LICENSE.txt').read_bytes())

if '--render' in sys.argv:
    s.render.filepath = str(OUT/'installed-full.png')
    bpy.ops.render.render(write_still=True)
    # Detail is a true higher-resolution local render, not a blurred upscaled sprite.
    s.render.resolution_percentage = 400
    s.render.use_border = True
    s.render.use_crop_to_border = True
    for row in rows:
        x,y = row['sourceImageAnchorPx']
        r = 48 if row['tag']=='L' else 34 if row['tag']=='M' else 23
        s.render.border_min_x, s.render.border_max_x = (x-r)/512,(x+r)/512
        s.render.border_min_y, s.render.border_max_y = 1-(y+r)/1024,1-(y-r)/1024
        s.render.filepath = str(OUT/('detail-'+row['tag']+'.png'))
        bpy.ops.render.render(write_still=True)
print('WEAPON_FIT_CREATED', str(OUT), flush=True)
