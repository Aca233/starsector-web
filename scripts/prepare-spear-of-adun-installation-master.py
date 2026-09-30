"""Create a real editable attachment master; markers are non-rendering authoring empties."""
import json
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path.cwd();OUT=ROOT/'output/spear-of-adun-art/mount-layout-v01'
regions=json.loads((OUT/'source-regions.json').read_text(encoding='utf-8'))
evidence=json.loads((OUT/'calibration.json').read_text(encoding='utf-8'))
assert evidence['corePhaseCount']==72 and all(r['sampledSupportPassed'] for r in evidence['sites'])
bpy.ops.wm.open_mainfile(filepath=str(ROOT/regions['sourceBlend']),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.frame_set(0);bpy.context.view_layer.update();rig=next(o for o in s.objects if o.type=='ARMATURE')
collections={}
for key,label in [('FIXED_HULL','Fixed hull - open bearings'),('ROTATING_CORE','Rotating core - NO WEAPONS'),('FORE_MECHANISM','Fore mechanism - dedicated built-in')]:
 col=bpy.data.collections.new(label);s.collection.children.link(col);collections[key]=col
for row in regions['objects']:
 obj=bpy.data.objects[row['object']]
 for col in list(obj.users_collection):col.objects.unlink(obj)
 collections[row['category']].objects.link(obj)
 obj['installation_owner']=row['category'];obj['open_weapon_mounts_allowed']=row['category']=='FIXED_HULL'
markers=bpy.data.collections.new('Installation candidates - NOT weapon art');s.collection.children.link(markers)
rows=[]
for site in evidence['sites']:
 control=site['sourceSurface']['activeGroups'];assert len(control)==1
 point=Vector(site['restWorldAnchor']);obj=bpy.data.objects.new('MountCandidate_'+site['id'],None);markers.objects.link(obj)
 obj.empty_display_type='CIRCLE';obj.empty_display_size=site['bearingRadiusPx']*s.camera.data.ortho_scale/1024
 obj.show_in_front=True;obj.parent=rig;obj.parent_type='BONE';obj.parent_bone=control[0]
 bpy.context.view_layer.update();obj.matrix_world=Matrix.Translation(point);bpy.context.view_layer.update()
 assert (obj.matrix_world.translation-point).length<1e-5
 obj['authoring_only']=True;obj['weapon_identity']='UNASSIGNED - NOT RUNTIME';obj['target_size']=site['size'];obj['binding']='OPEN_SAME_SIZE'
 obj['surface_object']=site['sourceSurface']['object'];obj['art_fit_accepted']=False
 rows.append({'id':site['id'],'empty':obj.name,'parentBone':control[0],'sourceSurfaceObject':site['sourceSurface']['object'],
              'worldAnchor':list(point),'boneLocalAnchor':list((rig.matrix_world@rig.pose.bones[control[0]].matrix).inverted()@point)})
report={'authoringEmptiesNotWeaponSprites':True,'gameRegistered':False,'attachments':rows,'maxDrift':0,'maxProjectionErrorPx':0}
for frame in [0,42,375,750,1500,2250,3000]:
 s.frame_set(frame);bpy.context.view_layer.update()
 for row,site in zip(rows,evidence['sites']):
  p=bpy.data.objects[row['empty']].matrix_world.translation
  drift=(p-Vector(row['worldAnchor'])).length;report['maxDrift']=max(drift,report['maxDrift'])
  uv=world_to_camera_view(s,s.camera,p);xy=[uv.x*512,(1-uv.y)*1024]
  error=max(abs(a-b) for a,b in zip(xy,site['imageAnchorPx']));report['maxProjectionErrorPx']=max(error,report['maxProjectionErrorPx'])
assert report['maxDrift']<1e-5 and report['maxProjectionErrorPx']<.01,report
s.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'installation-layout.blend'))
bpy.ops.wm.open_mainfile(filepath=str(OUT/'installation-layout.blend'),load_ui=False,use_scripts=False)
s=bpy.context.scene;s.frame_set(750);bpy.context.view_layer.update()
for row in rows:
 o=bpy.data.objects[row['empty']];assert o.parent_type=='BONE' and o.parent_bone==row['parentBone']
 assert (o.matrix_world.translation-Vector(row['worldAnchor'])).length<1e-5
report['savedMasterReopenedAndBindingsVerified']=True
(OUT/'attachment-master.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='attachments'},indent=2))
