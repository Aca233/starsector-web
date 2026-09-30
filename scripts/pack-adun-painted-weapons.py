"""Register generated paired heads/collars; no repainting or synthetic weapon geometry.
Crop/resample, remove <=4/255 alpha fringe noise, calibrate observed pivots/apertures.
"""
from pathlib import Path
from PIL import Image
import json, numpy as np,hashlib
R=Path(__file__).resolve().parents[1];O=R/'output/imagegen/adun-weapon-kit-v11';D=R/'public/game-assets/graphics/ships/web_adun_ark'
im=Image.open(O/'paired-kit.png');assert im.format=='PNG' and im.size==(1254,1254) and im.mode=='RGBA';assert im.getchannel('A').getextrema()==(0,255)
a=np.array(im);a[a[:,:,3]<=4]=0;im=Image.fromarray(a)
old=json.loads((R/'src/engine/content/adun-ark-weapons-art.json').read_text());out={};audit=[]
# Measured against the returned image, NOT guessed from the requested canvas dimensions.
head_pivots={'S':(209,681),'M':(627,681),'L':(1045,681)}
ports={'S':[(208,600)],'M':[(627,476)],'L':[(1008,300),(1080,300)]}
for col,key in enumerate(['S','M','L']):
 rows={}
 for kind,y0,y1 in [('head',0,820),('seat',820,1254)]:
  x0,x1=418*col,418*(col+1);cell=im.crop((x0,y0,x1,y1));b=cell.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox();assert b
  box=[x0+b[0],y0+b[1],x0+b[2],y0+b[3]];tile=im.crop(box);w,h=tile.size
  scale=min(old[key][kind]['width']/w,old[key][kind]['height']/h)
  if kind=='head':pivot=head_pivots[key]
  else:
   arr=np.array(tile);yy,xx=np.mgrid[:h,:w];mask=(arr[:,:,3]>240)&(arr[:,:,:3].max(2)<115)&(np.abs(xx-w/2)<w*.24)&(np.abs(yy-h/2)<h*.24)
   assert mask.sum()>300;pivot=(box[0]+float(xx[mask].mean()),box[1]+float(yy[mask].mean()))
  name=f'{key}-{kind}-painted-v11.png';render=tile.resize((round(w*scale*2),round(h*scale*2)),Image.Resampling.LANCZOS);render.save(D/name,optimize=True)
  offsets=[v for px,py in ports[key] for v in [(head_pivots[key][1]-py)*scale,(px-head_pivots[key][0])*scale]] if kind=='head' else []
  rows[kind]={'file':name,'width':w*scale,'height':h*scale,'pivotX':(pivot[0]-box[0])/w,'pivotY':(pivot[1]-box[1])/h,'offsets':offsets}
  audit.append({'tier':key,'part':kind,'crop':box,'sourcePivot':pivot,'scale':scale,'sourceApertures':ports[key] if kind=='head' else None})
  if kind=='seat':
   # The same collar's near lip occludes the head root. No unrelated overlay shading.
   lip=render.copy();cut=round((rows[kind]['pivotY']+.2)*lip.height);lip.paste((0,0,0,0),(0,0,lip.width,cut));lipname=f'{key}-lip-painted-v11.png';lip.save(D/lipname,optimize=True)
   rows['foreground']={**rows[kind],'file':lipname}
 out[key]=rows
# UI portraits come from the SAME installed components, including the near lip.
for key,row in out.items():
 canvas=Image.new('RGBA',(320,420));pivot=(160,330);display_scale=4
 for kind in ['seat','head','foreground']:
  d=row[kind];tile=Image.open(D/d['file']);w,h=round(d['width']*display_scale),round(d['height']*display_scale);tile=tile.resize((w,h),Image.Resampling.LANCZOS);canvas.alpha_composite(tile,(round(pivot[0]-w*d['pivotX']),round(pivot[1]-h*d['pivotY'])))
 box=canvas.getchannel('A').getbbox();name=f'{key}-detail-painted-v11.png';canvas.crop(box).save(D/name,optimize=True);row['icon']=name
(R/'src/engine/content/adun-ark-weapons-painted.json').write_text(json.dumps(out,indent=2))
(O/'registration.json').write_text(json.dumps({'sourceSha256':hashlib.sha256((O/'paired-kit.png').read_bytes()).hexdigest(),'format':'PNG','actualSize':list(im.size),'actualAlphaRange':[0,255],'model':'gpt-image-2.5','provider':'user-configured local proxy','capabilitiesObserved':['two-reference edit','true transparency'],'fringeCleanup':'alpha <= 4/255 only; no opaque RGB repaint','assets':audit},indent=2))
print(json.dumps(out))
