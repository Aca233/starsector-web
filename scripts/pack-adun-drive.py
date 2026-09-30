"""Register physical drive-collar bakes and crop the authored six-frame plume atlas."""
from pathlib import Path
from PIL import Image
import numpy as np, json, hashlib
R=Path(__file__).resolve().parents[1]; B=R/'output/spear-of-adun-art/drive-v08'; D=R/'public/game-assets/graphics/ships/web_adun_ark'; D.mkdir(parents=True,exist_ok=True)
cal=json.loads((B/'calibration.json').read_text())
def cropped(im,name):
 a=np.array(im.getchannel('A'));ys,xs=np.where(a>1);box=(int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1));im.crop(box).save(D/name,optimize=True)
 return {'file':name,'box':[v/2 for v in box],'size':[(box[2]-box[0])/2,(box[3]-box[1])/2]}
body=cropped(Image.open(B/'collars.png').convert('RGBA'),'drive-collars-v08.png')
glow=Image.open(B/'apertures.png').convert('RGBA')
for i,p in enumerate(cal['ports']):
 isolated=Image.new('RGBA',glow.size);x0,x1=(0,512) if i==0 else (512,1024);isolated.paste(glow.crop((x0,0,x1,2048)),(x0,0));p['glow']=cropped(isolated,f'drive-aperture-{i}-v08.png')
meta={'version':8,'authoredWebDriveCollars':True,'body':body,'ports':cal['ports']}
(R/'src/engine/content/adun-ark-drive-art.json').write_text(json.dumps(meta,indent=2)+'\n')
source=R/'output/imagegen/adun-drive-v08/plume-sheet.png';im=Image.open(source);assert im.format=='PNG';rgb=im.convert('RGB');w,h=rgb.size;assert (w,h)==(1536,1024)
folder=R/'public/game-assets/graphics/fx/web_adun_ark_exhaust_v08';folder.mkdir(parents=True,exist_ok=True);frames=[];mouths=[]
for i in range(6):
 x,y=i%3*512,i//3*512;cell=rgb.crop((x,y,x+512,y+512));a=np.array(cell);hot=a[:150].min(2)>175;yy,xx=np.where(hot);root_y=int(yy.min());band=xx[yy<root_y+6];root_x=int(round((band.min()+band.max())/2));mouth=int(band.max()-band.min()+1);mouths.append(mouth/2)
 box=(root_x-128,root_y-24,root_x+128,root_y+424);assert min(box)>=0 and box[2]<=512 and box[3]<=512
 crop=np.maximum(np.array(cell.crop(box)).astype(np.int16)-3,0).astype(np.uint8);out=Image.fromarray(crop).resize((128,224),Image.Resampling.LANCZOS);name=f'plume-{i}.png';out.save(folder/name,optimize=True)
 frames.append({'file':name,'sourceCrop':list(box),'sourceThroat':[root_x,root_y],'sourceMouthWidth':mouth})
art={'version':8,'source':'output/imagegen/adun-drive-v08/plume-sheet.png','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceSize':[w,h],'width':128,'height':224,'throatWidth':float(np.mean(mouths)),'pivotX':.5,'pivotY':24/448,'fps':8,'blend':'ADDITIVE','frames':frames}
assert max(mouths)-min(mouths)<=3, mouths
(R/'src/engine/visual/ark-exhaust-art.json').write_text(json.dumps(art,indent=2)+'\n')
print(json.dumps({'body':body,'ports':cal['ports'],'mouthWidths':mouths,'plumeBytes':sum(p.stat().st_size for p in folder.glob('*.png'))}))
