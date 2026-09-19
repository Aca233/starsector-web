import { validateResources, validateHooks } from '../Dependencies';
import { requireSound } from '../../audio/SoundBank';
import { DefinitionRegistry } from '../DefinitionRegistry';
import type { ShipSystemDefinition } from './Types';
import { nativeCombatSystems } from './NativeCombatSystems';
import { canisterFlak } from './NativeWeaponSystems';
import { flareSystems } from './FlareSystems';
import { lidarArray } from './LidarArray';
import { recallDevice } from './RecallDevice';
import { droneLaunchers } from './DroneLaunchers';
import { energyLashSystems } from './EnergyLashSystems';
import { pulseDrives } from './PulseDrive';
import { empEmitter } from './EmpEmitter';
import { chiralFigment } from './ChiralFigment';
import { droneStrike } from './DroneStrike';
import { moteControl } from './MoteControl';
import { convulsiveLunge } from './ConvulsiveLunge';
import { targetingFeed, reserveWing } from './CarrierSupportSystems';
import { burnDrive } from './BurnDrive';
import { fortressShield } from './FortressShield';
import { mineStrike } from './MineStrike';
import { maneuveringJets } from './ManeuveringJets';
import { plasmaJets } from './PlasmaJets';
import { highEnergyFocus } from './HighEnergyFocus';
import { ammoFeed } from './AmmoFeed';
import { displacer, displacerDegraded, phaseTeleporter, droneSkimmer } from './PhaseTeleporter';
export const shipSystemDefinitions = new DefinitionRegistry<ShipSystemDefinition>('ship system', d => {
  if (typeof d.name !== 'string' || !d.name.trim() || !Array.isArray(d.sourceIds) || d.sourceIds.some(id=>typeof id !== 'string' || !id.trim()) || new Set(d.sourceIds).size !== d.sourceIds.length) throw new Error(d.id + ': invalid name/source IDs');
  for (const value of [d.description, d.implementationDetails]) if (value !== undefined && typeof value !== 'string') throw new Error(d.id + ': invalid description');
  validateResources(d.resources); validateHooks(d, ['installReason','statusText','passiveModifiers','weaponEnabled','modifiers','onActivate','onActive','onAdvance','advanceAI','canActivate','initialize','onReset','selectTarget','isExecuting','onEnergyLash','canVent','preventAIVenting','motionControl']);
  for (const group of [d.controls,d.visuals,d.phase]) if (group) for (const value of Object.values(group)) if (typeof value !== 'boolean') throw new Error(d.id + ': invalid capability flag');
  for (const value of [d.toggle,d.hardFlux,d.unavailable,d.usesChargesForActivation]) if (value !== undefined && typeof value !== 'boolean') throw new Error(d.id + ': invalid boolean');
  for (const key of [d.audio?.activate,d.audio?.loop,d.audio?.deactivate]) if (key !== undefined) requireSound(key,false);
  if (d.audio?.loopVolume !== undefined && (!Number.isFinite(d.audio.loopVolume) || d.audio.loopVolume < 0)) throw new Error(d.id + ': invalid volume');
  for (const key of ['chargeUp','chargeDown','cooldown'] as const) if (!Number.isFinite(d[key]) || d[key] < 0) throw new Error(`${d.id}.${key} must be nonnegative`);
  if (!(d.active >= 0) || (d.active === Infinity && !d.toggle)) throw new Error(`${d.id}: invalid active duration`);
  if (d.charges !== undefined && (!Number.isInteger(d.charges) || d.charges < 1)) throw new Error(`${d.id}: invalid charges`);
  if (d.initialCharges !== undefined && (!Number.isInteger(d.initialCharges) || d.initialCharges < 0 || d.initialCharges > (d.charges ?? 0))) throw new Error(d.id + ': invalid initial stock');
  for (const value of [d.chargeRegen ?? 0, d.fluxPerUseFraction ?? 0, d.fluxPerUseFlat ?? 0, d.fluxPerUseDissipationFraction ?? 0]) if (!Number.isFinite(value) || value < 0) throw new Error(`${d.id}: invalid cost/regen`);
  for (const alias of d.sourceIds) if (shipSystemDefinitions.all().some(other => other.sourceIds.includes(alias))) throw new Error(`Duplicate source system ${alias}`);
});
shipSystemDefinitions.register({id:'NONE', sourceIds:[], name:'无', chargeUp:0, active:0, chargeDown:0, cooldown:0});
for (const definition of [burnDrive, fortressShield, mineStrike, maneuveringJets, plasmaJets, highEnergyFocus, ammoFeed, displacer, displacerDegraded, phaseTeleporter, droneSkimmer, canisterFlak, targetingFeed, reserveWing, lidarArray, recallDevice, ...droneLaunchers, ...energyLashSystems, ...pulseDrives, empEmitter, chiralFigment, droneStrike, moteControl, convulsiveLunge, ...flareSystems, ...nativeCombatSystems]) shipSystemDefinitions.register(definition);
// Only this audited set has side-effect-free modifiers/passiveModifiers/isExecuting.
// Registration by external extensions does not confer this property.
const nativeStatDefinitions = new WeakSet(shipSystemDefinitions.all());
// Native advanceAI/canActivate/selectTarget only change ships/system state here;
// projectile effects are deferred to dispatchEvents, outside the AI phase.
export function hasNativeThreatPhaseAI(definition: ShipSystemDefinition): boolean {
  return nativeStatDefinitions.has(definition);
}
export function hasNativeSystemStats(definition: ShipSystemDefinition): boolean {
  return nativeStatDefinitions.has(definition);
}
export function systemFromSource(id: string, owner: string): string {
  if (!id) return 'NONE';
  const definition = shipSystemDefinitions.all().find(d => d.sourceIds.includes(id));
  if (!definition) throw new Error(`${owner}: unsupported source ship system "${id}" (not mapped to NONE)`);
  return definition.id;
}

/** Resolve old imported placeholders when a real adapter is registered; no re-import required. */
export function resolveSystemId(id: string): string {
  const sourceId = id.startsWith('UNADAPTED_SOURCE_') ? id.slice('UNADAPTED_SOURCE_'.length) : id;
  return shipSystemDefinitions.all().find(d => !d.unavailable && d.sourceIds.includes(sourceId))?.id ?? id;
}

/** Explicit unavailable adapter, NOT a source alias. Strict source loading still rejects it. */
export function registerUnavailableSourceSystem(sourceId: string, row: Record<string, string>): ShipSystemDefinition {
  if (!/^[A-Za-z0-9_-]+$/.test(sourceId)) throw new Error('Invalid source system ID: ' + sourceId);
  const implemented = shipSystemDefinitions.all().find(d => !d.unavailable && d.sourceIds.includes(sourceId));
  if (implemented) return implemented;
  const id = 'UNADAPTED_SOURCE_' + sourceId;
  const existing = shipSystemDefinitions.get(id);
  if (existing) return existing;
  const number = (key: string) => {
    const value = row[key] ? Number(row[key]) : 0;
    if (!Number.isFinite(value) || value < 0) throw new Error(sourceId + ': invalid timing ' + key);
    return value;
  };
  const definition: ShipSystemDefinition = {
    id, sourceIds: [], name: '未适配: ' + (row.name || sourceId), unavailable: true,
    description: '尚未实现原版战斗效果，当前不可启用。',
    implementationDetails: '仅保留原版系统名称和时序元数据；未模拟效果、消耗、控制限制或 AI。不会消耗使用次数或产生幅能。',
    chargeUp: number('charge up'), active: number('active'), chargeDown: number('down'), cooldown: number('cooldown'),
    toggle: row.toggle?.toLowerCase() === 'true',
    ...(number('max uses') > 0 ? { charges: number('max uses'), chargeRegen: number('regen') } : {})
  };
  shipSystemDefinitions.register(definition);
  return shipSystemDefinitions.require(id);
}
