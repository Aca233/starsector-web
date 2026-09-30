import json, hashlib, shutil, zipfile
from pathlib import Path
root=Path('.'); out=root/'artifacts/rocinante/ship-pack-v1'; out.mkdir(parents=True,exist_ok=True)
data=json.loads((root/'artifacts/rocinante/delivery/package-data.json').read_text(encoding='utf8'))
fits=data.pop('fits'); (out/'mod.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8');(out/'loadouts.json').write_text(json.dumps(fits,ensure_ascii=False,indent=2),encoding='utf8')
paths=['src/engine/content/RocinantePack.ts','src/engine/content/RocinanteArmory.ts','src/engine/content/RocinanteIds.ts','src/engine/content/RocinanteInstallation.ts','src/engine/content/RocinanteHullMods.ts','src/engine/content/rocinante-installation.json','src/engine/content/rocinante-armory-art.json','src/engine/extensions/ship-systems/RocinanteSystems.ts','src/studio/RocinanteLoadouts.ts','docs/rocinante-playable-v1.md','docs/rocinante-source-notes-2026-09-29.md','output/imagegen/rocinante/armory-v01.prompt.txt']
paths += [p.as_posix() for p in (root/'public/game-assets/graphics/ships/web_rocinante').rglob('*.png')]
for rel in paths:
 dst=out/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/rel,dst)
shutil.copyfile(root/'docs/rocinante-playable-v1.md',out/'README.md')
manifest={'id':data['id'],'version':data['version'],'kind':'same-host-ship-content-and-extension-source','runtimeAssetBytes':sum(p.stat().st_size for p in (out/'public').rglob('*.png')),'requiresHost':['WEB_ROCINANTE_ATTITUDE','WEB_ROCINANTE_FIRE_CONTROL','onWeaponRecoil','EngineSlotConfig.maneuver','below-hull-ballistic-v1','native-shared-media'],'requiresOtherShips':[],'oldHostAutomaticRuleInstall':False,'files':{}}
for p in out.rglob('*'):
 if p.is_file() and p.name!='pack-manifest.json':manifest['files'][p.relative_to(out).as_posix()]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(out/'pack-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
zip_path=root/'artifacts/rocinante/rocinante-ship-pack-v1.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in out.rglob('*'):
  if p.is_file():z.write(p,p.relative_to(out).as_posix())
with zipfile.ZipFile(zip_path) as z:
 assert z.testzip() is None
 for rel,m in manifest['files'].items(): assert hashlib.sha256(z.read(rel)).hexdigest()==m['sha256']
print(json.dumps({'file':str(zip_path),'bytes':zip_path.stat().st_size,'runtimeAssets':manifest['runtimeAssetBytes'],'files':len(manifest['files'])+1,'verified':True}))
