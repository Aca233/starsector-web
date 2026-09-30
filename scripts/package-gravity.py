"""Package only the gravity ship, its rules and evidence, never the whole host."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts/gravity'
dest = out / 'gravity-ship-dev-pack-v6'
dest.mkdir(parents=True, exist_ok=True)
data = json.loads((out / 'package-data.json').read_text(encoding='utf-8'))

def write_json(name, value):
    target = dest / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def copy(relative, target=None):
    source = root / relative
    result = dest / (target or relative)
    result.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, result)

write_json('mod.json', data['mod'])
for ship in data['mod']['ships']:
    write_json('data/ships/' + ship['id'] + '.json', ship)
for weapon in data['mod']['weapons']:
    write_json('data/weapons/' + weapon['id'] + '.json', weapon)
write_json('data/variants.json', data['variants'])
write_json('data/refit.json', {'hull': data['refit'], 'armory': data['armoryRefit']})

native_assets = [
    '/game-assets/graphics/missiles/shell_gauss_cannon.png',
    '/game-assets/graphics/fx/wormhole_ring_bright2.png',
    '/game-assets/graphics/fx/explosion_ring0.png',
    '/game-assets/graphics/fx/beam_rough2_fringe.png',
    '/game-assets/graphics/fx/beam_laser_core.png',
]
write_json('host-requirements.json', {
    'format': 'starsector-web-gravity-development-pack-v6',
    'testedHost': {'package': 'starsector-web', 'version': '0.2.11', 'workspaceDate': '2026-09-30'},
    'requiresCompiledIntegration': True,
    'nativeAssetUrls': native_assets,
    'nativeSoundKeys': ['railgun_fire', 'vulcan_cannon_fire'],
    'additionalCustomHulls': [],
    'systemIds': ['WEB_GRAVITY_WELL', 'WEB_GRAVITY_REMOTE_RELEASE', 'WEB_GRAVITY_REPULSOR'],
    'requiredCapabilities': [
        'WeaponSpec gravityTractor/gravityDeflector and WeaponMount controller state; special mounts never spawn fake projectiles.',
        'Registry entries from GravitySystems; gravityControlSpec F/G/RMB routing and command-edge well serial.',
        'ShipWeaponControlSystem uses actual projectile/asteroid/hulk world, updateGravityTractorInput and special-fire guard.',
        'CombatEngine runs advanceGravityFields then advanceGravityTerrain once per authoritative fixed step before terrain/projectile motion.',
        'Projectile capture provenance/inertialFlight and hit-time damage multiplier policy; no lifetime reset.',
        'CombatFXSystem/HulkVisuals skip duplicate movement/breakup of explicitly fixed or gravity-managed bodies as documented.',
        'HullCollisionSurface structural polygon support, TacticalWorld hulkFragments and managed-hulk navigation avoidance.',
        'Controller/field state is carried by render projection, display and LAN snapshot declarations; HUD reads real mount state.',
        'GravityRenderer and GravityVisuals asset preparation/render pass registration.',
        'ContentValidation accepts bounded special specs; design/refit/template/loadout/catalog and ModManager registration.'
    ],
    'limitations': ['Not a Java Starsector mod.', 'Old hosts need source integration; JSON alone cannot install new engine rules.',
        'No final balance or live human multiplayer validation claim.', 'This workspace already bundles these IDs; do not import duplicates.']
})

sources = [
    'src/engine/content/GravityPack.ts', 'src/engine/content/GravityArmory.ts',
    'src/engine/content/GravityIds.ts', 'src/engine/content/GravityControls.ts',
    'src/engine/content/gravity-art.json', 'src/studio/GravityLoadouts.ts',
    'src/engine/extensions/ship-systems/GravitySystems.ts',
    'src/engine/simulation/GravityFieldState.ts', 'src/engine/simulation/GravityManeuverState.ts',
    'src/engine/simulation/GravityTractorState.ts',
    'src/engine/simulation/systems/GravityFieldPhysics.ts',
    'src/engine/simulation/systems/GravityTractor.ts', 'src/engine/simulation/systems/GravityTerrain.ts',
    'src/engine/render/webgl/GravityRenderer.ts', 'src/engine/visual/GravityVisuals.ts',
]
for source in sources:
    copy(source, 'source/' + source)
for name in ['hull', 'tractor', 'calibrator', 'deflector', 'pdc']:
    copy('public/game-assets/graphics/gravity/' + name + '.png')
assets = json.loads((root / 'public/game-assets/asset-manifest.json').read_text(encoding='utf-8'))
assets = [entry for entry in assets if entry['path'].startswith('graphics/gravity/')]
assert len(assets) == 5
for entry in assets:
    assert hashlib.sha256((dest / 'public/game-assets' / entry['path']).read_bytes()).hexdigest() == entry['hash']
write_json('public/game-assets/gravity-asset-manifest.json', assets)
for name in ['gravity-playable-v6.md', 'gravity-ship-gameplay-v6.md']:
    copy('docs/' + name)
copy('output/imagegen/gravity-armory-v6/prompts.md', 'docs/art-provenance.md')
for name in ['rules-check.json', 'ui-check.json', 'presentation-check.json',
             'installed-hull.png', 'well-and-tractor.png', 'repulsor-wave.png', 'remote-release.png']:
    copy('artifacts/gravity/' + name, 'verification/' + name)

(dest / 'README.md').write_text('''# 万有引力号 · v6 单舰开发包

可玩工程版：引力辅助实验巡洋舰，左键抓真实实体、F 固定引力井、G 远端排斥、右键本舰全向强排斥。含 1 艘舰、4 武器、2 配装和 5 张原创运行资产。操作/数值见 docs/gravity-playable-v6.md。

## 使用与接入

当前 Starsector Web 工作区已经内置该舰：设计界面搜索“万有引力”，选择护航救援或阵地控场并进入模拟。不要重复加载相同舰体/武器 ID。

其它宿主先按 host-requirements.json 接入并编译引力扩展及共享引擎接口，再把 public/ 合入静态资源，将 gravity-asset-manifest.json 的五条记录合入宿主 asset-manifest，将 mod.json 的内容注册到 ContentRegistry/ModManager，并注册 data/refit.json、data/variants.json 的配装和设计元数据。source/ 是对应原创扩展源码，依赖宿主引擎接口；共享宿主文件没有打包，接入要求列在 host-requirements.json。只导入 JSON 不会使旧宿主自动拥有新规则。本包不是 Java 原版 Starsector 的 mods 安装包，也不是整宿主发布包。

## 验证范围

主线程和真实 Dedicated Worker 各 147 项规则检查。类型检查、相关文件 lint、两套配装的界面装配/刷新保留/模拟器启动以及正式 WebGL 状态渲染通过。verification/ 内有原检查记录与正式截图。45 秒自然 AI 场景验证了基本行为，未完成最终强度平衡、真人长局及真人联机端到端验收。源码/状态检查不代表原版实机等价。

## 素材与边界

本轮按用户要求直接调用内置生图工具；舰体运行图保留认可的原图 RGB，使用生成的 alpha，四武器由生成图集标定导出。来源记录见 docs/art-provenance.md，标定见 source/src/engine/content/gravity-art.json。自有图像随包；host-requirements.json 中的原版炮弹、声音及效果素材由宿主已有资产提供，未重复分发。本包不依赖其它原创舰，不包含未完成生涯代码。

manifest.json 记录每个归档文件的 SHA-256 与字节数。
''', encoding='utf-8')

# Explicit whitelist avoids accidentally distributing unrelated checkout contents.
files = ['mod.json', 'data/variants.json', 'data/refit.json', 'host-requirements.json', 'README.md',
         'public/game-assets/gravity-asset-manifest.json']
files += ['data/ships/' + s['id'] + '.json' for s in data['mod']['ships']]
files += ['data/weapons/' + w['id'] + '.json' for w in data['mod']['weapons']]
files += ['source/' + s for s in sources]
files += ['public/game-assets/graphics/gravity/' + n + '.png' for n in ['hull', 'tractor', 'calibrator', 'deflector', 'pdc']]
files += ['docs/' + n for n in ['gravity-playable-v6.md', 'gravity-ship-gameplay-v6.md', 'art-provenance.md']]
files += ['verification/' + n for n in ['rules-check.json', 'ui-check.json', 'presentation-check.json',
                                      'installed-hull.png', 'well-and-tractor.png', 'repulsor-wave.png', 'remote-release.png']]
entries = [{ 'path': name, 'bytes': (dest / name).stat().st_size,
             'sha256': hashlib.sha256((dest / name).read_bytes()).hexdigest() } for name in sorted(files)]
write_json('manifest.json', {'id': data['mod']['id'], 'version': data['mod']['version'], 'files': entries})
archive = out / 'gravity-ship-dev-pack-v6.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in sorted(files + ['manifest.json']):
        z.write(dest / name, 'gravity-ship-dev-pack-v6/' + name)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for entry in entries:
        assert hashlib.sha256(z.read('gravity-ship-dev-pack-v6/' + entry['path'])).hexdigest() == entry['sha256']
print(json.dumps({'archive': str(archive), 'files': len(entries) + 1, 'bytes': archive.stat().st_size,
                  'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'hashesVerified': True}, ensure_ascii=False))
