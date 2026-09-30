"""Archive model-checked attachments and annotate real renders for review (not weapon art)."""
import hashlib,json,shutil,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/spear-of-adun-art/mount-layout-v01'
plan_path=ROOT/'docs/spear-of-adun-installation-plan-v06.json'
plan=json.loads(plan_path.read_text(encoding='utf-8'))
regions=json.loads((OUT/'source-regions.json').read_text(encoding='utf-8'))
evidence=json.loads((OUT/'calibration.json').read_text(encoding='utf-8'))
master=json.loads((OUT/'attachment-master.json').read_text(encoding='utf-8'))
assert all(r['sampledSupportPassed'] for r in evidence['sites'])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_root=ROOT/'artifacts/spear-of-adun/model-research/source'
archive={'schemaVersion':1,'stage':'AUTHORING_INSTALLATION_ARCHIVE_NOT_RUNTIME',
 'source':{'author':'Catholomew','url':'https://sketchfab.com/3d-models/spear-of-adun-protoss-starcraft-2-7582ff949a4844e4bbc32ea93de2b8ec',
 'license':'CC BY-NC 4.0; underlying game IP permissions not resolved for distribution',
 'gltfSha256':sha(source_root/'scene.gltf'),'bufferSha256':sha(source_root/'scene.bin'),
 'sourceBlendSha256':sha(ROOT/regions['sourceBlend']),'planSha256':sha(plan_path)},
 'plan':plan,'calibration':evidence,'regions':regions,'editableAttachments':master,
 'coordinateConvention':'Source image upper-left origin; model bone space also recorded; no approved runtime ship pivot yet',
 'pending':['bearing/head artwork and seat contact','muzzle and barrel clearance','weapon arcs and balance','game pivot / collision / migration','actual runtime installation'],
 'runtimeReady':False}
(OUT/'installation-archive.json').write_text(json.dumps(archive,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# Small source/evidence snapshot travels with the tests, unlike ignored Blender/output data.
(ROOT/'docs/spear-of-adun-installation-evidence-v06.json').write_text(json.dumps({'source':archive['source'],'calibration':evidence,'regions':regions,'editableAttachments':master},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
shutil.copyfile(source_root/'license.txt',OUT/'SOURCE-LICENSE.txt')
font=lambda size:ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',size)
F={n:font(n) for n in [13,16,18,21,28]};bg='#111a23';fg='#e5edf1';muted='#9eb0bc'
colors={'LARGE':'#ffdb83','MEDIUM':'#86d5f2','SMALL':'#eceff4'}
prefix={'LARGE':'L','MEDIUM':'M','SMALL':'S'}
counters={k:0 for k in colors};labels={}
for site in plan['sites']:
 counters[site['size']]+=1;labels[site['id']]=prefix[site['size']]+str(counters[site['size']])
regions_img=Image.open(OUT/'visible-regions.png').convert('RGB')
# Pure diagnostic silhouette on matching board background, not a replacement texture.
rgb=regions_img.load()
for y in range(regions_img.height):
 for x in range(regions_img.width):
  if rgb[x,y]==(0,0,0):rgb[x,y]=(17,26,35)

def annotate(im,scale=1):
 d=ImageDraw.Draw(im)
 for site in plan['sites']:
  x,y=[v*scale for v in site['imageAnchorPx']];r=site['bearingRadiusPx']*scale;c=colors[site['size']]
  d.ellipse((x-r,y-r,x+r,y+r),outline=c,width=2)
  d.line((x-2,y,x+2,y),fill=c);d.line((x,y-2,x,y+2),fill=c)
  port=site['id'].endswith('_PORT');tag=labels[site['id']];tw=d.textlength(tag,font=F[13]);tx=x-r-5-tw if port else x+r+5;ty=y-8
  d.rectangle((tx-2,ty-1,tx+tw+2,ty+17),fill=bg)
  d.text((tx,ty),tag,font=F[13],fill=c)
 # One original mechanism, not twelve new slots; bracket is a production annotation.
 if scale==1:
  d.rectangle((233,214,279,315),outline='#679dff',width=1)
  d.text((282,251),'专武机构',font=F[13],fill='#91b8ff')
 return im

def board(index):
 im=Image.new('RGB',(1040,1180),bg);d=ImageDraw.Draw(im)
 d.text((24,18),'亚顿之矛 · 固定挂点与旋转环分离',font=F[28],fill=fg)
 d.text((24,60),'布局标定：2 大 / 4 中 / 6 小候选位 + 1 套原生专武机构',font=F[18],fill=muted)
 hull=Image.open(ROOT/f'output/spear-of-adun-art/core-motion-v01/frames/{index:03d}.png').convert('RGBA')
 layer=Image.new('RGBA',hull.size,bg);layer.alpha_composite(hull);left=annotate(layer.convert('RGB'))
 im.paste(left,(14,110))
 d.text((606,110),'部件归属（静止姿态）',font=F[21],fill=fg)
 im.paste(regions_img.resize((320,640),Image.Resampling.NEAREST),(646,160))
 for row,(col,title) in enumerate([('#3ecca9','固定舰体：常规安装位置'),('#dc8441','旋转环：禁止武器挂点'),('#619cf8','前部机构：独立内置专武')]):
  y=842+row*36;d.rectangle((588,y+4,602,y+18),fill=col);d.text((614,y),title,font=F[18],fill=fg)
 for row,text in enumerate(['72 个环姿态 × 前部开 / 合','支撑点与归属通过采样检查','尚未验证炮管 / 射界 / 最终炮座']):
  d.text((584,977+row*30),text,font=F[18],fill=muted)
 d.text((24,1140),'圆圈是标定标记，不是占位炮塔素材。动画约 6.9× 加速；未替换运行版。',font=F[18],fill=muted)
 return im
board(0).save(OUT/'installation-layout-review.png')
cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','1040x1180','-framerate','20','-i','pipe:0','-an','-c:v','libx264','-crf','20','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'fixed-mounts-moving-ring.mp4')]
process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
try:
 for index in range(144):process.stdin.write(board(index).tobytes())
finally:process.stdin.close()
assert process.wait()==0
verification={'candidateCounts':counters,'rotatingCoreWeaponCandidates':0,'corePhaseCount':evidence['corePhaseCount'],
 'independentForeStates':evidence['foreStates'],'bearingProbesPerPose':33,
 'allCandidatesPassedSampledSupport':all(r['sampledSupportPassed'] for r in evidence['sites']),
 'editableMasterVerified':master['savedMasterReopenedAndBindingsVerified'],
 'maxAuthoringAnchorDriftModelUnits':master['maxDrift'],
 'markersAreNotWeaponArtwork':True,'currentRuntimeRemainsV05':True}
(OUT/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(verification,ensure_ascii=False,indent=2))
