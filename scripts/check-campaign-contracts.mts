/** Compile only: validates browser/authority .mjs declarations and negative contracts. */
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { createCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
import type { CampaignCommand, CampaignRuleProvider, CommandReceipt, DeepReadonly, ReadonlyWorld } from '../src/campaign/Types.js';
import type { LogisticsInput, LogisticsQuote } from '../src/campaign/rules/OriginalLogistics.mjs';

const rules = createReferenceRuleset();
const world = createCampaignWorld({ id: 'typecheck', rules: rules.lock, contentFingerprint: 'test' });
const command: CampaignCommand = { worldId: world.id, epoch: 'epoch', requestId: 'r', type: 'party.invite', payload: {},
  expected: [{ collection: 'fleets', id: 'a', version: 0 }] };
const provider: CampaignRuleProvider = { id: 'custom.research', service: 'research', version: '1', apiVersion: 1, capabilities: [],
  commands: { 'research.unlock': (ctx, _payload) => {
    const row = ctx.requireVersion('fleets', 'a');
    const fuel: number | undefined = row.cargo.fuel;
    return { changes: [], events: [], result: { observedFuel: fuel ?? 0 } };
  } },
};
new CampaignRuleRegistry().register(provider).compile({ id: 'custom', version: '1', providers: { research: provider.id } });

function authorityContract(store: CampaignRepository, service: CampaignService, input: LogisticsInput) {
  const receipt: DeepReadonly<CommandReceipt> = store.execute({ kind: 'player', id: 'a' }, command);
  const workerReceipt: Promise<DeepReadonly<CommandReceipt>> = service.execute({ kind: 'system', id: 'world-service' }, command);
  const quote: LogisticsQuote = rules.services.logistics.quote(input);
  const workerQuote: Promise<DeepReadonly<LogisticsQuote>> = service.quoteLogistics(input);
  // @ts-expect-error persisted world is recursively readonly
  world.fleets.a.cargo.fuel = 0;
  // @ts-expect-error campaign commands only name known collections
  command.expected.push({ collection: 'random-table', id: 'a', version: 0 });
  // @ts-expect-error frontend cannot invent a new principal kind
  service.execute({ kind: 'host', id: 'a' }, command);
  // @ts-expect-error entity versions are numbers, not coercible strings
  command.expected[0].version = '1';
  return { receipt, workerReceipt, quote, workerQuote };
}
void authorityContract;

function resolvedLogisticsContract() {
  const fleet = world.fleets.a;
  const members = fleet.memberIds.map(id => world.members[id]);
  const stats = rules.services.fleetStats.resolve(fleet, members, { world });
  const input = { fleet, members, ticks: 60, aiMode: false,
    motion: { speed: 0, inHyperspace: false, hyperFuelMultiplier: 1, normalFuelMultiplier: 0, hiddenFuelMultiplier: 1 } };
  const result = rules.services.logistics.advance(input);
  const days: number = result.elapsedGameSeconds / 10;
  const crew: number = stats.members[0].assignedCrew;
  return { days, crew };
}
void resolvedLogisticsContract;

function simulationContract(service: CampaignService) {
  const starts: Promise<import('../server/campaign/SimulationLoop.mjs').SimulationStatus> = service.startSimulation(world.id);
  const stops: Promise<import('../server/campaign/SimulationLoop.mjs').SimulationStatus> = service.stopSimulation(world.id);
  const status = service.simulationStatus(world.id);
  // @ts-expect-error caller must name a world, not supply a clock or system principal
  service.startSimulation({ worldId: world.id, tick: 100 });
  void status.then(value => {
    const phase: 'running' | 'stopped' | 'error' = value.status;
    const tick: number = value.tick;
    // @ts-expect-error a status reply is immutable
    value.tick = 0;
    // @ts-expect-error an unknown status is not silently accepted
    const invalid: 'offline' = value.status;
    return { phase, tick, invalid };
  });
  return { starts, stops, status };
}
void simulationContract;

function navigationContract() {
  const fleet = world.fleets.a, members = fleet.memberIds.map(id => world.members[id]);
  const description = rules.services.travel.describe(world, fleet, members, rules.services.fleetStats.resolve);
  const next = rules.services.travel.advance(fleet, description, 1 / 60);
  const speed: number = description.motion.speed;
  const position: readonly [number, number] = next.fleet.position;
  // @ts-expect-error NPC classification is explicit, not another player's ID
  const invalidController: import('../src/campaign/Types.js').FleetControl = { kind: 'npc', id: 'a' };
  // @ts-expect-error authority-returned navigation is immutable
  next.fleet.navigation!.velocity[0] = 300;
  return { speed, position, invalidController };
}
void navigationContract;

// Jump service declarations are checked separately from the untyped rule registry.
import { originalFleetRadius, quoteOriginalJumpFuel, nearestOriginalGravityWell, advanceOriginalTransitions } from '../src/campaign/rules/OriginalTransitions.mjs';
export function transitionContracts(world: ReadonlyWorld) {
  const fleet = world.fleets.a, members = fleet.memberIds.map(id => world.members[id]);
  const rules = createReferenceRuleset();
  const stats = rules.services.fleetStats.resolve(fleet, members, { world });
  const fee: number = quoteOriginalJumpFuel(stats, false), radius: number = originalFleetRadius(members);
  const well = nearestOriginalGravityWell(world, fleet);
  const next = advanceOriginalTransitions(world, fleet, members);
  const position: readonly [number, number] = next.fleet.position;
  const events: string[] = next.events.map(e => e.type);
  return { fee, radius, well, position, events };
}

import { projectCampaignPlayer } from '../server/campaign/PlayerProjection.mjs';
import { listenCampaignGateway } from '../server/campaign/HttpGateway.mjs';
export function projectionContract(world: ReadonlyWorld) {
  const view = projectCampaignPlayer(world, 'a');
  const name: string = view.self.name;
  // @ts-expect-error projection does not expose arbitrary persisted extensions
  const hidden = view.extensions;
  // @ts-expect-error scoped projection must stay readonly
  view.fleets[0].position[0] = 4;
  return { name, hidden };
}
void listenCampaignGateway;

export async function hudProjectionContract(service: CampaignService) {
  const view = await service.projectPlayer(world.id, 'a');
  const stats = view.fleets[0].private?.logistics;
  const capacity: number | undefined = stats?.fuelCapacity;
  // @ts-expect-error projection cannot be used to transfer another player's ownership
  void view.fleets[0].owner;
  if (stats) {
    // @ts-expect-error published computed statistics are immutable
    stats.fuelCapacity = 0;
  }
  return capacity;
}

// Generic versioned JSON stays deeply immutable without recursive type-instantiation failure.
const bodyKind = world.spaceEntities.corvus.presentation?.kind;
void bodyKind;
const sourceObject = world.spaceEntities.corvus.presentation?.extra;
if (sourceObject && typeof sourceObject === 'object' && !Array.isArray(sourceObject)) {
  // @ts-expect-error readonly JSON dictionaries cannot be mutated
  sourceObject.mutated = true;
}
const nativeHullId: string = world.members.ship.loadout.hullId;
void nativeHullId;

export async function cargoPreviewContract(service: CampaignService) {
  const quote = await service.quoteCargo(world.id, 'a', {
    worldId: world.id, epoch: 'authority-epoch', fleetId: 'fleet', fleetVersion: 0,
    memberVersions: [{ id: 'ship', version: 0 }], cargo: { supplies: 10 },
  });
  const count: number | undefined = quote.logistics?.cargoSpaceUsed;
  // @ts-expect-error read-only presentation queries are not command receipts
  void quote.requestId;
  // @ts-expect-error published quote cargo is immutable
  quote.cargo.supplies = 900;
  // @ts-expect-error published member context is immutable
  quote.memberVersions[0].version = 1;
  return count;
}

export async function cargoQuickContract(service: CampaignService) {
  const quote = await service.quoteCargo(world.id, 'a', { worldId: world.id, epoch: 'epoch', fleetId: 'fleet', fleetVersion: 0,
    memberVersions: [{ id: 'ship', version: 0 }], cargo: { supplies: 10 }, quickTransfer: { side: 'hold', id: 'supplies', quantity: 10 } });
  const amount: number | undefined = quote.quickTransfer?.amount;
  if (quote.quickTransfer) {
    // @ts-expect-error read-only gesture quotes cannot be overwritten
    quote.quickTransfer.amount = 500;
  }
  return amount;
}

export async function marketBasketContract(service: CampaignService) {
  const quote = await service.quoteMarketBasket(world.id, 'a', {
    worldId: world.id, epoch: 'authority-epoch', marketId: 'port', submarketId: 'open', fleetId: 'fleet', accountId: 'a',
    items: [{ commodityId: 'supplies', side: 'buy', quantity: 2 }],
  });
  const net: number = quote.creditsDelta;
  // @ts-expect-error basket quotation is immutable, not a writable order
  quote.items[0].quantity = 9;
  // @ts-expect-error unified tariff must not be consumed as separately rounded line tariffs
  const lineTax = quote.items[0].tariff;
  // @ts-expect-error authenticated server supplies the principal, not the client
  await service.quoteMarketBasket(world.id, 'a', { marketId: 'port', principal: { kind: 'system', id: 'bad' } });
  void lineTax;
  return net;
}


import { refreshOriginalOpenMarketResources, advanceOriginalRetailTimer } from '../src/campaign/rules/OriginalOpenMarketStockpile.mjs';
import { advanceOriginalRetailFrame } from '../src/campaign/rules/OriginalRetail.mjs';
export function retailContracts(capturedWorld: ReadonlyWorld) {
  const plan = advanceOriginalRetailFrame(capturedWorld);
  const result = refreshOriginalOpenMarketResources({ marketId: 'port', submarketSpecId: 'open_market', month: 1, stability: 10,
    sinceLastCargoUpdate: advanceOriginalRetailTimer(31, 60, 60), inventory: { supplies: 0 },
    commodities: [{ commodityId: 'supplies', shippingGlobal: 4, available: 5, maxSupply: 5, maxDemand: 4 }], illegalCommodityIds: [] });
  // @ts-expect-error pure native refresh output is not a mutable authority inventory
  result.inventory.supplies = 900;
  // @ts-expect-error frame effects are immutable and cannot smuggle writes after validation
  plan.changes.push({});
  const allowed: boolean = rules.canWriteExtension('world.advance', 'reference.open-retail:port', 'system');
  return { result, allowed };
}

import { newOriginalResourceIndustry, applyOriginalResourceDeposit, applyOriginalResourceIndustry, originalResourceIndustryOutput } from '../src/campaign/rules/OriginalResourceIndustries.mjs';
export function resourceIndustryContracts() {
  const state = newOriginalResourceIndustry('farming');
  const operating = { disrupted: false, building: false, upgradeId: null } as const;
  const deposited = applyOriginalResourceDeposit({ conditionId: 'farmland_poor', modId: 'farmland_poor', marketSize: 4, industries: [{ state, operating }] });
  const empty = { base: 0, modifiers: { flat: [], percent: [], mult: [] } } as const;
  const applied = applyOriginalResourceIndustry({ state: deposited.industries[0].state, marketSize: 4, operating, available: { heavy_machinery: 1 },
    modifiers: { aiCoreId: null, improved: false, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: empty, demandReductionFromOther: empty, specialItemId: null } });
  const result = originalResourceIndustryOutput(applied, { commodityId: 'food', illegal: false });
  const amount: number = result.supply;
  // @ts-expect-error source-derived state is immutable, not a mutable simulation authority
  applied.supply.food.base = 200;
  // @ts-expect-error only the audited resource-industry implementations are currently supported
  newOriginalResourceIndustry('population');
  // @ts-expect-error no synthetic current market snapshot is produced by an industry method
  void applied.asOfTick;
  return amount;
}

import { newOriginalCivicIndustry, applyOriginalCivicIndustry } from '../src/campaign/rules/OriginalCivicIndustries.mjs';
import { reapplyOriginalIndustryCommodityPass } from '../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
import { resolveOriginalIndustryCommodityAmounts } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
export function civicIndustryContracts() {
  const empty = { base: 0, modifiers: { flat: [], percent: [], mult: [] } } as const;
  const modifiers = { aiCoreId: null, improved: false, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: empty, demandReductionFromOther: empty, specialItemId: null } as const;
  const operating = { disrupted: false, building: false, upgradeId: null } as const;
  const state = applyOriginalCivicIndustry({ state: newOriginalCivicIndustry('spaceport'), marketSize: 4, habitable: true, operating, modifiers });
  const result = reapplyOriginalIndustryCommodityPass({ marketSize: 4, freePort: false, factionIllegalCommodityIds: [], conditions: [], industries: [{ state, operating, modifiers }], available: { heavy_machinery: 0 }, commodities: [{ commodityId: 'ships', previousSupplyLegal: false, previousDemandLegal: false }] });
  const scope: 'selected-commodity-effects-only' = result.scope;
  const aggregate = resolveOriginalIndustryCommodityAmounts({ commodityId: 'ships', industries: [], previousSupplyLegal: false, previousDemandLegal: false });
  // @ts-expect-error commodity scope must not be treated as completed native economy work
  void result.completedTask;
  // @ts-expect-error computed industry quantities are immutable snapshots
  result.industries[0].state.supply.ships.base = 90;
  // @ts-expect-error no primary-price or inventory authorization is granted by aggregation
  void aggregate.inventory;
  // @ts-expect-error unsupported industry plugins cannot be built through this factory
  newOriginalCivicIndustry('refining');
  return { scope, aggregate };
}

import { computeOriginalGroupAccessibility, reapplyOriginalLocalAccessibility } from '../src/campaign/rules/OriginalMarketAccessibility.mjs';
import { resolveOriginalCommodityNetwork } from '../src/campaign/rules/OriginalCommodityNetwork.mjs';
export function accessibilityContracts() {
  const state = reapplyOriginalLocalAccessibility({ accessibility: { flat: [], percent: [], mult: [] }, hasSpaceport: false, marketSize: 3, firstQueuedIndustryHasSpaceportTag: false, conditions: [], freeMarketDaysByModId: {}, industries: [] });
  const result = computeOriginalGroupAccessibility({ econGroup: null, roster: [{ marketId: 'a', econGroup: null }], markets: [{ marketId: 'a', factionId: 'independent', size: 3, location: { x: 0, y: 0 }, accessibility: state.accessibility }], hostility: { independent: {} } });
  const source = resolveOriginalCommodityNetwork({ econGroup: null, roster: [], markets: [], hostility: {}, commodityId: 'ships' });
  const scope: 'commodity-network-effects-only' = source.scope;
  // @ts-expect-error network effects are not an economy scheduler completion certificate
  void source.completedTask;
  // @ts-expect-error group output must not be mutated by downstream price/stockpile calculators
  result.markets[0].accessibility.flat.push({ id: 'fake', value: 9 });
  // @ts-expect-error no current trade snapshot is minted by a local access reapplication
  void state.asOfTick;
  return { scope, result };
}

import { reapplyOriginalMarketStability, originalMismanagementPenalty } from '../src/campaign/rules/OriginalMarketStability.mjs';
export function stabilityContracts() {
  const zero = { base: 0, modifiers: { flat: [], percent: [], mult: [] } } as const;
  const result = reapplyOriginalMarketStability({ commodityPass: { marketSize: 3, freePort: false, factionIllegalCommodityIds: [], conditions: [], industries: [], available: { heavy_machinery: 0 }, commodities: [{ commodityId: 'food', previousSupplyLegal: true, previousDemandLegal: true }] }, stability: zero, incomeMult: { ...zero, base: 1 }, upkeepMult: { ...zero, base: 1 }, maxIndustries: zero.modifiers, previousStability: -1, hazard: 1, governance: { marketId: 'm', markets: [{ marketId: 'm', playerOwned: false, adminIsPlayer: false }], maxOutposts: 2 }, constructionQueue: [], conditionStateByModId: {}, marketCommodities: [{ commodityId: 'food', maxDemand: 0, maxSupply: 0, available: 0, shippingFaction: 0, maxExportFaction: 0 }] });
  const scope: 'local-stability-and-population-financial-factors-only' = result.scope;
  // @ts-expect-error local colony factors cannot certify an economy task or authorize a fresh market
  void result.completedTask;
  // @ts-expect-error ordered stability modifiers are immutable
  result.stability.modifiers.flat.push({ id: 'fake', value: 99 });
  // @ts-expect-error total market income is not calculated from an income multiplier alone
  void result.income;
  return { scope, penalty: originalMismanagementPenalty({ markets: [], maxOutposts: 2 }) };
}

import { newOriginalIndustryFinances, updateOriginalIndustryFinances, summarizeOriginalMarketFinances } from '../src/campaign/rules/OriginalMarketFinance.mjs';
import { resolveOriginalCommodityFinance } from '../src/campaign/rules/OriginalCommodityFinance.mjs';
export function financeContracts() {
  const industry = updateOriginalIndustryFinances({ state: newOriginalIndustryFinances('population'), marketSize: 5, phase: 'income-refresh', marketIncomeMult: 1, marketUpkeepMult: 1, operating: { disrupted: false, building: false, upgradeId: null }, aiCoreId: null, specialItemId: null, portInputs: null });
  const market = summarizeOriginalMarketFinances({ industries: [industry.state], commodities: [{ commodityId: 'food', networkInitialized: false, exportIncome: null }], shortageCountering: { enabled: false, cost: null }, immigrationIncentives: { enabled: false, cost: null } });
  const group = resolveOriginalCommodityFinance({ network: { commodityId: 'food', econGroup: null, roster: [], markets: [], hostility: {} }, financialMarkets: [] });
  const scope: 'original-single-player-commodity-financial-effects-only' = group.scope;
  // @ts-expect-error neither projected monthly income nor export values are an authority account balance
  void market.accountBalance;
  // @ts-expect-error income methods do not certify a complete native economy task
  void group.completedTask;
  // @ts-expect-error financial snapshots cannot be edited by clients
  industry.state.income.base = 9;
  return { scope, market };
}

import { newOriginalMarketHazard, reapplyOriginalColonyEnvironment, reapplyOriginalEnvironmentalFinancialPass, type OriginalEnvironmentalFinancialInput } from '../src/campaign/rules/OriginalColonyEnvironment.mjs';
import { computeOriginalIncoming, originalImmigrationHazardEffects, type OriginalImmigrationInput } from '../src/campaign/rules/OriginalImmigration.mjs';
export function immigrationContracts(input: DeepReadonly<OriginalImmigrationInput>, financialInput: DeepReadonly<OriginalEnvironmentalFinancialInput>) {
  const environment = reapplyOriginalColonyEnvironment({ hazard: newOriginalMarketHazard(), modifiers: { permanent: [], transient: [] }, conditions: [], industries: [] });
  const result = computeOriginalIncoming(input), finances = reapplyOriginalEnvironmentalFinancialPass(financialInput);
  const incomingScope: 'supported-native-incoming-phase-only' = result.scope;
  const environmentScope: 'supported-hazard-and-immigration-registration-only' = environment.scope;
  // @ts-expect-error current incoming phase does not advance population or grow market size
  void result.population;
  // @ts-expect-error projected incentives do not settle an authoritative account
  void result.accountBalance;
  // @ts-expect-error callback lists are immutable returned state
  environment.modifiers.transient.push({ kind: 'industry', id: 'population' });
  // @ts-expect-error the composed finance pass derives hazard; callers cannot inject a guessed scalar
  void financialInput.financial.local.hazard;
  // @ts-expect-error native incoming amount is immutable
  result.incoming.composition[0].amount = 9;
  return { incomingScope, environmentScope, finances, hazard: originalImmigrationHazardEffects({ hazard: 1.5, marketSize: 5 }) };
}

import { advanceOriginalPopulation, newOriginalPopulation, type OriginalPopulationState, type OriginalPopulationGrowthDriver } from '../src/campaign/rules/OriginalPopulation.mjs';
import { reapplyOriginalPopulationGrowth, replaceOriginalPopulationConditions, type OriginalPopulationLocalGrowthInput } from '../src/campaign/rules/OriginalPopulationGrowth.mjs';
export function populationContracts(input: DeepReadonly<OriginalPopulationState>, growthInput: DeepReadonly<OriginalPopulationLocalGrowthInput>, grow: OriginalPopulationGrowthDriver) {
  const result = advanceOriginalPopulation(input, grow), growth = reapplyOriginalPopulationGrowth(growthInput);
  const scope: 'native-population-advance-with-explicit-growth-effects' = result.scope;
  const localScope: 'local-growth-reapplication-only' = growth.scope;
  const initial = newOriginalPopulation('player', 3);
  const conditions = replaceOriginalPopulationConditions({ conditions: [], fromSize: 3, newModId: 'population_4_new', suppressed: false });
  // @ts-expect-error population calculation does not certify a whole-sector economy task
  void result.completedTask;
  // @ts-expect-error population and condition outputs are immutable
  initial.composition[0].amount = 9;
  // @ts-expect-error driver completion is synchronous; deferred reapply is not equivalent to native advance
  advanceOriginalPopulation(input, async request => grow(request));
  // @ts-expect-error source captures for growth must include actual environment/financial state
  reapplyOriginalPopulationGrowth({ fromSize: 3, immigration: input.immigration });
  return { scope, localScope, conditions };
}


import { OriginalEconomyTaskRunner, originalEconomyCommodityOrder, type OriginalEconomyTaskRuntime } from '../src/campaign/rules/OriginalEconomyTasks.mjs';
import { OriginalCommodityNetworkCache, originalCachedCommodityExportIncome, type OriginalCommodityCacheRuntime } from '../src/campaign/rules/OriginalCommodityCache.mjs';
import { resolveOriginalCommodityMaxima } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
export function economyTaskAndCacheContracts(runtime: OriginalEconomyTaskRuntime, cacheRuntime: OriginalCommodityCacheRuntime) {
  const runner = new OriginalEconomyTaskRunner(runtime, { mode: 'scheduled', lastIteration: false });
  const status = runner.step(), cache = new OriginalCommodityNetworkCache(cacheRuntime), entry = cache.get('a', 'lobster');
  const scope: 'native-economy-task-orchestration-only' = status.scope;
  const cacheScope: 'native-commodity-cache-object' = entry.scope;
  const amounts = resolveOriginalCommodityMaxima({ commodityId: 'lobster', industries: [], previousSupplyLegal: true, previousDemandLegal: false });
  const specs = originalEconomyCommodityOrder([{ id: 'lobster', economyTier: Math.fround(2.8), tags: [] }]);
  // @ts-expect-error finishing dependency callbacks is not a whole-world freshness certificate
  void status.asOfTick;
  // @ts-expect-error cached computation does not publish a tradable inventory
  void entry.inventory;
  // @ts-expect-error cached entries are immutable authority-draft snapshots
  entry.serial = 40;
  // @ts-expect-error commodity task order cannot be mutated by clients
  specs.push('food');
  // @ts-expect-error forced entry requires all native work flags, not scheduled options
  new OriginalEconomyTaskRunner(runtime, { mode: 'forced', lastIteration: false });
  // @ts-expect-error deferred capture cannot supply a synchronous native constructor
  new OriginalCommodityNetworkCache({ ...cacheRuntime, capture: async (id, group) => cacheRuntime.capture(id, group) });
  // @ts-expect-error listener expiration is a synchronous boolean
  new OriginalEconomyTaskRunner({ ...runtime, isEconomyListenerExpired: async () => false }, { mode: 'scheduled', lastIteration: false });
  const income = originalCachedCommodityExportIncome({ sourceIsIllegal: false, exportMarketShare: 0.5, marketValue: 2000, incomeMult: { base: 1, modifiers: { flat: [], percent: [], mult: [] } }, playerOwned: false, playerCommodityExportMult: null });
  return { scope, cacheScope, amounts, income, shipping: cache.getShipping('a') };
}

import { updateOriginalCommodityClassPrices, type OriginalClassPricingInput } from '../src/campaign/rules/OriginalCommodityClassPricing.mjs';
export function commodityClassPricingContracts(input: DeepReadonly<OriginalClassPricingInput>) {
  const result = updateOriginalCommodityClassPrices(input);
  const scope: 'native-demand-class-stockpile-and-price-effects-only' = result.scope;
  const price: number = result.commodities[0].supplyPrice.basePrice;
  // @ts-expect-error class pricing cannot certify live trade inventory or authority freshness
  void result.inventory;
  // @ts-expect-error demand belongs to the class, not to independent commodity copies
  void input.commodities[0].demandStat;
  // @ts-expect-error only real final/forced stockpile phases are admitted
  updateOriginalCommodityClassPrices({ ...input, phase: 'per-tick' });
  // @ts-expect-error returned shared demand and per-commodity state are immutable
  result.demandStat.modifiers.flat.push({ id: 'fake', value: 99 });
  // @ts-expect-error prices may not be independently overwritten by presentation
  result.commodities[0].stockpile = 100;
  return { scope, price };
}

import { extractNativeSaveEconomy, summarizeNativeSaveEconomy } from './lib/campaign-native-save.mjs';
export function nativeSaveInputContracts(campaignXML: string, descriptorXML: string) {
  const capture = extractNativeSaveEconomy(campaignXML, descriptorXML), summary = summarizeNativeSaveEconomy(capture);
  const scope: 'serialized-native-economy-inputs-not-restored-world' = capture.scope;
  const ready: false = summary.readyForAuthority;
  const sharedDemandRef: string = capture.markets[0].commodities[0].demandRef;
  // @ts-expect-error a serialized save is not an economy freshness certificate
  void capture.asOfTick;
  // @ts-expect-error pre-save removed industry maps are not restored numeric outputs
  void capture.markets[0].industries[0].supply;
  // @ts-expect-error cache values never replace the native mutable stat structure
  const _demand: number = capture.markets[0].demandClasses[0].demand;
  // @ts-expect-error capture cannot become authoritative by changing a readiness flag
  capture.reconstruction.readyForAuthority = true;
  return { scope, ready, sharedDemandRef };
}

// Production callbacks retain explicit native-quality/admin/availability inputs and frozen results.
import { newOriginalProductionIndustry, applyOriginalProductionIndustry, type OriginalProductionIndustryInput, type OriginalProductionIndustryResult } from '../src/campaign/rules/OriginalProductionIndustries.mjs';
const productionContractInput: DeepReadonly<OriginalProductionIndustryInput> = {
 state: structuredClone(newOriginalProductionIndustry('fuelprod')), marketSize: 6, operating: { disrupted: false, building: false, upgradeId: null },
 modifiers: { aiCoreId: 'alpha_core', improved: true, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: { base: 0, modifiers: { flat: [], percent: [], mult: [] } }, demandReductionFromOther: { base: 0, modifiers: { flat: [], percent: [], mult: [] } }, specialItemId: 'synchrotron' },
 available: { volatiles: 6 }, illegalCommodityIds: [], conditionIds: ['no_atmosphere'], adminFuelSupplyBonus: 1, previousStability: 5, productionQuality: { flat: [], percent: [], mult: [] }
};
const productionContractResult: DeepReadonly<OriginalProductionIndustryResult> = structuredClone(applyOriginalProductionIndustry(productionContractInput));
void productionContractResult;

// @ts-expect-error Frozen quality modifier arrays cannot be appended by UI code.
productionContractResult.productionQuality.flat.push({ id: 'ui', value: 1 });
// @ts-expect-error The explicit native availability/admin/quality inputs cannot be omitted.
applyOriginalProductionIndustry({ state: newOriginalProductionIndustry('refining'), marketSize: 6 });

import { newOriginalSpecialIndustry, applyOriginalSpecialIndustry, type OriginalSpecialIndustryInput } from '../src/campaign/rules/OriginalSpecialIndustries.mjs';
import { newOriginalHeavyIndustryPollution, updateOriginalHeavyIndustryPollution } from '../src/campaign/rules/OriginalHeavyIndustryPollution.mjs';
const specialContract: DeepReadonly<OriginalSpecialIndustryInput>={state:newOriginalSpecialIndustry('techmining'),marketSize:6,operating:{disrupted:false,building:false,upgradeId:null},modifiers:{...productionContractInput.modifiers,specialItemId:null},available:{},factionId:'independent',techMiningMult:{base:1,modifiers:{flat:[],percent:[],mult:[]}}};
const specialContractResult=applyOriginalSpecialIndustry(specialContract);
// @ts-expect-error Authoritative dynamic modifiers remain immutable.
specialContractResult.techMiningMult.base=0;
const pollutionContractResult=updateOriginalHeavyIndustryPollution({state:newOriginalHeavyIndustryPollution(),event:'advance',specialItemId:'pristine_nanoforge',days:1,habitable:true,pollutionPresent:false});
// @ts-expect-error Condition events are immutable native callback results, not editable UI state.
pollutionContractResult.conditionEffects.push({action:'add',conditionId:'pollution'});


import { applyOriginalAdditionalCondition, applyOriginalAdditionalIncoming, type OriginalAdditionalConditionInput } from '../src/campaign/rules/OriginalAdditionalConditions.mjs';
import { reapplyOriginalMarketConditions, type OriginalConditionRuntime } from '../src/campaign/rules/OriginalMarketConditions.mjs';
export function additionalConditionContracts(input:DeepReadonly<OriginalAdditionalConditionInput>,runtime:OriginalConditionRuntime<{id:string}>) {
 const result=applyOriginalAdditionalCondition(input),pass=reapplyOriginalMarketConditions(runtime);
 const scope:'additional-condition-local-effects-only'=result.scope;
 // @ts-expect-error Local callbacks do not certify inventory or economy freshness.
 void result.readyForAuthority;
 // @ts-expect-error Returned native state is immutable.
 result.state.industries[0].supplyBonusFromOther.base=10;
 // @ts-expect-error Pather cells require explicit intel state, not a guessed null.
 applyOriginalAdditionalCondition({conditionId:'pather_cells',context:null,modId:'pather_1',action:'apply',state:result.state});
 // @ts-expect-error Async apply must not masquerade as an ordered native callback.
 reapplyOriginalMarketConditions({...runtime,apply:async()=>{}});
 // @ts-expect-error A registered immigration callback is not an arbitrary condition function.
 applyOriginalAdditionalIncoming({conditionId:'solar_array',modId:'solar_1',marketSize:6,playerOwned:true,defeatedExpedition:false,incoming:{composition:[],weight:{base:0,modifiers:{flat:[],percent:[],mult:[]}}}});
 return {scope,pass};
}


import { reapplyOriginalConditionPhase, type OriginalConditionPhaseCapture } from '../src/campaign/rules/OriginalConditionPhase.mjs';
import { reapplyOriginalIndustryCommodityPass as checkedConditionCommodityPass, type OriginalIndustryCommodityPassInput } from '../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
export function conditionPhaseContracts(input:DeepReadonly<OriginalIndustryCommodityPassInput>,capture:DeepReadonly<OriginalConditionPhaseCapture>) {
 const phase=reapplyOriginalConditionPhase({...capture,marketSize:input.marketSize,conditions:input.conditions,industries:input.industries});
 const result=checkedConditionCommodityPass({...input,conditionPhase:capture});
 const scope:'ordered-condition-local-effects-only'|undefined=result.conditionPhase?.scope;
 // @ts-expect-error Condition scope is not an authoritative market refresh.
 void phase.asOfTick;
 // @ts-expect-error Condition stat results cannot be edited by presentation.
 phase.state.officerMercProbability.flat.push({id:'ui',value:1});
 // @ts-expect-error The common condition phase requires the original state and per-plugin contexts.
 reapplyOriginalConditionPhase({marketSize:input.marketSize,conditions:input.conditions,industries:input.industries});
 return {scope,phase,result};
}


import { reapplyOriginalEnvironmentalFinancialPass as sharedEnvironmentalFinance } from '../src/campaign/rules/OriginalColonyEnvironment.mjs';
export function sharedFinancialDraftContracts(input:DeepReadonly<OriginalEnvironmentalFinancialInput>) {
 const result=sharedEnvironmentalFinance(input),diagnostics=result.financial.localEffects.diagnostics;
 const available:number|undefined=diagnostics.marketCommodities?.[0].available;
 const hazard:number|undefined=diagnostics.hazardAfterConditions;
 // @ts-expect-error Financial diagnostics retain immutable source-derived availability.
 diagnostics.marketCommodities?.push({commodityId:'food',maxDemand:1,maxSupply:1,available:1,shippingFaction:1,maxExportFaction:1});
 // @ts-expect-error Shared local finances do not certify a restored authoritative world.
 void result.readyForAuthority;
 return {available,hazard,result};
}


import { reapplyOriginalIndustryAccessibility, type LocalAccessibilityInput } from '../src/campaign/rules/OriginalMarketAccessibility.mjs';
export function extendedIncomingContracts(input: DeepReadonly<OriginalImmigrationInput>, access: DeepReadonly<LocalAccessibilityInput>) {
 const result = computeOriginalIncoming({...input, luddicMajorityState: {playerOwned: true, defeatedExpedition: false}});
 // @ts-expect-error Church multiplier getters are required together, not inferred from faction id.
 computeOriginalIncoming({...input, luddicMajorityState: {playerOwned: true}});
 // @ts-expect-error UI cannot rewrite condition-derived population composition.
 result.incoming.composition[0].amount = 0;
 const {conditions: _conditions, freeMarketDaysByModId: _ages, ...industryAccess} = access;
 const effects = reapplyOriginalIndustryAccessibility(industryAccess);
 const scope: 'industry-accessibility-effects-only' = effects.scope;
 // @ts-expect-error An industry-only phase cannot silently consume or replay conditions.
 reapplyOriginalIndustryAccessibility({...industryAccess, conditions: input.conditions});
 return {result, scope};
}


import { restoreOriginalIndustryStorage, type OriginalSerializedIndustryStorage } from '../src/campaign/rules/OriginalIndustryRestore.mjs';
import { prepareNativeIndustryStorage } from './lib/campaign-native-industry-storage.mjs';
import type { NativeSaveEconomyCapture } from './lib/campaign-native-save.mjs';
export function industryStorageContracts(input: DeepReadonly<OriginalSerializedIndustryStorage>, capture: DeepReadonly<NativeSaveEconomyCapture>) {
 const storage = restoreOriginalIndustryStorage(input), draft = prepareNativeIndustryStorage(capture);
 const notReady: false = draft.readyForAuthority;
 // @ts-expect-error Reconstructed storage is not editable authority state.
 storage.state.supplyBonus.base = 10;
 // @ts-expect-error Storage initialization is not a live market snapshot with price/inventory.
 void draft.markets[0].inventory;
 // @ts-expect-error Serialized fields must be explicitly null or decoded, not silently absent.
 restoreOriginalIndustryStorage({industryId:'farming', classAlias:'Farming', buildTime:1});
 return {storage,draft,notReady};
}


import { readOriginalIndustryRuntime, type OriginalIndustryRuntimeInput } from '../src/campaign/rules/OriginalIndustryRuntime.mjs';
export function nativeIndustryRuntimeContracts(input: DeepReadonly<OriginalIndustryRuntimeInput>) {
 const result=readOriginalIndustryRuntime(input);
 const scope:'native-industry-getters-without-time-advance'=result.scope;
 // @ts-expect-error Getter projections cannot mutate the industry operating state.
 result.operating.disrupted=false;
 // @ts-expect-error Explicit memory key presence is not equivalent to an omitted getter capture.
 readOriginalIndustryRuntime({...input,disruption:{key:'test',value:true,expires:[]}});
 // @ts-expect-error This phase does not provide administrator supply/demand effects.
 void result.adminSupplyBonus;
 return {scope,result};
}


import { applyOriginalPortItemAccessibility, originalPortItemRequirements, type OriginalPortItemContext } from '../src/campaign/rules/OriginalPortItems.mjs';
import type { OriginalCivicIndustryModifiers } from '../src/campaign/rules/OriginalCivicIndustries.mjs';
import type { EconomyBonus } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
export function nativePortItemContracts(context:DeepReadonly<OriginalPortItemContext>, accessibility:DeepReadonly<EconomyBonus>, modifiers:DeepReadonly<OriginalCivicIndustryModifiers>) {
 const result=applyOriginalPortItemAccessibility({industryId:'spaceport',itemId:'fullerene_spool',action:'apply',context,accessibility});
 const scope:'port-installed-item-accessibility-only'=result.scope;
 const removed=applyOriginalPortItemAccessibility({industryId:'megaport',itemId:'fullerene_spool',action:'unapply',context:null,accessibility});
 const spoolModifiers:DeepReadonly<OriginalCivicIndustryModifiers>={...modifiers,specialItemId:'fullerene_spool'};
 // @ts-expect-error Apply requires the native market getter capture.
 applyOriginalPortItemAccessibility({industryId:'spaceport',itemId:'fullerene_spool',action:'apply',context:null,accessibility});
 // @ts-expect-error Unapply never reads or guesses requirement getters.
 applyOriginalPortItemAccessibility({industryId:'spaceport',itemId:'fullerene_spool',action:'unapply',context,accessibility});
 // @ts-expect-error Returned modifiers are immutable.
 result.accessibility.flat[0].value=1;
 // @ts-expect-error Missing PlanetEntity must be explicit null, not a missing field.
 originalPortItemRequirements({industryId:'spaceport',itemId:'fullerene_spool',context:{conditionIds:[]}});
 // @ts-expect-error This item subphase does not publish market stock or authority.
 void result.readyForAuthority;
 return {scope,result,removed,spoolModifiers};
}


import {readOriginalMarketPlanet, type OriginalMarketPlanetInput} from '../src/campaign/rules/OriginalMarketPlanet.mjs';
export function nativeMarketPlanetContracts(input:DeepReadonly<OriginalMarketPlanetInput>,capture:DeepReadonly<NativeSaveEconomyCapture>) {
 const result=readOriginalMarketPlanet(input),draft=prepareNativeIndustryStorage(capture);
 const gas:boolean|null=result.planetIsGasGiant;
 const contextGas:boolean|null|undefined=draft.markets[0].portItemContext?.planetIsGasGiant;
 // @ts-expect-error PlanetAPI absence is explicitly null, not a missing connection capture.
 readOriginalMarketPlanet({primaryEntityRef:null});
 // @ts-expect-error Returned getter results are immutable.
 result.planetIsGasGiant=true;
 // @ts-expect-error Gas getter restoration does not produce an authority snapshot.
 void result.readyForAuthority;
 // @ts-expect-error A serialized planet type is not a runtime boolean getter.
 const _wrong:boolean=capture.markets[0].planetInput?.connectedEntities[0].planet?.type;
 return {result,draft,gas,contextGas};
}


import {reapplyOriginalGovernedSkills,type OriginalGovernedSkillsCapture,type OriginalGovernedSkillState} from '../src/campaign/rules/OriginalGovernedSkills.mjs';
export function governedSkillsContracts(input:DeepReadonly<OriginalIndustryCommodityPassInput>,capture:DeepReadonly<OriginalGovernedSkillsCapture>,state:DeepReadonly<OriginalGovernedSkillState>) {
 const r=reapplyOriginalGovernedSkills({skills:capture.skills,state});const combined=checkedConditionCommodityPass({...input,governedSkills:capture});
 const applied:readonly string[]|undefined=combined.governedSkillsPhase?.execution.applied;
 // @ts-expect-error Skill capture is not inferred from player ownership.
 reapplyOriginalGovernedSkills({playerOwned:true,state});
 // @ts-expect-error A lazy absent DynamicStats modifier must be explicit null, not an omitted capture.
 reapplyOriginalGovernedSkills({skills:[],state:{stability:state.stability,accessibility:state.accessibility}});
 // @ts-expect-error Returned governed snapshots cannot overwrite condition-end state.
 r.state.stability.base=2;
 // @ts-expect-error Governed callbacks do not imply restored character-stat supply_bonus.
 void r.adminSupplyBonus;
 return {r,combined,applied};
}


import {readOriginalAdministrator,restoreOriginalSavedSkillOrder,originalPersonDefaultAfterReadResolve,type OriginalAdministratorInput} from '../src/campaign/rules/OriginalAdministrator.mjs';
export function nativeAdministratorContracts(input:DeepReadonly<OriginalAdministratorInput>,capture:DeepReadonly<NativeSaveEconomyCapture>){
 const result=readOriginalAdministrator(input),draft=prepareNativeIndustryStorage(capture);
 const scope:'administrator-identity-and-governed-skill-input-draft'=result.scope;
 const personRef:string|null=result.selectedPersonRef;
 const skills:DeepReadonly<OriginalGovernedSkillsCapture>|null=draft.markets[0].governedSkillsDraft;
 const legacyCapture:NativeSaveEconomyCapture['markets'][number]['administratorCapture']=undefined;
 // @ts-expect-error Administrator selection requires explicit actual player/admin captures.
 readOriginalAdministrator({playerOwned:true});
 // @ts-expect-error A lazy missing CharacterStats is null, not an omitted field.
 readOriginalAdministrator({...input,administrator:{objectRef:'1',isDefault:false,aiCoreId:null,savedSkills:[]}});
 // @ts-expect-error Native float skill levels are numbers, not saved textual values.
 restoreOriginalSavedSkillOrder([{skillId:'hypercognition',level:'1'}]);
 // @ts-expect-error Missing portrait readResolve uses explicit null, not undefined.
 originalPersonDefaultAfterReadResolve(undefined);
 // @ts-expect-error An identity plan cannot execute a mutable world assignment.
 result.selectedPersonRef='42';
 // @ts-expect-error Governed skill projection does not restore character-stat supply bonuses.
 void result.adminSupplyBonus;
 return {scope,personRef,skills,legacyCapture};
}


import {reapplyOriginalCharacterIndustryStats,readOriginalAdministratorIndustryInputs,type OriginalCharacterIndustryStatsDraft} from '../src/campaign/rules/OriginalCharacterIndustryStats.mjs';
export function characterIndustryDraftContract(draft:DeepReadonly<OriginalCharacterIndustryStatsDraft>){
 const result=reapplyOriginalCharacterIndustryStats({...draft,skipRefresh:false});
 const supply:number=readOriginalAdministratorIndustryInputs(result.modifiers).adminSupplyBonus;
 // @ts-expect-error Character refresh timing cannot be inferred from the presence of a saved skill.
 reapplyOriginalCharacterIndustryStats(draft);
 // @ts-expect-error Player custom production is a StatBonus structure, not this administrator's market multiplier.
 const _production:number=result.modifiers.customProduction;
 // @ts-expect-error The projection cannot mutate captured modifiers.
 result.modifiers.supplyBonus!.flat.push({id:'client',value:10});
 return {result,supply};
}

import { restoreNativeConditionDrafts, prepareNativeConditionPhase } from './lib/campaign-native-condition-restore.mjs';
export function nativeConditionRestoreContract(capture:DeepReadonly<NativeSaveEconomyCapture>){
 const result=restoreNativeConditionDrafts(capture),storage=prepareNativeIndustryStorage(capture);
 const input=prepareNativeConditionPhase(capture.markets[0],storage.markets[0]);
 const notAuthority:false=result.readyForAuthority;
 const phaseInput = input.status==='prepared' ? input.input : null;
 // @ts-expect-error A partial load result is not a trade/retail snapshot.
 void result.inventory;
 // @ts-expect-error Drafts must never overwrite the private native capture.
 result.markets.push(result.markets[0]);
 return {result,input,phaseInput,notAuthority};
}

import { restoreNativeIndustryCommodityDrafts, prepareNativeIndustryCommodityPass } from './lib/campaign-native-industry-restore.mjs';
import { originalIndustryAvailabilityKeys } from '../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
export function nativeIndustryRestoreContracts(capture:DeepReadonly<NativeSaveEconomyCapture>){
 const storage=prepareNativeIndustryStorage(capture),prepared=prepareNativeIndustryCommodityPass(capture.markets[0],storage.markets[0]);
 const result=restoreNativeIndustryCommodityDrafts(capture),keys:readonly string[]=originalIndustryAvailabilityKeys(['farming','orbitalworks']);
 const authority:false=result.readyForAuthority;
 // @ts-expect-error Commodity outputs do not create a retail inventory.
 void result.inventory;
 // @ts-expect-error Do not mutate the original native snapshot through a draft.
 result.storage.markets[0].marketId='rewritten';
 return {prepared,result,keys,authority};
}

import { NativeLiveEconomyDraft } from './lib/campaign-native-live-economy.mjs';
export function nativeLiveEconomyContracts(capture:DeepReadonly<NativeSaveEconomyCapture>){
 const runtime=new NativeLiveEconomyDraft(capture),market=runtime.market(capture.marketRoster[0]);
 const orderedRuntime=new NativeLiveEconomyDraft(capture),ordered=orderedRuntime.reapplyEconomicEffects();
 const incoming=orderedRuntime.computeIncoming(ordered.markets[0].marketId,{days:0,uiUpdateOnly:true});
 // @ts-expect-error A growth-rate calculation cannot imply a world time advance without explicit phase options.
 orderedRuntime.computeIncoming(ordered.markets[0].marketId);
 // @ts-expect-error Incoming calculations do not deduct player account funds or settle a monthly ledger.
 void incoming.accountBalance;
 const orderedScope:'shared-offline-economy-economic-effects-only'=ordered.scope;
 // @ts-expect-error Offline economic effects cannot authorize publishing a retail market.
 const _ready:true=ordered.readyForAuthority;
 const factors=runtime.modifyPopulationStability(market.marketId),factorsScope:'live-population-financial-factors-only'=factors.scope;
 const finance=runtime.refreshIndustryFinances(market.marketId,market.industries[0].state.industryId);
 const sameDraft=market.industries;market.incomeMult.base=1; // Trusted native callbacks share mutable transaction handles.
 const snapshot=runtime.snapshot(),authority:false=snapshot.readyForAuthority;
 // @ts-expect-error External snapshot readers cannot modify shared runtime state.
 snapshot.markets[0].incomeMult.base=2;
 // @ts-expect-error A network draft does not grant market trading admission.
 void snapshot.admission;
 return {sameDraft,snapshot,authority,factorsScope,finance,orderedScope,incoming};
}

// Pure native motion modules are reusable without a CampaignFleet/UI implementation.
import { createOriginalSmoothMovement, advanceOriginalSmoothMovement, createOriginalSmoothFacing, advanceOriginalSmoothFacing, getOriginalMovementFacing } from '../src/campaign/rules/OriginalMovement.mjs';
function nativeFleetMotionContract() {
  const delegate = { travelSpeed: 200 };
  const movement = createOriginalSmoothMovement(1, 2, delegate);
  const advanced = advanceOriginalSmoothMovement(movement, [100, 0], [0, 0], 1 / 60, {
    travelSpeedOf: d => d.travelSpeed, fleetTravelSpeed: () => delegate.travelSpeed,
  });
  const position: [number, number] = advanced.position;
  const facing = advanceOriginalSmoothFacing(createOriginalSmoothFacing(150, 100), getOriginalMovementFacing(advanced.velocity), 1 / 60);
  // @ts-expect-error delegate speed comes from the declared actual delegate object
  advanceOriginalSmoothMovement(movement, [0, 0], [0, 0], 1, { travelSpeedOf: (d: { speed: number }) => d.speed });
  // @ts-expect-error a motion vector has exactly two components
  getOriginalMovementFacing([1, 2, 3]);
  return { position, facing };
}
void nativeFleetMotionContract;

function nativeFleetCommanderContract(draft:import('./lib/campaign-native-live-economy.mjs').NativeLiveEconomyDraft,dataRef:string) {
  const made=draft.initializeFleetCommander(dataRef,'independent',{isInSectorGen:false});
  const current:import('../src/campaign/rules/OriginalPlayerEconomy.mjs').OriginalPayrollPerson=draft.getNativeFleetCommander(dataRef);
  const cleared:import('../src/campaign/rules/OriginalPlayerEconomy.mjs').OriginalPayrollPerson|null=draft.setNativeFleetCommander(dataRef,null);
  draft.setNativeFleetCommander(dataRef,made.objectRef,{refreshCharacterPlayerOutposts:()=>{throw Error('Setter must not refresh colonies');}});
  // @ts-expect-error constructor context must state the actual sector-generation mode
  draft.initializeFleetCommander(dataRef,'independent',{});
  // @ts-expect-error use the registered Person reference, not a copied person payload
  draft.setNativeFleetCommander(dataRef,{...current});
  return {made,current,cleared};
}
void nativeFleetCommanderContract;

function originalWorldFleetConstructorContract(draft:import('./lib/campaign-native-live-economy.mjs').NativeLiveEconomyDraft,faction:import('../src/campaign/rules/OriginalCampaignFleet.mjs').OriginalFleetConstructionFaction) {
 const built=draft.createNativeEmptyFleet(faction,false,{isInSectorGen:false});
 const position:[number,number]=built.fleet.position;
 const ai:null|({objectRef:string}&Record<string,unknown>)=built.fleet.campaign.ai; // Runtime construction is null; a retained fleet may later receive a real AI.
 const severity:'NONE'|'MAJOR'=draft.fleetAccidentSeverity(built.fleet.dataRef);void severity;
 const accident=draft.advanceFleetAccidents(built.fleet.dataRef,1/60);const accidentReady:false=accident.readyForAuthority;void accidentReady;
 // @ts-expect-error An accident result is data, not a rendered native report dialog.
 const rendered:true=accident.readyForAuthority;void rendered;
 draft.setNativeFleetMoveDestination(built.fleet.dataRef,100,200,true);draft.requestNativeFleetGoSlow(built.fleet.dataRef,true);
 const moved=draft.advanceNativeFleetMotion(built.fleet.dataRef,1/60,{isFastForwardIteration:false});const phase:'native-fleet-counts-and-motion-phase'=moved.scope;void phase;
 // @ts-expect-error fast-forward iteration must come from the actual frame, not a guessed default
 draft.advanceNativeFleetMotion(built.fleet.dataRef,1/60,{});
 // @ts-expect-error this motion subphase is not a completed authoritative world frame
 const worldReady:true=moved.readyForAuthority;void worldReady;
 const resource:import('../src/campaign/rules/OriginalCampaignFleet.mjs').OriginalConstructorTexture=built.fleet.campaign.arrow.texture;
 // @ts-expect-error String/name overload requires the yet-unported ModularFleetAI constructor
 draft.createNativeEmptyFleet('independent','Patrol',{isInSectorGen:false});
 // @ts-expect-error runtime faction overrides are required, not inferred from an ID
 draft.createNativeEmptyFleet({factionId:'independent'},false,{isInSectorGen:false});
 return {position,ai,resource};
}
void originalWorldFleetConstructorContract;

import {originalAutofitSpecs,createOriginalAutofitSpecRegistry} from '../src/campaign/rules/OriginalAutofitSpecRegistry.mjs';
function nativeAutofitSpecRegistryContract(variant:import('../src/campaign/rules/OriginalAutofitEquipment.mjs').OriginalAutofitVariant) {
 const defaults:import('../src/campaign/rules/OriginalCoreAutofit.mjs').OriginalCoreAutofitServices=originalAutofitSpecs;
 const weapon=originalAutofitSpecs.readWeaponSpec('lightmg');const mount:import('../src/campaign/rules/OriginalAutofitSpecRegistry.mjs').OriginalWeaponMountType=weapon.mountType;
 const absent:null=originalAutofitSpecs.readFighterSpec(null);const wing:import('../src/campaign/rules/OriginalAutofitSpecRegistry.mjs').OriginalRegisteredAutofitFighter=originalAutofitSpecs.readFighterSpec('talon_wing');
 const slots=originalAutofitSpecs.readWeaponSlots(variant),compatible:boolean=defaults.weaponFits!(slots[0],weapon);
 const hull=originalAutofitSpecs.readHull(variant),shield:'NONE'|'FRONT'|'OMNI'|'PHASE'|null=hull.shieldType;
 const independent=createOriginalAutofitSpecRegistry();
 // @ts-expect-error spec lookups require an actual id, not a guessed numeric reference
 independent.readWeaponSpec(123);
 // @ts-expect-error static specs do not pretend to implement the mutable OP-stat lifecycle
 originalAutofitSpecs.readVariantOPCost(variant,null);
 return {mount,absent,wing,compatible,shield};
}
void nativeAutofitSpecRegistryContract;

import {originalAutofitCosts,createOriginalAutofitCostServices,invalidateOriginalVariantOPCosts} from '../src/campaign/rules/OriginalAutofitCosts.mjs';
import {createOriginalVariantShipStats} from '../src/campaign/rules/OriginalFleetMemberStats.mjs';
function nativeAutofitCostContract(variant:import('../src/campaign/rules/OriginalAutofitEquipment.mjs').OriginalAutofitVariant) {
 const services:import('../src/campaign/rules/OriginalCoreAutofit.mjs').OriginalCoreAutofitServices=originalAutofitCosts;
 const cost:number=originalAutofitCosts.readVariantOPCost(variant,null);const stats=createOriginalVariantShipStats(variant);const member:null=stats.fleetMember;
 invalidateOriginalVariantOPCosts(variant);const cached:import('../src/campaign/rules/OriginalFleetMemberStats.mjs').OriginalVariantShipStats|null=originalAutofitCosts.readCostStats(variant);
 const adapted=createOriginalAutofitCostServices({readOPCostListeners:()=>[],modifyWeaponOPCost:(_listener,_stats,_spec,cost)=>cost});
 // @ts-expect-error asynchronous beforeCreation effects are not valid native cost hooks
 createOriginalAutofitCostServices({createVariantStats:async()=>stats});
 return {services,cost,member,cached,adapted};
}
void nativeAutofitCostContract;

import {restoreOriginalFactionEquipment,createOriginalFactionEquipmentServices} from '../src/campaign/rules/OriginalFactionEquipment.mjs';
function nativeFactionEquipmentContract(runtime:import('../server/campaign/native/NativeCampaignRuntime.mjs').NativeLiveEconomyDraft,faction:import('../src/campaign/rules/OriginalRelationships.mjs').OriginalRelationshipFaction,inputs:import('../src/campaign/rules/OriginalFactionEquipment.mjs').OriginalFactionEquipmentInputs){
 const equipment=restoreOriginalFactionEquipment(faction,inputs);runtime.bindNativeFactionEquipment(faction.factionId,equipment);
 const services:import('../src/campaign/rules/OriginalFleetInflater.mjs').OriginalFleetInflaterServices=createOriginalFactionEquipmentServices({readPlayerKnownHullmods:()=>['reinforcedhull']});
 const known:boolean=runtime.isNativeFactionEquipmentKnownAt(faction.factionId,'weapon','lightmg','9007199254740993');
 const saved:import('../src/campaign/rules/OriginalFactionEquipment.mjs').OriginalFactionEquipment|null=runtime.nativeFactionEquipmentState(faction.factionId);
 runtime.addNativeFactionKnownEquipment(faction.factionId,'fighter','talon_wing',true,{readFactionEquipmentTimestamp:()=> '42',reportPlayerAwareOfEquipment:(_kind,_id,learned)=>{const yes:true=learned;void yes;}});
 // @ts-expect-error native long timestamps must not be passed as lossy JS numbers
 runtime.isNativeFactionEquipmentKnownAt(faction.factionId,'weapon','lightmg',42);
 // @ts-expect-error hullmods use CharacterData/UI knowledge, not equipment blueprint timestamp maps
 runtime.addNativeFactionKnownEquipment(faction.factionId,'hullmod','fluxcoil',false);
 // @ts-expect-error native equipment getters must be synchronous
 createOriginalFactionEquipmentServices({readPlayerKnownHullmods:async()=>[]});
 return {services,known,saved};
}
void nativeFactionEquipmentContract;

import {createOriginalJavaStringSet,addOriginalJavaStringSet} from '../src/campaign/rules/OriginalJavaStringSet.mjs';
import {originalCharacterHullmodUnlocks} from '../src/campaign/rules/OriginalPlayerHullmods.mjs';
import {bindOriginalHullmodItemManager,originalHullmodItemManagerInstance} from '../src/campaign/rules/OriginalHullmodItems.mjs';
function nativePlayerHullmodContract(runtime:import('../server/campaign/native/NativeCampaignRuntime.mjs').NativeLiveEconomyDraft,memory:import('../src/campaign/rules/OriginalCampaignMemory.mjs').OriginalCampaignMemory,cargo:import('../src/campaign/rules/OriginalPlayerEconomy.mjs').OriginalPlayerCargo,member:import('../src/campaign/rules/OriginalHullmodItems.mjs').OriginalHullmodItemMember){
 const learned=createOriginalJavaStringSet(['fluxcoil']);const changed:boolean=addOriginalJavaStringSet(learned,'reinforcedhull');const available:string[]=runtime.readNativePlayerAvailableHullmods();runtime.addNativePlayerHullmod('heavyarmor');runtime.removeNativePlayerHullmod('heavyarmor');
 const manager=originalHullmodItemManagerInstance(memory,{readRefitScreenListeners:()=>({saved:[],transient:[]}),createHullmodItemManagerRef:()=> 'type-manager'});
 const rules=bindOriginalHullmodItemManager(manager,{readHullmodPlayerCargo:()=>cargo,readHullmodRequiredItem:()=>({type:'RESOURCES',commodityId:'ore'}),readHullmodGameState:()=> 'CAMPAIGN'});const known:boolean=rules.isRequiredItemAvailable('test',member,member.variant,null);const items:number=rules.getNumUnconfirmed({type:'RESOURCES',commodityId:'ore'},member,member.variant);
 runtime.reportNativeRefitVariantSaved(member,null);const actual=runtime.nativeHullmodItemManager();
 // @ts-expect-error synchronous knowledge getters cannot await an external response
 originalCharacterHullmodUnlocks({skills:[]},{readSkillHullmodEffects:async()=>[]});
 // @ts-expect-error required item is an actual cargo item, not a made-up ID string
 bindOriginalHullmodItemManager(manager,{readHullmodRequiredItem:()=> 'fake-item'});
 return {changed,available,known,items,actual};
}
void nativePlayerHullmodContract;

import {createOriginalSpecialCargoStack,bindOriginalSpecialItem} from '../src/campaign/rules/OriginalSpecialItems.mjs';
function nativeRequiredSpecialItemContract(cargo:import('../src/campaign/rules/OriginalPlayerEconomy.mjs').OriginalPlayerCargo,memory:import('../src/campaign/rules/OriginalCampaignMemory.mjs').OriginalCampaignMemory){
 const item=createOriginalSpecialCargoStack(cargo,'shrouded_lens',null),standalone=createOriginalSpecialCargoStack(null,'fragment_fabricator',null);
 const stack:import('../src/campaign/rules/OriginalNativeCargo.mjs').OriginalNativeCargoStack=item;
 const required:import('../src/campaign/rules/OriginalNativeCargo.mjs').OriginalNativeCargoItem=standalone;
 const plugin=bindOriginalSpecialItem(item.plugin,{isCharacterHullmodKnown:()=>false,readSpecialItemPlayerMemory:()=>memory});const price:number=plugin.getPrice();plugin.performRightClickAction({stack});
 // @ts-expect-error special item data is an explicit nullable String, not an omitted value
 createOriginalSpecialCargoStack(cargo,'shrouded_lens',undefined);
 // @ts-expect-error actual synchronous MemoryAPI is required
 bindOriginalSpecialItem(item.plugin,{readSpecialItemPlayerMemory:async()=>memory});
 return {stack,required,price};
}
void nativeRequiredSpecialItemContract;

import {originalEmptyVariantFactoryServices} from '../src/campaign/rules/OriginalEmptyVariants.mjs';
function nativeEmptyVariantsContract(factory:import('../src/campaign/rules/OriginalFleetMembers.mjs').OriginalFleetMemberFactory){
 const services=originalEmptyVariantFactoryServices(factory,()=> 'fresh-type-fixture');
 const variant:import('../src/campaign/rules/OriginalAutofitEquipment.mjs').OriginalAutofitVariant=services.createInflaterEmptyVariant('fresh','hermes');
 const moduleServices:Partial<import('../src/campaign/rules/OriginalCoreAutofit.mjs').OriginalCoreAutofitServices>={readModuleVariant:services.readModuleVariant,cloneVariant:services.cloneVariant,setModuleVariant:services.setModuleVariant};
 const clone=services.cloneVariant(variant);services.setModuleVariant(variant,'WS 026',null);
 // @ts-expect-error actual synchronous hull specification is required
 originalEmptyVariantFactoryServices(factory,()=> 'bad',{readEmptyVariantHull:async()=>({})});
 return {variant,clone,moduleServices};
}
void nativeEmptyVariantsContract;

import {createOriginalDModClassState,addOriginalDMods,setOriginalDHull} from '../src/campaign/rules/OriginalDModManager.mjs';
import {ORIGINAL_DMOD_ADDER_TYPE} from '../src/campaign/rules/OriginalDModManager.mjs';
import {createOriginalGenericPluginDescriptor,createOriginalGenericPluginManager,pickOriginalGenericPlugin} from '../src/campaign/rules/OriginalGenericPlugins.mjs';
function nativeDModContract(runtime:import('../server/campaign/native/NativeCampaignRuntime.mjs').NativeLiveEconomyDraft,variant:import('../src/campaign/rules/OriginalStorage.mjs').OriginalStorageVariant,random:import('../src/campaign/rules/OriginalJavaRandom.mjs').OriginalJavaRandomState){
 const manager=createOriginalGenericPluginManager(),plugin=createOriginalGenericPluginDescriptor('contract-plugin','test.DMod',[ORIGINAL_DMOD_ADDER_TYPE],{calls:0});runtime.addNativeGenericPlugin(plugin);runtime.removeNativeGenericPlugin(plugin);
 const state=createOriginalDModClassState(),services:import('../server/campaign/native/NativeCampaignRuntime.mjs').NativeDModServices={readGenericPluginPriority:(_plugin,params)=>params.num,pickDModAdderPlugin:p=>pickOriginalGenericPlugin(manager,ORIGINAL_DMOD_ADDER_TYPE,p),runDModAdderPlugin:(_p,args)=>{args.variant.hullId='wolf';}};
 addOriginalDMods(variant,true,2,random,state,services);const changed:boolean=setOriginalDHull(variant);runtime.setNativeDHull(variant);runtime.addNativeDMods(variant,true,2,random,services);runtime.addNativeCombatDMods(variant,false,true,null,random,services);runtime.removeNativeDMod(variant,'comp_hull');const count:number=runtime.nativeDModCount(variant);
 // @ts-expect-error original D-mod random is a real checkpointable Java stream, not an integer seed
 addOriginalDMods(variant,true,2,1,state,services);
 // @ts-expect-error original plugin priority is synchronous
 const asyncServices:import('../server/campaign/native/NativeCampaignRuntime.mjs').NativeDModServices={readGenericPluginPriority:async()=>1};
 // @ts-expect-error plugin checkpoint data cannot retain callback functions
 createOriginalGenericPluginDescriptor('bad','test.Bad',[],{run:()=>1});
 return {changed,count,asyncServices};
}
void nativeDModContract;

import {createOriginalModularFleetAI} from '../src/campaign/rules/OriginalModularFleetAI.mjs';
import {createOriginalCampaignPluginRegistry,createOriginalCoreCampaignPlugin,addOriginalCampaignPlugin,pickOriginalCampaignPlugin} from '../src/campaign/rules/OriginalCampaignPluginPicks.mjs';
import {createOriginalFleetInflaterParams,createOriginalFleetInflaterForParams} from '../src/campaign/rules/OriginalFleetInflater.mjs';
import {generateOriginalIndustryProductionCargo} from '../src/campaign/rules/OriginalIndustryProductionCargo.mjs';
function nativeProductionFactoryContract(runtime:import('../server/campaign/native/NativeCampaignRuntime.mjs').NativeLiveEconomyDraft,fleet:import('../src/campaign/rules/OriginalCampaignFleet.mjs').OriginalConstructedCampaignFleet,industry:import('../src/campaign/rules/OriginalIndustryCommodityPass.mjs').OriginalIndustryCommodityEntry,random:import('../src/campaign/rules/OriginalJavaRandom.mjs').OriginalJavaRandomState){
 const registry=createOriginalCampaignPluginRegistry(),core=createOriginalCoreCampaignPlugin('contract-core');addOriginalCampaignPlugin(registry,core);runtime.addNativeCampaignPlugin(core);runtime.removeNativeCampaignPlugin(core.id);runtime.registerNativeCoreCampaignPlugin();
 const ai=createOriginalModularFleetAI('contract-ai',fleet,{globalRandom:random,pickFleetAIModule:()=>null});runtime.createNativeModularFleetAI(fleet.dataRef);runtime.advanceNativeModularFleetAI(fleet.dataRef,0,{advanceFleetAIModule:()=>{},readFleetAIAbilities:()=>[]});
 const named=runtime.createNativeNamedEmptyFleet('player',null,false,{isInSectorGen:false});const list:string[]=runtime.nativeProductionHullVariants('hermes');
 const params=createOriginalFleetInflaterParams('params',{quality:.5}),inflater=createOriginalFleetInflaterForParams('inflater',params);pickOriginalCampaignPlugin(registry,'fleetInflater',{fleet,params},{createCampaignDefaultInflater:()=>inflater});runtime.attachNativePickedFleetInflater(fleet.dataRef,params);
 const cargo:import('../src/campaign/rules/OriginalPlayerEconomy.mjs').OriginalPlayerCargo|null=generateOriginalIndustryProductionCargo(industry,null);runtime.generateNativeIndustryProductionCargo(industry,random);const title:string=runtime.readNativeIndustryProductionCargoTitle(industry);
 runtime.runNativeCustomProduction({devMode:false,weaponsHaveCost:true,industryServices:{generateEncounterExtraDrops:()=>{throw new Error('real generator dependency');}}});
 // @ts-expect-error named overload requires the actual faction ID, not a Faction object
 runtime.createNativeNamedEmptyFleet(fleet.campaign.faction,'temp',true);
 // @ts-expect-error AI picks must be synchronous
 createOriginalModularFleetAI('bad',fleet,{pickFleetAIModule:async()=>null});
 // @ts-expect-error industry salvage cannot return a Promise or fabricated cargo DTO
 generateOriginalIndustryProductionCargo(industry,random,undefined,{generateEncounterExtraDrops:async()=>({slots:[]})});
 return {ai,named,list,inflater,cargo,title};
}
void nativeProductionFactoryContract;
