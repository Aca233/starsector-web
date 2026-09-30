import type { Design } from '../../studio/DesignModel';
import type { CombatEngine } from '../simulation/CombatEngine';
import type { ShipSpec } from '../content/ShipSpec';
import type { CommandResult } from './CombatCommands';
import { immutableCopy } from '../extensions/Immutable';
import { deploymentCost } from '../simulation/CombatDeployment';
import { modManager } from '../modding/ModManager';

export type DeploymentCommand =
  | { kind: 'fleet'; ids: readonly string[] }
  | { kind: 'simulation-limit'; limit: number }
  | { kind: 'simulation-wave'; ally: readonly string[]; enemy: readonly string[]; designs?: readonly Design[] };
export type PreparedDeployment = Exclude<DeploymentCommand, { kind: 'simulation-wave' }> |
  { kind: 'simulation-wave'; entries: { specId: ShipSpec; cost: number; isPlayer: boolean }[] };
const validIds = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.length <= 4096
  && ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 4096) && new Set(ids).size === ids.length;
/** Snapshot UI intent before the first await; ignore any supplied cost/spec/team fields. */
export function copyDeploymentCommand(command: DeploymentCommand): DeploymentCommand {
  if (!command || typeof command !== 'object') throw Error('无效的部署命令。');
  switch (command.kind) {
    case 'fleet':
      if (!validIds(command.ids) || !command.ids.length) throw Error('请选择不重复的待命舰船。');
      return { kind: 'fleet', ids: [...command.ids] };
    case 'simulation-limit':
      if (!Number.isInteger(command.limit) || command.limit <= 0 || command.limit > 20000) throw Error('部署上限无效。');
      return { kind: 'simulation-limit', limit: command.limit };
    case 'simulation-wave': {
      if (!validIds(command.ally) || !validIds(command.enemy) || !(command.ally.length + command.enemy.length) || command.ally.length + command.enemy.length > 4096) throw Error('请选择不重复的模拟舰船。');
      const designs = command.designs ?? [];
      if (!Array.isArray(designs) || designs.length > 100 || JSON.stringify(designs).length > 2_000_000)
        throw Error('模拟装配数据超过限制。');
      return { kind: 'simulation-wave', ally: [...command.ally], enemy: [...command.enemy], designs: structuredClone(designs) };
    }
    default: throw Error('未知的部署命令。');
  }
}
/** Pure preparation. The catalogue/compiler is lazy, and never registers a hull or mutates combat. */
export async function prepareDeployment(command: DeploymentCommand): Promise<PreparedDeployment> {
  if (command.kind !== 'simulation-wave') return command;
  const { simulationRoster, prepareSimulationOption, savedSimulationId } = await import('../content/SimulationCatalog');
  const { decodeDesign } = await import('../../studio/DesignModel');
  // Browser-local storage is unavailable here in worker authority. Decode the
  // copied selection, not arbitrary ShipSpecs or caller-supplied costs.
  const designs = (command.designs ?? []).map(decodeDesign);
  const ids = designs.map(savedSimulationId), selected = new Set([...command.ally, ...command.enemy]);
  if (new Set(ids).size !== ids.length || ids.some(id => !selected.has(id))) throw Error('自定义模拟装配重复或未被选择。');
  const catalog = new Map(simulationRoster(designs).map(option => [option.id, option]));
  const entries = ([true, false] as const).flatMap(isPlayer => (isPlayer ? command.ally : command.enemy).map(id => {
    const option = catalog.get(id);
    if (!option) throw Error('模拟配装不在当前目录：' + id);
    const resolved = prepareSimulationOption(option);
    if (resolved.errors.length) throw Error(resolved.name + '：' + resolved.errors.join('；'));
    modManager.validateShipDefinition(resolved.spec);
    return { specId: immutableCopy(resolved.spec), cost: deploymentCost(resolved.spec), isPlayer };
  }));
  return { kind: 'simulation-wave', entries };
}
/** Commit under the host's tick/epoch barrier. Do not trust the UI's old DP figures. */
export function applyPreparedDeployment(engine: CombatEngine, prepared: PreparedDeployment): CommandResult {
  if (engine.battleResult) return { accepted: false, reason: '战斗已经结束，不能继续部署。' };
  switch (prepared.kind) {
    case 'fleet': engine.deployment.deploy(prepared.ids, engine.playerShip.teamId); break;
    case 'simulation-wave': engine.deploySimulationFleet(prepared.entries); break;
    case 'simulation-limit':
      if (!engine.setSimulationPointLimit(prepared.limit)) return { accepted: false, reason: '不能低于场上舰船已经占用的部署点，且只能调整模拟战斗。' };
      break;
  }
  return { accepted: true };
}
