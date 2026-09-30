"""Render actual empty/installed/aiming samples and an offline articulated review.
Never copies these development resources into public/ or registers runtime IDs.
"""
import json
import math
import sys
from pathlib import Path
import bpy

ROOT=Path.cwd()
OUT=ROOT/'output/spear-of-adun-art/weapon-fit-v01'
report=json.loads((OUT/'weapon-fit.json').read_text(encoding='utf-8'))
verification=json.loads((OUT/'geometry-verification.json').read_text(encoding='utf-8'))
assert verification['sampledGeometryPassed'], 'Do not render a failing fit as completed'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'weapon-fit.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene
s.use_nodes=False
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
s.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
s.cycles.samples=192
s.cycles.use_denoising=True
s.cycles.use_animated_seed=False
s.render.resolution_x,s.render.resolution_y=512,1024
s.render.image_settings.file_format='PNG'
s.render.image_settings.color_mode='RGBA'
s.render.image_settings.color_depth='8'
s.render.film_transparent=True
s.frame_set(0);bpy.context.view_layer.update()
meshes=[o for o in s.objects if o.type=='MESH' and not o.hide_render]
rig=next(o for o in s.objects if o.type=='ARMATURE')
fore={b.name:b.matrix_basis.copy() for b in rig.pose.bones if b.name.startswith('Ctrl_Gun_')}


def defaults():
    for obj in meshes:
        obj.hide_render=False;obj.visible_camera=True;obj.is_holdout=False
    for row in report['sites']:
        bpy.data.objects[row['pivot']].rotation_euler.z=-math.radians(row['yaw'])
    bpy.context.view_layer.update()


def render(path, row=None, scale=1):
    s.render.resolution_percentage=100*scale
    s.render.use_border=row is not None
    s.render.use_crop_to_border=row is not None
    if row:
        x,y=row['sourceImageAnchorPx'];r={'L':48,'M':34,'S':23}[row['tag']]
        s.render.border_min_x,s.render.border_max_x=(x-r)/512,(x+r)/512
        s.render.border_min_y,s.render.border_max_y=1-(y+r)/1024,1-(y-r)/1024
    s.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)


exports=[]
for row in report['sites']:
    directory=OUT/row['tag'];directory.mkdir(exist_ok=True)
    r={'L':48,'M':34,'S':23}[row['tag']]
    x,y=row['sourceImageAnchorPx']
    for state in ['empty','rest','outer','inner']:
        defaults()
        if state=='empty':
            for name in row['headObjects']:bpy.data.objects[name].hide_render=True
        else:
            angle=row['yaw']+({'rest':0,'outer':-row['halfArc'],'inner':row['halfArc']}[state])
            bpy.data.objects[row['pivot']].rotation_euler.z=-math.radians(angle)
        bpy.context.view_layer.update()
        render(directory/(state+'.png'),row,4)
    # Visibility-derived layers. Full vs holdout is measured, not assumed.
    defaults()
    head_names=set(row['headObjects'])
    for obj in meshes:
        if obj.name not in head_names:obj.visible_camera=False
    render(directory/'head-complete.png',row)
    defaults()
    for obj in meshes:
        if obj.name not in head_names:obj.is_holdout=True
    render(directory/'head-visible.png',row)
    defaults()
    for name in row['headObjects']:bpy.data.objects[name].hide_render=True
    for obj in meshes:
        if obj.name not in row['fixedObjects']:obj.is_holdout=True
    render(directory/'seat-visible.png',row)
    exports.append({'size':row['tag'],'rectSourcePx':[x-r,y-r,2*r,2*r],
                    'pivotInRectPx':[r,r],'headFile':row['tag']+'/head-visible.png',
                    'baseFile':row['tag']+'/seat-visible.png',
                    'restYawDegreesClockwise':row['yaw'],
                    'note':'Absolute rest pose, not zero-yaw normalized runtime art. Moving hull-shadow layer not exported.'})

defaults()
render(OUT/'installed-full.png')
(OUT/'layer-export.json').write_text(json.dumps({'exports':exports,'runtimeReady':False,
    'pending':'Normalize angle/pivot into game coordinates; choose directional frame/shadow policy; validate all replacement weapons, not only these heads.'},ensure_ascii=False,indent=2),encoding='utf-8')
if '--animate' in sys.argv:
    directory=OUT/'motion-frames';directory.mkdir(exist_ok=True)
    count=96
    for i in range(count):
        f=i/count*3000
        s.frame_set(math.floor(f),subframe=f%1)
        # Isolate the new turrets; maintain the real source core animation, not a 2D spin.
        for name,basis in fore.items():rig.pose.bones[name].matrix_basis=basis
        for row in report['sites']:
            yaw=row['yaw']+row['halfArc']*math.sin(i/count*math.tau)
            bpy.data.objects[row['pivot']].rotation_euler.z=-math.radians(yaw)
        bpy.context.view_layer.update()
        render(directory/f'{i:03d}.png')
    (OUT/'motion-review.json').write_text(json.dumps({'frames':count,'fps':16,'durationSeconds':6,
        'sourceRingSeconds':50,'sourcePlaybackSpeedMultiplier':50/6,
        'turretAim':'Authored sinusoidal review within each sampled clear sector, not combat AI',
        'fullHullFrames':'512x1024','runtimeIntegrated':False},indent=2),encoding='utf-8')
print('WEAPON_FIT_REVIEW_RENDERED',flush=True)
