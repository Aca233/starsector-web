"""Extract a generated atlas; preserve painted contours, register nozzle pivots, remove black matte floor."""
from pathlib import Path
import hashlib, json
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'output/imagegen/adun-exhaust-v07/plume-sheet.png'
out = ROOT / 'public/game-assets/graphics/fx/web_adun_ark_exhaust_v07'
out.mkdir(parents=True, exist_ok=True)
im = Image.open(source)
assert im.format == 'PNG'
rgb = im.convert('RGB')
w, h = rgb.size
assert w % 3 == 0 and h % 2 == 0
frames = []
for i in range(6):
    x, y = i % 3 * (w//3), i//3 * (h//2)
    cell = rgb.crop((x, y, x+w//3, y+h//2))
    pixels = np.asarray(cell)
    hot = pixels[:int(cell.height*.22)].min(axis=2) > 215
    yy, xx = np.where(hot)
    assert len(xx) > 0, 'No painted throat found'
    throat_y = int(yy.min())
    throat_x = int(round(xx[yy < throat_y+12].mean()))
    box = (throat_x-120, throat_y-28, throat_x+120, throat_y+452)
    assert box[0] >= 0 and box[1] >= 0 and box[2] <= cell.width and box[3] <= cell.height
    cropped = np.asarray(cell.crop(box)).astype(np.int16)
    # Atlas is authored on black for additive rendering; suppress 1–3/255 matte noise.
    cropped = np.maximum(cropped-3, 0).astype(np.uint8)
    frame = Image.fromarray(cropped).resize((128,256), Image.Resampling.LANCZOS)
    name = f'plume-{i}.png'
    frame.save(out/name, optimize=True)
    frames.append({'file':name, 'sourceCell':[x,y,w//3,h//2], 'sourceCrop':list(box), 'sourceThroat':[throat_x,throat_y]})
meta = {'version':7, 'source':'output/imagegen/adun-exhaust-v07/plume-sheet.png', 'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'sourceSize':[w,h], 'width':128, 'height':256, 'pivotX':.5, 'pivotY':28/480, 'fps':10, 'blend':'ADDITIVE', 'frames':frames}
(ROOT/'src/engine/visual/ark-exhaust-art.json').write_text(json.dumps(meta,indent=2)+'\n', encoding='utf8')
print(json.dumps({'format':im.format,'actualSize':[w,h],'frames':6,'runtimeSize':[128,256],'bytes':sum((out/f['file']).stat().st_size for f in frames)}))
