import { combatSkillErrors } from '../extensions/CombatSkills';
import type { CombatSkillLoadout } from '../extensions/CombatSkills';
import type { CombatOutcome, CombatRequest, FleetMember, GameState } from './GameState';

const fail = (label: string): never => { throw new Error(`存档数据无效：${label}`); };
const object = (value: unknown, label: string): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(label);
const text = (value: unknown, label: string): string =>
  typeof value === 'string' && value.trim() ? value : fail(label);
const number = (value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : fail(label);
const integer = (value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number => {
  const result = number(value, label, max);
  return Number.isSafeInteger(result) ? result : fail(label);
};
const array = (value: unknown, label: string): unknown[] => Array.isArray(value) ? value : fail(label);
const unique = <T>(items: T[], key: (item: T) => string, label: string): T[] =>
  new Set(items.map(key)).size === items.length ? items : fail(label);

export function decodeFleetMember(value: unknown): FleetMember {
  const raw = object(value, '舰船');
  const status = raw.status;
  if (status !== 'ready' && status !== 'destroyed') fail('舰船状态');
  const hullFraction = number(raw.hullFraction, '结构', 1);
  if ((status === 'destroyed') !== (hullFraction === 0)) fail('结构与战沉状态不一致');
  let armor: FleetMember['armor'] = null;
  if (raw.armor !== null) {
    const grid = object(raw.armor, '装甲');
    const cols = integer(grid.cols, '装甲列'), rows = integer(grid.rows, '装甲行');
    const fractions = array(grid.fractions, '装甲格').map(v => number(v, '装甲值', 1));
    if (!cols || !rows || fractions.length !== cols * rows) fail('装甲网格');
    armor = { cols, rows, fractions };
  }
  if (combatSkillErrors(raw.captainSkills).length) fail('舰长战斗技能');
  const skills = raw.captainSkills as CombatSkillLoadout | undefined;
  return {
    ...(raw.hullMods === undefined ? {} : { hullMods: unique(array(raw.hullMods, '舰装').map(id => text(id, '舰装 ID')), id => id, '重复舰装') }),
    ...(skills === undefined ? {} : { captainSkills: { ...skills } }),
    ...(raw.fighterWings === undefined ? {} : { fighterWings: array(raw.fighterWings, '舰载机联队').map(input => {
      const wing = object(input, '舰载机联队');
      if (wing.role !== 'FIGHTER' && wing.role !== 'BOMBER') fail('舰载机职责');
      const count = integer(wing.count, '联队数量', 100), rebuildSeconds = number(wing.rebuildSeconds, '补充时间');
      if (!count || rebuildSeconds <= 0) fail('联队数量或补充时间');
      return { specId: text(wing.specId, '舰载机舰体'), role: wing.role as 'FIGHTER' | 'BOMBER', count, rebuildSeconds,
        ...(wing.tags === undefined ? {} : {tags: array(wing.tags, '联队标记').map(t => text(t, '联队标记'))}) };
    }) }),
    ...(raw.weaponGroups === undefined ? {} : { weaponGroups: unique(array(raw.weaponGroups, '武器组').map(input => {
      const group = object(input, '武器组');
      if (group.mode !== 'LINKED' && group.mode !== 'ALTERNATING') fail('武器组模式');
      if (typeof group.isAutofire !== 'boolean') fail('武器组自动开火');
      return { index: integer(group.index, '武器组编号', 6), mode: group.mode as 'LINKED' | 'ALTERNATING', isAutofire: group.isAutofire as boolean,
        weaponSlotIds: unique(array(group.weaponSlotIds, '武器组挂点').map(v => text(v, '武器组挂点')), id => id, '重复武器组挂点') };
    }), g => String(g.index), '重复武器组编号') }),
    id: text(raw.id, '舰船 ID'), hullId: text(raw.hullId, '舰体 ID'), status: status as FleetMember['status'],
    hullFraction, combatReadiness: number(raw.combatReadiness, 'CR', 1), armor,
    weapons: unique(array(raw.weapons, '装备').map(value => {
      const weapon = object(value, '装备');
      return {
        slotId: text(weapon.slotId, '挂点'), weaponId: text(weapon.weaponId, '武器'),
        ammo: weapon.ammo === null ? null : integer(weapon.ammo, '弹药')
      };
    }), w => w.slotId, '重复挂点')
  };
}

function roster(value: unknown): FleetMember[] {
  const ships = unique(array(value, '参战名单').map(decodeFleetMember), s => s.id, '重复舰船 ID');
  return ships.length ? ships : fail('空舰队');
}
const kind = (value: unknown): CombatRequest['kind'] => value === 'sandbox' || value === 'fleet' ? value : fail('战斗模式');

export function decodeCombatRequest(value: unknown): CombatRequest {
  const raw = object(value, '出击');
  const result: CombatRequest = {
    id: text(raw.id, '出击 ID'), kind: kind(raw.kind), seed: integer(raw.seed, '随机种子', 0xffffffff),
    playerFleet: roster(raw.playerFleet), enemyFleet: roster(raw.enemyFleet)
  };
  const all = [...result.playerFleet, ...result.enemyFleet];
  unique(all, s => s.id, '敌我舰船 ID 冲突');
  if (all.some(s => s.status !== 'ready')) fail('战沉舰船不能出击');
  return result;
}

export function decodeCombatOutcome(value: unknown): CombatOutcome {
  const raw = object(value, '战果');
  if (typeof raw.victory !== 'boolean') fail('胜负');
  return {
    encounterId: text(raw.encounterId, '战果 ID'), kind: kind(raw.kind), victory: raw.victory as boolean,
    duration: number(raw.duration, '时长'), playerFleet: roster(raw.playerFleet), enemyFleet: roster(raw.enemyFleet)
  };
}

/** Version dispatch belongs here. Never guess how to read a future schema or silently reset it. */
export function decodeGameState(value: unknown): GameState {
  const raw = object(value, '根节点');
  if (raw.schemaVersion !== 1) throw new Error(`不支持存档版本 ${String(raw.schemaVersion)}，原存档已保留。`);
  const inventory = object(raw.inventory, '库存');
  const state: GameState = {
    schemaVersion: 1, gameId: text(raw.gameId, '游戏 ID'), revision: integer(raw.revision, '修订号'),
    nextEncounter: integer(raw.nextEncounter, '下一出击编号'), fleet: roster(raw.fleet),
    inventory: {
      credits: number(inventory.credits, '资金'), supplies: number(inventory.supplies, '补给'), fuel: number(inventory.fuel, '燃料'),
      cargo: Object.fromEntries(Object.entries(object(inventory.cargo, '货舱')).map(([id, count]) => [text(id, '货物 ID'), number(count, '货物数量')]))
    },
    sandboxHullId: text(raw.sandboxHullId, '沙盒舰体'),
    pendingCombat: raw.pendingCombat === null ? null : decodeCombatRequest(raw.pendingCombat),
    outcomes: unique(array(raw.outcomes, '战果记录').map(decodeCombatOutcome), o => o.encounterId, '重复战果')
  };
  if (state.nextEncounter < 1 || state.outcomes.length > 20) fail('出击序列/战果记录');
  const sequence = (id: string) => {
    const prefix = `${state.gameId}:`;
    const n = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
    if (!Number.isSafeInteger(n) || n < 1 || n >= state.nextEncounter || id !== `${prefix}${n}`) fail('出击编号');
    return n;
  };
  let previous = 0;
  for (const outcome of state.outcomes) {
    const n = sequence(outcome.encounterId);
    if (n <= previous) fail('战果顺序');
    previous = n;
  }
  if (state.pendingCombat) {
    if (sequence(state.pendingCombat.id) <= previous) fail('重复或过期的战前检查点');
    if (state.pendingCombat.kind === 'fleet') for (const member of state.pendingCombat.playerFleet) {
      if (JSON.stringify(state.fleet.find(s => s.id === member.id)) !== JSON.stringify(member)) fail('舰队检查点不一致');
    }
  }
  return state;
}
