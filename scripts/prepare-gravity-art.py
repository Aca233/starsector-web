"""Export approved/generated art without redrawing. Native imagegen supplies alpha.
All coordinates refer to the archived originals; world forward is sprite-up.
"""
from pathlib import Path
from PIL import Image
import json, hashlib, shutil

root = Path(__file__).resolve().parents[1]
generated = Path('C:/Users/Aca/.codex/generated_images/01a0f05f-77d0-77f1-92ca-a83ca789af32')
archive = root / 'output/imagegen/gravity-armory-v6'
archive.mkdir(parents=True, exist_ok=True)
atlas_name = 'exec-56e9a3cf-95cd-44a2-9376-3c46001c3e8c.png'
alpha_name = 'exec-6b368314-d82b-4839-bac4-a6520828eb2c.png'
shutil.copyfile(generated / atlas_name, archive / 'armory-native.png')
shutil.copyfile(generated / alpha_name, archive / 'hull-alpha-native.png')
atlas = Image.open(archive / 'armory-native.png').convert('RGBA')
dest = root / 'public/game-assets/graphics/gravity'
dest.mkdir(parents=True, exist_ok=True)
art = {}
rows = [
    ('tractor', (220, 0, 680, 568), (448, 322), (384, 12), .075),
    ('calibrator', (990, 0, 1340, 565), (1160, 395), (1160, 39), .055),
    ('deflector', (270, 595, 645, 1010), (448, 837), (396, 637), .045),
    ('pdc', (990, 580, 1340, 1010), (1160, 847), (1128, 609), .045),
]
for kind, box, pivot, muzzle, scale in rows:
    region = atlas.crop(box)
    # Crop by actual alpha, not the RGB matte that viewers sometimes display.
    bbox = region.getchannel('A').point(lambda a: 255 if a >= 8 else 0).getbbox()
    crop = region.crop(bbox)
    crop.save(dest / (kind + '.png'))
    ox, oy = box[0] + bbox[0], box[1] + bbox[1]
    art[kind] = dict(spriteWidth=round(crop.width*scale,3), spriteHeight=round(crop.height*scale,3),
        spritePivotX=(pivot[0]-ox)/crop.width, spritePivotY=(pivot[1]-oy)/crop.height,
        turretSpriteUrl='/game-assets/graphics/gravity/'+kind+'.png',
        hardpointSpriteUrl='/game-assets/graphics/gravity/'+kind+'.png',
        turretOffsets=[round((pivot[1]-muzzle[1])*scale,3),round((muzzle[0]-pivot[0])*scale,3)],
        sourceBox=[ox,oy,ox+crop.width,oy+crop.height], sourcePivot=list(pivot), sourceMuzzle=list(muzzle), scale=scale)

# Preserve the approved hull RGB exactly; the native extraction supplies only alpha.
hull = Image.open(root / 'output/imagegen/gravity-B-field-drive-v2/gravity-B-field-drive-v2.png').convert('RGBA')
alpha = Image.open(archive / 'hull-alpha-native.png').getchannel('A')
assert hull.size == alpha.size == (1024,1536)
hull.putalpha(alpha)
hull.save(dest / 'hull.png')
(root / 'src/engine/content/gravity-art.json').write_text(json.dumps(art,ensure_ascii=False,indent=2)+'\n', encoding='utf8')
manifest_path = root / 'public/game-assets/asset-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf8'))
paths = {'graphics/gravity/'+p.name for p in dest.glob('*.png')}
manifest = [r for r in manifest if r['path'] not in paths]
for path in sorted(paths):
    data = (root/'public/game-assets'/path).read_bytes()
    manifest.append(dict(id=path,path=path,type='image',bytes=len(data),hash=hashlib.sha256(data).hexdigest(),group='graphics',
        sampler=dict(wrap='clamp',minFilter='linear',magFilter='linear',mipmap=False)))
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n', encoding='utf8')
print(json.dumps({'atlasSize':atlas.size,'hullSize':hull.size,'art':art},ensure_ascii=False))
