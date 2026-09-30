/** Nonvisual production probes. Fixture hulls are NOT registered or shown to players. */
export async function runGravityScenarios() {
  globalThis.__LAN_BUILD_ID__ = 'gravity-rules-check';
  const { modManager } = await import('/src/engine/modding/ModManager.ts');
  const { assetManager } = await import('/src/engine/assets/AssetResolver.ts');
  const { contentManifestManager } = await import('/src/engine/content/ContentManifest.ts');
  const { Ship } = await import('/src/engine/simulation/Ship.ts');
  const { Vector2 } = await import('/src/engine/math/Vector2.ts');
  const { SimulationRandom } = await import('/src/engine/simulation/SimulationRandom.ts');
  const { GRAVITY_HULL_ID, GRAVITY_SYSTEM_IDS: ID } = await import('/src/engine/content/GravityIds.ts');
  const { gravityControlSpec } = await import('/src/engine/content/GravityControls.ts');
  const { dispatchShipCommand, shipCommandForKey } = await import('/src/engine/runtime/CombatCommands.ts');
  const { systemLoadoutErrors } = await import('/src/engine/extensions/ship-systems/Loadout.ts');
  const { gravityWell, gravityRepulsor, gravityVectorTurn } = await import('/src/engine/extensions/ship-systems/GravitySystems.ts');
  const { advanceGravityFields: advance, GRAVITY_LIMITS: limits, crossesGravityWave, gravityWaveContactTime } = await import('/src/engine/simulation/systems/GravityFieldPhysics.ts');
  const { initializeSourceProjectile, advanceSourceProjectile } = await import('/src/engine/simulation/systems/weapon/SourceProjectileLifecycle.ts');
  const { RenderShipProjection } = await import('/src/engine/runtime/local/RenderShipProjection.ts');
  const { LanShipProjection } = await import('/src/network/display/LanShipProjection.ts');
  const { createLanWorld } = await import('/src/network/LanWorld.ts');
  const { captureCombat, applyCombatSnapshot } = await import('/src/network/AuthorityCombatSnapshot.ts');
  const { initializeLanDisplayWorld, applyLanDisplaySnapshot } = await import('/src/network/LanDisplaySnapshot.ts');
  await assetManager.ensureManifestLoaded(); await contentManifestManager.ensureLoaded();
  const base = modManager.requireShip('web_zhefeng');
  const checks = [], measurements = {};
  const check = (value, label) => { if (!value) throw Error(label); checks.push(label); };
  const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
  let serial = 0;
  const spec = (gravity = false, extra = {}) => ({ ...base, id: 'gravity-probe-' + serial++, sourceHullId: gravity ? GRAVITY_HULL_ID : 'gravity-rule-target', builtInHullMods: [], hullMods: [], fighterBays: 0, fighterWings: [], modules: undefined, systemTypes: [], systemType: 'NONE', defenseSystemType: 'NONE', rightClickSystemType: 'NONE', weaponSlots: [], engineSlots: [], mass: 1000, maxFlux: 12000, fluxDissipation: 100, shieldType: 'NONE', collisionRadius: 30, ...(gravity ? {...gravityControlSpec(),systemTypes:[ID.well,ID.maneuver]} : {}), ...extra });
  const fresh = (team = 0, x = 0, y = 0, gravity = false, extra = {}) => {
    const ship = new Ship('gravity-test-' + serial++, spec(gravity, extra), team === 0, new Vector2(x, y), 0, new SimulationRandom(39));
    ship.teamId = team; ship.fireControlMode = 'MANUAL'; return ship;
  };
  const context = (ships, projectiles = []) => ({ ships, projectiles, asteroids: [], combatRandom: new SimulationRandom(91), deployMine() {} });
  const dispatch = (ship, ctx, dt = 0) => { for (const system of ship.allSystems) { system.dispatchEvents(ship, ctx, dt); if (system.type===ID.repulsor && system.state==='IN')system.update(.13); } };
  const openWell = (ship, ctx, x = 0, y = 0) => { ship.aimTargetWorld.set(x, y); if (!ship.system.activate()) throw Error('Well activation: ' + ship.system.activationFailureReason); ship.system.update(.36); dispatch(ship, ctx); };
  const projectile = (id, x, y, team = 1, extra = {}) => ({ id, specId: 'kinetic-rule-probe', sourceShipId: 'source-' + team, sourceWeaponType: 'BALLISTIC', teamId: team, pos: new Vector2(x, y), prevPos: new Vector2(x, y), vel: new Vector2(0, 100), radius: 2, damage: 100, damageType: 'KINETIC', rangeRemaining: 3000, totalRange: 3000, elapsedTime: 0, color: [255, 255, 255], spawnType: 'BALLISTIC', projLength: 16, fadeTime: .2, ...extra });
  check(modManager.requireShip(GRAVITY_HULL_ID).weaponSlots.length===11, 'Production hull is registered with authored slots');
  check(!!gravityWell.installReason(base) && !gravityWell.installReason(spec(true)), 'Dedicated systems reject unrelated hulls');
  {
    const owner = fresh(0, 0, 0, true), ctx = context([owner]);
    const key = code => shipCommandForKey({ code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }, owner);
    check(owner.systems.map(s => s.type).join(',') === [ID.well, ID.maneuver].join(',') && owner.defenseSystem.type === ID.repulsor, 'F well, G vector turn and right-click repulsor occupy distinct production slots');
    check(systemLoadoutErrors(owner.spec).length === 0, 'Shared gravity control specification passes real system loadout validation');
    check(owner.shield.type === 'NONE' && !dispatchShipCommand(owner, { kind: 'hullShield' }).accepted && !owner.shield.isActive, 'No hull shield and Shift-right-click cannot create a hidden defense');
    check(key('KeyF')?.value === 0 && key('KeyG')?.value === 1, 'Default F/G keys route to the two different tactical slots');
    check(!dispatchShipCommand(owner, key('KeyG')).accepted && owner.systems[1].reservedFluxCost === 0, 'Stationary G is rejected without reserving flux');
    owner.vel.set(100, 0); owner.aimTargetWorld.set(0, 0);
    check(!dispatchShipCommand(owner, key('KeyG')).accepted, 'G rejects aim at the hull center');
    owner.aimTargetWorld.set(1000, 0);
    check(!dispatchShipCommand(owner, key('KeyG')).accepted, 'G rejects an already-aligned heading');
    owner.aimTargetWorld.set(0, 1000);
    check(dispatchShipCommand(owner, key('KeyG')).accepted && owner.systems[1].reservedFluxCost === 450, 'G reserves its own real activation cost');
    dispatch(owner, ctx); owner.aimTargetWorld.set(0, -1000);
    const facing = owner.facingRad, startPosition = owner.pos.clone();
    advance(.1, ctx.ships, []);
    check(near(owner.vel.length(), 100) && owner.vel.y > 0 && near(owner.facingRad, facing) && owner.pos.distanceTo(startPosition) === 0, 'G bends velocity without changing speed, facing or directly writing position');
    check(near(owner.systems[1].gravityManeuver.targetAngle, Math.PI / 2), 'G uses command-edge direction rather than a freely moving cursor');
    const projection = new RenderShipProjection();
    check(projection.supports([owner]) && !!projection.project(owner).allSystems.find(s => s.type === ID.maneuver).gravityManeuver, 'Authority render projection carries G state');
    check(!dispatchShipCommand(owner, key('KeyG')).accepted, 'G cannot be retriggered while active');
    for (let i = 0; i < 10; i++) advance(.1, ctx.ships, []);
    check(!owner.systems[1].gravityManeuver && near(owner.vel.length(), 100) && near(owner.vel.x, 0), 'Completed G leaves real momentum and cannot keep steering');
    owner.systems[1].update(.11);
    check(owner.systems[1].state === 'COOLDOWN' && !dispatchShipCommand(owner, key('KeyG')).accepted, 'G enters a real cooldown');
    measurements.vectorTurn = { speed: owner.vel.length(), direction: owner.vel.heading(), fluxReserved: owner.systems[1].reservedFluxCost };
  }
  {
    const turn = (speed, reverse = false) => {
      const owner = fresh(0, 0, 0, true), ctx = context([owner]); owner.vel.set(speed, 0); owner.aimTargetWorld.set(-1000, 0);
      dispatchShipCommand(owner, { kind: 'system', value: 1 }); dispatch(owner, ctx);
      for (let i = 0; i < 50; i++) advance(1 / 60, reverse ? [...ctx.ships].reverse() : ctx.ships, []);
      return { speed: owner.vel.length(), angle: owner.vel.heading() };
    };
    const slow = turn(80), fast = turn(800);
    check(near(slow.speed, 80) && near(fast.speed, 800) && slow.angle <= gravityVectorTurn.gravityManeuver.maxTurn + 1e-6, 'G respects angular budget and preserves pre-existing overspeed');
    check(fast.angle < slow.angle && near(fast.angle, turn(800, true).angle), 'High speed has a wider turn and roster order does not affect G');
    for (const invalidate of [s => { s.flux.softFlux = s.flux.maxFlux; s.flux.triggerOverload(); }, s => { s.flux.isVenting = true; }, s => { s.isDead = true; }, s => { s.systems[1].disabled = true; }, s => s.retreatFromCombat()]) {
      const owner = fresh(0, 0, 0, true), ctx = context([owner]); owner.vel.set(100, 0); owner.aimTargetWorld.set(0, 1000);
      dispatchShipCommand(owner, { kind: 'system', value: 1 }); dispatch(owner, ctx); invalidate(owner); advance(.1, ctx.ships, []);
      check(!owner.systems[1].gravityManeuver && near(owner.vel.y, 0), 'G invalidation removes ongoing maneuver without restoring stored velocity');
    }
    for (const reverse of [false, true]) {
      const owner = fresh(0, 0, 0, true), target = fresh(1, 250, 0), ctx = context([owner, target]);
      const commands = [{ kind: 'system', value: 0 }, { kind: 'shield' }];
      for (const command of reverse ? [...commands].reverse() : commands) check(dispatchShipCommand(owner, command, new Vector2(300, 0)).accepted, 'F and right-click can be accepted in either same-frame order');
      dispatch(owner, ctx); owner.system.update(.36); advance(.1, ctx.ships, []);
      check(!!owner.system.gravityField && !!owner.defenseSystem.gravityField, 'F and right-click coexist without slot-order cancellation');
      owner.flux.softFlux = owner.flux.maxFlux - 1;
      check(!dispatchShipCommand(owner, { kind: 'shield' }).accepted && !!owner.system.gravityField, 'Unavailable right-click leaves the independent well untouched');
    }
  }
  {
    const owner = fresh(0, -700, 0, true), a = fresh(1, 180, 0), b = fresh(1, 0, 180), ally = fresh(0, 140, 0), heavy = fresh(1, 180, 0, false, { mass: 8000 });
    const ctx = context([owner, a, b, ally, heavy]);
    owner.aimTargetWorld.set(0, 0); check(owner.system.activate(), 'F accepts valid fixed deployment');
    dispatch(owner, ctx); advance(.1, ctx.ships, []); check(a.vel.length() === 0, 'Charge-up does not apply full force early');
    owner.aimTargetWorld.set(1000, 1000); owner.system.update(.36); advance(.1, ctx.ships, []);
    check(owner.system.gravityField.x === 0 && owner.system.gravityField.y === 0, 'Well captures the command-edge point, never follows later cursor motion');
    check(a.vel.x < 0 && b.vel.y < 0 && ally.vel.length() === 0, 'F affects multiple hostiles and preserves allies');
    check(near(a.pos.x, 180) && near(b.pos.y, 180), 'Force changes velocity, never teleports positions');
    check(Math.abs(heavy.vel.x) < Math.abs(a.vel.x) / 5, 'Heavy hull resists acceleration by actual mass');
    measurements.well = { lightDelta: a.vel.x, heavyDelta: heavy.vel.x };
    const oldVelocity = a.vel.clone(); check(owner.system.activate(), 'Second F is accepted as recall'); advance(.1, ctx.ships, []);
    check(!owner.system.gravityField && near(a.vel.x, oldVelocity.x), 'Recall removes force but preserves existing momentum');
  }
  {
    const owner = fresh(0, 0, 0, true), a = fresh(1, 200, 0), b = fresh(1, -200, 0), ally = fresh(0, 180, 0);
    const bullets = [projectile(1, 150, 0), projectile(2, -160, 0), projectile(3, 150, 0, 0), projectile(4, 150, 0, 0, { gravityCoupling: 'MASS_DRIVER',sourceShipId:owner.id }), projectile(5, 150, 0, 1, { spawnType: 'BALLISTIC_AS_BEAM' })];
    const ctx = context([owner, a, b, ally], bullets); openWell(owner, ctx, 300, 0);
    owner.flux.softFlux = owner.flux.maxFlux - 1;
    const repulsor = owner.defenseSystem; check(!dispatchShipCommand(owner, { kind: 'shield' }).accepted && !!owner.system.gravityField, 'Failed right-click (flux) preserves the running well');
    owner.flux.softFlux = 0; owner.aimTargetWorld.set(-1300, 50); check(dispatchShipCommand(owner, { kind: 'shield' }).accepted, 'Affordable right-click starts'); dispatch(owner, ctx);
    check(!!owner.system.gravityField && owner.system.state === 'ACTIVE', 'Successful right-click preserves the independently deployed well');
    check(near(repulsor.gravityField.x, owner.pos.x) && near(repulsor.gravityField.y, owner.pos.y), 'Right-click originates at the ship, not the mouse');
    check(dispatchShipCommand(owner, { kind: 'system', value: 0 }).accepted, 'F can be independently recalled during a repulsion wave');
    const identities = bullets.map(p => [p.damage, p.teamId, p.sourceShipId, p.rangeRemaining, p.elapsedTime]);
    advance(.25, ctx.ships, bullets);
    check(a.vel.x > 0 && b.vel.x < 0 && ally.vel.length() === 0, 'Right-click pushes multiple enemies outward and leaves allies alone');
    check(bullets[0].vel.x > 0 && bullets[1].vel.x < 0 && bullets[2].vel.x === 0 && bullets[3].vel.x > 0 && bullets[4].vel.x === 0, 'Right-click deflects hostile solids and opted-in friendly mass rounds, not normal friendly rounds or moving-ray beams');
    check(JSON.stringify(identities) === JSON.stringify(bullets.map(p => [p.damage, p.teamId, p.sourceShipId, p.rangeRemaining, p.elapsedTime])), 'Field never resets damage, ownership, remaining range or age');
    const velocity = [a.vel.x, b.vel.x, bullets[0].vel.x]; advance(.1, ctx.ships, bullets);
    check(near(a.vel.x, velocity[0]) && near(b.vel.x, velocity[1]) && near(bullets[0].vel.x, velocity[2]), 'Wave deduplication prevents a second impulse across successive frames');
    const projected = new RenderShipProjection(); check(projected.supports([owner]), 'Gravity systems satisfy the authority render adapter');
    check(projected.project(owner).allSystems.find(s => s.type === ID.repulsor).gravityField.projectileHits.includes(1), 'Inline/Worker render projection carries actual wave state');
    const lan = new LanShipProjection(); lan.begin(); const display = lan.project(owner); lan.finish();
    check(display.defenseSystem.gravityField.shipHits.includes(a.id), 'LAN display projection includes field and hit history');
    advance(.31, ctx.ships, bullets); check(!repulsor.gravityField, 'Repulsion expires at the finite wave radius');
  }
  {
    const owner = fresh(0, -700, 0, true), root = fresh(1, 200, 0, false, { mass: 1000, modules: [{ slotId: 'attached', x: 0, y: 30, angleDeg: 0, spec: spec(false, { mass: 4000 }) }] }), single = fresh(1, 200, 0, false, { mass: 5000 });
    const ctx = context([owner, ...root.assemblyShips, single]); openWell(owner, ctx); advance(.1, ctx.ships, []);
    check(near(root.vel.x, single.vel.x, .03), 'Attached module mass is counted once in a single assembly impulse');
    check(near(root.childModules[0].vel.x, root.vel.x) && root.childModules[0].parentShip === root, 'Module follows root velocity and is not torn out of its mount');
  }
  {
    const owner = fresh(0, -700, 0, true), target = fresh(1, 180, 0), round = projectile(11, 150, 0), ally = projectile(12, 150, 0, 0), phase = fresh(1, 100, 0);
    phase.externalPhaseEffects.set({}, () => 1);
    const ctx = context([owner, target, phase], [round, ally]); openWell(owner, ctx); advance(.1, ctx.ships, ctx.projectiles);
    check(round.vel.x < 0 && ally.vel.x === 0 && phase.vel.length() === 0, 'Well changes hostile bullet trajectory, excludes friendly shots and phased ships');
    initializeSourceProjectile(round, 100); round.gravityDeflected = true; const before = round.pos.clone(), range = round.rangeRemaining;
    advanceSourceProjectile(round, .1); check(near(range - round.rangeRemaining, round.pos.distanceTo(before)), 'Deflected native solid drains actual world path length');
    const ordinary = projectile(13, 0, 0); ordinary.vel.set(300, 0); initializeSourceProjectile(ordinary, 100, new Vector2(200, 0)); advanceSourceProjectile(ordinary, .1);
    check(near(ordinary.rangeRemaining, 2990), 'Unaffected native inherited-velocity range behavior stays unchanged');
    owner.flux.isVenting = true; const speed = target.vel.clone(); advance(.1, ctx.ships, []);
    check(!owner.system.gravityField && near(target.vel.x, speed.x), 'Venting terminates field without zeroing enemy inertia');
  }
  {
    check(crossesGravityWave({ x: 900, y: 0 }, { x: -900, y: 0 }, { x: 0, y: 0 }, 100, 150, 2), 'Swept wave detects a fast round crossing between frames');
    check(!crossesGravityWave({ x: 10, y: 0 }, { x: 12, y: 0 }, { x: 0, y: 0 }, 100, 150, 2), 'A round entirely behind the spent wave is not hit retroactively');
    const crossing = gravityWaveContactTime({ x: 10, y: 0 }, { x: -900, y: 0 }, { x: 0, y: 0 }, 100, 150, 2);
    check(crossing !== undefined && 10 - 910 * crossing < 0, 'A crossing round uses the contacted side of the wave, not a stale opposite-side normal');
    const owner = fresh(0, -700, 0, true), target = fresh(1, 200, 0), ctx = context([owner, target]); openWell(owner, ctx); owner.pos.x = -2000; advance(.1, ctx.ships, []);
    check(!owner.system.gravityField, 'Leaving the maintenance tether ends F');
    owner.system.reset(); owner.pos.x = -700; openWell(owner, ctx); owner.isDead = true; advance(.1, ctx.ships, []);
    check(!owner.system.gravityField, 'Destroyed owner cannot leave a ghost well');
    const retreat = fresh(0, -700, 0, true), retreatCtx = context([retreat, target]); openWell(retreat, retreatCtx);
    retreat.retreatFromCombat(); check(!retreat.system.gravityField, 'Retreat clears state immediately even after removal from the engine roster');
    const timed = fresh(0, -700, 0, true), timedCtx = context([timed, target]); openWell(timed, timedCtx);
    for (let i = 0; i < 370; i++) { timed.system.update(1 / 60); advance(1 / 60, timedCtx.ships, []); }
    check(!timed.system.gravityField && timed.system.state === 'COOLDOWN', 'F has a hard duration and a real cooldown instead of permanent control');
    const invalid = fresh(0, 0, 0, true); invalid.aimTargetWorld.set(1401, 0);
    check(!invalid.system.activate() && invalid.system.reservedFluxCost === 0, 'Out-of-range deployment is rejected without spending flux');
    invalid.aimTargetWorld.set(NaN, 0); check(!invalid.system.activate(), 'Non-finite cursor coordinates cannot poison the simulation');
  }
  {
    const run = reverse => {
      const owners = Array.from({ length: 8 }, (_, i) => { const s = fresh(0, -700, i * 3, true); s.id = 'ordered-source-' + i; return s; });
      const target = fresh(1, 180, 0); const ships = [...owners, target]; const ctx = context(ships);
      for (const s of owners) openWell(s, ctx);
      advance(.1, reverse ? [...ships].reverse() : ships, []); return target.vel.x;
    };
    const first = run(false), second = run(true);
    check(near(first, second) && Math.abs(first) <= limits.shipAcceleration * .1 + 1e-6, 'Multiple sources share a per-object acceleration cap independent of roster order');
    const owner = fresh(0, 0, 0, true), target = fresh(1, 100, 0), bullets = Array.from({ length: 180 }, (_, i) => projectile(100 + i, 100, 0));
    const ctx = context([owner, target], bullets); owner.defenseSystem.activate(); dispatch(owner, ctx); advance(.2, ctx.ships, bullets);
    check(bullets.filter(p => p.gravityDeflected).length === 128, 'Source processing count is bounded during a dense barrage');
    check(bullets.reduce((n, p) => n + Math.abs(p.vel.x), 0) <= gravityRepulsor.gravityField.projectileBudget + 1e-6, 'Dense barrage shares a finite emitter impulse budget');
    const spent = bullets.reduce((n, p) => n + Math.abs(p.vel.x), 0); advance(.2, ctx.ships, bullets);
    check(near(spent, bullets.reduce((n, p) => n + Math.abs(p.vel.x), 0)), 'Wave does not refill its budget on a later tick');
  }
  // Full CombatEngine.fixedUpdate, real production fireWeapon, snapshot and display decode.
  {
    const { createZhefengAssault } = await import('/src/studio/ZhefengLoadouts.ts');
    const match = { id: 'gravity-check', seed: 930, hostId: 'p0', snapshotHz: 60, players: [{ id: 'p0', seat: 0, team: 0, hull: 'web_zhefeng', design: createZhefengAssault() }, { id: 'p1', seat: 1, team: 1, hull: 'web_zhefeng', design: createZhefengAssault() }], options: { assignment: 'teams', battleSize: 400, aiHulls: [[], []] } };
    const { engine } = createLanWorld(match); engine.asteroids.length = 0;
    engine.playerShip.pos.set(-6000, 0); engine.enemyShip.pos.set(6000, 0);
    const owner = engine.addShip(spec(true), true, new Vector2(0, 0), 0, 0), target = engine.addShip(spec(false), false, new Vector2(900, 0), Math.PI, 1);
    for (const ship of engine.allCapitalShips) { engine.externallyControlledShipIds.add(ship.id); ship.fireControlMode = 'MANUAL'; ship.isFiringMain = false; for (const group of ship.weaponGroups) group.isAutofire = false; }
    owner.aimTargetWorld.set(600, 0); owner.system.activate();
    for (let i = 0; i < 32; i++) engine.fixedUpdate(1 / 60);
    check(target.vel.x < 0 && target.pos.x < 900 && owner.flux.totalFlux > 200, 'Production fixedUpdate applies multi-frame gravity and real activation/upkeep flux');
    const main = engine.enemyShip.weapons.find(w => w.spec.weaponType === 'BALLISTIC' && !w.spec.isBeam);
    let fired; check(engine.enemyShip.weaponControl.fireWeapon(main, engine.enemyShip, p => { fired = p; engine.projectiles.push(p); }, () => {}), 'Production gun creates the tested hostile round');
    fired.pos.set(600, 200); fired.prevPos.copy(fired.pos); fired.vel.set(200, 0); fired.facingRad = 0;
    engine.fixedUpdate(1 / 60); check(fired.gravityDeflected && fired.vel.y < 0, 'Production projectile movement receives the field before collision processing');
    // Place the target away from physical collision but inside the next wavefront.
    target.pos.set(220, 140); target.prevPos.copy(target.pos);
    dispatchShipCommand(owner, { kind: 'shield' }); for (let i = 0; i < 26; i++) engine.fixedUpdate(1 / 60);
    const sourceField = owner.defenseSystem.gravityField;
    check(!!sourceField, 'Full-engine right-click creates a living expanding wave');
    check(sourceField.shipHits.includes(target.id) && target.vel.dot(target.pos.clone().sub(owner.pos)) > 0, 'Full-engine right-click crosses and pushes the real target outward');
    // The fixture retains its production hull polygon: radius alone does not
    // prevent a real hull collision. Isolate the self-turn AFTER proving the hit.
    target.pos.set(1000, 700); target.prevPos.copy(target.pos);
    owner.vel.set(100, 0);
    check(dispatchShipCommand(owner, { kind: 'system', value: 1 }, owner.pos.clone().add(new Vector2(0, 1000))).accepted, 'Production G command activates vector turn');
    for (let i = 0; i < 6; i++) engine.fixedUpdate(1 / 60);
    check(owner.vel.y > 0 && !!owner.systems[1].gravityManeuver && !!owner.system.gravityField, 'Production G changes own trajectory without closing F');
    const raw = captureCombat(engine, 1, { 0: 0, 1: 0 }, 0, false, false, false, true);
    const savedAge = sourceField.age, savedHits = JSON.stringify([sourceField.shipHits, sourceField.projectileHits]);
    const savedTurn = { ...owner.systems[1].gravityManeuver };
    owner.defenseSystem.gravityField = undefined; owner.systems[1].gravityManeuver = undefined;
    // Legacy capture is a presentation codec, not a resumable whole-engine save.
    // Limit diagnostic restore to the new systems: existing frozen weapon-group
    // metadata elsewhere in this checkout is not writable by that old decoder.
    const focused = structuredClone(raw);
    focused.world = {}; focused.crafts = [];
    focused.ships = focused.ships.map(row => {
      const keys = focused.layouts[row.state.$record];
      return { ...row, state: Object.fromEntries(['systems', 'defenseSystem'].map(key => [key, keys ? row.state.values[keys.indexOf(key)] : row.state[key]])) };
    });
    applyCombatSnapshot(engine, focused);
    check(near(owner.defenseSystem.gravityField.age, savedAge) && JSON.stringify([owner.defenseSystem.gravityField.shipHits, owner.defenseSystem.gravityField.projectileHits]) === savedHits, 'System-scoped diagnostic codec restores wave age and hit history (not a whole-engine checkpoint)');
    check(JSON.stringify(owner.systems[1].gravityManeuver) === JSON.stringify(savedTurn), 'System-scoped diagnostic codec restores the committed G direction and remaining budget');
    const frame = captureCombat(engine, 2, { 0: 0, 1: 0 }, 0, false, false, false, true, false, false, false, false, false, true, false, true, true);
    const { world } = initializeLanDisplayWorld(0, structuredClone(frame));
    const viewer = world.ships.find(s => s.id === owner.id);
    check(!!viewer?.defenseSystem.gravityField && near(viewer.defenseSystem.gravityField.age, savedAge), 'Real LAN display encoder/decoder retains authority field state');
    check(near(viewer.systems[1].gravityManeuver.targetAngle, savedTurn.targetAngle), 'Real LAN display encoder/decoder retains G maneuver state');
    owner.systems[1].reset(); owner.defenseSystem.reset(); const endFrame = captureCombat(engine, 3, { 0: 0, 1: 0 }, 0, false, false, false, true, false, false, false, false, false, true, false, true, true);
    applyLanDisplaySnapshot(world, structuredClone(endFrame));
    check(viewer.defenseSystem.gravityField === undefined, 'Reset clears field in subsequent display snapshots, not only local memory');
    check(viewer.systems[1].gravityManeuver === undefined, 'G reset clears state through display snapshots');
    measurements.engine = { seconds: engine.combatTime, targetX: target.pos.x, targetVx: target.vel.x, flux: owner.flux.totalFlux, projectileBent: fired.gravityDeflected };
    // The old Zhefeng check uses createDesign() (now empty), which cannot satisfy
    // its own armed-weapon precondition. Check the same lifecycle on a real fit.
    const other = engine.playerShip;
    other.shield.setActive(true); other.shield.update(1, 0, 0);
    check(other.system.activate(), 'Existing Zhefeng system still activates on an actually armed production loadout');
    other.system.update(1.5); check(other.system.state === 'ACTIVE' && near(other.system.getWeaponRateOfFireMultiplier('BALLISTIC'), 1.6), 'Existing Zhefeng counterattack lifecycle and weapon stats remain intact');
  }
  const v6=await (await import('/scripts/gravity-v6-scenarios.mjs')).runGravityV6Scenarios();checks.push(...v6.checks);measurements.v6=v6.measurements;
  return { checks, measurements, scope: 'Nonvisual production rules, fixedUpdate, genuine Dedicated Worker and authority/display codecs. Actual v6 hull and fits; visual, natural AI and live multiplayer evidence reported separately.' };
}
