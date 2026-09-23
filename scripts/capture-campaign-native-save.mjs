import fleetAccidentReference from '../src/campaign/data/reference-fleet-accidents.json' with {type:'json'};
import fleetConstructionReference from '../src/campaign/data/reference-fleet-construction.json' with {type:'json'};
import {ORIGINAL_FACTION_PERSONS} from '../src/campaign/rules/OriginalFactionPersons.mjs';
import {ORIGINAL_MILITARY_BASES} from '../src/campaign/rules/OriginalMilitaryBases.mjs';
import {ORIGINAL_SENSORS} from '../src/campaign/rules/OriginalSensors.mjs';
import {ORIGINAL_FLEET_MEMBERS} from '../src/campaign/rules/OriginalFleetMembers.mjs';
import {ORIGINAL_FLEET_COMPOSITION} from '../src/campaign/rules/OriginalFleetComposition.mjs';
import {ORIGINAL_SHIP_SELECTION} from '../src/campaign/rules/OriginalShipSelection.mjs';
import {ORIGINAL_GROUND_DEFENSES} from '../src/campaign/rules/OriginalGroundDefenses.mjs';
import { ORIGINAL_STORAGE } from '../src/campaign/rules/OriginalStorage.mjs';
import { captureNativeClock } from './lib/campaign-native-clock.mjs';
/** Explicit read-only native save extraction. Private captures may only be written under artifacts/. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import {ORIGINAL_CHARACTER_INDUSTRY_STATS} from '../src/campaign/rules/OriginalCharacterIndustryStats.mjs';
import { ORIGINAL_ADMINISTRATORS } from '../src/campaign/rules/OriginalAdministrator.mjs';
import { ORIGINAL_CONDITION_PHASE } from '../src/campaign/rules/OriginalConditionPhase.mjs';
import { ORIGINAL_MARKET_PLANETS } from '../src/campaign/rules/OriginalMarketPlanet.mjs';
import { extractNativeSaveEconomy, summarizeNativeSaveEconomy } from './lib/campaign-native-save.mjs';
const project = fileURLToPath(new URL('..', import.meta.url));
const within = (parent, target) => { const relative = path.relative(parent, target); return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
export async function captureNativeSaveEconomy(saveDirectory, outputFile, options = {}) {
  const projectRoot = await fs.realpath(project), artifacts = await fs.realpath(path.join(project, 'artifacts'));
  if (!within(projectRoot, artifacts)) throw Error('Artifacts directory must resolve inside the project');
  const source = await fs.realpath(path.resolve(saveDirectory));
  const output = path.resolve(outputFile), parent = await fs.realpath(path.dirname(output));
  if (!(parent === artifacts || within(artifacts, parent)) || within(source, parent) || source === parent || path.extname(output) !== '.json') throw Error('Output must be a JSON file inside project artifacts, outside the source save');
  const existing = await fs.lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw Error('Output must not be a link or non-file');
  const campaignPath = path.join(source, 'campaign.xml'), descriptorPath = path.join(source, 'descriptor.xml');
  if ((await fs.stat(campaignPath)).size > 256 * 1024 * 1024 || (await fs.stat(descriptorPath)).size > 4 * 1024 * 1024) throw Error('Save size budget exceeded');
  const bytes = await fs.readFile(campaignPath), descriptor = await fs.readFile(descriptorPath);
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const capture = extractNativeSaveEconomy(decoder.decode(bytes), decoder.decode(descriptor));
  const hash = buffer => createHash('sha256').update(buffer).digest('hex');
  if (capture.source.campaignSha256 !== hash(bytes) || capture.source.descriptorSha256 !== hash(descriptor)) throw Error('Source encoding did not preserve input bytes');
  const sourceFiles = [
    'starfarer.api/com/fs/starfarer/api/characters/AdminData.java',
    'starfarer.api/com/fs/starfarer/api/characters/FullName.java',
    'starfarer.api/com/fs/starfarer/api/util/Misc.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/tutorial/TutorialMissionIntel.java',
    'starfarer_obf/com/fs/starfarer/campaign/PlayerCharacterData.java',
    'starfarer_obf/com/fs/starfarer/campaign/CharacterStats.java',
    'starfarer_obf/com/fs/starfarer/rpg/Person.java',
    'starfarer_obf/com/fs/starfarer/rpg/OfficerData.java',
    'starfarer_obf/com/fs/starfarer/campaign/fleet/FleetData.java',

    'starfarer.api/com/fs/starfarer/api/campaign/BaseCampaignEventListener.java',
    'starfarer.api/com/fs/starfarer/api/campaign/listeners/EconomyTickListener.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/events/BaseEventPlugin.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/events/CoreEventProbabilityManager.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/events/RepTrackerEvent.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/events/nearby/NearbyEventsEvent.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/PlaythroughLog.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/BasePLStat.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/PLSnapshot.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/PLStatLevel.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/PLStatFleet.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/PLStatCredits.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/PLStatSupplies.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/PLStatFuel.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/PLStatCargo.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/PLStatCrew.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/PLStatMarines.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/plog/PLStatColonies.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/tutorial/GalatianAcademyStipend.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/terrain/BaseTiledTerrain.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/terrain/HyperspaceAbyssPluginImpl.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/terrain/BaseHyperspaceAbyssPlugin.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/terrain/HyperspaceAbyssPlugin.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/HullModItemManager.java',
    'starfarer.api/com/fs/starfarer/api/impl/PlayerFleetPersonnelTracker.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/enc/EncounterManager.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/events/OfficerManagerEvent.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/command/WarSimScript.java',
    'starfarer.api/com/fs/starfarer/api/impl/combat/threat/DisposableThreatFleetManager.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/fleets/DisposableFleetManager.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/fleets/PlayerVisibleFleetManager.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/fleets/BaseLimitedFleetManager.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/intel/SystemBountyIntel.java',
    'starfarer.api/com/fs/starfarer/api/campaign/econ/MonthlyReport.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/CoreScript.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/shared/SharedData.java',
    'starfarer.api/com/fs/starfarer/api/util/MutableValue.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/ShipQuality.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/intel/BaseIntelPlugin.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/intel/bases/PirateActivity.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/intel/bases/PirateBaseIntel.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/intel/bases/LuddicPathBaseIntel.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/LocalResourcesSubmarketPlugin.java',
    'starfarer_obf/com/fs/starfarer/campaign/econ/Submarket.java',
    'starfarer_obf/com/fs/starfarer/campaign/fleet/CargoData.java',
    'starfarer_obf/com/fs/starfarer/campaign/ui/trade/CargoItemStack.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/BaseSubmarketPlugin.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/submarkets/OpenMarketPlugin.java',
    'starfarer_obf/com/fs/starfarer/campaign/save/CampaignGameManager.java',
    'starfarer_obf/com/fs/starfarer/campaign/econ/Market.java',
    'starfarer_obf/com/fs/starfarer/campaign/econ/Economy.java',
    'starfarer_obf/com/fs/starfarer/campaign/econ/reach/ReachEconomy.java',
    'starfarer_obf/com/fs/starfarer/campaign/econ/CommodityOnMarket.java',
    'starfarer_obf/com/fs/starfarer/campaign/econ/PriceCalculator.java',
    'starfarer_obf/com/fs/starfarer/campaign/econ/reach/MainWorkTask2.java',
    'starfarer_obf/com/fs/starfarer/campaign/econ/reach/CommodityMarketData.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/PopulationAndInfrastructure.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/population/CoreImmigrationPluginImpl.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/population/PopulationComposition.java',
    'starfarer.api/com/fs/starfarer/api/util/Misc.java',
    'starfarer_obf/com/fs/starfarer/campaign/econ/MarketCondition.java',
    'starfarer_obf/com/fs/starfarer/campaign/econ/MarketDemand.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/BaseIndustry.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/CoreLifecyclePluginImpl.java',
    'starfarer.api/com/fs/starfarer/api/combat/MutableStat.java',
    'starfarer.api/com/fs/starfarer/api/combat/StatBonus.java',
    'starfarer.api/com/fs/starfarer/api/combat/MutableStatWithTempMods.java',
    'starfarer_obf/com/fs/starfarer/campaign/rules/Memory.java',
    'starfarer.api/com/fs/starfarer/api/campaign/SpecialItemData.java',
    'starfarer_obf/com/fs/starfarer/campaign/CampaignPlanet.java',
    'starfarer_obf/com/fs/starfarer/campaign/BaseCampaignEntity.java',
    'starfarer_obf/com/fs/starfarer/campaign/CustomCampaignEntity.java',
    'starfarer_obf/com/fs/starfarer/campaign/CampaignEngine.java',
    'starfarer_obf/com/fs/starfarer/campaign/ListenerManager.java',
    'fs.common_obf/com/fs/util/container/repo/ObjectRepository.java',
    'fs.common_obf/com/fs/util/container/repo/ObjectRepository.java',
    'starfarer.api/com/fs/starfarer/api/campaign/listeners/ListenerUtil.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/intel/events/LuddicChurchHostileActivityFactor.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/econ/LuddicMajority.java',
    'starfarer_obf/com/fs/starfarer/campaign/Faction.java',
    'starfarer_obf/com/fs/starfarer/campaign/FactionManager.java',
    'starfarer_obf/com/fs/starfarer/util/DynamicStats.java',
    'starfarer_obf/com/fs/starfarer/campaign/BaseLocation.java',
    'starfarer.api/com/fs/starfarer/api/campaign/RepLevel.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/ids/Stats.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/rulecmd/HA_CMD.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/intel/events/LuddicChurchHostileActivityFactor.java',
    'starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/ConstructionQueue.java',
    'starfarer_obf/com/fs/starfarer/combat/entities/terrain/Planet.java',
    'starfarer_obf/com/fs/starfarer/loading/specs/PlanetSpec.java',
  ];
  capture.source.formatEvidence = {};
  for (const file of sourceFiles) capture.source.formatEvidence[file] = { sha256: hash(await fs.readFile(path.join(project, '../decompiled', file))) };
  capture.source.formatEvidence['core:data/config/planets.json'] = { sha256: hash(await fs.readFile(path.join(project, '../starsector-core/data/config/planets.json'))) };
  for (const [key, evidence] of Object.entries(ORIGINAL_MARKET_PLANETS.sources)) {
    const sourceKey = key.startsWith('decompiled/') ? key.slice('decompiled/'.length) : key.replace('starsector-core/', 'core:');
    if (capture.source.formatEvidence[sourceKey]?.sha256 !== evidence.sha256) throw Error('Planet getter reference is stale; inspect and reimport before capturing');
  }
  for (const [key,evidence] of Object.entries({...ORIGINAL_ADMINISTRATORS.sources,...ORIGINAL_CHARACTER_INDUSTRY_STATS.sources,...ORIGINAL_GROUND_DEFENSES.sources,...ORIGINAL_MILITARY_BASES.sources,...ORIGINAL_SENSORS.sources,...ORIGINAL_SHIP_SELECTION.sources,...ORIGINAL_FLEET_COMPOSITION.sources,...ORIGINAL_FLEET_MEMBERS.sources,...ORIGINAL_FACTION_PERSONS.sources,...fleetConstructionReference.sources,...fleetAccidentReference.sources})) {
    const sourceKey=key.startsWith('decompiled/')?key.slice('decompiled/'.length):key.replace('starsector-core/','core:').replace('starsector-web/','web:');
    const sha256=hash(await fs.readFile(path.join(project,'..',key)));
    if(sha256!==evidence.sha256)throw Error('Administrator/character/ground-defense/military/sensor/ship-selection/fleet-composition/member reference is stale; inspect and reimport before capturing');
    capture.source.formatEvidence[sourceKey]={sha256};
  }
  for (const [key, evidence] of Object.entries({...ORIGINAL_CONDITION_PHASE.sources,...ORIGINAL_STORAGE.sources})) {
    const sourceKey = key.replace('decompiled:', '');
    const file = key.startsWith('decompiled:') ? '../decompiled/' + key.slice(11) : '../starsector-core/' + key.slice(5);
    const sha256 = hash(await fs.readFile(path.join(project, file)));
    if (sha256 !== evidence.sha256) throw Error('Condition/storage reference is stale; inspect and reimport before capturing');
    capture.source.formatEvidence[sourceKey] = { sha256 };
  }
  if (options.nativeClock === true) capture.clockCapture = await captureNativeClock(capture.clock);
  if (!bytes.equals(await fs.readFile(campaignPath)) || !descriptor.equals(await fs.readFile(descriptorPath))) throw Error('Save changed while being read; no capture written');
  const temporary = path.join(parent, '.native-economy-' + randomUUID() + '.tmp');
  try { await fs.writeFile(temporary, JSON.stringify(capture, null, 2) + '\n', { flag: 'wx' }); await fs.rename(temporary, output); }
  finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  return summarizeNativeSaveEconomy(capture);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const nativeClock = process.argv.includes('--native-clock'), args = process.argv.slice(2).filter(arg => arg !== '--native-clock');
  if (args.length !== 4 || args[0] !== '--save-dir' || args[2] !== '--out') { console.error('Usage: node scripts/capture-campaign-native-save.mjs --save-dir <save directory> --out <project artifacts/file.json> [--native-clock]'); process.exitCode = 1; }
  else captureNativeSaveEconomy(args[1], args[3], { nativeClock }).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
