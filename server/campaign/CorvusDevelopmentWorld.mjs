import { createHash } from 'node:crypto';
import { createReferenceRuleset } from '../../src/campaign/ReferenceRuleset.mjs';
import { createCampaignWorld, validateCampaignWorld } from '../../src/campaign/core/WorldState.mjs';
import { canonicalJSON, identifier, isRecord, requireThat } from '../../src/campaign/core/Values.mjs';
import { buildOriginalCorvusBlueprint } from '../../src/campaign/content/OriginalCorvus.mjs';
import { originalOrbitOrder, advanceOriginalOrbit } from '../../src/campaign/rules/OriginalOrbits.mjs';
import { createOriginalFactionDefinitions } from '../../src/campaign/rules/OriginalFactionDefinitions.mjs';
import corvusReference from '../../src/campaign/data/reference-corvus.json' with { type: 'json' };
import factionReference from '../../src/campaign/data/reference-factions.json' with { type: 'json' };
import logisticsReference from '../../src/campaign/data/reference-logistics.json' with { type: 'json' };

export const CORVUS_DEVELOPMENT_WORLD_ID = 'development-corvus-authored';
export const CORVUS_DEVELOPMENT_SEED = 'web-corvus-authored-v1';
// Scenario setup belongs to the selected cooperative simulation namespace, not market snapshots.
export const CORVUS_DEVELOPMENT_EXTENSION_ID = 'cooperative.simulation:corvus-development';
const scenarioVersion = 1;
const hash = value => createHash('sha256').update(canonicalJSON(value)).digest('hex');
const fail = (ok, message) => requireThat(ok, 'INVALID_CORVUS_DEVELOPMENT', message);
const instantiateKinds = new Set(['star', 'planet', 'custom', 'jump-point']);
const blueprint = buildOriginalCorvusBlueprint(corvusReference);
const factions = createOriginalFactionDefinitions(factionReference);
const sourceDigest = hash(corvusReference);
const blockerId = handle => 'corvus-source-terrain:' + handle.replace(/^@operation:/, 'operation-');

/** Independent, frozen authored-content inspection scenario. This is NOT native new-game generation.
 * Seed controls only explicit Web fallback identities, never missing native procedural results.
 * Options do not accept rules, positions, market inventories or generated content overrides. */
export function createCorvusDevelopmentCampaign(options = {}) {
 fail(isRecord(options) && Object.keys(options).every(k => ['id', 'seed'].includes(k)), 'Only id and seed options are supported');
 const id = options.id === undefined ? CORVUS_DEVELOPMENT_WORLD_ID : options.id;
 const seed = options.seed === undefined ? CORVUS_DEVELOPMENT_SEED : options.seed;
 identifier(id, 'Corvus development world'); identifier(seed, 'Corvus Web identity seed');
 fail(id !== 'development-sector', 'Do not overwrite the separate navigation fixture identity');
 const rules = createReferenceRuleset();
 const fingerprint = 'dev-corvus:' + hash({ scenarioVersion, id, seed, blueprint: sourceDigest,
  factions: hash(factionReference), logistics: hash(logisticsReference), rules: rules.lock });
 const world = structuredClone(createCampaignWorld({ id, rules: rules.lock, contentFingerprint: fingerprint }));
 const selected = blueprint.entities.filter(e => instantiateKinds.has(e.kind));
 const identityByHandle = {}, usedIds = new Set();
 for (const e of selected) {
  const webGenerated = e.nativeId === null;
  const entityId = webGenerated ? 'web-corvus:entity:' + hash(['web-corvus-generated-id/v1', id, seed, e.handle]) : e.nativeId;
  identifier(entityId); fail(!usedIds.has(entityId), 'Entity identity collision'); usedIds.add(entityId);
  identityByHandle[e.handle] = { id: entityId, nativeId: e.nativeId,
   policy: webGenerated ? 'web-stable-sha256-v1-not-native-genUID' : 'preserved-native-id',
   sourceHandle: e.handle, source: e.source };
 }
 const resolveId = handle => { fail(Boolean(identityByHandle[handle]), `Uninstantiated source focus ${handle}`); return identityByHandle[handle].id; };
 const locationId = blueprint.system.id;
 const terrain = [];
 for (const e of blueprint.entities) {
  // RingBand without terrainType is a visual helper, not proof of an implemented terrain.
  const nativeType = e.terrainType ?? e.parameters?.terrainType;
  if (!nativeType) continue;
  terrain.push({ id: blockerId(e.handle), status: 'required-not-executed', nativeId: e.nativeId,
   nativeType, sourceHandle: e.handle, source: e.source, reason: 'Native terrain/helper not instantiated; navigation cannot assume empty terrain.' });
 }
 const corona = blueprint.postprocessing.find(s => s.id === 'star-corona');
 terrain.push({ id: blockerId('star-corona'), status: 'required-not-executed', nativeId: null,
  nativeType: 'corona', sourceHandle: 'star', source: corona.source, reason: 'initStar/addCorona helper remains unimplemented.' });
 for (const stageId of ['outer-orbits', 'systemwide-nebula']) {
  const s = blueprint.stages.find(s => s.id === stageId);
  terrain.push({ id: blockerId(stageId), status: 'required-not-executed', nativeId: null,
   nativeType: stageId === 'systemwide-nebula' ? 'nebula' : null, sourceHandle: null, source: s.source,
   stageId, reason: stageId === 'outer-orbits' ? 'Unresolved procedural content may add terrain; not a sampled or native terrain id.' : 'Systemwide nebula noise/geometry is ungenerated.' });
 }
 world.locations[locationId] = { id: locationId, version: 0, name: blueprint.system.name,
  presentation: { background: blueprint.system.background.path },
  navigation: { space: 'normal', terrain: terrain.map(t => t.id), jumpTopology: 'unavailable' },
  source: { blueprintId: blueprint.id, system: blueprint.system, coordinatePolicy: 'local authored positions; starmap position is metadata, not a second navigable location' } };
 world.extensions['reference.calendar:epoch'] = { id: 'reference.calendar:epoch', version: 0, schemaVersion: 1,
  data: { epoch: rules.services.calendar.createNewGameEpoch({ start: 'development-no-time-pass', atGameSeconds: 0 }) } };

 const factionIds = new Set(blueprint.markets.map(m => m.faction));
 for (const e of selected) if (e.faction ?? e.conditionMarket?.faction) factionIds.add(e.faction ?? e.conditionMarket.faction);
 for (const factionId of [...factionIds].sort()) {
  const name = factions.field(factionId, 'displayName'); fail(name.status === 'resolved', `Missing faction name ${factionId}`);
  world.factions[factionId] = { id: factionId, version: 0, name: name.value, playerRoles: {},
   source: { definitionId: factions.get(factionId).sourceId, status: 'native-definition-only', relationships: 'not-initialized', governance: 'not-simulated' } };
 }
 for (const e of selected) {
  fail(typeof e.name === 'string' && Number.isFinite(e.radius), `Missing authored physical definition ${e.handle}`);
  const entityId = resolveId(e.handle);
  const customTags = e.customType ? blueprint.specs.customEntities[e.customType].fields.tags.value ?? [] : [];
  const value = { id: entityId, version: 0, name: e.name, locationId,
   // Temporary initialization buffer. Every orbit is evaluated focus-first before anything escapes this function.
   position: e.kind === 'star' ? [e.localPosition.x, e.localPosition.y] : [0, 0], radius: e.radius,
   tags: [...customTags],
   source: { blueprintId: blueprint.id, blueprintSha256: sourceDigest, ...identityByHandle[e.handle],
    initialOrbit: e.orbit, definitionFactionId: e.faction ?? null,
    factionStatus: e.marketFaction ? 'economy-link-metadata' : e.faction ? e.factionStatus : e.conditionMarket ? 'condition-market-metadata' : 'not-declared',
    conditionMarket: e.conditionMarket ?? null, properties: e.properties },
   factionId: e.marketFaction ?? e.faction ?? e.conditionMarket?.faction ?? null,
   ...(e.marketId ? { marketId: e.marketId } : {}),
  };
  if (e.kind === 'star' || e.kind === 'planet') {
   value.surfacePhase = 0; // Explicit Web development choice; native initial angle uses Math.random().
   value.cloudPhase = 0; // Native CampaignPlanet initial cloudAngle.
   value.source.phasePolicy = { surface: 'web-development-fixed-zero-not-native-random', cloud: 'native-initial-zero' };
   if (e.kind === 'planet') {
    let focus = e;
    const visited = new Set();
    while (focus.kind !== 'star') {
     fail(!visited.has(focus.handle) && focus.orbit, 'Planet needs an authored star light source');
     visited.add(focus.handle);
     focus = selected.find(candidate => candidate.handle === focus.orbit.focusHandle);
     fail(Boolean(focus), 'Missing planet light-source focus');
    }
    value.lightSourceId = resolveId(focus.handle);
   }
  }
  if (e.kind !== 'jump-point') value.presentation = { kind: e.kind, nativeType: e.planetType ?? e.customType, sourceHandle: e.handle };
  else value.jump = { anchor: null, destinations: [] };
  if (e.orbit) value.orbit = { schemaVersion: 1, kind: e.orbit.mode, focusId: resolveId(e.orbit.focusHandle),
   radius: e.orbit.radius, periodDays: e.orbit.periodDays, angleDegrees: e.orbit.angleDegrees };
  world.spaceEntities[entityId] = value;
 }
 const initializationOrder = originalOrbitOrder(world);
 for (const entityId of initializationOrder) {
  const before = world.spaceEntities[entityId];
  world.spaceEntities[entityId] = advanceOriginalOrbit(before, world.spaceEntities[before.orbit.focusId], 0);
 }
 // Real market identity/link metadata only; deliberately NO reference.market:<id> economic extension.
 for (const m of blueprint.markets) {
  fail(m.connectedEntityIds.every(entityId => world.spaceEntities[entityId]?.marketId === m.id), `Broken market link ${m.id}`);
  world.markets[m.id] = { id: m.id, version: 0, owner: { kind: 'faction', id: m.faction }, locationId,
   metadata: { status: 'authored-definition-only-not-economic-snapshot', definition: m,
    tradeState: 'unavailable', industrySimulation: 'not-executed', economyRegistration: m.kind === 'economy' ? 'native-definition-not-simulated' : 'native-helper-not-economy-registered' } };
 }
 const respawn = [blueprint.system.respawn.x, blueprint.system.respawn.y];
 for (const [index, playerId] of ['captain-a', 'captain-b'].entries()) {
  const owner = { kind: 'player', id: playerId }, fleetId = 'fleet-' + playerId, memberId = 'wolf-' + playerId;
  world.players[playerId] = { id: playerId, version: 0, name: index ? '舰长乙' : '舰长甲', factionId: null };
  world.fleets[fleetId] = { id: fleetId, version: 0, name: index ? '先锋舰队（开发）' : '远航舰队（开发）', owner, control: owner,
   locationId, position: [...respawn], memberIds: [memberId], partyId: null, encounterId: null, cargo: { supplies: 30, fuel: 20, crew: 15 } };
  world.members[memberId] = { id: memberId, version: 0, fleetId, owner, loadout: { hullId: 'wolf' },
   condition: { status: 'ready', hullFraction: 1, combatReadiness: 0.7, armor: null, ammunition: {} } };
 }
 world.extensions[CORVUS_DEVELOPMENT_EXTENSION_ID] = { id: CORVUS_DEVELOPMENT_EXTENSION_ID, version: 0, schemaVersion: 1,
  data: { scenario: 'web-authored-corvus-development', scenarioVersion,
   worldId: id, seed, seedScope: 'Web fallback identity only; no Java/procgen RNG parity',
   renderPhasePolicy: 'Persist surfacePhase=0 as a Web development phase, not native random angle; cloudPhase=0 follows initial cloudAngle.',
   officialNewGame: false, newGamePreludeExecuted: false, simulationStatus: 'inspection-only-terrain-and-topology-unavailable',
   blueprint: { id: blueprint.id, sha256: sourceDigest, digestFormat: 'sha256-canonical-json', scope: blueprint.scope, sources: blueprint.sources },
   identityByHandle, initializationOrder, orderingPolicy: 'Web deterministic focus-first, not native collection iteration parity',
   spawn: { position: respawn, source: blueprint.system.respawn.source,
    policy: 'Both QA fleets use the exact SectorGen respawn coordinate, not a claimed native new-game spawn.',
    loadout: 'Two development Wolf fleets copied in intent from the existing QA fixture; not a native starting fleet.',
    calendar: 'development-no-time-pass; no time advance or original new-game simulation' },
   unimplementedTerrain: terrain,
   omittedAuthoredRecords: blueprint.entities.filter(e => !instantiateKinds.has(e.kind)),
   pendingStages: blueprint.stages, pendingPostprocessing: blueprint.postprocessing,
   // Abandoned market identity is assembled as metadata; the storage plugin/cargo helper is NOT claimed executed.
   marketPolicy: 'Market rows are linkable metadata; all native trade snapshots, inventories, balances and price state remain unavailable.',
   limits: ['No hyperspace location, well, endpoint or jump destination is fabricated.',
    'No terrain sampler, outer-system procgen, condition generator, abandoned ship, economy warmup or lifecycle script ran.',
    'Authoritative world.advance and fleet travel fail at the existing terrain gate; caller should display a frozen inspection scene.',
    'Faction identities/names are definitions; playerRoles is empty and diplomacy/governance have not been initialized.'] } };
 const result = validateCampaignWorld(world);
 rules.validateWorld(result);
 return result;
}
