"""Inspect/source-register a fore assembly; no runtime weapon or invented art."""
import json
import shutil
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/spear-of-adun-art/fore-installation-v01'
files={name:Image.open(OUT/(name+'.png')).convert('RGBA') for name in [
    'assembled-reference','hull-without-fore','hull-mounted-underlay',
    'fore-complete','fore-visible','split-geometry-reference']}
assert all(im.size==(512,1024) for im in files.values())
ref=files['assembled-reference']; full=files['fore-complete']; visible=files['fore-visible']
assert full.tobytes()==visible.tobytes(), 'Current neutral fore pose unexpectedly became occluded'
composite=Image.alpha_composite(files['hull-mounted-underlay'],full)
composite.save(OUT/'layered-fit.png')
roi=(206,190,306,334)
errors={name:ImageStat.Stat(ImageChops.difference(im.crop(roi),ref.crop(roi))).mean for name,im in [
    ('layered',composite),('split',files['split-geometry-reference'])]}
assert max(errors['layered'][:3])<2, errors
assert max(errors['split'][:3])<2, errors
crop=(224,208,288,320)
asset=full.crop(crop)
assert asset.getchannel('A').getbbox()==(9,10,55,105)
asset.save(OUT/'fore-mechanism.png')
asset.save(OUT/'fore-mechanism.webp',lossless=True,method=6,exact=True)
assert Image.open(OUT/'fore-mechanism.webp').convert('RGBA').tobytes()==asset.tobytes()
source=json.loads((OUT/'segmentation-report.json').read_text(encoding='utf-8'))
assert all(part['boundVertices']==part['vertices'] for part in source['segments']), 'Source skin weights were lost'
pivot=source['sourceBonePivots']['Ctrl_Gun_Master_15']['pixel']
registration={
    'kind':'offline art registration, NOT a runtime WeaponMountSlotConfig',
    'hull':'web_spear_of_adun', 'sourceObject':'Object_15',
    'art':'fore-mechanism.png','canvasSize':[512,1024], 'cropBounds':crop,
    'assetSize':list(asset.size),'sourceRigMasterPixel':pivot,
    'sourceRigMasterPixelInAsset':[pivot[0]-crop[0],pivot[1]-crop[1]],
    'sourceRigMasterIsNotConfirmedGunPivot':True,
    'equipmentPolicyDecision':'built-in dedicated weapon for characteristic native mechanisms; binding awaits finished weapon definition',
    'policyIsWebAdaptationNotCanonLoadout':True,
    'motionPolicy':'no free 2D aim rotation; source-control articulation must be separately authored',
    'foregroundRequiredInNeutralPose':False,
    'occlusionEvidence':'fore-complete.png and fore-visible.png have identical RGBA bytes at frame 0',
    'interchangeableSlotsElsewhere':'strict same-size replacements; actual positions not assigned here',
    'runtimeRegistered':False
}
(OUT/'art-registration.json').write_text(json.dumps(registration,ensure_ascii=False,indent=2),encoding='utf-8')

bg='#111a23'; fg='#e4edf2'; muted='#a0b0bd'; accent='#69c8d2'
font='C:/Windows/Fonts/msyh.ttc'
board=Image.new('RGB',(1184,900),bg); d=ImageDraw.Draw(board)
def text(x,y,s,size=18,color=fg):
    d.text((x,y),s,font=ImageFont.truetype(font,size),fill=color)
def paste(im,xy,size):
    im=im.resize(size,Image.Resampling.LANCZOS);board.paste(im,xy,im)
text(28,20,'亚顿之矛 / 前部原生机构拆装',30)
text(28,65,'设计方向：标志性机构用内置专武；其它开放槽位仍按同档换装。',19,muted)
text(28,110,'整体位置（65%）',20)
paste(ref,(20,155),(333,666))
# Source registration rectangle on this inspection board only, never on the art asset.
d.rectangle((20+206*.65,155+190*.65,20+306*.65,155+334*.65),outline=accent,width=2)
region=(196,160,316,350)
for x,title,img in [(390,'01  移除机构后的舰体',files['hull-without-fore']),
                    (650,'02  独立完整部件',full),
                    (910,'03  按原位置装回',composite)]:
    text(x,110,title,17)
    paste(img.crop(region),(x,160),(240,380))
    text(x,556,'局部 2× / 非新增造型',16,muted)
text(390,615,'已保留原网格、贴图、顶点色与材质。',20)
text(390,655,'12 个源控制段，不等于 12 个炮位。',20)
text(390,695,'这处静止姿态无舰体遮挡，不虚构一层护罩。',18,muted)
text(390,733,'锁定武器身份与是否能转动，是两项独立设置。',18,muted)
text(28,850,'P6 离线安装样板；未绑定武器 ID，未替换游戏资源，未确认原作枪口和射界。',18,muted)
board.save(OUT/'installation-review.png')

verification={
    'technicalFit':True,'resolution':[512,1024], 'crop':crop,
    'visibleVsCompleteRgbaIdentical':True,
    'neutralPoseDoesNotNeedInventedForeground':True,
    'roi':roi,'meanAbsoluteRgbaError0to255':errors,
    'splitGeometryConservation':source['topologyConservation'],
    'splitPreservesUVAndVertexColorsAndCornerNormals':all(s['uvPreserved'] and s['vertexColorsPreserved'] and s['customCornerNormalsCopied'] for s in source['segments']),
    'mechanismWebpBytes':(OUT/'fore-mechanism.webp').stat().st_size,
    'rgba8BytesNoMipmaps':64*112*4,
    'partialAlphaAAStillRequiresInGameCheck':True,
    'gameIntegrated':False,'canonGunBehaviorVerified':False,
    'finalArtApproval':False
}
(OUT/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copyfile(ROOT/'artifacts/spear-of-adun/model-research/source/license.txt',OUT/'SOURCE-LICENSE.txt')
for filename in ['prepare-spear-of-adun-fore-installation.py','split-spear-of-adun-fore-controls.py','review-spear-of-adun-fore-installation.py']:
    shutil.copyfile(ROOT/'scripts'/filename,OUT/filename)
print(json.dumps(verification,ensure_ascii=False,indent=2))
