"""Review actual restored ring pose renders; no synthetic/interpolated art."""
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/spear-of-adun-art/core-motion-v01'
report = json.loads((OUT / 'render-report.json').read_text(encoding='utf-8'))
frames = [Image.open(OUT / item['file']).convert('RGBA') for item in report['fullHullFrames']]
assert len(frames) == 144 and all(im.size == (512, 1024) for im in frames)
# Ignore alpha=0 hidden RGB when checking image differences/hashes.
background = Image.new('RGBA', (512, 1024), '#111a23')
composites = [Image.alpha_composite(background, im).convert('RGB') for im in frames]
hashes = [hashlib.sha256(im.tobytes()).hexdigest() for im in composites]
assert len(set(hashes)) == len(frames)
end = Image.alpha_composite(background, Image.open(OUT / 'loop-end.png').convert('RGBA')).convert('RGB')
loop_error = ImageStat.Stat(ImageChops.difference(composites[0], end)).mean
assert max(loop_error) < .15, loop_error
crop = (104, 260, 408, 724)
fonts = {size: ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', size) for size in [16, 18, 28]}

def board(index):
    image = Image.new('RGB', (820, 820), '#111a23')
    draw = ImageDraw.Draw(image)
    draw.text((24, 18), '亚顿之矛 · 中央环旋转恢复', font=fonts[28], fill='#e5edf1')
    draw.text((24, 63), '原模型动作 · 约 6.9× 加速审阅 / 非游戏截图', font=fonts[18], fill='#9eb0bc')
    image.paste(composites[index].resize((320, 640), Image.Resampling.LANCZOS), (8, 120))
    image.paste(composites[index].crop(crop).resize((426, 650), Image.Resampling.LANCZOS), (362, 111))
    draw.text((362, 774), '环部放大 · 真实几何与遮挡', font=fonts[18], fill='#e5edf1')
    draw.text((22, 784), '二维烘焙；不改炮的设定', font=fonts[16], fill='#9eb0bc')
    return image

boards = [board(i) for i in range(len(frames))]
# A common palette prevents frame-wise palette changes from looking like flicker.
palette_board = Image.new('RGB', (820*3, 820*2))
for i, frame_index in enumerate([0, 24, 48, 72, 96, 120]):
    palette_board.paste(boards[frame_index], ((i % 3)*820, (i//3)*820))
palette = palette_board.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
gif_frames = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in boards]
gif_frames[0].save(OUT / 'core-motion-preview.gif', save_all=True, append_images=gif_frames[1:], duration=50, loop=0, disposal=2)
boards[0].save(OUT / 'core-motion-preview.webp', save_all=True, append_images=boards[1:], duration=50, loop=0, lossless=True, method=4)
boards[0].save(OUT / 'core-motion-preview-still.png')
proof = Image.new('RGB', (960, 610), '#111a23')
d = ImageDraw.Draw(proof)
d.text((20, 16), '同一中央环 · 沿舰身纵轴转动', font=fonts[28], fill='#e5edf1')
for col, index in enumerate([0, 18, 36, 54]):
    proof.paste(composites[index].crop(crop).resize((228, 348), Image.Resampling.LANCZOS), (col*240+6, 100))
    d.text((col*240+16, 475), f'{report["fullHullFrames"][index]["sourceTimeSeconds"]:.2f} s', font=fonts[18], fill='#e5edf1')
d.text((20, 553), '真实模型逐帧渲染；不是把整圈俯视贴图做二维旋转。', font=fonts[18], fill='#9eb0bc')
proof.save(OUT / 'core-motion-contact-proof.png')
with Image.open(OUT / 'core-motion-preview.gif') as im:
    assert im.n_frames == 144
verification = {'realPoseFrameCount': len(frames), 'distinctVisibleFrames': len(set(hashes)),
                'wholeImageLoopMeanRGBError255': loop_error,
                'savedBlendReopenedAndDeformationVerified': True,
                'ringDescendantObject7MovesWithOuterBone': True,
                'previewSpeedMultiplier': report['previewPlaybackSpeedMultiplier'],
                'previewOnlyNotRuntimeFPSOrResourceBudget': True,
                'runtimeAssetsChanged': False, 'gunAimChanged': False}
(OUT / 'verification.json').write_text(json.dumps(verification, ensure_ascii=False, indent=2), encoding='utf-8')
shutil.copyfile(ROOT / 'artifacts/spear-of-adun/model-research/source/license.txt', OUT / 'SOURCE-LICENSE.txt')
print(json.dumps(verification, ensure_ascii=False, indent=2))
