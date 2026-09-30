from pathlib import Path
import json,time
from PIL import Image
R=Path.cwd();O=R/'output/spear-of-adun-art/ark-weapons-v06';P=R/'public/game-assets/graphics/ships/web_adun_ark';P.mkdir(parents=True,exist_ok=True)
while not (O/'calibration.json').exists():time.sleep(3)
rows=json.loads((O/'calibration.json').read_text());out={}
for tag,row in rows.items():
 out[tag]={}
 for kind in ['head','seat']:
  im=Image.open(O/(tag+'-'+kind+'.png')).convert('RGBA');box=im.getchannel('A').getbbox();assert box
  name=tag+'-'+kind+'.png';im.crop(box).save(P/name);w,h=box[2]-box[0],box[3]-box[1];x,y=row['anchor'];out[tag][kind]={'file':name,'width':w,'height':h,'pivotX':(x*2-box[0])/w,'pivotY':(y*2-box[1])/h,'offsets':sum(([round((y-my)*2,4),round((mx-x)*2,4)] for mx,my in row['muzzles']),[])}
(R/'src/engine/content/adun-ark-weapons-art.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out),flush=True)
