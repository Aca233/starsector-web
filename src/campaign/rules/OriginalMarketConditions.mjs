import { identifier, requireThat, immutableJSON } from '../core/Values.mjs';
const check = (v, m) => requireThat(v, 'UNSUPPORTED_CONDITION_RUNTIME', m);
const methods = ['listConditions', 'getSpecificCondition', 'getConditionId', 'getModId', 'isSurveyed', 'isSuppressed', 'apply', 'unapply'];
function runtime(host) {
    for (const name of methods)
        check(typeof host?.[name] === 'function' && host[name].constructor?.name !== 'AsyncFunction', 'Missing synchronous condition operation ' + name);
    return (name, ...args) => { const value = host[name](...args); check(!value || typeof value.then !== 'function', 'Condition runtime must finish synchronously: ' + name); return value; };
}
const boolean = (v, label) => { check(typeof v === 'boolean', 'Expected native ' + label); return v; };
/** Original Market.reapplyConditions / reapplyCondition. Operates on transaction-owned live references.
 * Snapshot the roster ONCE; no cloning condition objects, no whole-pass unapply, no fixpoint iteration.
 * Every condition (including extension plugins) needs real synchronous host callbacks. On an exception
 * the caller must discard its draft, rather than publish a partly restored market.
 */
export function reapplyOriginalMarketConditions(host, specificModId = null) {
    if (specificModId !== null)
        identifier(specificModId);
    const call = runtime(host);
    let conditions;
    if (specificModId === null) {
        const list = call('listConditions');
        check(Array.isArray(list) && list.length <= 128, 'Expected complete condition roster');
        conditions = [...list];
    }
    else {
        const c = call('getSpecificCondition', specificModId);
        check(c !== undefined, 'Missing condition must be explicit null');
        conditions = c === null ? [] : [c];
    }
    let applied = 0;
    for (const c of conditions) {
        check(c !== null && c !== undefined, 'Null condition in roster');
        check(call('unapply', c, identifier(call('getModId', c))) === undefined, 'Condition unapply must complete without a deferred or returned operation');
        // The single-condition entry point intentionally does not inspect survey state.
        if (specificModId === null && !boolean(call('isSurveyed', c), 'survey flag'))
            continue;
        if (boolean(call('isSuppressed', identifier(call('getConditionId', c))), 'suppression flag'))
            continue;
        check(call('apply', c, identifier(call('getModId', c))) === undefined, 'Condition apply must complete without a deferred or returned operation');
        applied++;
    }
    return immutableJSON({ scope: 'native-ordered-condition-callbacks-only', visited: conditions.length, applied });
}
