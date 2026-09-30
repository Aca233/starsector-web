"""Crop current FORE renders as whole replacement layers, never an opaque overlay patch."""
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
import json,hashlib
R=Path(__file__).resolve().parents[1];O=R/'output/spear-of-adun-art/lance-motion-v10';D=R/'public/game-assets/graphics/ships/web_adun_ark';art=json.loads((R/'src/engine/content/adun-ark-art.json').read_text())
base=[d for d in art['frames'][0] if d['owner']=='FORE'];assert len(base)==1;rest=base[0]
assert all([d for d in f if d['owner']=='FORE']==base for f in art['frames'])
images=[Image.open(O/f'fore-{i:02d}.png').convert('RGBA').resize((512,1024),Image.Resampling.LANCZOS) for i in range(46)]
boxes=[im.getchannel('A').getbbox() for im in images];box=[min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes)]
frames=[]
for i,im in enumerate(images):
 name=f'lance-fore-{i:02d}-v10.png';im.crop(box).save(D/name,optimize=True);frames.append({'file':name,'box':box,'size':[box[2]-box[0],box[3]-box[1]]})
assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})>=35
mean=ImageStat.Stat(ImageChops.difference(images[0],images[-1])).mean;assert max(mean)<.2,mean
meta={'version':10,'canonicalAnimation':False,'owner':'FORE','replaceLayer':rest['file'],'frames':frames,'chargeEndFrame':30,'releaseEndFrame':33,'lastFrame':45,'recoverySeconds':.9}
(R/'src/engine/visual/ark-lance-motion-art.json').write_text(json.dumps(meta,indent=2))
Image.open(O/'fore-30.png').convert('RGBA').crop((420,410,604,646)).save(D/'solar-lance-detail-v10.png',optimize=True)
# Source-native field stays attached to the hull; stronger but localized response.
print(json.dumps({'frames':len(frames),'box':box,'bytes':sum((D/f['file']).stat().st_size for f in frames),'restLoopMeanDifference':mean}))
