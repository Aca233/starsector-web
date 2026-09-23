import { originalMarketBasketTotals } from './OriginalMarketBasket.mjs';
import logisticsReference from '../data/reference-logistics.json' with { type: 'json' };
import { identifier, integer, finite, isRecord, requireThat, immutableJSON } from '../core/Values.mjs';
import { canCommandFleet } from './FleetControl.mjs';
import { originalFleetRadius } from './OriginalTransitions.mjs';
import { ORIGINAL_MARKET_REFERENCE as reference, ORIGINAL_MARKET_NUMERIC_LIMIT as limit, originalMarketCommodity,
  validateOriginalPriceModifiers, validateOriginalPriceThresholds, originalMarketStockpileUtility, originalCommodityTradeGross, quoteOriginalCommodityTrade } from './OriginalMarketPricing.mjs';
export { quoteOriginalCommodityTrade, ORIGINAL_MARKET_REFERENCE } from './OriginalMarketPricing.mjs';
const f = Math.fround;
const shape = (value, keys, label) => requireThat(isRecord(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)),
  'UNSUPPORTED_MARKET_STATE', `Expected supported ${label} fields`);
const numeric = (value, label, minimum = 0) => finite(value, label, minimum, limit);
const uniqueIds = (value, label) => {
  requireThat(Array.isArray(value) && new Set(value).size === value.length, 'UNSUPPORTED_MARKET_STATE', `Expected unique ${label}`);
  value.forEach(v => identifier(v, label));
};
export function originalMarketStateId(marketId) { return identifier('reference.market:' + identifier(marketId, 'market')); }
/** Provider-owned state: the shared Market contract remains {owner, locationId}. No client may seed this state. */
export function validateOriginalMarketState(world, marketId) {
  const market = world.markets[identifier(marketId, 'market')];
  requireThat(market, 'NOT_FOUND', 'Market does not exist');
  const state = world.extensions[originalMarketStateId(marketId)];
  requireThat(state?.schemaVersion === 1, 'MARKET_UNAVAILABLE', 'Market has no supported native trading state');
  shape(state, ['id', 'version', 'schemaVersion', 'data'], 'market extension'); integer(state.version, 'market state version');
  requireThat(state.id === originalMarketStateId(marketId), 'UNSUPPORTED_MARKET_STATE', 'Market extension identity mismatch');
  const d = state.data;
  shape(d, ['marketId', 'anchorEntityId', 'asOfTick', 'coverage', 'tariffRate', 'admissionByPlayer', 'illegalCommodityIds',
    'commodityOrder', 'commodities', 'marketSupplyMod', 'marketDemandMod', 'submarkets', 'tradeImpacts'], 'resolved market snapshot');
  requireThat(d.marketId === market.id && d.coverage === 'resolved-native-trade-v1', 'UNSUPPORTED_MARKET_STATE', 'Unsupported economic coverage');
  integer(d.asOfTick, 'market snapshot tick'); requireThat(d.asOfTick <= world.clock.tick, 'UNSUPPORTED_MARKET_STATE', 'Future market snapshot');
  const anchor = world.spaceEntities[identifier(d.anchorEntityId, 'market anchor')];
  requireThat(anchor && anchor.locationId === market.locationId && !anchor.jump, 'MARKET_ANCHOR_INVALID', 'Market requires a real local non-jump entity anchor');
  finite(d.tariffRate, 'effective open-market tariff', 0, 1);
  requireThat(isRecord(d.admissionByPlayer), 'UNSUPPORTED_MARKET_STATE', 'Missing authoritative port admission');
  for (const [id, mode] of Object.entries(d.admissionByPlayer)) {
    requireThat(world.players[id] && ['OPEN', 'SNEAK', 'NONE'].includes(mode), 'UNSUPPORTED_MARKET_STATE', 'Unknown player or port admission mode');
  }
  uniqueIds(d.illegalCommodityIds, 'illegal commodity'); d.illegalCommodityIds.forEach(originalMarketCommodity);
  uniqueIds(d.commodityOrder, 'native commodity iteration order');
  requireThat(isRecord(d.commodities) && Object.keys(d.commodities).length === d.commodityOrder.length && d.commodityOrder.every(id => Object.hasOwn(d.commodities, id)),
    'UNSUPPORTED_MARKET_STATE', 'Commodity roster and native iteration order must agree');
  const demandValues = new Map();
  for (const id of d.commodityOrder) {
    const spec = originalMarketCommodity(id), row = d.commodities[id];
    shape(row, ['stockpile', 'demandValue', 'greed', 'utilityOnMarket', 'availableWithoutTrade', 'tradeMod',
      'supplyPrice', 'demandPrice', 'playerSupplyModsByPlayer', 'playerDemandModsByPlayer'], 'commodity-on-market');
    for (const k of ['stockpile', 'demandValue', 'greed', 'utilityOnMarket', 'availableWithoutTrade']) numeric(row[k], k);
    requireThat(row.utilityOnMarket > 0, 'UNSUPPORTED_MARKET_STATE', 'Missing native commodity utility');
    if (spec.origin === null) requireThat(row.utilityOnMarket === spec.utility, 'UNSUPPORTED_MARKET_STATE', 'Non-exotic utility must match the native spec');
    else requireThat(row.utilityOnMarket >= spec.utility && row.utilityOnMarket <= f(spec.utility * (1 + reference.settings.exoticUtilityMultAtMaxRange)),
      'UNSUPPORTED_MARKET_STATE', 'Exotic utility is not a supported resolved native value');
    shape(row.tradeMod, ['both', 'plus', 'minus'], 'resolved trade mods');
    for (const n of Object.values(row.tradeMod)) numeric(n, 'trade impact quantity', -limit);
    validateOriginalPriceThresholds(row.supplyPrice); validateOriginalPriceThresholds(row.demandPrice);
    for (const key of ['playerSupplyModsByPlayer', 'playerDemandModsByPlayer']) {
      requireThat(isRecord(row[key]), 'UNSUPPORTED_MARKET_STATE', 'Missing player-specific pricing modifiers');
      for (const [playerId, mod] of Object.entries(row[key])) {
        requireThat(world.players[playerId], 'UNSUPPORTED_MARKET_STATE', 'Unknown player-specific price owner'); validateOriginalPriceModifiers(mod);
      }
      for (const [playerId, admission] of Object.entries(d.admissionByPlayer)) if (admission !== 'NONE') requireThat(Object.hasOwn(row[key], playerId),
        'UNSUPPORTED_MARKET_STATE', 'Every admitted player needs an explicitly resolved native price modifier');
    }
    if (demandValues.has(spec.demandClass)) requireThat(demandValues.get(spec.demandClass) === row.demandValue, 'UNSUPPORTED_MARKET_STATE', 'Demand-class members disagree on effective demand');
    demandValues.set(spec.demandClass, row.demandValue);
    // An omitted alternative commodity can change the whole class price. Do not silently quote a partial class.
    if (spec.variability !== 'V0') for (const other of Object.values(reference.commodities)) {
      if (other.demandClass === spec.demandClass && !other.tags.includes('meta')) requireThat(Object.hasOwn(d.commodities, other.id),
        'UNSUPPORTED_MARKET_STATE', 'Incomplete native demand-class stockpile roster');
    }
  }
  validateOriginalPriceModifiers(d.marketSupplyMod); validateOriginalPriceModifiers(d.marketDemandMod);
  requireThat(isRecord(d.submarkets), 'UNSUPPORTED_MARKET_STATE', 'Missing submarkets');
  for (const [id, sub] of Object.entries(d.submarkets)) {
    identifier(id, 'submarket'); shape(sub, ['plugin', 'inventory'], 'submarket');
    requireThat(['open', 'black'].includes(sub.plugin) && isRecord(sub.inventory), 'UNSUPPORTED_SUBMARKET', 'Only resolved open and black market inventories have pricing support');
    for (const [commodityId, n] of Object.entries(sub.inventory)) {
      originalMarketCommodity(commodityId); requireThat(Object.hasOwn(d.commodities, commodityId), 'UNSUPPORTED_MARKET_STATE', 'Retail inventory lacks commodity pricing data'); numeric(n, 'retail inventory');
    }
  }
  requireThat(Array.isArray(d.tradeImpacts) && d.tradeImpacts.length <= 4096, 'UNSUPPORTED_MARKET_STATE', 'Missing or oversized pending trade impact ledger');
  const impactKeys = new Set(), impactGroups = new Map();
  for (const impact of d.tradeImpacts) {
    shape(impact, [...(isRecord(impact) && Object.hasOwn(impact, 'lineId') ? ['lineId'] : []), 'requestId', 'playerId', 'submarketId', 'commodityId', 'channel', 'quantity', 'createdTick', 'expiresAtGameSeconds'], 'native trade impact');
    identifier(impact.requestId); identifier(impact.playerId); identifier(impact.submarketId); identifier(impact.commodityId);
    if (Object.hasOwn(impact, 'lineId')) requireThat(impact.lineId === impact.commodityId, 'UNSUPPORTED_MARKET_STATE', 'Basket line identity must be the net commodity');
    const requestKey = JSON.stringify([impact.playerId, impact.requestId]);
    const group = JSON.stringify([Object.hasOwn(impact, 'lineId'), impact.submarketId, impact.createdTick]);
    requireThat(!impactGroups.has(requestKey) || impactGroups.get(requestKey) === group, 'UNSUPPORTED_MARKET_STATE', 'One request cannot mix legacy/basket identities, markets or creation ticks');
    impactGroups.set(requestKey, group);
    const impactKey = JSON.stringify([impact.playerId, impact.requestId, ...(Object.hasOwn(impact, 'lineId') ? [impact.lineId] : [])]);
    requireThat(!impactKeys.has(impactKey), 'UNSUPPORTED_MARKET_STATE', 'Duplicate actor/request trade impact'); impactKeys.add(impactKey);
    requireThat(world.players[impact.playerId] && d.submarkets[impact.submarketId] && d.commodities[impact.commodityId] && impact.channel === 'plus', 'UNSUPPORTED_MARKET_STATE', 'Unknown impact references or mode');
    numeric(impact.quantity, 'signed impact', -limit); requireThat(impact.quantity !== 0, 'UNSUPPORTED_MARKET_STATE', 'Empty trade impact');
    integer(impact.createdTick, 'trade creation tick'); finite(impact.expiresAtGameSeconds, 'trade expiry', 0);
    requireThat(impact.createdTick <= d.asOfTick && impact.expiresAtGameSeconds === impact.createdTick / world.clock.ticksPerSecond + reference.settings.tradeImpactDays * reference.settings.secondsPerDay,
      'UNSUPPORTED_MARKET_STATE', 'Trade impact lifetime differs from the native 120 game days');
  }
  return state;
}
/** Whole-save hook: validate every owned snapshot, while allowing uninitialized markets and stale readable snapshots. */
export function validateOriginalMarketWorld(world) {
  for (const [id, extension] of Object.entries(world.extensions)) {
    if (!id.startsWith('reference.market:')) continue;
    requireThat(isRecord(extension.data) && typeof extension.data.marketId === 'string' && id === originalMarketStateId(extension.data.marketId),
      'UNSUPPORTED_MARKET_STATE', 'Market extension key does not match its market identity');
    validateOriginalMarketState(world, extension.data.marketId);
  }
}

/** Local known anchors only, following the existing cooperative location-disclosure policy. */
export function listOriginalMarketPorts(world, actor) {
  requireThat(actor?.kind === 'player' && world.players[actor.id], 'FORBIDDEN', 'Authenticated player required');
  const locations = new Set(Object.values(world.fleets).filter(fleet => canCommandFleet(world, fleet, actor.id)).map(fleet => fleet.locationId));
  const result = [];
  for (const market of Object.values(world.markets)) {
    if (!locations.has(market.locationId)) continue;
    const state = world.extensions[originalMarketStateId(market.id)];
    const anchors = state ? [world.spaceEntities[state.data.anchorEntityId]]
      : Object.values(world.spaceEntities).filter(entity => entity.marketId === market.id);
    for (const anchor of anchors) if (anchor && anchor.locationId === market.locationId) result.push({ marketId: market.id,
      anchorEntityId: anchor.id, anchorVersion: anchor.version, name: anchor.name, locationId: market.locationId, position: anchor.position });
  }
  return immutableJSON(result);
}

/** Private current port view. Pricing, admission tables and other accounts never leave the provider. */
export function browseOriginalMarket(world, actor, input) {
  shape(input, ['marketId', 'fleetId'], 'market visit');
  requireThat(actor?.kind === 'player' && world.players[actor.id], 'FORBIDDEN', 'Authenticated player required');
  const fleet = world.fleets[identifier(input.fleetId)];
  requireThat(fleet && canCommandFleet(world, fleet, actor.id), 'FORBIDDEN', 'No command permission for this fleet');
  requireThat(fleet.encounterId === null, 'ASSET_LOCKED', 'Cannot trade during an encounter');
  requireThat(!fleet.navigation?.transition, 'IN_TRANSITION', 'Cannot trade during a jump');
  const state = validateOriginalMarketState(world, identifier(input.marketId)), d = state.data;
  const market = world.markets[input.marketId], anchor = world.spaceEntities[d.anchorEntityId];
  requireThat(fleet.locationId === market.locationId, 'WRONG_LOCATION', 'Fleet is outside the market location');
  const members = fleet.memberIds.map(id => world.members[id]);
  const distance = Math.hypot(fleet.position[0] - anchor.position[0], fleet.position[1] - anchor.position[1]);
  const contactDistance = originalFleetRadius(members) + anchor.radius;
  requireThat(distance < contactDistance, 'MARKET_OUT_OF_REACH', 'Fleet must contact the market anchor');
  requireThat(d.asOfTick === world.clock.tick && d.tradeImpacts.every(i => i.expiresAtGameSeconds > world.clock.gameSeconds),
    'MARKET_SNAPSHOT_STALE', 'Current economics and port admission are required');
  const admission = d.admissionByPlayer[actor.id];
  requireThat(admission === 'OPEN' || admission === 'SNEAK', 'MARKET_ACCESS_DENIED', 'No authoritative port access');
  const accounts = Object.values(world.accounts).filter(account => account.currency === 'credits'
    && account.owner.kind === fleet.owner.kind && account.owner.id === fleet.owner.id
    && (account.owner.kind === 'player' ? account.owner.id === actor.id : ['leader', 'manager'].includes(world.factions[account.owner.id]?.playerRoles[actor.id])))
    .map(account => ({ id: account.id, version: account.version, balance: finite(account.balance, 'account balance', 0, Number.MAX_SAFE_INTEGER) }));
  // Installed submarkets.csv: open_market order=0, black_market order=999.
  const submarkets = Object.entries(d.submarkets).sort(([, a], [, b]) => Number(a.plugin === 'black') - Number(b.plugin === 'black')).filter(([, sub]) => admission === 'OPEN' || sub.plugin === 'black')
    .map(([id, sub]) => ({ id, plugin: sub.plugin, inventory: sub.inventory, tariffRate: sub.plugin === 'black' ? 0 : d.tariffRate,
      unavailableReason: sub.plugin === 'black' ? 'BLACK_MARKET_CONSEQUENCES_UNIMPLEMENTED' : null,
      commodities: d.commodityOrder.map(commodityId => ({ id: commodityId,
        unavailableReason: sub.plugin !== 'black' && d.illegalCommodityIds.includes(commodityId) ? 'ILLEGAL_COMMODITY'
          : unsupportedTrade({ sub, spec: originalMarketCommodity(commodityId) }) })) }));
  const dependencies = [['players', actor.id], ['fleets', fleet.id], ['markets', market.id], ['extensions', state.id], ['spaceEntities', anchor.id],
    ...members.map(m => ['members', m.id]), ...accounts.map(a => ['accounts', a.id])];
  for (const owner of [fleet.control, fleet.owner, market.owner]) if (owner.kind === 'faction') dependencies.push(['factions', owner.id]);
  const expected = [...new Map(dependencies.map(([collection, id]) => [collection + ':' + id, { collection, id, version: world[collection][id].version }])).values()];
  return immutableJSON({ worldId: world.id, revision: world.revision, marketId: market.id, name: anchor.name, expected,
    anchorEntityId: anchor.id, asOfTick: d.asOfTick, fleetId: fleet.id, fleetVersion: fleet.version,
    memberVersions: members.map(m => ({ id: m.id, version: m.version })), accounts, submarkets, distance, contactDistance });
}

function contextForQuote(world, actor, input) {
  shape(input, ['marketId', 'submarketId', 'fleetId', 'accountId', 'commodityId', 'quantity', 'side'], 'trade request');
  requireThat(actor?.kind === 'player' && world.players[actor.id], 'FORBIDDEN', 'Authenticated player required');
  for (const key of ['marketId', 'submarketId', 'fleetId', 'accountId', 'commodityId']) identifier(input[key], key);
  integer(input.quantity, 'quantity', 1); requireThat(input.quantity <= limit, 'UNSUPPORTED_MARKET_RANGE', 'Unsupported trade quantity');
  requireThat(['buy', 'sell'].includes(input.side), 'INVALID_COMMAND', 'Unknown trade side');
  const fleet = world.fleets[input.fleetId], account = world.accounts[input.accountId];
  requireThat(fleet && account, 'NOT_FOUND', 'Missing fleet or account');
  requireThat(canCommandFleet(world, fleet, actor.id), 'FORBIDDEN', 'No command permission for this fleet');
  const mayDebit = account.owner.kind === 'player' ? account.owner.id === actor.id : ['leader', 'manager'].includes(world.factions[account.owner.id]?.playerRoles[actor.id]);
  requireThat(mayDebit && account.owner.kind === fleet.owner.kind && account.owner.id === fleet.owner.id, 'FORBIDDEN', 'Account must be authorized and belong to the fleet owner');
  requireThat(account.currency === 'credits', 'UNSUPPORTED_CURRENCY', 'Native trade settles in credits');
  requireThat(fleet.encounterId === null, 'ASSET_LOCKED', 'Trading during an encounter is unavailable');
  requireThat(!fleet.navigation?.transition, 'IN_TRANSITION', 'Trading during a jump is unavailable');
  const state = validateOriginalMarketState(world, input.marketId), d = state.data, market = world.markets[input.marketId], anchor = world.spaceEntities[d.anchorEntityId];
  requireThat(d.asOfTick === world.clock.tick, 'MARKET_SNAPSHOT_STALE', 'Refresh native economics and port admission at the current authority tick before trading');
  requireThat(d.tradeImpacts.every(i => i.expiresAtGameSeconds > world.clock.gameSeconds), 'MARKET_SNAPSHOT_STALE', 'Native economic resolver must expire old impacts before trading');
  requireThat(fleet.locationId === market.locationId, 'WRONG_LOCATION', 'Fleet is outside the market location');
  const members = fleet.memberIds.map(id => world.members[id]);
  requireThat(members.every(Boolean), 'BROKEN_REFERENCE', 'Missing fleet members');
  const contactDistance = originalFleetRadius(members) + anchor.radius;
  const distance = Math.hypot(fleet.position[0] - anchor.position[0], fleet.position[1] - anchor.position[1]);
  requireThat(distance < contactDistance, 'MARKET_OUT_OF_REACH', 'Fleet must physically contact the market anchor (native selection radius + entity radius)');
  const sub = d.submarkets[input.submarketId]; requireThat(sub, 'NOT_FOUND', 'Submarket does not exist');
  const admission = d.admissionByPlayer[actor.id];
  requireThat(admission === 'OPEN' || (admission === 'SNEAK' && sub.plugin === 'black'), 'MARKET_ACCESS_DENIED', 'No authoritative access to this submarket');
  requireThat(sub.plugin === 'black' || !d.illegalCommodityIds.includes(input.commodityId), 'ILLEGAL_COMMODITY', 'This commodity cannot be transferred on the open market');
  const spec = originalMarketCommodity(input.commodityId), commodity = d.commodities[input.commodityId];
  requireThat(commodity, 'UNSUPPORTED_MARKET_STATE', 'Missing resolved commodity pricing');
  const inventory = sub.inventory[input.commodityId] ?? 0, cargo = fleet.cargo[input.commodityId] ?? 0;
  numeric(inventory, 'inventory'); numeric(cargo, 'fleet cargo');
  requireThat((input.side === 'buy' ? inventory : cargo) >= input.quantity, input.side === 'buy' ? 'INSUFFICIENT_STOCK' : 'INSUFFICIENT_CARGO', 'Not enough resource units for this transfer');
  const expected = [], keys = new Set();
  const version = (collection, id) => { const key = collection + ':' + id; if (keys.has(key)) return; keys.add(key);
    const row = world[collection][id]; requireThat(row, 'BROKEN_REFERENCE', 'Missing quote dependency'); expected.push({ collection, id, version: row.version }); };
  for (const [collection, id] of [['players', actor.id], ['fleets', fleet.id], ['accounts', account.id], ['markets', market.id], ['extensions', state.id], ['spaceEntities', anchor.id]]) version(collection, id);
  for (const member of members) version('members', member.id);
  if (fleet.control.kind === 'faction') version('factions', fleet.control.id);
  if (account.owner.kind === 'faction') version('factions', account.owner.id);
  if (market.owner.kind === 'faction') version('factions', market.owner.id);
  requireThat(expected.length <= 256, 'UNSUPPORTED_MARKET_RANGE', 'Fleet exceeds the command dependency budget');
  return { fleet, account, market, state, sub, spec, commodity, inventory, cargo, distance, contactDistance, expected };
}
/** Read-only, private to the authenticated actor; includes dependencies for optimistic command submission. */
export function quoteOriginalMarketTrade(world, actor, input) {
  const c = contextForQuote(world, actor, input);
  const price = quoteOriginalCommodityTrade(priceInput(c, actor, input));
  finite(c.account.balance, 'account balance', 0, Number.MAX_SAFE_INTEGER);
  const resultingBalance = c.account.balance + price.creditsDelta;
  const canAfford = resultingBalance >= 0 && resultingBalance <= Number.MAX_SAFE_INTEGER;
  return immutableJSON({ ...price, marketId: input.marketId, submarketId: input.submarketId, fleetId: input.fleetId, accountId: input.accountId,
    asOfTick: world.clock.tick, expected: c.expected, available: input.side === 'buy' ? c.inventory : c.cargo,
    distance: c.distance, contactDistance: c.contactDistance, canAfford,
    executable: unsupportedTrade(c) === null && canAfford,
    unavailableReason: unsupportedTrade(c) ?? (canAfford ? null : 'INSUFFICIENT_CREDITS') });
}
function priceInput(c, actor, input) {
  const d = c.state.data;
  return { commodityId: input.commodityId, side: input.side, quantity: input.quantity,
    submarketKind: c.sub.plugin, tariffRate: d.tariffRate, stockpileUtility: originalMarketStockpileUtility(d.commodityOrder, d.commodities, input.commodityId),
    demandValue: c.commodity.demandValue, greed: c.commodity.greed, utilityOnMarket: c.commodity.utilityOnMarket,
    thresholds: input.side === 'buy' ? c.commodity.supplyPrice : c.commodity.demandPrice,
    marketMod: input.side === 'buy' ? d.marketSupplyMod : d.marketDemandMod,
    playerMod: input.side === 'buy' ? c.commodity.playerSupplyModsByPlayer[actor.id] : c.commodity.playerDemandModsByPlayer[actor.id] };
}
function unsupportedTrade(c) {
  return c.sub.plugin !== 'open' ? 'BLACK_MARKET_CONSEQUENCES_UNIMPLEMENTED' : c.spec.origin !== null ? 'EXOTIC_TRADE_UNIMPLEMENTED' : !Object.hasOwn(logisticsReference.commodities, c.spec.id) ? 'UNSUPPORTED_LOGISTICS_COMMODITY' : null;
}
const put = (collection, row, value) => ({ collection, id: row.id, expectedVersion: row.version, value: { ...value, version: row.version + 1 } });
function trade(side, ctx, payload, requestId) {
  shape(payload, ['marketId', 'submarketId', 'fleetId', 'accountId', 'commodityId', 'quantity'], 'trade command');
  const input = { ...payload, side }, q = quoteOriginalMarketTrade(ctx.world, ctx.actor, input);
  for (const e of q.expected) ctx.requireVersion(e.collection, e.id);
  requireThat(q.unavailableReason !== 'BLACK_MARKET_CONSEQUENCES_UNIMPLEMENTED', 'UNSUPPORTED_MARKET_TRANSACTION', 'Black-market customs/reputation consequences have not been integrated; quote only');
  requireThat(q.unavailableReason !== 'EXOTIC_TRADE_UNIMPLEMENTED', 'UNSUPPORTED_MARKET_TRANSACTION', 'Exotic origin/distance economy adapter has not been integrated; quote only');
  requireThat(q.unavailableReason !== 'UNSUPPORTED_LOGISTICS_COMMODITY', 'UNSUPPORTED_MARKET_TRANSACTION', 'The current native logistics adapter cannot represent this commodity; quote only');
  requireThat(q.canAfford, 'INSUFFICIENT_CREDITS', 'Insufficient credits or unsupported resulting balance');
  const { fleet, account, market, state, sub, inventory, cargo } = contextForQuote(ctx.world, ctx.actor, input);
  requireThat(state.data.tradeImpacts.length < 4096, 'MARKET_REFRESH_REQUIRED', 'Economy adapter must compact pending impacts');
  const sign = side === 'buy' ? 1 : -1, nextInventory = inventory - sign * payload.quantity, nextCargo = cargo + sign * payload.quantity;
  numeric(nextInventory, 'resulting stock'); numeric(nextCargo, 'resulting cargo');
  const d = structuredClone(state.data), row = d.commodities[payload.commodityId];
  d.submarkets[payload.submarketId] = { ...sub, inventory: { ...sub.inventory, [payload.commodityId]: nextInventory } };
  row.tradeMod.plus = f(numeric(f(row.tradeMod.plus) - sign * payload.quantity, 'resulting impact', -limit));
  // OpenMarketPlugin = PLAYER_SELL_ONLY: both sells (+) and buys (-) affect tradeModPlus, not stockpile.
  d.tradeImpacts.push({ requestId, playerId: ctx.actor.id, submarketId: payload.submarketId, commodityId: payload.commodityId,
    channel: 'plus', quantity: -sign * payload.quantity, createdTick: ctx.world.clock.tick,
    expiresAtGameSeconds: ctx.world.clock.gameSeconds + reference.settings.tradeImpactDays * reference.settings.secondsPerDay });
  // Check post-transfer pricing too, so a successful trade cannot strand the snapshot outside this provider's supported numeric range.
  originalMarketStockpileUtility(d.commodityOrder, d.commodities, payload.commodityId);
  const data = { playerId: ctx.actor.id, marketId: market.id, submarketId: payload.submarketId, fleetId: fleet.id, accountId: account.id,
    commodityId: payload.commodityId, side, quantity: payload.quantity, gross: q.gross, tariff: q.tariff, creditsDelta: q.creditsDelta };
  return { changes: [put('markets', market, market), put('extensions', state, { ...state, data: d }),
    put('fleets', fleet, { ...fleet, cargo: { ...fleet.cargo, [payload.commodityId]: nextCargo } }),
    put('accounts', account, { ...account, balance: account.balance + q.creditsDelta })],
    events: [{ type: 'market.trade-settled', data }], result: { ...data, asOfTick: ctx.world.clock.tick } };
}
/** Same-snapshot basket: one net line per commodity. Never settle each line separately. */
export function quoteOriginalMarketBasket(world, actor, input) {
  shape(input, ['marketId', 'submarketId', 'fleetId', 'accountId', 'items'], 'basket request');
  requireThat(Array.isArray(input.items) && input.items.length > 0 && input.items.length <= 64, 'UNSUPPORTED_MARKET_RANGE', 'Expected 1..64 net trade lines');
  const { items, ...common } = input, seen = new Set(), lines = [];
  let first, unavailableReason = null;
  for (const item of items) {
    shape(item, ['commodityId', 'side', 'quantity'], 'net basket line');
    requireThat(!seen.has(item.commodityId), 'INVALID_COMMAND', 'Net opposing transfers before quoting; duplicate commodities are not separate transactions'); seen.add(item.commodityId);
    const request = { ...common, ...item }, c = contextForQuote(world, actor, request);
    first ??= c;
    unavailableReason ??= unsupportedTrade(c);
    const rawGross = originalCommodityTradeGross(priceInput(c, actor, request));
    lines.push({ ...item, rawGross, available: item.side === 'buy' ? c.inventory : c.cargo });
  }
  const totals = originalMarketBasketTotals(lines, first.sub.plugin === 'black' ? 0 : first.state.data.tariffRate);
  finite(first.account.balance, 'account balance', 0, Number.MAX_SAFE_INTEGER);
  const balance = first.account.balance + totals.creditsDelta;
  const canAfford = balance >= 0 && balance <= Number.MAX_SAFE_INTEGER;
  return immutableJSON({ ...common, items: lines, ...totals, asOfTick: world.clock.tick, expected: first.expected,
    distance: first.distance, contactDistance: first.contactDistance, canAfford,
    executable: unavailableReason === null && canAfford, unavailableReason: unavailableReason ?? (canAfford ? null : 'INSUFFICIENT_CREDITS') });
}
function tradeBasket(ctx, payload, requestId) {
  const q = quoteOriginalMarketBasket(ctx.world, ctx.actor, payload);
  for (const e of q.expected) ctx.requireVersion(e.collection, e.id);
  requireThat(q.unavailableReason === null || q.unavailableReason === 'INSUFFICIENT_CREDITS', 'UNSUPPORTED_MARKET_TRANSACTION', 'Basket contains unsupported settlement consequences');
  requireThat(q.canAfford, 'INSUFFICIENT_CREDITS', 'Final basket balance is insufficient or unsupported');
  const { fleetId, accountId, marketId, submarketId } = payload;
  const fleet = ctx.world.fleets[fleetId], account = ctx.world.accounts[accountId], market = ctx.world.markets[marketId], state = ctx.world.extensions[originalMarketStateId(marketId)];
  requireThat(state.data.tradeImpacts.length + q.items.length <= 4096, 'MARKET_REFRESH_REQUIRED', 'Economy adapter must compact pending impacts');
  const d = structuredClone(state.data), cargo = { ...fleet.cargo }, inventory = d.submarkets[submarketId].inventory;
  for (const item of q.items) {
    const { commodityId, side, quantity } = item, sign = side === 'buy' ? 1 : -1;
    inventory[commodityId] = numeric((inventory[commodityId] ?? 0) - sign * quantity, 'resulting stock');
    cargo[commodityId] = numeric((cargo[commodityId] ?? 0) + sign * quantity, 'resulting cargo');
    const row = d.commodities[commodityId];
    row.tradeMod.plus = f(numeric(f(row.tradeMod.plus) - sign * quantity, 'resulting impact', -limit));
    d.tradeImpacts.push({ requestId, playerId: ctx.actor.id, lineId: commodityId, submarketId, commodityId,
      channel: 'plus', quantity: -sign * quantity, createdTick: ctx.world.clock.tick,
      expiresAtGameSeconds: ctx.world.clock.gameSeconds + reference.settings.tradeImpactDays * reference.settings.secondsPerDay });
  }
  for (const item of q.items) originalMarketStockpileUtility(d.commodityOrder, d.commodities, item.commodityId);
  const data = { playerId: ctx.actor.id, marketId, submarketId, fleetId, accountId, items: q.items.map(({ available: _available, ...line }) => line),
    buyGross: q.buyGross, sellGross: q.sellGross, subtotal: q.subtotal, tariff: q.tariff, creditsDelta: q.creditsDelta };
  return { changes: [put('markets', market, market), put('extensions', state, { ...state, data: d }),
    put('fleets', fleet, { ...fleet, cargo }), put('accounts', account, { ...account, balance: account.balance + q.creditsDelta })],
    events: [{ type: 'market.basket-settled', data }], result: { ...data, asOfTick: ctx.world.clock.tick } };
}
/** Trusted authority bridge for a real native economy/admission resolver; never expose as a player write RPC. */
function publishSnapshot(ctx, payload) {
  requireThat(ctx.actor.kind === 'system', 'FORBIDDEN', 'Only the authority may publish resolved economic state');
  shape(payload, ['marketId', 'data'], 'snapshot publication');
  const market = ctx.requireVersion('markets', identifier(payload.marketId, 'market')), id = originalMarketStateId(market.id);
  const before = ctx.world.extensions[id]; if (before) ctx.requireVersion('extensions', id);
  requireThat(isRecord(payload.data), 'UNSUPPORTED_MARKET_STATE', 'Missing resolved snapshot');
  const next = { id, version: before ? before.version + 1 : 0, schemaVersion: 1, data: payload.data };
  validateOriginalMarketState({ ...ctx.world, extensions: { ...ctx.world.extensions, [id]: next } }, market.id);
  requireThat(next.data.asOfTick === ctx.world.clock.tick, 'MARKET_SNAPSHOT_STALE', 'Publish for the current authority tick');
  requireThat(next.data.tradeImpacts.every(i => i.expiresAtGameSeconds > ctx.world.clock.gameSeconds), 'MARKET_SNAPSHOT_STALE', 'Resolver must fold and expire previous impacts');
  ctx.requireVersion('spaceEntities', next.data.anchorEntityId);
  if (market.owner.kind === 'faction') ctx.requireVersion('factions', market.owner.id);
  for (const playerId of Object.keys(next.data.admissionByPlayer)) ctx.requireVersion('players', playerId);
  return { changes: [put('markets', market, market), { collection: 'extensions', id, expectedVersion: before?.version ?? null, value: next }],
    events: [{ type: 'market.snapshot-published', data: { marketId: market.id, asOfTick: next.data.asOfTick } }],
    result: { marketId: market.id, stateId: id, asOfTick: next.data.asOfTick } };
}
export const originalMarketProvider = Object.freeze({
  id: 'reference.market', version: '0.4.0', service: 'market', apiVersion: 1,
  extensionWriteGrants: [{ service: 'retail', capabilities: ['native-open-resource-refresh'], commands: ['market.refresh-open-resources'] }],
  capabilities: ['native-private-port-view', 'native-resource-price-integral', 'resolved-market-snapshot', 'anchored-open-market-trade', 'atomic-resource-settlement', 'native-net-basket-settlement'],
  evidence: [{ reference: reference.originalReference, sources: reference.provenance.sources,
    scope: 'Resolved same-tick native pricing + legal open-market resource trades and same-submarket net baskets; no economy generation, black-market consequences or UI',
    cooperationPolicy: 'Explicit controller plus fleet-owner account authority; account balance cannot go negative; only the payer account is settled (native market credit supply and tariffs are not a finite merchant account)' }],
  methods: { ports: listOriginalMarketPorts, browse: browseOriginalMarket, quoteBasket: quoteOriginalMarketBasket, quote: quoteOriginalMarketTrade, validateState: validateOriginalMarketState, validateWorld: validateOriginalMarketWorld },
  commands: { 'market.trade-basket': tradeBasket, 'market.publish-snapshot': publishSnapshot, 'market.buy': (ctx, payload, requestId) => trade('buy', ctx, payload, requestId), 'market.sell': (ctx, payload, requestId) => trade('sell', ctx, payload, requestId) },
});
