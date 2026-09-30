"""Review offline Blender outputs; never edits game assets or paints ship geometry."""
from pathlib import Path
import hashlib
import json
import shutil
import struct
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/spear-of-adun-art/production-v01'
APPROVED = ROOT / 'output/spear-of-adun-art/material-study-v02/hull-material-study.png'
SIZE = (512, 1024)
FONT = 'C:/Windows/Fonts/msyh.ttc'
BG = '#101820'
FG = '#e3edf0'
MUTED = '#9bacb7'


def text(draw, xy, value, size=18, color=FG):
    draw.text(xy, value, fill=color, font=ImageFont.truetype(FONT, size))


def exr_channels(path):
    # Read the OpenEXR header only; no pixel decoder dependency or inferred passes.
    with path.open('rb') as f:
        assert struct.unpack('<I', f.read(4))[0] == 20000630
        f.read(4)
        def cstring():
            data = bytearray()
            while True:
                b = f.read(1)
                if not b:
                    raise ValueError('Truncated EXR header')
                if b == b'\0':
                    return data.decode('utf-8')
                data.extend(b)
        while True:
            name = cstring()
            if not name:
                raise ValueError('No channels in EXR header')
            kind = cstring()
            length = struct.unpack('<I', f.read(4))[0]
            data = f.read(length)
            assert len(data) == length
            if name == 'channels':
                assert kind == 'chlist'
                pos, channels = 0, []
                while data[pos] != 0:
                    end = data.index(0, pos)
                    channels.append(data[pos:end].decode('utf-8'))
                    pos = end + 1 + 16
                return channels


def silhouette_compare(a, b):
    av = a.getchannel('A').tobytes()
    bv = b.getchannel('A').tobytes()
    inter = sum(x > 16 and y > 16 for x, y in zip(av, bv))
    union = sum(x > 16 or y > 16 for x, y in zip(av, bv))
    diffs = [abs(x-y) for x, y in zip(av, bv)]
    return {'threshold': 16, 'iou': inter / union,
            'alphaIdentical': av == bv,
            'alphaAbsMean': sum(diffs) / len(diffs),
            'alphaAbsMax': max(diffs),
            'boundsA': a.getchannel('A').getbbox(),
            'boundsB': b.getchannel('A').getbbox()}


def file_info(path):
    return {'file': path.name, 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def paste_scaled(board, image, xy, scale):
    image = image.resize((round(image.width*scale), round(image.height*scale)), Image.Resampling.LANCZOS)
    board.paste(image, xy, image)


powered = Image.open(OUT / 'hull-powered.png')
unpowered = Image.open(OUT / 'hull-unpowered.png')
approved = Image.open(APPROVED).convert('RGBA')
assert powered.format == unpowered.format == 'PNG'
assert powered.mode == unpowered.mode == 'RGBA'
assert powered.size == unpowered.size == approved.size == SIZE
images = [powered, unpowered]
for image in images:
    bounds = image.getchannel('A').getbbox()
    assert bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < 512 and bounds[3] < 1024

parts = ['fixed-structure', 'core-mechanism', 'fore-rig-assembly']
masks = [Image.open(OUT / f'mask-{part}-0000.png') for part in parts]
assert all(m.size == SIZE and m.mode == 'L' for m in masks)
mask_info = {}
alpha_values = powered.getchannel('A').tobytes()
mask_values = [m.tobytes() for m in masks]
for name, mask in zip(parts, masks):
    assert mask.getbbox()
    mask_info[name] = {'bounds': mask.getbbox(), 'nonzeroPixels': sum(v > 0 for v in mask.tobytes())}
opaque = [i for i, a in enumerate(alpha_values) if a >= 250]
covered = sum(any(values[i] > 16 for values in mask_values) for i in opaque)
coverage = covered / len(opaque)
assert coverage > .995, f'Matte coverage too low: {coverage}'

comp_approved = silhouette_compare(approved, powered)
comp_states = silhouette_compare(powered, unpowered)
assert comp_approved['iou'] > .995 and comp_states['iou'] > .995
assert ImageChops.difference(powered.convert('RGB'), unpowered.convert('RGB')).getbbox()
channels = exr_channels(OUT / 'art-layers.exr')
passes = sorted(set(c.rsplit('.', 1)[0] for c in channels))
assert all('ViewLayer.' + name in passes for name in ['Combined', 'Emit', 'Normal', 'Depth', 'DiffCol', 'IndexOB'])

webps = []
for image, stem in zip(images, ['hull-powered', 'hull-unpowered']):
    path = OUT / (stem + '.webp')
    image.save(path, format='WEBP', lossless=True, method=6, exact=True)
    decoded = Image.open(path).convert('RGBA')
    assert image.tobytes() == decoded.tobytes(), 'WebP must preserve all RGBA bytes'
    webps.append({**file_info(path), 'decodedRgbaExact': True})

# Full-resolution state proof on a neutral backdrop, not a fabricated in-game screenshot.
board = Image.new('RGB', (1120, 1260), BG)
draw = ImageDraw.Draw(board)
text(draw, (32, 22), '亚顿之矛 / 二维素材状态检查', 30)
text(draw, (32, 68), '真实模型正交烘焙 · 已认可的 v02 材质方向 · P6 候选，尚未实装', 19, MUTED)
text(draw, (32, 108), '01  正常自发光', 22)
text(draw, (576, 108), '02  关闭材质自发光', 22)
paste_scaled(board, powered, (32, 150), 1)
paste_scaled(board, unpowered, (576, 150), 1)
text(draw, (32, 1182), '两张均为 512 × 1024 原尺寸；关闭自发光后，蓝色基色仍保留。', 18, MUTED)
text(draw, (32, 1214), '未添加光束、外围光晕或假炮塔；不等于技能 / 损毁状态已经完成。', 18, MUTED)
board.save(OUT / 'state-review.png')

# Pixel sizes remain literal in this file; a chat preview may rescale the board.
board = Image.new('RGB', (1120, 1230), BG)
draw = ImageDraw.Draw(board)
text(draw, (28, 22), '实际像素尺寸 / 缩放可读性', 30)
text(draw, (28, 67), '请按图片原始尺寸查看；聊天窗口可能自动缩放，非游戏截图。', 19, MUTED)
for x, scale in [(16, 1.0), (548, .65), (918, .35)]:
    text(draw, (x + 8, 113), f'{scale:.0%} / {round(512*scale)}×{round(1024*scale)}', 18)
    paste_scaled(board, powered, (x, 152), scale)
text(draw, (28, 1190), '小尺寸以剪影和装甲分区为主；前部细机构不能按这些像素直接推定独立炮位。', 17, MUTED)
board.save(OUT / 'scale-review.png')

board = Image.new('RGB', (960, 810), BG)
draw = ImageDraw.Draw(board)
text(draw, (24, 20), '部件归属 / 仅可见区域蒙版', 28)
text(draw, (24, 64), '颜色只是检查标记，不是舰体涂装；没有补全被遮挡的后表面。', 18, MUTED)
labels = ['固定结构', '核心机构（4 个源网格）', '前部机构（1 个源网格）']
colors = [(115, 165, 217), (81, 220, 182), (238, 173, 91)]
for index, (mask, label, color) in enumerate(zip(masks, labels, colors)):
    x = 22 + index * 312
    text(draw, (x, 108), label, 18, color)
    tint = Image.new('RGBA', SIZE, color + (255,))
    annotation = Image.composite(tint, powered, mask.point(lambda v: round(v*.65)))
    annotation.putalpha(powered.getchannel('A'))
    paste_scaled(board, annotation, (x, 160), .56)
text(draw, (24, 748), '核心原动画沿舰体纵轴转动，不能把俯视贴图当作平面炮塔旋转。', 18, MUTED)
text(draw, (24, 777), '前部控制骨存在 ≠ 原作武器数量、射界与换装方式已经核实。', 18, MUTED)
board.save(OUT / 'parts-review.png')

license_path = ROOT / 'artifacts/spear-of-adun/model-research/source/license.txt'
shutil.copyfile(license_path, OUT / 'SOURCE-LICENSE.txt')
shutil.copyfile(ROOT / 'scripts/prepare-spear-of-adun-art-layers.py', OUT / 'reproduce.py')
shutil.copyfile(Path(__file__), OUT / 'review.py')
verification = {
    'stage': 'P6 offline candidate; no runtime integration',
    'materialDirectionApproved': 'v02 accepted by user; not approval of these new outputs',
    'resolution': SIZE,
    'approvedVsPoweredSilhouette': comp_approved,
    'poweredVsUnpoweredSilhouette': comp_states,
    'statesDifferInRGB': True,
    'matteOpaqueCoverage': coverage,
    'mattes': mask_info,
    'mattesAreVisibleSelectionsOnly': True,
    'matteEdgesAreNotVerifiedForSeamlessRecomposition': True,
    'actualExrChannels': channels,
    'actualExrPasses': passes,
    'pngs': [file_info(OUT / name) for name in ['hull-powered.png', 'hull-unpowered.png']],
    'losslessWebps': webps,
    'hypotheticalRuntimeBudget': {
        'oneRgba8TextureBytesNoMipmaps': 512*1024*4,
        'twoRgba8TexturesBytesNoMipmaps': 512*1024*4*2,
        'note': 'Static textures only; excludes future animation/effects. Source blend/exr/masks/review sheets are offline art, not runtime payload.'
    },
    'gameIntegrated': False,
    'runtimeAnimationProduced': False,
    'finalArtApproved': False
}
(OUT / 'verification.json').write_text(json.dumps(verification, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: verification[k] for k in ['resolution', 'approvedVsPoweredSilhouette', 'poweredVsUnpoweredSilhouette', 'matteOpaqueCoverage', 'actualExrPasses', 'losslessWebps']}, ensure_ascii=False, indent=2))
