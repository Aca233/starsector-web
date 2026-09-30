"""Cut the local-provider v19 atlas into registered flowing materials and UI icons.
No generated shapes, color-keying, placeholder textures, or external provider calls.
"""
from pathlib import Path
from PIL import Image
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/imagegen/adun-systems-v19/atlas.png'
TARGET = ROOT / 'public/game-assets/graphics/fx/web_adun_ark/systems-v19'
image = Image.open(SOURCE)
assert image.format == 'PNG' and image.mode == 'RGBA'
assert image.getchannel('A').getextrema()[0] == 0
width, height = image.size
TARGET.mkdir(exist_ok=True, parents=True)
for row, name in enumerate(['forge', 'barrier', 'repair']):
    for col in range(4):
        box = (round((col + .29) * width / 4), round((row + .09) * height / 4),
               round((col + .71) * width / 4), round((row + .90) * height / 4))
        image.crop(box).resize((128, 256), Image.Resampling.LANCZOS).save(
            TARGET / f'{name}-{col}.png', optimize=True)
for col, name in enumerate(['reactor', 'coupler', 'matrix', 'hangar']):
    box = (round(col * width / 4), round(height * .740), round((col + 1) * width / 4), height)
    image.crop(box).resize((256, 256), Image.Resampling.LANCZOS).save(TARGET / f'{name}.png', optimize=True)
manifest_path = ROOT / 'public/game-assets/asset-manifest.json'
manifest = {entry['id']: entry for entry in json.loads(manifest_path.read_text())}
records = []
for path in sorted(TARGET.glob('*.png')):
    key = path.relative_to(ROOT / 'public/game-assets').as_posix()
    raw = path.read_bytes()
    manifest[key] = {'id': key, 'path': key, 'type': 'image', 'bytes': len(raw),
                     'hash': hashlib.sha256(raw).hexdigest(), 'group': 'graphics',
                     'sampler': {'wrap': 'clamp', 'minFilter': 'linear', 'magFilter': 'linear', 'mipmap': False}}
    with Image.open(path) as tile:
        assert tile.format == 'PNG' and tile.mode == 'RGBA'
        records.append({'path': key, 'size': tile.size, 'alpha': tile.getchannel('A').getextrema(),
                        'bytes': len(raw), 'sha256': manifest[key]['hash']})
manifest_path.write_text(json.dumps(list(manifest.values()), ensure_ascii=False, indent=2) + '\n')
report = {'sourceSize': image.size, 'sourceAlpha': image.getchannel('A').getextrema(),
          'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
          'runtimePngBytes': sum(record['bytes'] for record in records), 'textures': records}
(ROOT / 'artifacts/adun-v19-assets.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: value for key, value in report.items() if key != 'textures'}))
