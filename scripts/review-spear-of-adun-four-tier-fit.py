"""Summarize real rendered four-tier samples; not a runtime ship definition."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops

ROOT=Path.cwd();BASE=ROOT/'output/spear-of-adun-art'
small=json.loads((BASE/'weapon-fit-v01/weapon-fit.json').read_text(encoding='utf-8'))
geometry=json.loads((BASE/'weapon-fit-v01/geometry-verification.json').read_text(encoding='utf-8'))
xl=json.loads((BASE/'xl-fit-v01/xl-fit.json').read_text(encoding='utf-8'))
assert geometry['sampledGeometryPassed'] and xl['sampledGeometryPassed'] and xl['savedMasterReopenedAndBindingsVerified']
sizes={'S':'SMALL','M':'MEDIUM','L':'LARGE'}
records=[]
for row in small['sites']:
    evidence=next(r for r in geometry['sites'] if r['site']==row['site'])
    files=[BASE/'weapon-fit-v01'/row['tag']/f'{name}.png' for name in ['empty','rest','outer','inner','head-complete','head-visible','seat-visible']]
    for file in files:
        with Image.open(file) as im:
            assert im.format=='PNG' and im.mode=='RGBA' and im.getbbox(), file
    complete=Image.open(files[4]).convert('RGBA');visible=Image.open(files[5]).convert('RGBA')
    diff=ImageChops.difference(complete,visible)
    records.append({'size':sizes[row['tag']],'site':row['site'],'binding':'OPEN_SAME_SIZE','motion':'TURRET',
        'artProduction':'SOURCE_MESH_RECOMPOSITION_AND_AUTHORED_GEOMETRY','runtimeMedia':'2D_RASTER',
        'imageAnchorPx':row['sourceImageAnchorPx'],'muzzleHeadLocalPx':evidence['muzzleLocalPx'],
        'sampledYawRangeDegreesClockwise':evidence['yawRangeDegrees'],'sampledPoses':evidence['poseCount'],
        'headHullIntersections':len(evidence['headHullIntersectionPoses']),'blockedMuzzles':len(evidence['blockedMuzzles']),
        'completeVsVisibleDifferentPixels':sum(any(pixel) for pixel in diff.getdata()),
        'artFitAccepted':False,'anotherSameTier2DWeaponFitTested':False,
        'previewFiles':[str(f.relative_to(ROOT)).replace('\\','/') for f in files[:4]]})
records.append({'size':'EXTRA_LARGE','site':'FORE_PROJECTOR','binding':'BUILT_IN_UNIQUE_WEAPON','motion':'HULL_FIXED_FORWARD_WITH_DEPLOYING_SHROUD',
    'artProduction':'SOURCE_MECHANISM_PLUS_AUTHORED_FIXED_OPTIC','runtimeMedia':'2D_RASTER',
    'imageAnchorPx':xl['imageAnchorPx'],'muzzleRootLocalPx':xl['muzzleRootLocalPx'],
    'muzzleImagePx':xl['samples'][0]['muzzleImagePx'],'sourceSurface':xl['sourceSurface'],'parentBone':xl['parentBone'],
    'mountCount':1,'sourceControlSegmentCount':12,'sampledPoses':len(xl['samples']),
    'headHullIntersections':len(xl['headHullIntersections']),'blockedMuzzles':len(xl['blockedMuzzles']),
    'artFitAccepted':False,'previewFiles':['output/spear-of-adun-art/xl-fit-v01/'+n+'.png' for n in ['closed','deployed','charged','recovered']]})
records.sort(key=lambda r:['SMALL','MEDIUM','LARGE','EXTRA_LARGE'].index(r['size']))
sources=['scripts/build-spear-of-adun-weapon-fit.py','scripts/check-spear-of-adun-weapon-fit.py','scripts/build-spear-of-adun-xl-fit.py',
         'output/spear-of-adun-art/weapon-fit-v01/weapon-fit.json','output/spear-of-adun-art/weapon-fit-v01/geometry-verification.json','output/spear-of-adun-art/xl-fit-v01/xl-fit.json']
manifest={'schemaVersion':1,'stage':'OFFLINE_FOUR_TIER_ART_SAMPLES_NOT_RUNTIME','runtimeRegistered':False,
    'requires3DSourceForOtherWeapons':False,'sourceImageSize':[512,1024],'profiles':records,
    'sourceSha256':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in sources},
    'limitations':['Discrete geometric checks, not continuous collision proof','Not gameplay balance or cannon identification from canon',
                   'Runtime pivot/lighting and same-tier replacement fit pending','No v05 slot/save migration or publication']}
(ROOT/'docs/spear-of-adun-four-tier-fit-v06.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'sizes':[r['size'] for r in records],'sampledPoses':sum(r['sampledPoses'] for r in records),'runtimeRegistered':False},indent=2))
