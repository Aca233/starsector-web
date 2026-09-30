"""Register actual emissive bakes to the existing depth sprites; no new contours.
Crop and sample at the registered logical positions, with emission sampled at 0.375 texels/world-unit; owner alpha is a hard ceiling on the source grid before downsampling.
"""
from pathlib import Path
from PIL import Image
import numpy as np,json,hashlib
R=Path(__file__).resolve().parents[1];B=R/'output/spear-of-adun-art/system-emission-v18';D=R/'public/game-assets/graphics/ships/web_adun_ark';OUT=D/'emission-v18';OUT.mkdir(exist_ok=True)
assert (B/'complete.json').exists()
art=json.loads((R/'src/engine/content/adun-ark-art.json').read_text());motion=json.loads((R/'src/engine/visual/ark-lance-motion-art.json').read_text());T=art['textureScale'];size=(round(512*T),round(1024*T));entries={};images={};used=set();rgba=0

def pack(draw,source):
 global rgba
 if draw['file'] in entries:return
 if source not in images:images[source]=Image.open(B/source).convert('RGBA').resize(size,Image.Resampling.LANCZOS)
 body=Image.open(D/draw['file']).convert('RGBA');box=tuple(round(x*T) for x in draw['box']);pix=np.array(images[source].crop(box));mask=np.asarray(body.getchannel('A'))
 assert pix.shape[:2]==mask.shape,(draw['file'],pix.shape,mask.shape)
 pix[:,:,3]=np.minimum(pix[:,:,3],mask);pix[:,:,3][np.max(pix[:,:,:3],axis=2)<=3]=0
 glow=Image.fromarray(pix);trim=glow.getchannel('A').getbbox()
 if not trim:entries[draw['file']]=None;return
 glow=glow.crop(trim);logical_size=[glow.width/T,glow.height/T];glow=glow.resize((max(1,round(glow.width/2)),max(1,round(glow.height/2))),Image.Resampling.LANCZOS);key=hashlib.sha256(glow.tobytes()+str(glow.size).encode()).hexdigest()[:20];file=f'emission-v18/{key}.png'
 if file not in used:glow.save(D/file,optimize=True);used.add(file);rgba+=glow.width*glow.height*4
 entries[draw['file']]={'file':file,'box':[(box[0]+trim[0])/T,(box[1]+trim[1])/T],'size':logical_size}
 assert not np.any((pix[:,:,3]>0)&(mask==0))
for i,frame in enumerate(art['frames']):
 for draw in frame:pack(draw,f'core-{i:02d}.png' if draw['owner']=='CORE' else draw['owner']+'.png')
for i,draw in enumerate(motion['frames']):pack(draw,f'fore-{i:02d}.png')
meta={'version':18,'source':'system-emission-v18','textureScale':T/2,'layers':entries}
(R/'src/engine/visual/ark-system-emission-art.json').write_text(json.dumps(meta,separators=(',',':'))+'\n')
# Each row's actual top-boundary landmark, measured on generated output rather than ideal grid.
S=R/'output/imagegen/adun-field-v18/atlas.png';im=Image.open(S);assert im.format=='PNG' and im.mode=='RGBA' and im.size==(1254,1254);assert im.getchannel('A').getextrema()[0]==0
F=R/'public/game-assets/graphics/fx/web_adun_ark/field-v18';F.mkdir(parents=True,exist_ok=True)
for i,y in enumerate([192,446,700,954]):im.crop((170,y-64,1084,y+134)).resize((768,124),Image.Resampling.LANCZOS).save(F/f'membrane-{i}.png',optimize=True)
manifestPath=R/'public/game-assets/asset-manifest.json';manifest=json.loads(manifestPath.read_text());byId={v['id']:v for v in manifest}
for f in [*(D/file for file in used),*F.glob('*.png')]:
 path=f.relative_to(R/'public/game-assets').as_posix();raw=f.read_bytes();byId[path]={'id':path,'path':path,'type':'image','bytes':len(raw),'hash':hashlib.sha256(raw).hexdigest(),'group':'graphics','sampler':{'wrap':'clamp','minFilter':'linear','magFilter':'linear','mipmap':False}}
manifestPath.write_text(json.dumps(list(byId.values()),ensure_ascii=False,indent=2)+'\n')
report={'registeredLayers':len(entries),'emissionTextures':len(used),'emissionPngBytes':sum((D/f).stat().st_size for f in used),'emissionRGBABytes':rgba,'shieldPNGBytes':sum(f.stat().st_size for f in F.glob('*.png')),'sourceGridAlphaOutsideOwner':0,'sourceShieldSha256':hashlib.sha256(S.read_bytes()).hexdigest(),'sourceShieldSize':im.size,'sourceShieldAlpha':im.getchannel('A').getextrema()};(B/'pack-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
