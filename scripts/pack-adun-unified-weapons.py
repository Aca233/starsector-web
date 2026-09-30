"""Register the local-proxy v13 material repair against measured source apertures.
Only technical alpha cleanup/cropping/resampling; no procedural replacement art.
"""
from pathlib import Path
import argparse,json,hashlib
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[1];O=R/'output/imagegen/adun-weapon-kit-v13';D=R/'public/game-assets/graphics/ships/web_adun_ark'
parser=argparse.ArgumentParser();parser.add_argument('--install',action='store_true');parser.add_argument('--match-hull-density',action='store_true');args=parser.parse_args()
revision=14 if args.match_hull_density else 13
hull_art=json.loads((R/'src/engine/content/adun-ark-art.json').read_text())
density=hull_art['textureScale']/hull_art['scale'] if args.match_hull_density else 2
assert .5<=density<=2
image=Image.open(O/'paired-kit.png');assert image.format=='PNG' and image.mode=='RGBA' and image.size==(1254,1254);assert image.getchannel('A').getextrema()==(0,255)
a=np.array(image);a[a[:,:,3]<=4]=0;image=Image.fromarray(a)
previous=R/'src/engine/content/adun-ark-weapons-painted.json';backup=O/'before-runtime-kit.json'
if not backup.exists():backup.write_text(previous.read_text())
old=json.loads(backup.read_text());reference=Image.open(R/'output/imagegen/adun-weapon-kit-v11/paired-kit.png')
pivots={'S':(206,681),'M':(627,681),'L':(1045,681)}
# Apertures measured from the actual blue pixels in the returned image, not request coordinates.
ports={'S':[(205.29,602.16)],'M':[(626.56,475.80)],'L':[(1007.84,301.10),(1080.02,301.00)]}
out={};audit=[];portrait_tiles={}
for col,key in enumerate('SML'):
 row={}
 for kind,y0,y1 in [('head',0,820),('seat',820,1254)]:
  x0,x1=col*418,(col+1)*418;region=(x0,y0,x1,y1);cell=image.crop(region)
  mask=np.asarray(cell)[:,:,3]>128;old_mask=np.asarray(reference.crop(region))[:,:,3]>128;iou=float((mask&old_mask).sum()/(mask|old_mask).sum());assert iou>.88,(key,kind,iou)
  b=cell.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox();box=(x0+b[0],y0+b[1],x0+b[2],y0+b[3]);tile=image.crop(box);w,h=tile.size
  scale=min(old[key][kind]['width']/w,old[key][kind]['height']/h)
  if kind=='head':pivot=pivots[key]
  else:
   pixels=np.array(tile);yy,xx=np.mgrid[:h,:w];dark=(pixels[:,:,3]>240)&(pixels[:,:,:3].max(2)<115)&(abs(xx-w/2)<w*.24)&(abs(yy-h/2)<h*.24);assert dark.sum()>300
   pivot=(box[0]+float(xx[dark].mean()),box[1]+float(yy[dark].mean()))
  offsets=[v for px,py in ports[key] for v in [(pivot[1]-py)*scale,(px-pivot[0])*scale]] if kind=='head' else []
  name=f'{key}-{kind}-painted-v{revision}.png';render=tile.resize((round(w*scale*density),round(h*scale*density)),Image.Resampling.LANCZOS);render.save(D/name,optimize=True)
  portrait_tiles[key,kind]=tile.resize((round(w*scale*4),round(h*scale*4)),Image.Resampling.LANCZOS)
  row[kind]={'file':name,'width':w*scale,'height':h*scale,'pivotX':(pivot[0]-box[0])/w,'pivotY':(pivot[1]-box[1])/h,'offsets':offsets}
  audit.append({'tier':key,'part':kind,'sourceCrop':box,'sourcePivot':pivot,'sourceApertures':ports[key] if kind=='head' else [],'worldScale':scale,'silhouetteIoU':iou})
  if kind=='seat':
   lip=render.copy();cut=round((row[kind]['pivotY']+.2)*lip.height);lip.paste((0,0,0,0),(0,0,lip.width,cut));name=f'{key}-lip-painted-v{revision}.png';lip.save(D/name,optimize=True);row['foreground']={**row[kind],'file':name}
   portrait_lip=portrait_tiles[key,kind].copy();portrait_lip.paste((0,0,0,0),(0,0,portrait_lip.width,round((row[kind]['pivotY']+.2)*portrait_lip.height)));portrait_tiles[key,'foreground']=portrait_lip
 out[key]=row
for key,row in out.items():
 canvas=Image.new('RGBA',(320,420));pivot=(160,330);display_scale=4
 for kind in ['seat','head','foreground']:
  d=row[kind];tile=portrait_tiles[key,kind];w,h=tile.size;canvas.alpha_composite(tile,(round(pivot[0]-w*d['pivotX']),round(pivot[1]-h*d['pivotY'])))
 name=f'{key}-detail-painted-v{revision}.png';canvas.crop(canvas.getchannel('A').getbbox()).save(D/name,optimize=True);row['icon']=name
(O/f'runtime-kit-v{revision}.json').write_text(json.dumps(out,indent=2));(O/f'registration-runtime-v{revision}.json').write_text(json.dumps({'sourceSha256':hashlib.sha256((O/'paired-kit.png').read_bytes()).hexdigest(),'actualFormat':'PNG','actualSize':list(image.size),'actualAlphaRange':[0,255],'model':'gpt-image-2.5','provider':'configured localhost proxy','sourceFringeCleanup':'alpha <= 4/255 only','installed':args.install,'runtimeRevision':revision,'runtimePixelsPerWorldUnit':density,'uiPixelsPerWorldUnit':4,'parts':audit},indent=2))
if args.match_hull_density:
 current=json.loads(previous.read_text())
 for tier,row in out.items():
  for part in ['head','seat','foreground']:
   assert {k:v for k,v in row[part].items() if k!='file'}=={k:v for k,v in current[tier][part].items() if k!='file'},'Sampling-only fix must not move any geometry or muzzle'
if args.install:
 temp=previous.with_suffix('.next');temp.write_text(json.dumps(out,indent=2));temp.replace(previous)
print(json.dumps({'installed':args.install,'components':len(audit),'minSilhouetteIoU':min(r['silhouetteIoU'] for r in audit),'bodyAndMotionUnchanged':True,'runtimeRevision':revision,'density':density}))
