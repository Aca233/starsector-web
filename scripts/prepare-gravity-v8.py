"""Export the native-style generated master and measure its actual alpha outline.
No painting, recoloring, background replacement or synthetic hull geometry.
"""
from pathlib import Path
from PIL import Image
import json, hashlib, shutil, math

root=Path(__file__).resolve().parents[1]
archive=root/'output/imagegen/gravity-battleship-v8'
archive.mkdir(parents=True,exist_ok=True)
master=archive/'gravity-native-v8.png'
if not master.exists():
    shutil.copyfile(Path('C:/Users/Aca/.codex/generated_images/01a0f05f-77d0-77f1-92ca-a83ca789af32/exec-6057cf48-d2ac-449b-adf9-2cb9c1fdfde0.png'),master)
im=Image.open(master).convert('RGBA')
w,h=im.size
alpha=im.getchannel('A')
mask=alpha.point(lambda a:255 if a>=128 else 0).tobytes()
edges={}
def put(a,b): edges.setdefault(a,[]).append(b)
for y in range(h):
    for x in range(w):
        if not mask[y*w+x]:continue
        if y==0 or not mask[(y-1)*w+x]:put((x,y),(x+1,y))
        if x==w-1 or not mask[y*w+x+1]:put((x+1,y),(x+1,y+1))
        if y==h-1 or not mask[(y+1)*w+x]:put((x+1,y+1),(x,y+1))
        if x==0 or not mask[y*w+x-1]:put((x,y+1),(x,y))
loops=[]
while edges:
    start=next(iter(edges));point=start;loop=[]
    while point in edges:
        loop.append(point);next_point=edges[point].pop()
        if not edges[point]:del edges[point]
        point=next_point
        if point==start:break
    if point==start and len(loop)>3:loops.append(loop)
def area(p):return abs(sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p))))
outline=max(loops,key=area)
def simplify(points,tolerance=2):
    a,b=points[0],points[-1];dx,dy=b[0]-a[0],b[1]-a[1];den=dx*dx+dy*dy
    distances=[]
    for p in points[1:-1]:
        q=0 if den==0 else max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den))
        distances.append(math.hypot(p[0]-a[0]-q*dx,p[1]-a[1]-q*dy))
    if not distances or max(distances)<=tolerance:return [a,b]
    split=distances.index(max(distances))+1
    return simplify(points[:split+1],tolerance)[:-1]+simplify(points[split:],tolerance)
half=len(outline)//2
outline=simplify(outline[:half+1])[:-1]+simplify(outline[half:]+[outline[0]])[:-1]
scale=.38;pivot=[447,880]
local=lambda p:[round((pivot[1]-p[1])*scale,4),round((p[0]-pivot[0])*scale,4)]
bounds=[local(p) for p in outline]
dest=root/'public/game-assets/graphics/gravity';dest.mkdir(parents=True,exist_ok=True)
shutil.copyfile(master,dest/'hull-v8.png')
# Inventory portrait of the exact fixed core, never drawn again over the hull.
im.crop((285,735,612,1062)).save(dest/'field-core-v8.png')
art={'source':str(master.relative_to(root)).replace('\\','/'),'sourceSize':[w,h],'sourcePivot':pivot,'scale':scale,
     'spriteWidth':w*scale,'spriteHeight':h*scale,'pivotX':pivot[0]*scale,'pivotY':pivot[1]*scale,
     'bounds':bounds,'collisionRadius':math.ceil(max(math.hypot(x,y) for x,y in bounds)),
     'outlineAlphaThreshold':128,'outlineTolerancePx':2,
     'slots':{'TRACTOR':[447,880],'M1':[331,327],'M2':[560,327],'M3':[251,1125],'M4':[641,1125],
              'S1':[292,515],'S2':[602,515],'S3':[172,655],'S4':[155,906],'S5':[720,655],'S6':[739,906]},
     'drives':[[235,1590],[667,1590]]}
(root/'src/engine/content/gravity-battle-art.json').write_text(json.dumps(art,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
manifest_path=root/'public/game-assets/asset-manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
paths=['graphics/gravity/hull-v8.png','graphics/gravity/field-core-v8.png']
manifest=[a for a in manifest if a['path'] not in paths]
for path in paths:
    data=(root/'public/game-assets'/path).read_bytes()
    manifest.append({'id':path,'path':path,'type':'image','bytes':len(data),'hash':hashlib.sha256(data).hexdigest(),'group':'graphics',
                     'sampler':{'wrap':'clamp','minFilter':'linear','magFilter':'linear','mipmap':False}})
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'size':im.size,'alphaExtrema':alpha.getextrema(),'vertices':len(bounds),'collisionRadius':art['collisionRadius']}))
