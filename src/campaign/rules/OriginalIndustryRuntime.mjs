import { identifier, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { bool } from './OriginalIndustryState.mjs';
import { financeFloat } from './OriginalMarketFinance.mjs';
import { ORIGINAL_IMMIGRATION } from './OriginalColonyEnvironment.mjs';
import { originalIndustrySavedClass } from './OriginalIndustryRestore.mjs';
const check = (value, message) => requireThat(value, 'UNSUPPORTED_INDUSTRY_RUNTIME', message);
export function originalIndustryDisruptionKey(industryId) {
    originalIndustrySavedClass(industryId);
    return '$core_disrupted_' + ORIGINAL_IMMIGRATION.industries[industryId].className;
}
function javaTrim(value) {
    let start = 0, end = value.length;
    while (start < end && value.charCodeAt(start) <= 0x20) start++;
    while (end > start && value.charCodeAt(end - 1) <= 0x20) end--;
    return value.slice(start, end);
}
/** Native getter readback only, without Memory.advance, effect application, or simulated time. */
export function readOriginalIndustryRuntime(input) {
    economyShape(input, ['industryId', 'classAlias', 'building', 'upgradeId', 'improved', 'disruption'], 'native industry runtime capture');
    check(input.classAlias === originalIndustrySavedClass(input.industryId), 'Mismatched saved industry class');
    bool(input.building, 'building');
    if (input.upgradeId !== null) identifier(input.upgradeId);
    check(input.improved === null || typeof input.improved === 'boolean', 'Expected original nullable improvement flag');
    const d = input.disruption;
    economyShape(d, ['key', 'present', 'value', 'expires'], 'projected original disruption memory');
    check(d.key === originalIndustryDisruptionKey(input.industryId), 'Disruption memory uses the wrong runtime class key');
    bool(d.present, 'memory key presence');
    check(Array.isArray(d.expires) && d.expires.length <= 256, 'Expected ordered original expiry entries');
    for (const days of d.expires) financeFloat(days, 'memory expiration days');
    let disrupted = false;
    if (!d.present) check(d.value === null, 'Absent memory key must have explicit null value');
    else {
        check(['boolean', 'string', 'number'].includes(typeof d.value), 'Present null/object memory cannot be coerced as a native primitive');
        if (typeof d.value === 'string') {
            check(d.value.length <= 4096, 'Oversized disruption memory string');
            disrupted = javaTrim(d.value.toLowerCase()) === 'true';
        } else if (typeof d.value === 'boolean') disrupted = d.value;
        else financeFloat(d.value, 'numeric disruption memory');
    }
    const expiresIn = d.expires[0] ?? -1;
    return immutableJSON({ scope: 'native-industry-getters-without-time-advance', disruptionKey: d.key, operating: { building: input.building, disrupted, upgradeId: input.upgradeId }, improved: input.improved === true, expiresIn, disruptedDays: expiresIn < 0 ? 0 : expiresIn });
}
