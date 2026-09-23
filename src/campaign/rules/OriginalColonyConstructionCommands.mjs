/** Native colony UI transactions on shared state. Caller owns the full revision transaction. */
import {identifier, requireThat, immutableJSON} from '../core/Values.mjs';
import directory from '../data/reference-colony-construction.json' with {type: 'json'};
import {stat} from './OriginalIndustryState.mjs';
import {buildNextOriginalConstructionQueue, validateOriginalConstructionQueue} from './OriginalConstructionQueue.mjs';

// Actual installed CSV + H.loadFromCSV/config extraction. Metadata is not live availability.
export const ORIGINAL_COLONY_CONSTRUCTION = immutableJSON(directory);
// settings.json:281 (0.98a-RC8), not a construction-cost discount.
export const ORIGINAL_COLONY_INDUSTRY_REFUND_FRACTION = Math.fround(ORIGINAL_COLONY_CONSTRUCTION.settings.industryRefundFraction);
// IndustryListPanel.java:256-273: visible industries + queued items, NOT the industry cap.
export const ORIGINAL_COLONY_CONSTRUCTION_DISPLAY_LIMIT = 12;
const f = Math.fround;
const check = (ok, message) => requireThat(ok, 'UNSUPPORTED_COLONY_CONSTRUCTION_COMMAND', message);
// Java float -> int narrowing, including saturation; intermediate int -> float casts matter too.
const int = value => Number.isNaN(value) ? 0 : Math.max(-2147483648, Math.min(2147483647, Math.trunc(value))) || 0;
const isRef = value => typeof value === 'string' && value.length > 0;
function float(value, label) {
    check(Number.isFinite(value) && value === f(value), `Actual native float required: ${label}`);
    return value;
}
function intValue(value, label) {
    check(Number.isInteger(value) && value >= -2147483648 && value <= 2147483647, `Actual Java int required: ${label}`);
    return value;
}
function service(runtime, name, ...args) {
    check(typeof runtime?.[name] === 'function', `Live synchronous service required: ${name}`);
    const result = runtime[name](...args);
    check(!(result && typeof result.then === 'function'), `Asynchronous construction service unsupported: ${name}`);
    return result;
}
function booleanService(runtime, name, row) {
    const value = service(runtime, name, row);
    check(typeof value === 'boolean', `Actual boolean required: ${name}`);
    return value;
}
function spec(runtime, industryId) {
    identifier(industryId);
    const value = service(runtime, 'getSpec', industryId);
    check(value?.industryId === industryId && Array.isArray(value.tags) && value.tags.every(tag => typeof tag === 'string'), 'Actual industry spec/tags required');
    for (const key of ['upgradeId', 'downgradeId']) {
        check(value[key] === null || typeof value[key] === 'string', `Actual spec ${key} required (no missing-field fallback)`);
        if (value[key] !== null) identifier(value[key]);
    }
    return value;
}
function rowId(row) {
    check(isRef(row?.objectRef) && row.entry?.state && row.entry?.operating, 'Actual industry lifecycle object required');
    const id = identifier(row.entry.state.industryId), op = row.entry.operating;
    check(typeof op.building === 'boolean' && (op.upgradeId === null || typeof op.upgradeId === 'string'), 'Actual building/upgrade state required');
    if (op.upgradeId !== null) identifier(op.upgradeId);
    return id;
}
function existing(market, runtime, industryId) {
    const entries = market.industries.filter(entry => entry.state.industryId === industryId);
    check(entries.length === 1, 'Current industry is missing or ambiguous');
    const row = service(runtime, 'getIndustry', industryId);
    check(rowId(row) === industryId && row.entry === entries[0], 'Industry service must return the actual shared entry, not a copy');
    return row;
}
function candidate(market, runtime, industryId) {
    const row = service(runtime, 'instantiate', industryId);
    check(rowId(row) === industryId && !market.industries.includes(row.entry), 'Actual fresh candidate construction required, not an existing industry or DTO');
    return row;
}
function buildCost(runtime, row) {
    // BaseIndustry.getBuildCost(): actual override before spec cost; no assumed discounts.
    return float(service(runtime, 'readBuildCost', row), 'getBuildCost');
}
function progressStarted(runtime, row) {
    const value = service(runtime, 'readBuildOrUpgradeProgress', row);
    // Native 0/0 may be NaN, and NaN > 0 is false. Do not substitute raw buildProgress.
    check(typeof value === 'number' && (Number.isNaN(value) || (Number.isFinite(value) && value === f(value))), 'Actual getBuildOrUpgradeProgress float required');
    return value > 0;
}
function queue(market) {
    const q = validateOriginalConstructionQueue(market), refs = new Set(), ids = new Set(), objects = new Set();
    check(isRef(q.objectRef), 'Actual construction queue identity required');
    for (const item of q.items) {
        identifier(item.industryId);
        check(isRef(item.objectRef) && !refs.has(item.objectRef) && !ids.has(item.industryId) && !objects.has(item), 'Ambiguous queued industry or record identity');
        refs.add(item.objectRef); ids.add(item.industryId); objects.add(item);
    }
    return q;
}
function context(market, credits) {
    check(market?.playerOwned === true, 'Player-owned market required; host must also bind the specific authorized owner');
    check(Array.isArray(market.industries) && Array.isArray(market.constructionQueue), 'Actual mutable market required');
    check(isRef(credits?.objectRef), 'Actual bound player credit MutableValue required');
    float(credits.value, 'player credits');
    const ids = new Set();
    for (const entry of market.industries) {
        const id = identifier(entry?.state?.industryId);
        check(!ids.has(id), 'Ambiguous current industry ID'); ids.add(id);
    }
    return queue(market);
}
function selectedQueueItem(q, target) {
    check(isRef(target?.objectRef), 'Actual selected queue item identity required');
    identifier(target.industryId); intValue(target.cost, 'selected queue cost');
    const index = q.items.findIndex(item => item.objectRef === target.objectRef), item = q.items[index];
    check(item && item.industryId === target.industryId && item.cost === target.cost, 'Stale queue selection (identity/id/saved cost changed)');
    return {item, index};
}
function selectedIndustry(market, runtime, target) {
    check(isRef(target?.objectRef), 'Actual selected industry identity required');
    const row = existing(market, runtime, identifier(target.industryId));
    check(row.objectRef === target.objectRef, 'Stale industry selection');
    check(!booleanService(runtime, 'isHidden', row), 'Hidden industry has no ordinary construction-cancel UI');
    return row;
}
function currentConstruction(market, runtime) {
    // Misc.getCurrentlyBeingConstructed: native order, excluding population and upgrading.
    for (const entry of market.industries) {
        if (spec(runtime, entry.state.industryId).tags.includes('population')) continue;
        const op = entry.operating;
        check(typeof op.building === 'boolean' && (op.upgradeId === null || typeof op.upgradeId === 'string'), 'Actual current construction state required');
        if (op.building && op.upgradeId === null) return existing(market, runtime, entry.state.industryId);
    }
    return null;
}
function prepareBuild(market, credits, request, runtime, q) {
    const id = identifier(request.industryId), d = spec(runtime, id);
    check(d.downgradeId === null && !d.tags.includes('do_not_show_in_build_dialog'), 'Industry is not an ordinary build-dialog choice');
    check(!d.tags.includes('parent_item') && !d.tags.includes('sub_item'), 'Grouped/category build selections require their separate native choice flow');
    check(!market.industries.some(entry => entry.state.industryId === id) && !q.items.some(item => item.industryId === id), 'Industry already exists or is queued');
    let visible = 0;
    for (const entry of market.industries) if (!booleanService(runtime, 'isHidden', existing(market, runtime, entry.state.industryId))) visible++;
    check(visible + q.items.length < ORIGINAL_COLONY_CONSTRUCTION_DISPLAY_LIMIT, 'No displayed construction slot available');
    const visited = new Set([id]);
    let next = d.upgradeId;
    while (next !== null) {
        check(!visited.has(next), 'Cyclic upgrade-choice metadata unsupported'); visited.add(next);
        const upgrade = spec(runtime, next);
        check(!market.industries.some(entry => entry.state.industryId === next), 'An upgraded variant already exists');
        next = upgrade.upgradeId;
    }
    const row = candidate(market, runtime, id), available = booleanService(runtime, 'isAvailable', row);
    let withinCap = true;
    if (d.tags.includes('industry')) {
        // Native Misc.getNumIndustries must instantiate qualifying upgrade candidates; no guessed count.
        const count = service(runtime, 'readIndustryCount');
        check(Number.isInteger(count) && count >= 0, 'Actual Misc industry count required');
        const max = Math.floor(f(stat({base: 0, modifiers: market.maxIndustries})) + 0.5);
        withinCap = count < max;
    }
    const cost = int(buildCost(runtime, row));
    check(available, 'Industry is not currently available to build');
    check(withinCap, 'Actual industry limit reached');
    check(f(cost) <= credits.value, 'Insufficient actual player credits');
    return {row, cost, refund: 0, industryIds: [id], queueItemRefs: [], industryRef: null, economyRefresh: true, requiresConfirmation: true};
}
function constructionRefund(market, runtime, row) {
    let refund = buildCost(runtime, row);
    if (progressStarted(runtime, row)) {
        // b_0.computeShutdownRefund: actual current cost plus newly constructed downgrade candidates.
        let sum = f(0), part = row;
        const visited = new Set();
        while (part !== null) {
            const id = rowId(part);
            check(!visited.has(id), 'Cyclic downgrade refund chain unsupported'); visited.add(id);
            sum = f(sum + f(buildCost(runtime, part) * ORIGINAL_COLONY_INDUSTRY_REFUND_FRACTION));
            const downgrade = spec(runtime, id).downgradeId;
            part = downgrade === null ? null : candidate(market, runtime, downgrade);
        }
        // The UI assigns computeShutdownRefund's int result to float f9, then stores (int)f9.
        refund = f(int(sum));
    }
    return int(refund);
}
function prepare(market, credits, request, runtime) {
    const q = context(market, credits);
    check(request && typeof request.type === 'string', 'Explicit native construction command required');
    if (request.type === 'build') return {...prepareBuild(market, credits, request, runtime, q), q};
    if (request.type === 'cancel-queued' || request.type === 'swap-queued') {
        const first = selectedQueueItem(q, request.target), swap = request.type === 'swap-queued';
        const second = swap ? selectedQueueItem(q, request.other) : null;
        check(!swap || first.item !== second.item, 'Choose two distinct queued slots to swap');
        return {q, first, second, cost: 0, refund: swap ? 0 : Math.max(0, first.item.cost),
            industryIds: swap ? [first.item.industryId, second.item.industryId] : [first.item.industryId],
            queueItemRefs: swap ? [first.item.objectRef, second.item.objectRef] : [first.item.objectRef],
            industryRef: null, economyRefresh: first.index === 0 || (swap && second.index === 0), requiresConfirmation: false};
    }
    check(request.type === 'cancel-construction' || request.type === 'cancel-upgrade', 'Unsupported native choice: only build, queue cancel/swap, building cancel and upgrade cancel are implemented');
    const row = selectedIndustry(market, runtime, request.target), op = row.entry.operating;
    check(op.building, 'Selected industry is not building or upgrading');
    let refund;
    if (request.type === 'cancel-construction') {
        check(op.upgradeId === null, 'Use the separate upgrade cancellation flow');
        check(request.interactionMode === 'LOCAL' || request.interactionMode === 'REMOTE', 'Actual LOCAL/REMOTE interaction mode required for cargo return');
        refund = constructionRefund(market, runtime, row);
    } else {
        check(op.upgradeId !== null, 'Selected industry is not upgrading');
        const upgradeId = spec(runtime, rowId(row)).upgradeId;
        check(upgradeId !== null && upgradeId === op.upgradeId, 'Downgrade/custom transition is not the confirmed ordinary upgrade-cancel flow');
        const upgrade = candidate(market, runtime, upgradeId);
        let amount = buildCost(runtime, upgrade);
        if (progressStarted(runtime, row)) amount = f(amount * ORIGINAL_COLONY_INDUSTRY_REFUND_FRACTION);
        refund = int(amount);
    }
    return {q, row, cost: 0, refund, industryIds: [rowId(row)], queueItemRefs: [], industryRef: row.objectRef, economyRefresh: true, requiresConfirmation: true};
}
function publicQuote(request, prepared) {
    return {type: request.type, industryIds: [...prepared.industryIds], queueItemRefs: [...prepared.queueItemRefs],
        industryRef: prepared.industryRef, cost: prepared.cost, refund: prepared.refund,
        requiresConfirmation: prepared.requiresConfirmation, economyRefresh: prepared.economyRefresh};
}
/**
 * Explicit inspect mutation transaction: native constructors may consume random/create shared conditions.
 * Never call this from a supposedly read-only GET. Directory order is native CSV/LinkedHashMap order;
 * UI sorting and rendering are outside this module. Unknown plugins/groups are not silently enabled.
 */
export function inspectOriginalColonyConstructionBuildOptions(market, credits, runtime) {
    const q = context(market, credits);
    let visible = 0;
    for (const entry of market.industries) if (!booleanService(runtime, 'isHidden', existing(market, runtime, entry.state.industryId))) visible++;
    const canOpenBuildDialog = visible + q.items.length < ORIGINAL_COLONY_CONSTRUCTION_DISPLAY_LIMIT;
    const result = {canOpenBuildDialog, visibleIndustryCount: visible, queuedCount: q.items.length, options: [], unsupportedChoices: []};
    if (!canOpenBuildDialog) return result;
    const candidates = [];
    // IndustryPickerDialog.updateTable first constructs ALL candidates, THEN evaluates their rows.
    for (const id of ORIGINAL_COLONY_CONSTRUCTION.industryIds) {
        const d = spec(runtime, id);
        if (d.downgradeId !== null || d.tags.includes('do_not_show_in_build_dialog') ||
            market.industries.some(entry => entry.state.industryId === id) || q.items.some(item => item.industryId === id)) continue;
        if (d.tags.includes('parent_item') || d.tags.includes('sub_item')) {
            result.unsupportedChoices.push({industryId: id, reason: 'grouped-choice'});
            continue;
        }
        const visited = new Set([id]);
        let next = d.upgradeId, existingUpgrade = false;
        while (next !== null) {
            check(!visited.has(next), 'Cyclic upgrade-choice metadata unsupported'); visited.add(next);
            const upgrade = spec(runtime, next);
            if (market.industries.some(entry => entry.state.industryId === next)) { existingUpgrade = true; break; }
            next = upgrade.upgradeId;
        }
        if (existingUpgrade) continue;
        if (!booleanService(runtime, 'supportsIndustry', id)) {
            result.unsupportedChoices.push({industryId: id, reason: 'unimplemented-plugin'});
            continue;
        }
        candidates.push({id, d, row: candidate(market, runtime, id)});
    }
    for (const {id, d, row} of candidates) {
        const available = booleanService(runtime, 'isAvailable', row);
        if (!available && !booleanService(runtime, 'showWhenUnavailable', row)) continue;
        let withinIndustryLimit = true;
        if (d.tags.includes('industry')) {
            const count = service(runtime, 'readIndustryCount');
            check(Number.isInteger(count) && count >= 0, 'Actual Misc industry count required');
            withinIndustryLimit = count < Math.floor(f(stat({base: 0, modifiers: market.maxIndustries})) + 0.5);
        }
        const cost = int(buildCost(runtime, row)), canAfford = f(cost) <= credits.value;
        const name = service(runtime, 'readCurrentName', row), imageName = service(runtime, 'readCurrentImage', row);
        check(typeof name === 'string' && (imageName === null || typeof imageName === 'string'), 'Actual current industry label/image required');
        const reasons = [];
        if (!available) reasons.push('unavailable');
        if (!withinIndustryLimit) reasons.push('industry-limit');
        if (!canAfford) reasons.push('insufficient-credits');
        result.options.push({industryId: id, name, imageName, tags: [...d.tags],
            specCost: ORIGINAL_COLONY_CONSTRUCTION.industries[id].cost, cost,
            available, withinIndustryLimit, canAfford, enabled: reasons.length === 0, reasons});
    }
    return result;
}
/** No ledger mutation. Candidate construction/getters are still real synchronous services, not DTO evaluation. */
export function quoteOriginalColonyConstructionCommand(market, credits, request, runtime) {
    return publicQuote(request, prepare(market, credits, request, runtime));
}
function setCredits(credits, value) {
    credits.value = float(f(value), 'resulting player credits');
}
/** Roll back our own ledger in place; arbitrary service/cargo/economy writes require the host revision rollback. */
function ledger(market, credits, action) {
    const q = context(market, credits), items = q.items, mirror = market.constructionQueue;
    const records = items.map(item => ({item, objectRef: item.objectRef, industryId: item.industryId, cost: item.cost}));
    const ids = [...mirror], before = credits.value;
    try {
        const result = action();
        check(queue(market) === q && q.items === items && market.constructionQueue === mirror, 'Services must preserve shared construction queue/array identity');
        float(credits.value, 'resulting player credits');
        return result;
    } catch (error) {
        for (const record of records) Object.assign(record.item, {objectRef: record.objectRef, industryId: record.industryId, cost: record.cost});
        items.splice(0, items.length, ...records.map(record => record.item));
        mirror.splice(0, mirror.length, ...ids);
        credits.value = before;
        throw error;
    }
}
/** Mutates the same market, native queue records and credit object. No eager queue start. */
export function executeOriginalColonyConstructionCommand(market, credits, command, runtime) {
    return ledger(market, credits, () => {
        const p = prepare(market, credits, command, runtime), before = credits.value;
        if (p.requiresConfirmation) {
            check(command.confirmed === true, 'Native build/cancellation confirmation required');
            if (command.type === 'build') check(intValue(command.expectedCost, 'confirmed build cost') === p.cost, 'Build price changed since confirmation');
            else check(intValue(command.expectedRefund, 'confirmed refund') === p.refund, 'Cancellation refund changed since confirmation');
        }
        if (p.economyRefresh) check(typeof runtime.refreshEconomy === 'function', 'Actual synchronous economy refresh required');
        if (command.type === 'build') {
            // IndustryListPanel queries Misc here but does NOT start the queued industry.
            currentConstruction(market, runtime);
            const objectRef = service(runtime, 'allocateQueueItemRef');
            check(isRef(objectRef) && objectRef !== p.q.objectRef && !p.q.items.some(item => item.objectRef === objectRef), 'Fresh native queue item identity required');
            const item = {objectRef, industryId: p.industryIds[0], cost: p.cost};
            p.q.items.push(item); market.constructionQueue.push(item.industryId);
            setCredits(credits, f(credits.value - f(p.cost)));
            if (credits.value <= 0) credits.value = f(0);
            p.queueItemRefs.push(objectRef);
        } else if (command.type === 'cancel-queued') {
            p.q.items.splice(p.first.index, 1); market.constructionQueue.splice(p.first.index, 1);
            if (p.refund > 0) setCredits(credits, f(credits.value + f(p.refund)));
        } else if (command.type === 'swap-queued') {
            // intnew swaps the ID AND saved-cost payload. The slot/record objects stay where they are.
            const a = p.first.item, b = p.second.item, id = a.industryId, cost = a.cost;
            a.industryId = b.industryId; a.cost = b.cost; b.industryId = id; b.cost = cost;
            market.constructionQueue[p.first.index] = a.industryId;
            market.constructionQueue[p.second.index] = b.industryId;
        } else {
            const method = command.type === 'cancel-construction' ? 'removeIndustry' : 'cancelUpgrade';
            check(typeof runtime[method] === 'function', `Actual lifecycle service required: ${method}`);
            // b_0 confirmation adds credits before actual lifecycle removal/cancelUpgrade.
            setCredits(credits, f(credits.value + f(p.refund)));
            if (command.type === 'cancel-construction') {
                service(runtime, method, p.row, command.interactionMode, false);
                check(!market.industries.some(entry => entry.state.industryId === p.industryIds[0]), 'removeIndustry service did not remove the actual industry');
            } else {
                service(runtime, method, p.row);
                check(p.row.entry.operating.building === false && p.row.entry.operating.upgradeId === null, 'cancelUpgrade service did not cancel the actual shared lifecycle state');
            }
        }
        if (p.economyRefresh) service(runtime, 'refreshEconomy');
        return {...publicQuote(command, p), creditsBefore: before, creditsAfter: credits.value};
    });
}
/** Market.advance integration point, NOT the build-confirm callback. Existing queue engine does real add/start. */
export function startOriginalColonyConstructionIfIdle(market, credits, runtime) {
    return ledger(market, credits, () => {
        if (queue(market).items.length === 0 || currentConstruction(market, runtime) !== null) return null;
        return buildNextOriginalConstructionQueue(market, {
            instantiate: id => candidate(market, runtime, id),
            isAvailable: row => booleanService(runtime, 'isAvailable', row),
            add: id => {
                const row = service(runtime, 'add', id);
                check(rowId(row) === id && market.industries.includes(row.entry), 'Queue add must return an actual market industry');
                return row;
            },
            startBuilding: row => {
                service(runtime, 'startBuilding', row);
                check(row.entry.operating.building === true && row.entry.operating.upgradeId === null, 'startBuilding service did not start the actual shared lifecycle state');
            },
            // This binding intentionally overrides any global/player-agnostic refund callback.
            refundCredits: cost => setCredits(credits, f(credits.value + f(intValue(cost, 'queued refund')))),
            message: (row, kind, cost) => service(runtime, 'message', row, kind, cost),
        });
    });
}
