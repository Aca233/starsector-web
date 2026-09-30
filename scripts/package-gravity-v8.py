"""Whitelisted single-ship development package, not a host/campaign release."""
from pathlib import Path
import json, hashlib, shutil, zipfile

root=Path(__file__).resolve().parents[1]
out=root/'artifacts/gravity';dest=out/'gravity-ship-dev-pack-v8';dest.mkdir(parents=True,exist_ok=True)
data=json.loads((out/'package-data-v8.json').read_text(encoding='utf-8'))
files=[]
def write(name,value):
    p=dest/name;p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');files.append(name)
def copy(source,name=None):
    name=name or source;p=dest/name;p.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(root/source,p);files.append(name)
write('mod.json',data['mod'])
write('data/variants.json',data['variants'])
write('data/refit.json',{'hull':data['refit'],'armory':data['armoryRefit']})
for ship in data['mod']['ships']:write('data/ships/'+ship['id']+'.json',ship)
for weapon in data['mod']['weapons']:write('data/weapons/'+weapon['id']+'.json',weapon)

def urls(value):
    if isinstance(value,dict):
        for item in value.values():yield from urls(item)
    elif isinstance(value,list):
        for item in value:yield from urls(item)
    elif isinstance(value,str) and value.startswith('/game-assets/'):yield value
all_urls=set(urls(data['mod']))
owned=sorted(u.removeprefix('/game-assets/') for u in all_urls if u.startswith('/game-assets/graphics/gravity/'))
assert len(owned)==5,owned
manifest=json.loads((root/'public/game-assets/asset-manifest.json').read_text(encoding='utf-8'))
entries=[a for a in manifest if a['path'] in owned];assert len(entries)==len(owned)
for entry in entries:
    relative='public/game-assets/'+entry['path'];copy(relative)
    assert hashlib.sha256((dest/relative).read_bytes()).hexdigest()==entry['hash']
write('public/game-assets/gravity-asset-manifest.json',entries)

native=sorted(u for u in all_urls if not u.startswith('/game-assets/graphics/gravity/'))
native+=['/game-assets/graphics/fx/wormhole_ring_bright2.png','/game-assets/graphics/fx/explosion_ring0.png',
         '/game-assets/graphics/fx/hit_glow.png','/game-assets/graphics/fx/glow64.png']
write('host-requirements.json',{
 'format':'starsector-web-gravity-development-pack-v8',
 'testedHost':{'package':'starsector-web','version':'0.2.11','workspaceDate':'2026-09-30'},
 'requiresCompiledIntegration':True,'additionalCustomHulls':[],
 'systemIds':['WEB_GRAVITY_BATTLE_WELL','WEB_GRAVITY_COLLAPSE','WEB_GRAVITY_BATTLE_REPULSOR'],
 'nativeAssetUrls':sorted(set(native)),'nativeSoundKeys':['railgun_fire','vulcan_cannon_fire'],
 'requiredCapabilities':[
  'Register GravitySystems and gravityBattleControlSpec F/G/RMB slots, snapshot accepted well position/serial before cursor moves.',
  'WeaponSpec special controller fields and effectiveHullModWeaponSpec tidal damage/flux; real world supplied to ShipWeaponControlSystem; fake-fire guard.',
  'CombatEngine: after system events, advanceGravityFields then advanceGravityDamage (native armor/component/shield/hull and actual damage statistics), then advanceGravityTerrain before collision/movement.',
  'GravityTractor ownership/provenance, native projectile lifetime and field mass/force budget caps; real fixed obstacles and managed hulk navigation/collision.',
  'Registry validates GravityCollapseSpec; ContentValidation accepts bounded tidal specs. RenderShipProjection and LanShipProjection copy gravityField for gravityCollapse as well as gravityField definitions.',
  'Serializable mount/field state through authority/display codecs; existing successful-activation, weapon damage, engine and HUD lifecycle.',
  'GravityRenderer native-texture feedback and GravityLensPass after world FX, before HUD; WebGLCombatRenderer recreates/disposes lens GPU resources and gates by effect layers.',
  'Measured hull/weapon art, four-tier strict mounting, fixed hardpointUsesHullSprite, baseline built-in versus default fit separation, catalog registration and saved-design compiler.'
 ],
 'limitations':['Development source plus validated data; the JSON importer does not execute TypeScript rules.','Not a Java Starsector mod.','This workspace already bundles these IDs; do not import duplicates.','No automatic old-host installation, final balance or live human multiplayer validation claim.'],
})
sources=[
 'src/engine/content/GravityPack.ts','src/engine/content/GravityArmory.ts','src/engine/content/GravityIds.ts','src/engine/content/GravityControls.ts',
 'src/engine/content/gravity-art.json','src/engine/content/gravity-battle-art.json','src/studio/GravityLoadouts.ts',
 'src/engine/extensions/ship-systems/GravitySystems.ts','src/engine/simulation/GravityFieldState.ts','src/engine/simulation/GravityTractorState.ts','src/engine/simulation/GravityManeuverState.ts',
 'src/engine/simulation/systems/GravityFieldPhysics.ts','src/engine/simulation/systems/GravityTractor.ts','src/engine/simulation/systems/GravityTerrain.ts','src/engine/simulation/systems/GravityDamage.ts',
 'src/engine/render/webgl/GravityRenderer.ts','src/engine/render/webgl/GravityLensPass.ts','src/engine/visual/GravityVisuals.ts',
]
for source in sources:copy(source,'source/'+source)
copy('docs/gravity-playable-v8.md')
copy('docs/gravity-fx-v8.md')
for name in ['native.prompt.txt','art-review.md']:copy('output/imagegen/gravity-battleship-v8/'+name,'docs/art/'+name)
copy('output/imagegen/gravity-armory-v6/prompts.md','docs/art/armory-prompts.md')
copy('scripts/prepare-gravity-v8.py','source/scripts/prepare-gravity-v8.py')
copy('artifacts/gravity/rules-check-v8.json','verification/rules-check-v8.json')
for name in ['ui-check.json','presentation-check.json','fx-check.json','installed-hull.png','well-and-tractor.png','repulsor-wave.png','collapse.png','gravity-effects-v8.webm','gravity-effects-v8-preview.webm']:
    copy('artifacts/gravity/v8/'+name,'verification/'+name)

readme='''# 万有引力号 · v8 单舰开发包

实验引力战列舰：左键真实潮汐攻击/实体抓取，F固定井，G潮汐坍缩，右键全向排斥。浅蓝正式舰体、4武器、2合法配装、5张原创运行图。操作和验收范围见 docs/gravity-playable-v8.md。

本工作区已经内置该舰，设计页搜索“万有引力”，选“潮汐攻坚”或“引力控场”并进入模拟。不要重复导入同ID。

其它宿主需要先具备 host-requirements.json 所列可信、已编译引力接口，再合入 public/资产与资源清单、注册 mod.json 的舰船/武器，以及 data/refit.json 和 variants.json 元数据。本包是数据与专属集成源码开发交付，宿主的 JSON 导入器不能执行源码；没有验证旧客户端解压即用。共享宿主文件没有捆入包中，以免分发其它开发内容。

生产主线程与实际Dedicated Worker各59项规则检查一致；两套配装UI保存/读回/模拟器启动、正式WebGL阶段画面及45秒AI功能场景通过。新折射特效在抗锯齿画布、原/降低渲染比例和暂停/关闭效果状态检查通过。真人手感、最终平衡和真人多人未验。

素材来源：船图为用户当前选定的生成原图；源提示词与标定随包，S/M部件沿用已生成的独立武器图集。原版效果、炮弹与声音由宿主提供，未重新分发；不依赖另一艘原创舰、不含生涯代码，不是Java原版Starsector模组。仅本地开发交付，未公开发布。

manifest.json记录逐文件SHA-256和大小。
'''
(dest/'README.md').write_text(readme,encoding='utf-8');files.append('README.md')
records=[{'path':name,'bytes':(dest/name).stat().st_size,'sha256':hashlib.sha256((dest/name).read_bytes()).hexdigest()} for name in sorted(set(files))]
write('manifest.json',{'id':data['mod']['id'],'version':data['mod']['version'],'files':records})
archive=out/'gravity-ship-dev-pack-v8.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for name in sorted(set(files)):z.write(dest/name,'gravity-ship-dev-pack-v8/'+name)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for record in records:assert hashlib.sha256(z.read('gravity-ship-dev-pack-v8/'+record['path'])).hexdigest()==record['sha256']
print(json.dumps({'archive':str(archive),'files':len(set(files)),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'hashesVerified':True},ensure_ascii=False))
