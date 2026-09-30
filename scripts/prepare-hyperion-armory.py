"""Deterministic atlas packing only: no repainting, regeneration or hull edits."""
from PIL import Image
from pathlib import Path
import hashlib, json, math
root=Path(__file__).resolve().parents[1]
src=root/'output/imagegen/hyperion-armory-v01/turret-atlas.png'
im=Image.open(src).convert('RGBA')
assert im.size==(1536,1024), 'Recheck atlas geometry for different source dimensions'
out=root/'public/game-assets/graphics/weapons/web_sc2_hyperion'
out.mkdir(parents=True,exist_ok=True)
# Source pivots are the centers of the rotating receiver bearings, not image centers.
regions={
 'battery':((0,0,572,1024),(283,716),.105,[(220,61),(345,61)]),
 'suppressor':((580,0,1105,1024),(837,748),.083,[(774,244),(898,244)]),
 'interceptor':((1120,0,1536,1024),(1352,761),.075,[(1353,446)]),
}
meta={}
for kind,(region,pivot,scale,muzzles) in regions.items():
 area=im.crop(region)
 b=area.getchannel('A').point(lambda a:255 if a>=200 else 0).getbbox()
 assert b
 box=(region[0]+max(0,b[0]-8),max(0,b[1]-8),region[0]+min(area.width,b[2]+8),min(area.height,b[3]+8))
 cut=im.crop(box); w,h=round(cut.width*scale),round(cut.height*scale)
 sx,sy=w/cut.width,h/cut.height
 px,py=round((pivot[0]-box[0])*sx),round((pivot[1]-box[1])*sy)
 cw=2*math.ceil(max(px,w-px)+2);ch=2*math.ceil(max(py,h-py)+2)
 image=Image.new('RGBA',(cw,ch));image.alpha_composite(cut.resize((w,h),Image.Resampling.LANCZOS),(cw//2-px,ch//2-py))
 image.save(out/f'{kind}.png')
 # An emissive mask selected from the existing painted colored pixels (no invented geometry).
 glow=Image.new('RGBA',image.size)
 for y in range(ch):
  for x in range(cw):
   r,g,b,a=image.getpixel((x,y))
   colored=(r>115 and r>g*1.24 and g>b*1.1) if kind=='battery' else (b>115 and b>r*1.3 and g>r*1.12)
   if colored:glow.putpixel((x,y),(r,g,b,a))
 glow.save(out/f'{kind}-glow.png')
 offsets=[]
 for mx,my in muzzles:offsets.extend([round((pivot[1]-my)*sy,3),round((mx-pivot[0])*sx,3)])
 meta[kind]={'sourceBox':box,'sourcePivot':pivot,'scale':scale,'width':cw,'height':ch,'offsets':offsets}
(root/'src/engine/content/hyperion-armory-art.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf8')
manifestPath=root/'public/game-assets/asset-manifest.json';manifest=json.loads(manifestPath.read_text(encoding='utf8'))
for file in sorted(out.glob('*.png')):
 relative=file.relative_to(root/'public/game-assets').as_posix();data=file.read_bytes()
 entry={'id':relative,'path':relative,'type':'image','bytes':len(data),'hash':hashlib.sha256(data).hexdigest(),'group':'graphics','sampler':{'wrap':'clamp','minFilter':'linear','magFilter':'linear','mipmap':False}}
 index=next((i for i,e in enumerate(manifest) if e['id']==relative),None)
 if index is None:manifest.append(entry)
 else:manifest[index]=entry
manifestPath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'actualSize':im.size,'cornersAlpha':[im.getpixel(p)[3] for p in [(0,0),(1535,0),(0,1023),(1535,1023)]],'atlasSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'turrets':meta},ensure_ascii=False))
