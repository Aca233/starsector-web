"""Lossless crop/pack of baked sprites. Depth is only used offline."""
from pathlib import Path
import json,hashlib,importlib.util,time,shutil
import numpy as np
from PIL import Image
R=Path.cwd();O=R/'output/spear-of-adun-art/ark-runtime-v06';P=R/'public/game-assets/graphics/ships/web_adun_ark';P.mkdir(parents=True,exist_ok=True)
s=importlib.util.spec_from_file_location('layers',R/'scripts/build-spear-of-adun-module-layers.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.OUT=O
master=json.loads((R/'output/spear-of-adun-art/modules-v01/module-master.json').read_text());anchors={r['id']:r['authoringImageAnchorPx'] for r in master['modules']}
frames=[];seen=set()
for i in range(96):
 folder=O/f'frame-{i:04d}'
 while not (folder/'bake.json').exists():time.sleep(5)
 result=m.build_frame(i,anchors,authoring_checks=False);rows=[]
 for r in result['draws']:
  src=O/r['file'];name='layer-'+r['sha256'][:20]+'.png'
  if name not in seen:shutil.copyfile(src,P/name);seen.add(name)
  rows.append({'owner':r['owner'],'file':name,'box':r['sourceBox'],'size':r['size']})
 frames.append(rows)
 print('PACKED',i,flush=True)
def hull(points):
 p=sorted(set(points));cross=lambda o,a,b:(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);lo=[];hi=[]
 for q in p:
  while len(lo)>=2 and cross(lo[-2],lo[-1],q)<=0:lo.pop()
  lo.append(q)
 for q in reversed(p):
  while len(hi)>=2 and cross(hi[-2],hi[-1],q)<=0:hi.pop()
  hi.append(q)
 return lo[:-1]+hi[:-1]
parts={}
for owner,anchor in anchors.items():
 im=Image.open(O/'frame-0000'/(owner+'.png')).convert('RGBA');box=im.getchannel('A').getbbox();im.crop(box).save(P/(owner+'.png'))
 arr=np.asarray(im)[:,:,3];ys,xs=np.where(arr>160);outline=hull(list(zip(xs[::3].tolist(),ys[::3].tolist())))
 if owner=='CORE':outline=[[248,330],[268,330],[281,495],[274,645],[238,645],[231,495]]
 parts[owner]={'anchor':anchor,'box':list(box),'bounds':outline,'file':owner+'.png'}
Image.open(O/'frame-0000/composed.png').save(P/'assembly.png')
art={'version':6,'scale':2,'canvas':[512,1024],'cycleSeconds':8,'sourceCycleSeconds':50,'parts':parts,'frames':frames}
(R/'src/engine/content/adun-ark-art.json').write_text(json.dumps(art,separators=(',',':')))
shutil.copyfile(R/'output/spear-of-adun-art/modules-v01/SOURCE-LICENSE.txt',P/'SOURCE-LICENSE.txt')
# Aircraft source is already a transparent image; crop/scale only, no repaint.
im=Image.open(R/'output/imagegen/adun-interceptor-v06/interceptor.png');assert im.format=='PNG' and im.mode=='RGBA';assert im.getchannel('A').getextrema()[0]==0
box=im.getchannel('A').point(lambda x:255 if x>1 else 0).getbbox();im=im.crop(box);factor=160/max(im.size);im=im.resize((round(im.width*factor),round(im.height*factor)),Image.Resampling.LANCZOS);im.save(P/'interceptor.png')
print(json.dumps({'frames':len(frames),'uniqueLayers':len(seen),'bytes':sum(p.stat().st_size for p in P.glob('*.png')),'aircraftSize':im.size,'aircraftSourceCrop':box}),flush=True)
