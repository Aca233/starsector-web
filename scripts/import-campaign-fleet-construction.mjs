/** Public constructor inputs only. No engine bootstrap, image copying, or private saves. */
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {parseFactionText} from './import-campaign-factions.mjs';
const repo=fileURLToPath(new URL('..',import.meta.url)),root=path.resolve(repo,'..'),sources={};
const check=process.argv.includes('--check');if(process.argv.slice(2).some(a=>a!=='--check'))throw Error('Only --check is supported');
async function read(p){const bytes=await fs.readFile(path.join(root,p));sources[p]={sha256:createHash('sha256').update(bytes).digest('hex')};return bytes;}
const obf='decompiled/starfarer_obf/com/fs/starfarer/',common='decompiled/fs.common_obf/com/fs/graphics/';
for(const p of ['campaign/BaseCampaignEntity.java','campaign/fleet/CampaignFleet.java','campaign/fleet/CampaignFleetView.java','campaign/fleet/ContrailEngineV2.java','campaign/fleet/LogisticsModule.java','campaign/util/CollectionView.java','campaign/util/super.java','campaign/ui/oOO0.java','campaign/E.java','campaign/accidents/AccidentManager.java','campaign/accidents/AccidentRisk.java','campaign/accidents/O0oO.java','campaign/accidents/oooo_0.java','util/IntervalTracker.java','O0OO.java'])await read(obf+p);
for(const p of ['util/B.java','util/Fader.java','Sprite.java','Object.java','TextureLoader.java','oooo_0.java'])await read(common+p);
await read('decompiled/starfarer.api/com/fs/starfarer/api/impl/combat/CRPluginImpl.java');
await read('decompiled/starfarer.api/com/fs/starfarer/api/util/Misc.java');
await read(obf+'campaign/fleet/FleetData.java');
for(const p of ['starfarer_obf.jar','fs.common_obf.jar','starfarer.api.jar'])await read('starsector-core/'+p);
const settings=parseFactionText((await read('starsector-core/data/config/settings.json')).toString('utf8')),textures={};
for(const p of ['graphics/hud/line8x8.png','graphics/warroom/ship_arrow.png']){
 const bytes=await read('starsector-core/'+p);if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('Expected original PNG');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(width<=0||height<=0||(width&(width-1))||(height&(height-1)))throw Error('Re-audit texture padding for non-power-of-two assets');
 textures[p]={kind:'native-texture-source',path:p,sha256:sources['starsector-core/'+p].sha256,width,height,texWidth:1,texHeight:1};
}
for(const p of ['campaign/fleet/CampaignFleetMemberView.java','campaign/fleet/CampaignShipEngineGlow.java','prototype/Utils.java','loading/specs/EngineSlot.java','combat/entities/ContrailEngine.java'])await read(obf+p);
await read('decompiled/fs.common_obf/com/fs/util/oOOO.java');await read('starsector-core/graphics/fx/contrail64b.png');
const plugin=settings.plugins.combatReadinessPlugin;if(plugin!=='com.fs.starfarer.api.impl.combat.CRPluginImpl')throw Error('Unaudited combat readiness plugin');
for(const p of ['campaign/rules/Memory.java','renderers/O.java','rpg/Person.java','campaign/fleet/CargoData.java','campaign/fleet/RepairTracker.java','campaign/SensorContactIndicatorManager.java','campaign/ListenerManager.java','campaign/BaseLocation.java','campaign/CampaignEntity.java','campaign/fleet/FleetAbilityRenderer.java','campaign/fleet/SmoothMovementModule.java','campaign/CampaignEngine.java'])await read(obf+p);
for(const p of ['com/fs/util/container/repo/ObjectRepository.java','com/fs/util/container/repo/FastIterationClassifier.java','com/fs/graphics/LayeredRenderer.java','com/fs/graphics/LayeredRenderable.java'])await read('decompiled/fs.common_obf/'+p);
for(const p of ['campaign/CampaignFleetAPI.java','campaign/SectorEntityToken.java','campaign/FleetOrStubAPI.java','campaign/rules/HasMemory.java','campaign/listeners/DetectedEntityListener.java','campaign/listeners/DiscoverEntityPlugin.java','campaign/listeners/ListenerUtil.java'])await read('decompiled/starfarer.api/com/fs/starfarer/api/'+p);
const layerText=(await read('decompiled/starfarer.api/com/fs/starfarer/api/campaign/CampaignEngineLayers.java')).toString('utf8');
const layerBody=layerText.match(/public enum CampaignEngineLayers\s*\{([^;]+);/s);if(!layerBody)throw Error('Changed campaign layer enum');
const worldRegistration={layers:layerBody[1].split(',').map(v=>v.trim()),fleetClasses:['java.lang.Object','com.fs.starfarer.campaign.BaseCampaignEntity','com.fs.starfarer.campaign.CampaignEntity','com.fs.starfarer.api.campaign.SectorEntityToken','com.fs.starfarer.api.campaign.rules.HasMemory','com.fs.util.DoNotObfuscate','com.fs.graphics.LayeredRenderable','com.fs.starfarer.campaign.fleet.CampaignFleet','com.fs.starfarer.api.campaign.CampaignFleetAPI','com.fs.starfarer.api.campaign.FleetOrStubAPI','com.fs.starfarer.campaign.fleet.SmoothMovementModule$MovementModuleDelegate','java.lang.Cloneable']};
// Stock cargo_pods custom entity. Keep these assets outside the fleet texture registry so
// older live fleet resource objects remain compatible rather than acquiring fake texture history.
for(const p of ['campaign/CustomCampaignEntity.java','loading/specs/int.java'])await read(obf+p);
for(const p of ['impl/campaign/CargoPodsEntityPlugin.java','impl/campaign/CoreScript.java','impl/campaign/GenericFieldItemManager.java','impl/campaign/GenericFieldItemSprite.java','util/FaderUtil.java','campaign/CustomCampaignEntityAPI.java','campaign/listeners/CargoScreenListener.java'])await read('decompiled/starfarer.api/com/fs/starfarer/api/'+p);
const cargoPodSpec=parseFactionText((await read('starsector-core/data/config/custom_entities.json')).toString('utf8')).cargo_pods;
if(cargoPodSpec.pluginClass!=='com.fs.starfarer.api.impl.campaign.CargoPodsEntityPlugin')throw Error('Unaudited cargo-pod plugin');
const imageBytes=await read('starsector-core/'+cargoPodSpec.interactionImage);let imageDimensions=null;
if(imageBytes.readUInt16BE(0)!==0xffd8)throw Error('Expected native JPEG illustration');
for(let at=2;at+4<=imageBytes.length;){if(imageBytes[at++]!==255)throw Error('Malformed JPEG marker');while(imageBytes[at]===255)at++;const marker=imageBytes[at++];if(marker===0xda||marker===0xd9)break;const size=imageBytes.readUInt16BE(at);if(size<2||at+size>imageBytes.length)throw Error('Malformed JPEG segment');if([0xc0,0xc1,0xc2].includes(marker)){imageDimensions={width:imageBytes.readUInt16BE(at+5),height:imageBytes.readUInt16BE(at+3)};break;}at+=size;}
if(!imageDimensions?.width||!imageDimensions.height)throw Error('Missing illustration dimensions');
await read('starsector-core/'+cargoPodSpec.icon);
const fieldTextures={};
for(const p of [settings.graphics.misc.cargoPods,'graphics/fx/ship_shadow_mask.png']){
 const bytes=await read('starsector-core/'+p);if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('Expected native field PNG');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(width<=0||height<=0||(width&(width-1))||(height&(height-1)))throw Error('Re-audit field texture padding');
 fieldTextures[p]={kind:'native-texture-source',path:p,sha256:sources['starsector-core/'+p].sha256,width,height,texWidth:1,texHeight:1};
}
worldRegistration.customEntityClasses=[...worldRegistration.fleetClasses.slice(0,7),'com.fs.starfarer.campaign.CustomCampaignEntity','com.fs.starfarer.api.campaign.CustomCampaignEntityAPI'];
const cargoPods={fieldTexture:fieldTextures[settings.graphics.misc.cargoPods],shadowTexture:fieldTextures['graphics/fx/ship_shadow_mask.png'],spec:{spriteWidth:64,spriteHeight:64,interactable:true,detectionRange:-1,...cargoPodSpec},interactionImage:{path:cargoPodSpec.interactionImage,...imageDimensions,sha256:sources['starsector-core/'+cargoPodSpec.interactionImage].sha256}};
const result={schemaVersion:1,scope:'native-campaign-fleet-construction-inputs',originalReference:'Starsector 0.98a-RC8',sources,worldRegistration,cargoPods,selectionColor:settings.widgetBorderColorBright,combatReadinessPlugin:plugin,textures,motionSettings:{sneakBurnMult:settings.sneakBurnMult,baseTravelSpeed:settings.baseTravelSpeed,speedPerBurnLevel:settings.speedPerBurnLevel}};
const output=path.join(repo,'src/campaign/data/reference-fleet-construction.json'),text=JSON.stringify(result,null,2)+'\n';let old=null;try{old=await fs.readFile(output,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
if(check){if(old!==text)throw Error('Fleet construction input snapshot differs');}else await fs.writeFile(output,text,{flag:old===null?'wx':'w'});
console.log(JSON.stringify({sources:Object.keys(sources).length,textures:Object.keys(textures).length,check}));
