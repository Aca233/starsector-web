"""Pack genuine per-slot Cycles fixtures without modifying hull/head bitmaps.
Runtime uses hull-matched sampling; portraits use the untouched high-res source.
"""
from pathlib import Path
import argparse,json,hashlib
from PIL import Image,ImageChops
import numpy as np
R=Path(__file__).resolve().parents[1];O=R/'output/spear-of-adun-art/installations-v16';D=R/'public/game-assets/graphics/ships/web_adun_ark'
p=argparse.ArgumentParser();p.add_argument('--install',action='store_true');args=p.parse_args()
bake=json.loads((O/'bake.json').read_text());layout=json.loads((R/'src/engine/content/adun-ark-layout.json').read_text());expected={r['id'] for r in layout if r['size']!='EXTRA_LARGE'}
assert set(bake['slots'])==expected
art=json.loads((R/'src/engine/content/adun-ark-art.json').read_text());T=art['textureScale'];K=art['scale'];density=T/K
wp=R/'src/engine/content/adun-ark-weapons-painted.json';weapons=json.loads(wp.read_text());before=json.loads(wp.read_text())
out={};audit=[]
for id,d in bake['slots'].items():
 src=[Image.open(O/(id+'-'+kind+'.png')).convert('RGBA') for kind in ['seat','lip']]
 w,h=d['box'][2]-d['box'][0],d['box'][3]-d['box'][1]
 assert all(i.size==(w*8,h*8) for i in src),(id,[i.size for i in src])
 tiles=[]
 for im in src:
  im=im.resize((round(w*T),round(h*T)),Image.Resampling.LANCZOS)
  a=np.array(im);a[a[:,:,3]<=4]=0;tiles.append(Image.fromarray(a))
 bbox=ImageChops.lighter(tiles[0].getchannel('A'),tiles[1].getchannel('A')).getbbox();assert bbox
 # Keep one transparent filtering texel around the physical crop.
 bbox=(max(0,bbox[0]-1),max(0,bbox[1]-1),min(tiles[0].width,bbox[2]+1),min(tiles[0].height,bbox[3]+1))
 width=(bbox[2]-bbox[0])/density;height=(bbox[3]-bbox[1])/density
 anchor=((d['anchor'][0]-d['box'][0])*T-bbox[0],(d['anchor'][1]-d['box'][1])*T-bbox[1])
 geometry={'width':width,'height':height,'pivotX':anchor[0]/(bbox[2]-bbox[0]),'pivotY':anchor[1]/(bbox[3]-bbox[1])}
 row={}
 for kind,tile in zip(['seat','foreground'],tiles):
  name=f'{id}-'+('seat' if kind=='seat' else 'lip')+'-baked-v16.png';tile=tile.crop(bbox);tile.save(D/name,optimize=True);row[kind]={'file':name,**geometry}
  assert tile.getchannel('A').getextrema()[1]>0
  audit.append({'slot':id,'layer':kind,'pixelSize':list(tile.size),'bytes':(D/name).stat().st_size,'sha256':hashlib.sha256((D/name).read_bytes()).hexdigest()})
 out[id]=row
# Detail art uses an actual representative saddle per tier, not an enlarged
# runtime thumbnail. The rotating head stays the exact v13 generated source.
registration=json.loads((R/'output/imagegen/adun-weapon-kit-v13/registration-runtime-v14.json').read_text())
heads={d['tier']:d for d in registration['parts'] if d['part']=='head'}
source=Image.open(R/'output/imagegen/adun-weapon-kit-v13/paired-kit.png').convert('RGBA')
for tag,id in [('S','AFT_OUTER_GUARD_PORT'),('M','FORE_SHOULDER_PORT'),('L','AFT_BATTERY_PORT')]:
 d=bake['slots'][id];c=Image.new('RGBA',(400,480));pivot=(200,350)
 for kind in ['seat','head','lip']:
  if kind=='head':
   hd=heads[tag];b=hd['sourceCrop'];im=source.crop(b);a=np.array(im);a[a[:,:,3]<=4]=0;im=Image.fromarray(a)
   im=im.resize((round(im.width*hd['worldScale']*4),round(im.height*hd['worldScale']*4)),Image.Resampling.LANCZOS)
   off=((hd['sourcePivot'][0]-b[0])*hd['worldScale']*4,(hd['sourcePivot'][1]-b[1])*hd['worldScale']*4)
  else:
   im=Image.open(O/(id+'-'+kind+'.png')).convert('RGBA');off=((d['anchor'][0]-d['box'][0])*8,(d['anchor'][1]-d['box'][1])*8)
  c.alpha_composite(im,(round(pivot[0]-off[0]),round(pivot[1]-off[1])))
 # Remove only essentially-transparent render fringe for the UI crop.
 a=np.array(c);a[a[:,:,3]<=4]=0;c=Image.fromarray(a);c=c.crop(c.getchannel('A').getbbox());name=tag+'-detail-seated-v16.png';c.save(D/name,optimize=True);weapons[tag]['icon']=name
for tag in before:
 assert {k:v for k,v in weapons[tag].items() if k!='icon'}=={k:v for k,v in before[tag].items() if k!='icon'},'Do not alter turret calibration or runtime bitmap'
(O/'runtime-installations.json').write_text(json.dumps(out,indent=2))
if args.install:
 if not (O/'before-weapons.json').exists():(O/'before-weapons.json').write_text(json.dumps(before,indent=2))
 for path,data in [(R/'src/engine/content/adun-ark-installations-baked.json',out),(wp,weapons)]:
  tmp=path.with_suffix('.next');tmp.write_text(json.dumps(data,indent=2));tmp.replace(path)
report={'installed':args.install,'slots':len(out),'density':density,'runtimeBytes':sum(r['bytes'] for r in audit),'runtimeRgbaBytes':sum(r['pixelSize'][0]*r['pixelSize'][1]*4 for r in audit),'source':'v12 physical hull surface, UV/color and lighting; new v16 fixture geometry','cleanup':'alpha <=4/255 after final sampling','portraitRepresentativeSlots':{'S':'AFT_OUTER_GUARD_PORT','M':'FORE_SHOULDER_PORT','L':'AFT_BATTERY_PORT'},'headArtUnchanged':True,'files':audit}
(O/'pack-report.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='files'}))
