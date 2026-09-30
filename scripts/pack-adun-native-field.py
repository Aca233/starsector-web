"""Register a native-material crop inside the static lower AFT depth layer.
Only crop/downsample/alpha registration; no painted or synthesized exhaust geometry.
"""
from pathlib import Path
from PIL import Image
import numpy as np, json, hashlib
R=Path(__file__).resolve().parents[1];B=R/'output/spear-of-adun-art/native-field-v09';D=R/'public/game-assets/graphics/ships/web_adun_ark'
source=B/'native-emission.png'; im=Image.open(source); assert im.format=='PNG' and im.size==(1024,2048)
im=im.convert('RGBA').resize((512,1024),Image.Resampling.LANCZOS)
art=json.loads((R/'src/engine/content/adun-ark-art.json').read_text());box=[196,720,316,1001];layers=[];coverage=None
for frame in art['frames']:
 d=next(d for d in frame if d['owner']=='AFT' and d['box'][1]<=box[1] and d['box'][3]>=box[3]);layers.append(d['file'])
 a=Image.open(D/d['file']).getchannel('A').crop((box[0]-d['box'][0],box[1]-d['box'][1],box[2]-d['box'][0],box[3]-d['box'][1]))
 if coverage is None:coverage=np.asarray(a)
 else:assert np.array_equal(coverage,np.asarray(a)), 'Selected field region must be static in every baked ring frame'
pixels=np.array(im.crop(box));pixels[:,:,3]=np.minimum(pixels[:,:,3],coverage)
name='native-field-v09.png';Image.fromarray(pixels).save(D/name,optimize=True)
meta={'version':9,'presentation':'hull-native-field','owner':'AFT','source':'output/spear-of-adun-art/native-field-v09/native-emission.png','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'file':name,'box':box,'size':[box[2]-box[0],box[3]-box[1]],'afterLayers':sorted(set(layers))}
(R/'src/engine/visual/ark-native-field-art.json').write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps({'textureBytes':(D/name).stat().st_size,'registeredFrames':len(layers),'depthLayers':len(meta['afterLayers']),'size':meta['size']}))
