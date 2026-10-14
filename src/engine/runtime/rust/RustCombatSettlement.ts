/** Persistent writeback reads the same native authority used for the result. */
import type { CombatOutcome, CombatRequest, FleetMember } from '../../game/GameState';
import { decodeFleetMember } from '../../game/GameStateCodec';
import type { RustCombatStartup } from './RustCombatStartup';
import type { RustCoreSnapshot, RustBodyHandle } from './RustCoreProtocol';
import { RustShipFlag } from './RustCoreProtocol';
import type { RustScenePublication } from './RustScenePublication';
const key = (h:RustBodyHandle) => h.slot + ':' + h.generation;
const fraction = (value:number) => Math.max(0,Math.min(1,value));
export function captureRustCombatOutcome(request:CombatRequest, startup:RustCombatStartup, snapshot:RustCoreSnapshot, scene:RustScenePublication):CombatOutcome {
  const report = scene.result;
  if (!report || !scene.resultReady) throw Error('战斗尚未结束，不能写回舰队。');
  const bindings = new Map(startup.members.map(member => [member.memberId,key(member.handle)]));
  const roots = new Set(scene.rosters.allCapitalShips.map(key));
  const entities = new Map(startup.content.entities.map(entity => [key(entity.handle),entity]));
  if (request.kind === 'fleet' && [...roots].some(id => !entities.get(id)?.transient && ![...bindings.values()].includes(id)))
    throw Error('存在绕过出击接口加入的主舰，已拒绝不完整结算。');
  const bodies = new Map(snapshot.bodies.map(body => [key(body.handle),body]));
  const specs = new Map(startup.content.dictionary.ships.map(entry => [entry.key,entry.spec]));
  const weapons = new Map(startup.content.dictionary.weapons.map(entry => [entry.key,entry.spec]));
  const pending = new Map(scene.pendingCR.map(entry => [key(entry.handle),entry.value]));
  const capture = (roster:readonly FleetMember[]) => roster.map(member => {
    const id = bindings.get(member.id);
    if (!id || !roots.has(id)) throw Error('战斗实例已更换，不能写回旧出击。');
    if (scene.deployment.some(row => key(row.handle) === id && row.status === 'reserve')) return structuredClone(member);
    const entity = entities.get(id), body = bodies.get(id), ship = body?.ship, spec = entity && specs.get(entity.specKey);
    if (!entity || !ship?.armor || !ship.readiness || !ship.weapons || !spec || !pending.has(id)) throw Error('Incomplete native fleet member');
    const dead = !!(ship.flags & RustShipFlag.Dead), armor = ship.armor, controller = ship.weapons;
    const mount = (component:number) => { const binding = entity.mounts.find(m => m.componentId === component); if (!binding) throw Error('Missing native settlement mount'); return binding; };
    return decodeFleetMember({ id:member.id, hullId:spec.id, sourceVariantId:spec.sourceVariantId,
      status:dead || armor.values[14] <= 0 ? 'destroyed' : 'ready', hullFraction:dead ? 0 : fraction(armor.values[14] / armor.values[13]),
      combatReadiness:fraction(ship.readiness.values[0] - pending.get(id)!),
      armor:{cols:armor.values[0],rows:armor.values[1],fractions:Array.from(armor.cells,value => fraction(value / armor.values[7]))},
      hullMods:[...(spec.hullMods ?? [])],sMods:[...(spec.sMods ?? [])],captainSkills:{...spec.captainSkills},fighterWings:structuredClone(spec.fighterWings ?? []),
      weaponGroups:controller.groups.map(group => ({index:group.values[0],mode:group.values[1] === 1 ? 'ALTERNATING' : 'LINKED',isAutofire:group.values[2] === 1,
        weaponSlotIds:Array.from(group.members,component => mount(component).sourceSlotId)})),
      weapons:controller.mounts.map(row => { const binding = mount(row[0]), weapon = weapons.get(binding.weaponKey); if (!weapon) throw Error('Missing native settlement weapon');
        return {slotId:binding.sourceSlotId,weaponId:weapon.id,ammo:weapon.maxAmmo === undefined ? null : row[17]}; }) });
  });
  return {encounterId:request.id,kind:request.kind,victory:report.isVictory,duration:report.combatDuration,
    playerFleet:capture(request.playerFleet),enemyFleet:capture(request.enemyFleet)};
}
