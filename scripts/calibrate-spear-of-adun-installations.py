"""Check proposed fixed bearings against evaluated model surfaces and core sweep."""
import json,math
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path.cwd();OUT=ROOT/'output/spear-of-adun-art/mount-layout-v01'
plan=json.loads((ROOT/'docs/spear-of-adun-installation-plan-v06.json').read_text(encoding='utf-8'))
regions=json.loads((OUT/'source-regions.json').read_text(encoding='utf-8'))
source={r['object']:r for r in regions['objects']}
bpy.ops.wm.open_mainfile(filepath=str(ROOT/regions['sourceBlend']),load_ui=False,use_scripts=False)
s=bpy.context.scene;rig=next(o for o in s.objects if o.type=='ARMATURE')
s.frame_set(0);bpy.context.view_layer.update()
fore_names=[b.name for b in rig.pose.bones if b.name.startswith('Ctrl_Gun_')]
closed={name:rig.pose.bones[name].matrix_basis.copy() for name in fore_names}
s.frame_set(42);bpy.context.view_layer.update();opened={name:rig.pose.bones[name].matrix_basis.copy() for name in fore_names}
# Independent degrees of freedom: sample ring phases with fore closed AND open.
for layer in rig.animation_data.action.layers:
 for strip in layer.strips:
  for bag in strip.channelbags:
   for curve in list(bag.fcurves):
    if 'Ctrl_Gun_' in curve.data_path:bag.fcurves.remove(curve)
cam=s.camera;direction=cam.matrix_world.to_quaternion()@Vector((0,0,-1));h=cam.data.ortho_scale

def rayorigin(x,y):return cam.matrix_world@Vector(((x/512-.5)*h/2,(.5-y/1024)*h,0))

def geometry():
 vertices=[];triangles=[];owners=[]
 for name,row in source.items():
  obj=bpy.data.objects[name].evaluated_get(bpy.context.evaluated_depsgraph_get());m=obj.to_mesh();m.calc_loop_triangles();offset=len(vertices)
  vertices.extend(obj.matrix_world@v.co for v in m.vertices)
  for tri in m.loop_triangles:triangles.append(tuple(offset+i for i in tri.vertices));owners.append(row)
  obj.to_mesh_clear()
 return BVHTree.FromPolygons(vertices,triangles,all_triangles=True),owners

def offsets(radius):
 # Center plus two concentric rings. These are bearing checks, not barrel sweeps.
 return [(0,0)]+[(math.cos(i*math.tau/16)*r,math.sin(i*math.tau/16)*r) for r in [radius*.5,radius] for i in range(16)]

rows={site['id']:{**site,'sourceSurface':None,'restWorldAnchor':None,'restWorldNormal':None,'maxAnchorDriftModelUnits':0,'testedPoses':0,'footprintProbeCount':33,'minimumFixedCoverage':1,'blockers':{},'firstFailure':None} for site in plan['sites']}
count=72 if '--full' in __import__('sys').argv else 1
for phase in range(count):
 frame=phase*50/count*60;s.frame_set(math.floor(frame),subframe=frame%1)
 for fore_state,poses in [('closed',closed),('open',opened)]:
  for name,basis in poses.items():rig.pose.bones[name].matrix_basis=basis
  bpy.context.view_layer.update();bvh,owners=geometry()
  for site in plan['sites']:
   row=rows[site['id']];x,y=site['imageAnchorPx'];hits=[]
   for dx,dy in offsets(site['bearingRadiusPx']):
    hit=bvh.ray_cast(rayorigin(x+dx,y+dy),direction,1000)
    owner=owners[hit[2]] if hit[0] is not None else None
    hits.append((hit,owner))
   fixed=sum(o is not None and o['category']=='FIXED_HULL' for _,o in hits)
   row['minimumFixedCoverage']=min(row['minimumFixedCoverage'],fixed/len(hits));row['testedPoses']+=1
   (hit,owner)=hits[0]
   if row['sourceSurface'] is None and owner:
    row['sourceSurface']={'object':owner['object'],'category':owner['category'],'activeGroups':owner['activeGroups'],'parentChains':owner['parentChains']}
    row['restWorldAnchor']=list(hit[0]);row['restWorldNormal']=list(hit[1])
   if hit[0] is not None and row['restWorldAnchor'] is not None:
    row['maxAnchorDriftModelUnits']=max(row['maxAnchorDriftModelUnits'],(hit[0]-Vector(row['restWorldAnchor'])).length)
   invalid=[o['category'] if o else 'EMPTY_SPACE' for _,o in hits if o is None or o['category']!='FIXED_HULL']
   for key in invalid:row['blockers'][key]=row['blockers'].get(key,0)+1
   if invalid and row['firstFailure'] is None:row['firstFailure']={'corePhaseDegrees':phase/count*360,'foreState':fore_state,'causes':sorted(set(invalid))}
for row in rows.values():row['sampledSupportPassed']=row['minimumFixedCoverage']==1 and row['maxAnchorDriftModelUnits']<1e-5
report={'schemaVersion':1,'stage':'SAMPLED_GEOMETRY_NOT_FINAL_WEAPON_ACCEPTANCE','sourceImageSize':[512,1024],
        'corePhaseCount':count,'foreStates':['closed','open'],'sites':list(rows.values()),
        'runtimeRegistered':False,'newWeaponArtComplete':False,'firingClearanceTested':False,
        'sampledOcclusionOnlyNotContinuousCollisionProof':True}
(OUT/('calibration.json' if count>1 else 'rest-probe.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
for row in rows.values():print(row['id'],row['sourceSurface']['object'] if row['sourceSurface'] else '-',round(row['minimumFixedCoverage'],3),row['firstFailure'],flush=True)
