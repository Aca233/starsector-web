"""Pack v12 bake into depth-owned bitmaps; preserve ALL gameplay coordinates.
768x1536 texture sampling, 512x1024 logical authoring canvas; no runtime meshes.
"""
from pathlib import Path
import json,hashlib,importlib.util,shutil,time
import numpy as np
from PIL import Image,ImageChops,ImageStat
R=Path(__file__).resolve().parents[1];O=R/'output/spear-of-adun-art/material-bake-v12';D=R/'public/game-assets/graphics/ships/web_adun_ark'
deadline=time.monotonic()+1800
def ready(path):
 while not path.exists():
  if time.monotonic()>deadline:raise TimeoutError('Bake incomplete; runtime metadata left unchanged')
  time.sleep(2)
T=1.5;SIZE=(768,1536)
ART=R/'src/engine/content/adun-ark-art.json';old=json.loads(ART.read_text())
backup=O/'before-art.json'
if not backup.exists():backup.write_text(json.dumps(old))
old=json.loads(backup.read_text());anchors={o:[v*T for v in p['anchor']] for o,p in old['parts'].items()}
s=importlib.util.spec_from_file_location('depth_layers',R/'scripts/build-spear-of-adun-module-layers.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.OUT=O;m.SIZE=SIZE
frames=[];unique=set();alpha_errors=[]
for i in range(96):
 ready(O/f'frame-{i:04d}/bake.json')
 ready(O/f'frame-{i:04d}/depth-ready.json')
 for owner in m.MODULES:shutil.copyfile(O/f'frame-{i:04d}/{owner}-depth-hi.npy',O/f'frame-{i:04d}/{owner}-depth.npy')
 result=m.build_frame(i,anchors,authoring_checks=False);draws=[]
 for r in result['draws']:
  src=O/r['file'];name='bake-v12-'+r['sha256'][:20]+'.png'
  if name not in unique:shutil.copyfile(src,D/name);unique.add(name)
  draws.append({'owner':r['owner'],'file':name,'box':[v/T for v in r['sourceBox']],'size':[v/T for v in r['size']]})
 # Lossless owning-module alpha reconstruction independent of neighboring layers.
 for owner in m.MODULES:
  composed=Image.new('RGBA',SIZE)
  for r in result['draws']:
   if r['owner']!=owner:continue
   tile=Image.open(O/r['file']);canvas=Image.new('RGBA',SIZE);canvas.paste(tile,tuple(r['sourceBox'][:2]));composed=Image.alpha_composite(composed,canvas)
  reference=Image.open(O/f'frame-{i:04d}/{owner}.png').resize(SIZE,Image.Resampling.LANCZOS)
  delta=ImageStat.Stat(ImageChops.difference(composed.getchannel('A'),reference.getchannel('A'))).mean[0]
  assert delta<.2,(i,owner,delta);alpha_errors.append(delta)
 frames.append(draws);print('STYLE_PACKED',i,flush=True)
parts={}
for owner,p in old['parts'].items():
 im=Image.open(O/f'frame-0000/{owner}.png').resize(SIZE,Image.Resampling.LANCZOS);box=im.getchannel('A').getbbox();name=owner+'-v12.png';im.crop(box).save(D/name,optimize=True)
 parts[owner]={**p,'box':[v/T for v in box],'file':name}
Image.open(O/'frame-0000/composed.png').save(D/'assembly-v12.png',optimize=True)
art={**old,'version':12,'textureScale':T,'parts':parts,'frames':frames}
# Whole FORE replacements must share the same shading and logical projection.
base=[d for d in frames[0] if d['owner']=='FORE'];assert len(base)==1
assert all([d for d in f if d['owner']=='FORE']==base for f in frames)
ready(O/'bake-complete.json')
images=[Image.open(O/f'fore-{i:02d}.png').convert('RGBA').resize(SIZE,Image.Resampling.LANCZOS) for i in range(46)]
bs=[im.getchannel('A').getbbox() for im in images];box=[min(b[0] for b in bs),min(b[1] for b in bs),max(b[2] for b in bs),max(b[3] for b in bs)];lance=[]
for i,im in enumerate(images):
 name=f'lance-fore-{i:02d}-v12.png';im.crop(box).save(D/name,optimize=True);unique.add(name)
 lance.append({'file':name,'box':[v/T for v in box],'size':[(box[2]-box[0])/T,(box[3]-box[1])/T]})
rest=Image.open(O/'frame-0000/FORE.png').resize(SIZE,Image.Resampling.LANCZOS)
rest_delta=max(ImageStat.Stat(ImageChops.difference(images[0],rest)).mean)
loop_delta=max(ImageStat.Stat(ImageChops.difference(images[0],images[-1])).mean)
assert rest_delta<.25 and loop_delta<.25,(rest_delta,loop_delta)
assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})>=35
motion=json.loads((R/'src/engine/visual/ark-lance-motion-art.json').read_text());motion.update(version=12,replaceLayer=base[0]['file'],frames=lance)
Image.open(O/'fore-30.png').crop((420,410,604,646)).save(D/'solar-lance-detail-v12.png',optimize=True)
# Re-register the original source-emission overlay under the new AFT depth layer.
field=json.loads((R/'src/engine/visual/ark-native-field-art.json').read_text());layers=[];coverage=None
box=field['box']
for f in frames:
 draw=next(d for d in f if d['owner']=='AFT' and d['box'][1]<=720 and d['box'][3]>=1000)
 layers.append(draw['file']);im=Image.open(D/draw['file']);tile=im.getchannel('A').crop(tuple(round((v-draw['box'][i%2])*T) for i,v in enumerate(box))).resize(tuple(field['size']),Image.Resampling.LANCZOS)
 arr=np.asarray(tile)
 if coverage is None:coverage=arr
 else:assert np.array_equal(coverage,arr),'Native lower-AFT field must remain frame-invariant'
native=Image.open(R/'output/spear-of-adun-art/native-field-v09/native-emission.png').resize((512,1024),Image.Resampling.LANCZOS).crop(tuple(box));pixels=np.array(native);pixels[:,:,3]=np.minimum(pixels[:,:,3],coverage)
field.update(version=12,file='native-field-v12.png',afterLayers=sorted(set(layers)))
Image.fromarray(pixels).save(D/field['file'],optimize=True)
# Never modify ship scale, pivots, hardpoints or collision bounds for a visual change.
assert art['scale']==old['scale'] and art['canvas']==old['canvas']
for owner,p in parts.items():assert p['anchor']==old['parts'][owner]['anchor'] and p['bounds']==old['parts'][owner]['bounds']
report={'version':12,'hullFrames':96,'lanceFrames':46,'logicalCanvas':art['canvas'],'textureCanvas':SIZE,'uniqueBodyAndMotionTextures':len(unique),'diskBytes':sum((D/n).stat().st_size for n in unique),'decodedBytes':sum(Image.open(D/n).width*Image.open(D/n).height*4 for n in unique),'maxOwningModuleAlphaError':max(alpha_errors),'lanceRestMeanDelta':rest_delta,'lanceLoopMeanDelta':loop_delta,'gameplayCoordinatesUnchanged':True}
assert report['decodedBytes']<192*1024**2,report
# Publish metadata last. Each file replacement is atomic; no runtime points at half a PNG.
for path,data in [(ART,art),(R/'src/engine/visual/ark-lance-motion-art.json',motion),(R/'src/engine/visual/ark-native-field-art.json',field)]:
 temp=path.with_suffix('.next');temp.write_text(json.dumps(data,separators=(',',':')));temp.replace(path)
(O/'pack-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
