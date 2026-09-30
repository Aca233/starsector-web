"""Package actual Blender pose renders as a small local atlas and an honest preview."""
import hashlib
import json
import math
import shutil
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageFont,ImageStat

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/spear-of-adun-art/fore-deployment-v01'
report=json.loads((OUT/'patch-render-report.json').read_text(encoding='utf-8'))
rect=tuple(report['rect']);w=rect[2]-rect[0];h=rect[3]-rect[1]
frames=[Image.open(OUT/item['file']).convert('RGBA') for item in report['frames']]
assert len(frames)==46 and all(im.size==(w,h) for im in frames)
hashes=[hashlib.sha256(im.tobytes()).hexdigest() for im in frames]
assert len(set(hashes))>=35, 'Sequence must contain real changing poses, not repeated stills'
change=ImageStat.Stat(ImageChops.difference(frames[0],frames[21])).mean
assert sum(change[:3])>1, change
loop=ImageStat.Stat(ImageChops.difference(frames[0],frames[-1])).mean
assert max(loop)<.2,loop
reference=Image.open(OUT/'frame-00.png').convert('RGBA')
base=reference.copy();base.paste((0,0,0,0),rect);base.save(OUT/'hull-static-base.png')
base.save(OUT/'hull-static-base.webp',lossless=True,method=6,exact=True)
assert Image.open(OUT/'hull-static-base.webp').convert('RGBA').tobytes()==base.tobytes()

def rebuild(patch):
    result=base.copy();result.paste(patch,(rect[0],rect[1]));return result
first=rebuild(frames[0]);first.save(OUT/'reassembled-rest.png')
rebuild(frames[21]).save(OUT/'reassembled-open.png')
# Real pixels, with duplicate-edge gutters; never interpolate/morph frame images.
pad=2;cols=8;rows=math.ceil(len(frames)/cols);cw=w+2*pad;ch=h+2*pad
atlas=Image.new('RGBA',(cw*cols,ch*rows),(0,0,0,0));entries=[]
for index,im in enumerate(frames):
    x=(index%cols)*cw+pad;y=(index//cols)*ch+pad
    atlas.paste(im,(x,y))
    atlas.paste(im.crop((0,0,w,1)).resize((w,pad)),(x,y-pad))
    atlas.paste(im.crop((0,h-1,w,h)).resize((w,pad)),(x,y+h))
    atlas.paste(im.crop((0,0,1,h)).resize((pad,h)),(x-pad,y))
    atlas.paste(im.crop((w-1,0,w,h)).resize((pad,h)),(x+w,y))
    for xx,yy,sx,sy in [(x-pad,y-pad,0,0),(x+w,y-pad,w-1,0),(x-pad,y+h,0,h-1),(x+w,y+h,w-1,h-1)]:
        atlas.paste(im.getpixel((sx,sy)),(xx,yy,xx+pad,yy+pad))
    assert atlas.crop((x,y,x+w,y+h)).tobytes()==im.tobytes()
    entries.append({'index':index,'sourceFrame':report['frames'][index]['sourceFrame'],
                    'rect':[x,y,w,h], 'timeSeconds':report['frames'][index]['timeSeconds']})
atlas.save(OUT/'fore-deployment-atlas.png')
atlas.save(OUT/'fore-deployment-atlas.webp',lossless=True,method=6,exact=True)
assert Image.open(OUT/'fore-deployment-atlas.webp').convert('RGBA').tobytes()==atlas.tobytes()
manifest={'stage':'P6 offline animation assets, not installed in game','fps':30,'durationSeconds':1.5,
          'frames':entries,'patchInHullPixels':list(rect),'frameSize':[w,h],'atlasSize':list(atlas.size),
          'atlas':'fore-deployment-atlas.webp','staticBase':'hull-static-base.webp','hullSize':[512,1024],
          'paddingPx':pad,'alpha':'straight','colors':'display-referred AgX / sRGB',
          'sampling':'linear, no mipmaps unless per-frame gutters are revalidated',
          'assembly':'Draw cutout static base and exactly registered patch under the same transform. Do not overlay on the uncut old hull.',
          'phaseFrames':{'rest':[0],'deploy':[0,21],'charge':[21,30],'readyHold':[30],'release':[30,33],'recover':[33,45]},
          'previewTimingNotCombatBalance':True,'originalSC2Animation':False,'beamOrImpactIncluded':False}
(OUT/'animation-art.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
font='C:/Windows/Fonts/msyh.ttc';bg='#111a23';fg='#e5edf1';muted='#9eb0bc'
def label(d,xy,s,size=18,color=fg):d.text(xy,s,font=ImageFont.truetype(font,size),fill=color)
def phase(i):
    return '待机' if i==0 or i==45 else '机构展开' if i<=21 else '蓄能' if i<=30 else '能量收束' if i<=33 else '机构收回'
def board(index):
    canvas=Image.new('RGB',(800,788),bg);draw=ImageDraw.Draw(canvas)
    label(draw,(24,18),'亚顿之矛 · 前部机构动作',28)
    label(draw,(24,60),'Web 改编动作 / 真实骨架逐帧烘焙',18,muted)
    hull=rebuild(frames[index]).resize((307,614),Image.Resampling.LANCZOS)
    canvas.paste(hull,(12,120),hull)
    label(draw,(376,120),phase(index),25)
    patch=frames[index].resize((256,320),Image.Resampling.LANCZOS)
    canvas.paste(patch,(376,178),patch)
    label(draw,(376,521),'局部 2× / 非游戏截图',17,muted)
    label(draw,(376,575),'固定前向，不随鼠标转动。',18)
    label(draw,(376,610),'开合与已有能量面参与动作。',18)
    label(draw,(376,645),'本轮未加入光束或命中特效。',18,muted)
    label(draw,(24,749),'二维序列贴图；运行时无需模型、骨骼或 Blender。',18,muted)
    return canvas
previews=[board(i) for i in range(46)]
# GIF duration is quantized in 10ms units; this 30/30/40 cadence preserves 30fps on average.
durations=[30 if i%3!=2 else 40 for i in range(46)];durations[0]=500;durations[-1]=550
previews[0].save(OUT/'deployment-preview.gif',save_all=True,append_images=previews[1:],duration=durations,loop=0,disposal=2)
previews[0].save(OUT/'deployment-preview.webp',save_all=True,append_images=previews[1:],duration=durations,loop=0,lossless=True,method=4)
previews[21].save(OUT/'deployment-preview-still.png')
proof=Image.new('RGB',(1024,475),bg);draw=ImageDraw.Draw(proof)
label(draw,(20,15),'动作关键状态 / 同一真实机构',26)
for j,index in enumerate([0,21,30,45]):
    x=j*256+18;label(draw,(x,69),phase(index),19)
    im=frames[index].resize((224,280),Image.Resampling.LANCZOS);proof.paste(im,(x,115),im)
label(draw,(20,432),'展开 → 蓄能 → 收回；这不是原模型自带的开火动画。',18,muted)
proof.save(OUT/'motion-contact-proof.png')
with Image.open(OUT/'deployment-preview.gif') as gif:
    gif_count=gif.n_frames;assert gif_count>=40
verification={'frames':len(frames),'distinctRgbaFrames':len(set(hashes)),'posePixelsDifferMeanRgba':change,
              'returnToRestMeanErrorRgba':loop,'savedBlendSkinningVerified':report['allSegmentsHaveUnitSourceWeights'],
              'geometricBoundsChangeVerified':True,'atlasRoundTripExact':True,'frameExtractionExact':True,
              'gifFrameCount':gif_count,
              'staticPlusAtlasDownloadBytes':sum((OUT/n).stat().st_size for n in ['hull-static-base.webp','fore-deployment-atlas.webp']),
              'staticPlusAtlasRgba8BytesNoMipmaps':512*1024*4+atlas.width*atlas.height*4,
              'staticReferenceVsPatchRestMeanErrorRgba':ImageStat.Stat(ImageChops.difference(first,reference)).mean,
              'gameIntegrated':False,'finalWeaponComplete':False}
(OUT/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copyfile(ROOT/'artifacts/spear-of-adun/model-research/source/license.txt',OUT/'SOURCE-LICENSE.txt')
for script in ['animate-spear-of-adun-fore-deployment.py','render-spear-of-adun-fore-patches.py','package-spear-of-adun-fore-deployment.py']:
    shutil.copyfile(ROOT/'scripts'/script,OUT/script)
print(json.dumps(verification,ensure_ascii=False,indent=2))
