"""Author a source-rig deployment animation as explicit Web adaptation, offline."""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Matrix
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path.cwd()
sys.path.insert(0,str(ROOT/'scripts'))
from spear_of_adun_core_animation import restore_core_animation
OUT=ROOT/'output/spear-of-adun-art/fore-deployment-v01'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'output/spear-of-adun-art/fore-installation-v01/fore-segmented.blend'),load_ui=False,use_scripts=False)
scene=bpy.context.scene
scene.use_nodes=False
scene.frame_set(0)
scene.render.resolution_x=512;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.image_settings.color_depth='8';scene.render.image_settings.compression=100
scene.cycles.samples=192;scene.cycles.seed=37;scene.cycles.use_animated_seed=False
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
for device in prefs.devices:device.use=device.type=='OPTIX'
scene.cycles.device='GPU' if any(d.use for d in prefs.devices) else 'CPU'
rig=next(o for o in scene.objects if o.type=='ARMATURE')
segments=[o for o in scene.objects if o.name.startswith('AdunFore_')]
assert len(segments)==12
for obj in segments:
    assert len(obj.vertex_groups)==1, (obj.name, 'missing source control group')
    assert all(len(v.groups)==1 and abs(v.groups[0].weight-1)<1e-6 for v in obj.data.vertices), obj.name
all_basis={b.name:b.matrix_basis.copy() for b in rig.pose.bones}
rig.animation_data_clear()  # Isolated fore renders only. Restore the core before saving the master.
for name,basis in all_basis.items():rig.pose.bones[name].matrix_basis=basis
bpy.context.view_layer.update()
names=['Ctrl_Gun_Lower_L_12','Ctrl_Gun_Lower_R_7','Ctrl_Gun_Lower_Wing_L_13','Ctrl_Gun_Lower_Wing_R_14']
base={name:rig.pose.bones[name].matrix.copy() for name in names}
world={name:rig.matrix_world@matrix for name,matrix in base.items()}
pivots={side:(rig.matrix_world@rig.pose.bones[name].head).copy() for side,name in [('L','Ctrl_Gun_Lower_L_12'),('R','Ctrl_Gun_Lower_R_7')]}
mat=bpy.data.materials['Material.011']
bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
emission=bsdf.inputs['Emission Strength'];assert not emission.is_linked
base_emission=emission.default_value
# Author only opening/closing and existing painted emission. No procedural rings, new nozzles or beams.
poses=[(0,'rest',0,1),(6,'deploy',1,1),(12,'deploy',3,1),(18,'deploy',5,1),(24,'deploy',7,1),
       (30,'deploy',9,1),(36,'deploy',11,1),(42,'deployed',12,1),
       (48,'charging',12,1.7),(54,'charging',12,2.5),(60,'ready',12,3.5),
       (66,'release',12,1.5),(72,'recover',10,1),(78,'recover',7,1),(84,'recover',3,1),(90,'rest',0,1)]
frames=[]
scene.render.fps=60
scene.frame_start=0;scene.frame_end=90
for index,(frame,phase,angle,energy) in enumerate(poses):
    scene.frame_set(frame)
    for name in names:rig.pose.bones[name].matrix=base[name]
    bpy.context.view_layer.update()
    for name in names:
        side='L' if '_L_' in name else 'R'
        pivot=pivots[side]
        signed_angle=math.radians(angle)*(1 if side=='L' else -1)
        delta=Matrix.Translation(pivot)@Matrix.Rotation(signed_angle,4,'Z')@Matrix.Translation(-pivot)
        rig.pose.bones[name].matrix=rig.matrix_world.inverted()@delta@world[name]
        bpy.context.view_layer.update()
        rig.pose.bones[name].keyframe_insert(data_path='rotation_quaternion',frame=frame,group='Web deployment '+side)
        rig.pose.bones[name].keyframe_insert(data_path='location',frame=frame,group='Web deployment '+side)
    emission.default_value=base_emission*energy
    emission.keyframe_insert(data_path='default_value',frame=frame)
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get()
    points=[]
    for obj in segments:
        evaluated=obj.evaluated_get(dg);mesh=evaluated.to_mesh()
        points.extend(world_to_camera_view(scene,scene.camera,evaluated.matrix_world@v.co) for v in mesh.vertices)
        evaluated.to_mesh_clear()
    bounds=[min(v.x for v in points)*512,(1-max(v.y for v in points))*1024,
            max(v.x for v in points)*512,(1-min(v.y for v in points))*1024]
    scene.render.filepath=str(OUT/f'frame-{index:02d}.png')
    bpy.ops.render.render(write_still=True)
    frames.append({'index':index,'sourceFrame':frame,'phase':phase,'openAnglePerSideDeg':angle,
                   'emissionMultiplier':energy,'render':f'frame-{index:02d}.png','mechanismBoundsPx':bounds})
rest_bounds=frames[0]['mechanismBoundsPx']
open_bounds=frames[7]['mechanismBoundsPx']
assert max(abs(a-b) for a,b in zip(rest_bounds,open_bounds))>4, 'Authored controls did not deform rendered mesh'
assert max(abs(a-b) for a,b in zip(rest_bounds,frames[-1]['mechanismBoundsPx']))<.01, 'Mechanism failed to return to rest'
# Linear curves make export interpolation explicit, avoiding auto-Bezier mechanical overshoot.
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.frame_set(0)
rig['animation_provenance']='Web-authored deployment; source core motion restored separately'
core_report=restore_core_animation(rig,ROOT/'output/spear-of-adun-art/material-study-v02/material-study.blend')
scene.frame_end=round(core_report['loopDurationSeconds']*scene.render.fps)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'fore-deployment.blend'))
report={'kind':'P6 Web-authored source-rig mechanism animation; not game-integrated',
        'geometryAdded':False,'sourceGeometryModified':False,'sourceCoreAnimationFrozenInIsolatedRenders':True,
        'sourceCoreAnimationFrozenInMaster':False,'sourceCoreLoop':core_report,
        'canonicalAnimation':False,'freeTurretAim':False,'authoredControls':names,
        'openAnglePerSideDeg':12,'animationDurationSeconds':1.5,'fps':60,'renderedKeyStates':frames,
        'renderResolution':[512,1024],'emissionMaterial':'Material.011','baseEmissionStrength':base_emission,
        'emissionUsesSourcePaintedMap':True,'noBeamOrImpactArtProduced':True,
        'gameAssetsChanged':False,'pending':['visual clearance review','canonical muzzle not established; any emitter placement is Web design','final beam/effect art and weapon balance','game mounting']}
(OUT/'deployment-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('FORE_DEPLOYMENT_COMPLETE',flush=True)
