import { deploymentCost } from '../simulation/CombatDeployment';
import type { ShipSpec } from '../content/ShipSpec';
import { effectiveHullModWeaponSpec } from '../extensions/HullMods';
import { contentRegistry } from '../content/ContentRegistry';
import { validateShipSpec } from '../modding/ContentValidation';
import { Vector2 } from '../math/Vector2';
import { Ship } from '../simulation/Ship';
import type { CombatSession } from '../runtime/CombatSession';
import type { CombatOutcome, CombatRequest, FleetMember } from './GameState';
import { decodeCombatRequest, decodeFleetMember } from './GameStateCodec';

const fraction = (n: number) => Math.max(0, Math.min(1, n));

/** The only adapter allowed to translate live Ship objects to persistent fleet records. */
export function captureFleetMember(ship: Ship, memberId: string): FleetMember {
  return decodeFleetMember({
    id: memberId, hullId: ship.spec.id, sourceVariantId:ship.spec.sourceVariantId, status: ship.isDead || ship.hullHp <= 0 ? 'destroyed' : 'ready',
    hullFraction: ship.isDead ? 0 : fraction(ship.hullHp / ship.maxHullHp),
    combatReadiness: fraction(ship.currentCR - ship.pendingCombatCRLoss),
    armor: {
      cols: ship.armor.cols, rows: ship.armor.rows,
      fractions: Array.from(ship.armor.cells, value => fraction(value / ship.armor.maxCellArmor))
    },
    hullMods: [...(ship.spec.hullMods ?? [])], sMods: [...(ship.spec.sMods ?? [])], captainSkills: { ...ship.spec.captainSkills },
    fighterWings: structuredClone(ship.spec.fighterWings ?? []),
    weaponGroups: ship.weaponGroups.map(({index,mode,isAutofire,weaponSlotIds}) => ({index,mode,isAutofire,weaponSlotIds:[...weaponSlotIds]})),
    weapons: ship.weapons.map(w => ({ slotId: w.slotId, weaponId: w.spec.id, ammo: Number.isFinite(w.ammo) ? w.ammo : null }))
  });
}

export function createFleetMember(hullId: string, memberId: string): FleetMember {
  const spec = contentRegistry.getShip(hullId);
  if (!spec) throw new Error(`不可用的舰体：${hullId}`);
  return captureFleetMember(new Ship(memberId, spec), memberId);
}

export function fleetMemberSpec(member: FleetMember): ShipSpec {
  const base = contentRegistry.getShip(member.hullId);
  if (!base) throw new Error(`存档所需舰体未加载：${member.hullId}`);
  return { ...base, sourceVariantId:member.sourceVariantId ?? base.sourceVariantId, hullMods: member.hullMods ?? base.hullMods, sMods: member.sMods ?? base.sMods, captainSkills: member.captainSkills ?? base.captainSkills,
    fighterWings: member.fighterWings ?? base.fighterWings, defaultWeaponGroups: member.weaponGroups ?? base.defaultWeaponGroups,
    weaponSlots: base.weaponSlots.map(slot => ({ ...slot, defaultWeaponId: member.weapons.find(w => w.slotId === slot.slotId)?.weaponId })) };
}

export function validateMemberContent(member: FleetMember): void {
  member = decodeFleetMember(member);
  const spec = fleetMemberSpec(member);
  const authored = contentRegistry.getShip(member.hullId)!;
  for (const slot of authored.weaponSlots) if ((slot.builtIn || slot.weaponType === 'BUILT_IN') && slot.defaultWeaponId
    && member.weapons.find(w => w.slotId === slot.slotId)?.weaponId !== slot.defaultWeaponId) throw new Error(`存档不能移除或替换内置武器：${slot.slotId}`);
  const slots = new Map(spec.weaponSlots.map(s => [s.slotId, s]));
  for (const weapon of member.weapons) {
    const weaponSpec = contentRegistry.getWeapon(weapon.weaponId);
    if (!slots.has(weapon.slotId) || !weaponSpec) throw new Error(`存档装备未加载或挂点不存在：${weapon.weaponId}`);
    const fitted = effectiveHullModWeaponSpec(spec, weaponSpec);
    if (fitted.maxAmmo === undefined ? weapon.ammo !== null : weapon.ammo === null || weapon.ammo > fitted.maxAmmo) {
      throw new Error(`存档弹药与武器定义不兼容：${weapon.weaponId}`);
    }
  }
  validateShipSpec(spec, { allowExistingId: true, requireBundledAssets: false });
  for (const wing of spec.fighterWings ?? []) if (contentRegistry.getShip(wing.specId)?.hullSize !== 'FIGHTER') throw new Error(`存档所需舰载机未加载：${wing.specId}`);
  if (member.armor) {
    const probe = new Ship('content-probe', spec);
    if (probe.armor.cols !== member.armor.cols || probe.armor.rows !== member.armor.rows) {
      throw new Error(`存档装甲网格与当前舰体不兼容：${member.hullId}`);
    }
  }
}

function applyMember(ship: Ship, member: FleetMember): void {
  // Loadout and derived stats are constructed before AI, systems and flight decks.
  ship.hullHp = member.hullFraction * ship.maxHullHp;
  ship.currentCR = member.combatReadiness;
  if (member.armor) {
    ship.armor.cells.set(member.armor.fractions.map(f => f * ship.armor.maxCellArmor));
    ship.armor.dirtyVersion++;
  }
  for (const weapon of ship.weapons) {
    const saved = member.weapons.find(w => w.slotId === weapon.slotId)!;
    weapon.ammo = saved.ammo ?? Number.POSITIVE_INFINITY;
  }
}

export class CombatHandoff {
  private readonly bindings = new Map<string, Ship>();
  public readonly request: CombatRequest;

  constructor(request: CombatRequest) {
    this.request = decodeCombatRequest(request);
    for (const member of [...this.request.playerFleet, ...this.request.enemyFleet]) validateMemberContent(member);
    if(this.request.kind==='fleet')for(const [fleet,ids] of [[this.request.playerFleet,this.request.initialPlayerIds],[this.request.enemyFleet,this.request.initialEnemyIds]] as const){
      const limit=this.request.deploymentPointLimit??240, initial=new Set(ids??[fleet[0].id]);
      const costs=fleet.map(m=>({id:m.id,cost:deploymentCost(fleetMemberSpec(m))}));
      if(costs.some(e=>e.cost>limit)||costs.filter(e=>initial.has(e.id)).reduce((sum,e)=>sum+e.cost,0)>limit)throw Error('舰队首发或单舰部署点超过上限。');
    }
  }

  public deploy(session: CombatSession): void {
    const request = this.request;
    session.beginEncounter(fleetMemberSpec(request.playerFleet[0]), fleetMemberSpec(request.enemyFleet[0]), request.seed);
    this.bindings.clear();
    for (const [side, roster] of [[true, request.playerFleet], [false, request.enemyFleet]] as const) {
      roster.forEach((member, index) => {
        const ship = index === 0 ? (side ? session.engine.playerShip : session.engine.enemyShip)
          : session.engine.addShip(fleetMemberSpec(member), side, new Vector2(index * 600, side ? 600 : -600), side ? -Math.PI / 2 : Math.PI / 2);
        applyMember(ship, member);
        this.bindings.set(member.id, ship);
      });
    }
    if(request.kind==='fleet'){
      const initial=[...(request.initialPlayerIds??[request.playerFleet[0].id]),...(request.initialEnemyIds??[request.enemyFleet[0].id])];
      session.engine.deployment.configure(session.engine.allCapitalShips,new Set(initial.map(id=>this.bindings.get(id)!.id)),request.deploymentPointLimit??240,[1]);
    }
    // One preparation after the complete roster/loadout is installed, not one per ship.
    session.refreshPresentationAssets();
  }

  public collect(session: CombatSession): CombatOutcome {
    const report = session.engine.battleResult;
    if (!report) throw new Error('战斗尚未结束，不能写回舰队。');
    if (this.request.kind === 'fleet' && session.engine.allCapitalShips.some(ship => !session.engine.isTransientCombatShip(ship) && ![...this.bindings.values()].includes(ship))) {
      throw new Error('存在绕过出击接口加入的主舰，已拒绝不完整结算。');
    }
    const capture = (roster: FleetMember[]) => roster.map(member => {
      const ship = this.bindings.get(member.id);
      if (!ship || !session.engine.allCapitalShips.includes(ship)) throw new Error('战斗实例已更换，不能写回旧出击。');
      return session.engine.deployment.isReserve(ship.id) ? structuredClone(member) : captureFleetMember(ship, member.id);
    });
    return {
      encounterId: this.request.id, kind: this.request.kind, victory: report.isVictory,
      duration: report.combatDuration, playerFleet: capture(this.request.playerFleet), enemyFleet: capture(this.request.enemyFleet)
    };
  }
}
