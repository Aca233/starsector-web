"""Pack user-approved, chroma-keyed Zhu Yuan art without redrawing it.
Usage: python scripts/prepare-zhuyuan-assets.py --hull <transparent.png> --weapon <transparent.png> --icon <original.png>
The separate imagegen chroma-key helper produces the two transparent inputs.
Only this pack's four runtime files and manifest entries are updated.
"""
from pathlib import Path
import argparse
import hashlib
import json
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
for key in ('hull', 'weapon', 'icon'):
    parser.add_argument('--' + key, required=True, type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
assets = root / 'public/game-assets'
hull = Image.open(args.hull).convert('RGBA')
weapon = Image.open(args.weapon).convert('RGBA')
icon = Image.open(args.icon).convert('RGBA')
for name, image in [('hull', hull), ('weapon', weapon)]:
    if image.getchannel('A').getextrema() != (0, 255):
        raise SystemExit(name + ': expected a keyed image with both opaque and transparent pixels')
# World-space hull dimensions remain 256x384; retain 2x texture density.
ship = hull.resize((512, 768), Image.Resampling.LANCZOS)
# Web turret sprites rotate around their image center. The source pedestal's
# pivot is (627,762) in the 1254px artwork, not the whole artwork's center.
turret = Image.new('RGBA', (64, 64))
small = weapon.resize((50, 50), Image.Resampling.LANCZOS)
turret.alpha_composite(small, (7, 2))
glow = Image.new('RGBA', turret.size)
glow.putdata([(r, g, b, a if g > r + 30 and b > r + 25 and min(g, b) > 100 else 0)
              for r, g, b, a in turret.getdata()])
images = {
    'graphics/ships/web_zhuyuan/zhuyuan.png': ship,
    'graphics/weapons/web_zhuyuan/star_needle_turret.png': turret,
    'graphics/weapons/web_zhuyuan/star_needle_glow.png': glow,
    'graphics/icons/hullsys/web_zhuyuan_eclipse.png': icon.resize((256, 256), Image.Resampling.LANCZOS),
}
for relative, image in images.items():
    path = assets / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)
    print(relative, image.size, path.stat().st_size, 'bytes')
manifest_path = assets / 'asset-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
for relative in images:
    data = (assets / relative).read_bytes()
    entry = {'id': relative, 'path': relative, 'type': 'image', 'bytes': len(data),
             'hash': hashlib.sha256(data).hexdigest(), 'group': 'graphics',
             'sampler': {'wrap': 'clamp', 'minFilter': 'linear', 'magFilter': 'linear', 'mipmap': False}}
    existing = next((i for i, row in enumerate(manifest) if row['path'] == relative), None)
    if existing is None:
        if any(row['id'] == relative for row in manifest):
            raise SystemExit('Manifest ID collision: ' + relative)
        manifest.append(entry)
    else:
        manifest[existing] = entry
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
# Appearance QA is a local composite, not newly generated art.
preview = Image.new('RGBA', (800, 800), '#07131f')
preview.alpha_composite(ship, (0, 16))
preview.alpha_composite(turret.resize((256, 256), Image.Resampling.NEAREST), (524, 44))
preview.alpha_composite(images['graphics/icons/hullsys/web_zhuyuan_eclipse.png'], (524, 404))
qa = root / 'artifacts/zhuyuan'
qa.mkdir(parents=True, exist_ok=True)
preview.convert('RGB').save(qa / 'art-preview.png')
