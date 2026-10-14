import { Ship } from '../../src/engine/simulation/Ship';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { RuntimeCombatModifiers } from '../../src/engine/extensions/RuntimeCombatModifiers';
import { contentRegistry } from '../../src/engine/content/ContentRegistry';
import { hyperionYamatoProjectile } from '../../src/engine/content/HyperionPack';
import type { Projectile } from '../../src/engine/simulation/Weapon';
import type { SystemWorld } from '../../src/engine/extensions/ship-systems/Types';
interface Exports extends WebAssembly.Exports {memory: WebAssembly.Memory; test_input(n: number): number; test_initialize(): number; test_step(): number; test_output_words(): number; test_contract(): number; test_reason(): number}
const ids = ['', 'WEB_ZHUYUAN_ECLIPSE_PROTOCOL', 'WEB_GLORIANA_BROADSIDE_EDICT', 'WEB_SC2_HYPERION_YAMATO', 'WEB_SC2_HYPERION_JUMP',
  'WEB_ADUN_ARK_FORGE', 'WEB_ADUN_ARK_BARRIER', 'WEB_ADUN_ARK_REPAIR', 'WEB_ROCINANTE_ATTITUDE', 'WEB_ROCINANTE_FIRE_CONTROL', 'WEB_ZHEFENG_COMMUTATOR'];
const states = ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'];
interface PrivateSystem { pendingActivationFlux: number; pendingActivationEvents: number; pendingActiveEvents: number; chargeRegenTimer: number; stageTimer: number; outEntryEffectLevel: number }
function lifecycleWords(s: ShipSystem) {const p = s as unknown as PrivateSystem; return [11, 1, states.indexOf(s.state), s.effectLevel, +s.isActive, +s.isCoolingDown, s.activeTimer,
  s.cooldownTimer, s.charges, s.activationSerial, p.pendingActivationFlux, p.pendingActivationEvents, p.pendingActiveEvents, p.chargeRegenTimer, p.stageTimer, p.outEntryEffectLevel, +s.disabled];}
function sourceFailureCode(reason: string | undefined): number {
  if (reason === undefined) return 0;
  const exact: Record<string, number> = { '没有舰船系统': 1, '该系统尚未接入': 1, '舰船不在战斗状态': 2, '系统离线': 3, '关闭中': 5, '系统正在运行': 6,
    '撤退中': 7, '载荷过载': 8, '正在排散载荷': 9, '载荷空间不足': 10, '充能耗尽': 11, '需要至少一门可用的能量武器': 12,
    '对应武器已失效或弹药耗尽': 13, '武备段不可用': 13, '缺少可用主攻武器': 13, '需要荣光女王指挥核心': 14,
    '需要内置旗舰反应堆': 14, '需要大和炮/反应堆核心技能': 14, '太阳核心未装配': 14, '旗舰反应堆离线': 15,
    '反应堆正供能另一技能': 16, '太阳核心正在供能另一项能力': 16, '将准星置于舰艏前方400距离外': 18, '大和炮需要舰艏对准准星（±12°）': 18,
    '将准星移至左舷或右舷后启动': 19, '先升起护盾，再启用超载': 21, '需要先展开前盾': 21, '没有可重构的受损模块或近旁舰载机': 22,
    '反冲补偿正在占用姿态喷口': 23, '刹车输入优先': 24, '推进系统停机': 25, '火控正在重分配': 26 };
  if (reason in exact) return exact[reason];
  if (reason.startsWith('冷却中（')) return 4;
  if (reason.startsWith('反应堆不足：') || reason.startsWith('太阳能不足：')) return 17;
  if (reason.includes('没有可用实弹炮廊')) return 20;
  throw Error('Unmapped actual source failure: ' + reason);
}
function makeShip(index: number): Ship {
  const ship = Object.create(Ship.prototype) as Ship;
  Object.defineProperty(ship, 'allSystems', { value: [], writable: true, configurable: true });
  const runtimeModifiers = new RuntimeCombatModifiers(), flux = new FluxTracker(1000, 0, 'FRIGATE');
  Object.assign(ship, { id: String(index + 1), spec: { id: index ? 'module' : 'web_sc2_hyperion', hullMods: ['web_sc2_hyperion_reactor'], builtInHullMods: [],
    collisionRadius: 100, hullSize: 'FRIGATE', weaponSlots: [], systemWeaponSlots: [{ slotId: 'SYS_YAMATO', x: 369, y: 0 }] },
    isDead: false, isRetreated: false, isDocked: false, retreating: false, hullHp: index ? 500 : 300,
    pos: new Vector2(index * 100, 0), vel: new Vector2(7, -3), facingRad: 0, flux, runtimeModifiers, shield: { isActive: true, radius: 1000 },
    hullStats: { hitpoints: 1000, fluxDissipation: 0, systemRangeMultiplier: 1, systemUsesBonus: 0, systemRegenMultiplier: 1, systemCooldownMultiplier: 1, systemFluxCostMultiplier: 1 },
    aimTargetWorld: new Vector2(800, 0), isPlayer: false, fireControlMode: 'MANUAL', allSystems: [], parentShip: null,
    engineController: { isFlamedOut: false, state: 'READY', engines: [] }, getFlameoutRatio: () => 0, brakeInput: false, weaponControl: {},
    weapons: [{ spec: { weaponType: 'ENERGY' }, isDisabled: false, ammo: 5 }, { spec: { weaponType: 'BALLISTIC', isPointDefense: false }, isDisabled: false, ammo: 5 }],
    teamId: 2, ecmRangePenalty: 0, getWeaponDamageMultiplier: () => 1.21 });
  Object.defineProperties(ship, { crDamageDealtMultiplier: { value: 1.07 }, isPhased: { value: false, configurable: true },
    assemblyShips: { value: [], configurable: true }, isAttachedModule: { value: index > 0 && index < 3, configurable: true } });
  return ship;
}
function shipWords(s: Ship) {const hullmods = [...(s.spec.hullMods ?? []), ...(s.spec.builtInHullMods ?? [])]; return [s.hullHp, +s.isDead, +s.isRetreated, +s.retreating, +s.isDocked, +s.isPhased, s.flux.totalFlux, +s.flux.isVenting, +s.flux.isOverloaded,
  s.runtimeModifiers.value.disableSystems ?? 0, +s.childModules.some(c => c.moduleMount?.slotId === 'AFT' && c.hullHp > 0 && !c.isDead && !c.isRetreated && !c.isDocked),
  +hullmods.includes('web_ark_corona_coupler'),
  s.pos.x, s.pos.y, s.facingRad, +s.shield.isActive, /^[PS][123]$/.test(s.moduleMount?.slotId ?? '') ? (s.moduleMount!.slotId[0] === 'P' ? -1 : 1) : 0, +((s.spec.sourceHullId ?? s.spec.id) === 'web_gloriana'), +s.system?.blocksWeapons,
  +hullmods.includes('web_sc2_hyperion_yamato_focus') | (+hullmods.includes('web_sc2_hyperion_reactor') << 1) | (+((s.spec.sourceHullId ?? s.spec.id) === 'web_sc2_hyperion' && !s.spec.isModuleHull) << 2), +s.brakeInput,
  s.getFlameoutRatio(), +s.engineController.isFlamedOut, 0, +s.weapons[0].isDisabled, s.weapons[0].ammo, +s.weapons[1].isDisabled, s.weapons[1].ammo,
  +!!s.weapons[1].spec.isPointDefense, s.aimTargetWorld.x, s.aimTargetWorld.y, +!!s.spec.systemWeaponSlots?.length];}
export async function checkRustSystemWorld(source: BufferSource) {
  contentRegistry.registerWeapon(hyperionYamatoProjectile, false);
  const { instance } = await WebAssembly.instantiate(source, {}), e = instance.exports as Exports;
  let strict = 0, geometry = 0, maxDifference = 0, steps = 0, launches = 0, totalLaunches = 0;
  const geometryLog: { label: string; actual: number; expected: number; difference: number }[] = [];
  function compare(a: number, b: number, label: string, geometric = false) {if (!geometric) {strict++; if (!Object.is(a, b)) throw Error(`${label}: ${a} differs from ${b}`); return;}
    geometry++; if (Object.is(a, b)) return; const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
    if (!Number.isFinite(a) || !Number.isFinite(b) || difference > limit) throw Error(`${label}: ${a} differs from ${b}`); maxDifference = Math.max(maxDifference, difference); geometryLog.push({ label, actual: a, expected: b, difference });}
  function write(row: number[]) {const p = e.test_input(row.length); new Float64Array(e.memory.buffer, p, row.length).set(row);}
  for (const kind of [1, 2, 3, 5, 6, 7, 8, 9, 10]) for (let scene = 0; scene < 24; scene++) {
    const ships = [0, 1, 2, 3, 4].map(makeShip), ship = ships[0], children = ships.slice(1, 3);
    children.forEach((child, i) => Object.assign(child, { parentShip: ship, moduleMount: { slotId: i ? 'S2' : 'P1' } }));
    ships.slice(3).forEach(c => Object.assign(c, { sourceCarrier: ship }));
    Object.assign(ship, { childModules: children, combatShips: ships }); Object.defineProperty(ship, 'assemblyShips', { value: ships.slice(0, 3), configurable: true });
    if (kind === 2) ship.spec.id = 'web_gloriana';
    if (kind >= 5 && kind <= 7) ship.spec.hullMods = scene % 2 ? ['web_ark_corona_coupler'] : [];
    if (kind === 3 && scene % 2) ship.spec.hullMods!.push('web_sc2_hyperion_yamato_focus');
    children[0].moduleMount!.slotId = scene % 2 ? 'AFT' : 'P1';
    if (kind === 2) ship.aimTargetWorld.set(0, -800);
    if (scene >= 6) {ship.facingRad = (scene - 8) * .27; const c = Math.cos(ship.facingRad), s = Math.sin(ship.facingRad);
      ship.aimTargetWorld.set(kind === 2 ? s * 800 : c * 800, kind === 2 ? -c * 800 : s * 800);}
    const sys = new ShipSystem(ids[kind], 1000, ship);
    const resourceKind = kind >= 5 && kind <= 7 ? 5 : 3, core = resourceKind === kind ? sys : new ShipSystem(ids[resourceKind], 1000, ship);
    Object.assign(ship, { system: sys, allSystems: core === sys ? [sys] : [sys, core] });
    for (const child of children) {const none = new ShipSystem('NONE', 1000, child); Object.assign(child, { system: none, allSystems: [none], childModules: [] });}
    for (const craft of ships.slice(3)) Object.assign(craft, { childModules: [], system: new ShipSystem('NONE', 1000) });
    if (scene === 12) ship.isDead = true;
    if (scene === 13) ship.isDocked = true;
    if (scene === 14) ship.runtimeModifiers.set('qualification', { disableSystems: 1 });
    if (scene === 15) for (const part of ships) for (const mount of part.weapons) mount.isDisabled = true;
    if (scene === 16) ship.shield.isActive = false;
    if (scene >= 17 && scene <= 19) for (const part of ships) part.hullHp = 1000;
    if (scene === 18 || scene === 19) {ships[3].hullHp = 500; ships[3].pos.set(scene === 18 ? 1000 : 999.9999999999999, 0);}
    if (scene === 20) {ship.spec.hullMods = []; ship.spec.builtInHullMods = ['web_ark_corona_coupler'];}
    if (scene === 21 || scene === 22) {children[0].moduleMount!.slotId = 'AFT'; if (scene === 21) children[0].hullHp = 0; else children[0].isDocked = true;}
    if (scene === 23) ship.brakeInput = true;
    const random = new SimulationRandom(7191), projectiles: Projectile[] = [], world = { ships, projectiles, combatRandom: random, deployMine: () => undefined } as SystemWorld;
    const flags = 1 | (sys.definition.toggle ? 2 : 0) | (sys.definition.charges !== undefined && sys.definition.usesChargesForActivation !== false ? 4 : 0) | (sys.generatesHardFlux ? 8 : 0);
    const initial = [kind, sys.chargeUpDuration, sys.activeDuration, sys.chargeDownDuration, sys.maxCooldown, sys.maxCharges, sys.definition.initialCharges ?? -1, sys.chargeRegenRate, sys.fluxCostPerUse, flags,
      ...ships.flatMap(s => shipWords(s))]; write(initial); e.test_initialize();
    for (let tick = 0; tick < (scene < 6 ? 110 : 5); tick++) {
      const directed = scene >= 6;
      const dt = directed ? (tick === 0 ? (scene === 11 ? 30 : scene === 8 || scene === 9 ? sys.chargeUpDuration * .3 : sys.chargeUpDuration + .01) : tick === 1 ? sys.chargeUpDuration + .1 : .2) : [.016, .17, .65, 2.4][(scene + tick) % 4];
      const command = directed ? (tick === 0 ? 1 : 0) : tick % 23 === 0 ? 1 : tick % 37 === 0 ? 2 : 0;
      const flags = (scene === 6 || scene === 7) && tick === 0 ? 2 : scene === 10 ? 4 : scene === 9 ? 1 : 0;
      ship.flux.softFlux = !directed && tick % 17 === 0 ? 950 : 0; ship.flux.hardFlux = 0;
      ship.flux.isVenting = directed ? scene === 9 && tick === 1 : tick > 0 && tick % 19 === 0; ship.flux.isOverloaded = !directed && tick > 0 && tick % 29 === 0;
      sys.disabled = tick > 0 && tick % 41 === 0; ship.retreating = tick > 0 && tick % 43 === 0;
      if (core !== sys) core.isActive = tick > 0 && tick % 31 === 0;
      if (core !== sys) core.charges = !directed && tick % 13 === 0 ? 34 : 100;
      if (scene === 7 && tick === 1) core.charges = 0;
      const p = core as unknown as PrivateSystem; p.pendingActivationFlux = !directed && core !== sys && tick % 47 === 0 ? 400 : p.pendingActivationFlux;
      if (kind === 3) ship.spec.systemWeaponSlots = (directed ? scene === 8 && tick === 1 : tick % 11 === 0) ? [] : [{ slotId: 'SYS_YAMATO', x: 369, y: 0 }] as never;
      const inputRow = [command, dt, flags, ...shipWords(ship), +(core !== sys && core.isActive), core !== sys ? core.charges : 100,
        +(core !== sys && core.disabled), core !== sys ? p.pendingActivationFlux : 0, +sys.disabled, sys.charges];
      const expectedReason = sourceFailureCode(sys.activationFailureReason);
      let accepted = false; if (command === 1) accepted = sys.activate(); else if (command === 2) {sys.deactivate(); accepted = true;}
      if (flags & 1 && dt > 0 && ((sys.definition.controls?.cancelOnBrake && ship.brakeInput) || (sys.definition.controls?.cancelOnRetreat && ship.retreating))) sys.deactivate();
      sys.update(dt);
      if (flags & 1 && (ship.flux.isVenting || ship.flux.isOverloaded || sys.isActive && sys.definition.controls?.cancelOnFlameout && (ship.getFlameoutRatio() >= 1 || ship.engineController.isFlamedOut))) sys.deactivate();
      const cost = sys.consumePendingActivationFlux(); if (!(flags & 2)) {sys.dispatchEvents(ship, world, dt); if (flags & 4) sys.dispatchEvents(ship, world, 0);}
      const witness = random.checkpointWitness();
      const outputExpected = [ +accepted, 1, cost, sys.chargeRegenRate, core !== sys ? core.charges : 100, witness[1], witness[2], projectiles.length, projectiles.length,
        ...lifecycleWords(sys), +!!sys.activationInput, ...ships.map(s => s.hullHp), ...projectiles.flatMap(p => [p.id, p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.facingRad ?? 0,
          p.damage, p.baseDamage!, p.sourceDamageMultiplier!, p.rangeRemaining, p.sourceMoveSpeed!, p.sourceVelocity!.x, p.sourceVelocity!.y]) ];
      // The system-only core branch owns its own resource, the fixture's unused
      // external stock remains100; RNG ID witness is separate from random state.
      write(inputRow); const ptr = e.test_step(), n = e.test_output_words(); compare(n, outputExpected.length, `world ${kind}/${scene}/${tick} width`);
      compare(e.test_reason(), expectedReason, `world ${kind}/${scene}/${tick} readiness failure`);
      const values = new Float64Array(e.memory.buffer, ptr, n); outputExpected.forEach((v, i) => compare(values[i], v, `world ${kind}/${scene}/${tick} ${i}`,
        i >= 32 && [1, 2, 3, 4, 5, 11, 12].includes((i - 32) % 13))); steps++; launches = Math.max(launches, projectiles.length);
    }
    totalLaunches += projectiles.length;
  }
  compare(e.test_contract(), 255, 'stale identity/host failure/rollback contract');
  return { passed: true, steps, strictFields: strict, geometryFields: geometry, maxGeometryDifference: maxDifference, geometryLog, launches, actualSourceCommands: true, actualSourceEvents: true,
    totalLaunches, failureContractChecks: 8, productionIntegrated: false, fullBattleReady: false };
}
