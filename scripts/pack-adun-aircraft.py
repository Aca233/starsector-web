"""Pack the one generated strike craft; retain real alpha, never paint exhaust/weapons.
All sockets are recorded in source pixels before conversion to runtime coordinates.
"""
from pathlib import Path
import json
from PIL import Image
root=Path(__file__).resolve().parents[1]
src=root/'output/imagegen/ark-striker-v20/striker-source.png'
im=Image.open(src)
assert im.format=='PNG'
im=im.convert('RGBA')
assert im.getchannel('A').getextrema()==(0,255)
# Remove only near-transparent background residue; preserve authored antialiased edges.
a=im.getchannel('A').point(lambda v: 0 if v<8 else v);im.putalpha(a)
bbox=a.getbbox();crop=im.crop(bbox)
size=(256,224);scale=min(248/crop.width,216/crop.height)
wh=(round(crop.width*scale),round(crop.height*scale));offset=((size[0]-wh[0])//2,(size[1]-wh[1])//2)
packed=Image.new('RGBA',size);packed.alpha_composite(crop.resize(wh,Image.Resampling.LANCZOS),offset)
path=root/'public/game-assets/graphics/ships/web_adun_ark/striker-v20.png';packed.save(path,optimize=True)
def port(x,y):return [round(offset[0]+(x-bbox[0])*wh[0]/crop.width,4),round(offset[1]+(y-bbox[1])*wh[1]/crop.height,4)]
art={
 'interceptor':{'file':'interceptor.png','width':160,'height':150,'worldWidth':92,'worldHeight':86,'pivot':[80,49*150/86], 'emitters':[[40,24],[120,24]],'engines':[[53,123,3.5,32],[80,130,6,54],[107,123,3.5,32]]},
 'striker':{'file':path.name,'width':256,'height':224,'worldWidth':108,'worldHeight':94.5,'pivot':[128,120], 'emitters':[port(475,87),port(778,87)],'engines':[port(442,1047)+[9,60],port(812,1047)+[9,60]]},
}
(root/'src/engine/content/adun-ark-aircraft-art.json').write_text(json.dumps(art,indent=2)+'\n')
report={'source':str(src.relative_to(root)),'actualSourceSize':im.size,'alphaRange':im.getchannel('A').getextrema(),'crop':bbox,'packedSize':packed.size,'art':art}
(root/'output/imagegen/ark-striker-v20/packing.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
