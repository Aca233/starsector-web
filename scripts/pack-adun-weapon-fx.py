"""Pack generated RGBA frames without painting new contours or removing backgrounds.
Manual origin registration follows the bright aperture/contact, not each alpha centroid.
"""
from pathlib import Path
import hashlib, json, math
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'output/imagegen/adun-vfx-v17/atlas.png'
OUT=ROOT/'public/game-assets/graphics/fx/web_adun_ark/v17'
OUT.mkdir(parents=True, exist_ok=True)
im=Image.open(SRC)
assert im.format=='PNG' and im.mode=='RGBA', (im.format,im.mode)
assert im.size==(1254,1254), f'Re-register actual output: {im.size}'
a=im.getchannel('A'); assert a.getextrema()[0]==0 and a.getextrema()[1]>=240
# Pixel origins inspected on the actual 1254px image (never trust request size).
origins={
 'charge':[(156,164),(473,165),(786,167),(1099,177)],
 'muzzle':[(157,550),(473,545),(786,553),(1099,548)],
 'packet':[(157,670),(473,670),(786,670),(1099,670)],
 'impact':[(156,1086),(475,1089),(786,1091),(1068,1096)],
}
meta={'sourceSha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'sourceSize':list(im.size),'clips':{}}
for row,(key,points) in enumerate(origins.items()):
 crops=[]; bounds=[]
 for col,(x,y) in enumerate(points):
  cell=(round(col*im.width/4),round(row*im.height/4),round((col+1)*im.width/4),round((row+1)*im.height/4))
  crop=im.crop(cell); box=crop.getchannel('A').point(lambda v: 255 if v>4 else 0).getbbox(); assert box
  local=(x-cell[0],y-cell[1]); crops.append((crop,local))
  bounds.append((box[0]-local[0],box[1]-local[1],box[2]-local[0],box[3]-local[1]))
 box=[min(b[0] for b in bounds)-3,min(b[1] for b in bounds)-3,max(b[2] for b in bounds)+3,max(b[3] for b in bounds)+3]
 size=(box[2]-box[0],box[3]-box[1]); scale=min(1,240/max(size)); target=tuple(max(1,round(v*scale)) for v in size)
 frames=[]
 for index,(crop,local) in enumerate(crops):
  registered=Image.new('RGBA',size); registered.paste(crop,(-local[0]-box[0],-local[1]-box[1]))
  registered=registered.resize(target,Image.Resampling.LANCZOS)
  file=f'{key}-{index}.png'; registered.save(OUT/file,optimize=True)
  frames.append({'file':file,'width':target[0],'height':target[1],'pivotX':-box[0]/size[0],'pivotY':-box[1]/size[1]})
 meta['clips'][key]={'frames':frames}
(ROOT/'src/engine/visual/ark-weapon-fx-art.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
manifestPath=ROOT/'public/game-assets/asset-manifest.json'
manifest=json.loads(manifestPath.read_text(encoding='utf-8')); byId={e['id']:e for e in manifest}
for file in OUT.glob('*.png'):
 path=file.relative_to(ROOT/'public/game-assets').as_posix(); raw=file.read_bytes()
 byId[path]={'id':path,'path':path,'type':'image','bytes':len(raw),'hash':hashlib.sha256(raw).hexdigest(),'group':'graphics','sampler':{'wrap':'clamp','minFilter':'linear','magFilter':'linear','mipmap':False}}
manifestPath.write_text(json.dumps(list(byId.values()),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'source':im.size,'alpha':a.getextrema(),'frames':16,'pngBytes':sum(p.stat().st_size for p in OUT.glob('*.png')),'clips':{k:v['frames'][0] for k,v in meta['clips'].items()}}))

