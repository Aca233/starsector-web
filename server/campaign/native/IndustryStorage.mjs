/** Read-only bridge from an offline capture to native post-save storage initialization.
 * The result is a draft for subsequent real condition/industry/admin/network restoration,
 * never a publishable market snapshot or a claim of zero production.
 */
import { immutableJSON, isRecord, identifier, requireThat, canonicalJSON } from '../../../src/campaign/core/Values.mjs';
import { stat as validateNativeStat } from '../../../src/campaign/rules/OriginalIndustryState.mjs';
import { validateOriginalCharacterIndustryModifiers } from '../../../src/campaign/rules/OriginalCharacterIndustryStats.mjs';
import { readOriginalAdministrator } from '../../../src/campaign/rules/OriginalAdministrator.mjs';
import { readOriginalMarketPlanet } from '../../../src/campaign/rules/OriginalMarketPlanet.mjs';
import { originalPortItemRequirements } from '../../../src/campaign/rules/OriginalPortItems.mjs';
import { readOriginalIndustryRuntime } from '../../../src/campaign/rules/OriginalIndustryRuntime.mjs';
import { restoreOriginalIndustryStorage } from '../../../src/campaign/rules/OriginalIndustryRestore.mjs';
const check = (v, message) => requireThat(v, 'UNSUPPORTED_NATIVE_STORAGE_DRAFT', message);
export function prepareNativeIndustryStorage(capture) {
    check(capture?.schemaVersion === 1 && capture.gameVersion === '0.98a-RC8' && capture.scope === 'serialized-native-economy-inputs-not-restored-world', 'Expected matching native serialized economy capture');
    check(capture.reconstruction?.readyForAuthority === false, 'Serialized capture cannot be ready for authority');
    check(isRecord(capture.source) && ['campaignSha256', 'descriptorSha256'].every(k => /^[a-f0-9]{64}$/.test(capture.source[k] ?? '')), 'Missing source identities');
    check(Array.isArray(capture.marketRoster) && Array.isArray(capture.markets) && capture.markets.length === capture.marketRoster.length && capture.markets.length <= 4096, 'Expected full ordered captured market roster');
    const marketIds = new Set(), objectRefs = new Set(), characterStatsByRef = new Map();
    const identity = ref => { check(typeof ref === 'string' && ref.length > 0 && ref.length <= 512 && !objectRefs.has(ref), 'Duplicate/missing captured object identity'); objectRefs.add(ref); return ref; };
    let count = 0;
    const markets = capture.markets.map((market, n) => {
        identifier(market.marketId);
        check(capture.marketRoster[n] === market.marketId && !marketIds.has(market.marketId), 'Market roster is reordered, missing or duplicated');
        marketIds.add(market.marketId);
        identity(market.objectRef);
        check(Array.isArray(market.industries) && market.industries.length <= 64, 'Expected actual captured industry order');
        const industryIds = new Set();
        const industries = market.industries.map(industry => {
            identity(industry.objectRef);
            identifier(industry.industryId);
            check(!industryIds.has(industry.industryId), 'Duplicate native industry'); industryIds.add(industry.industryId);
            check(isRecord(industry.cleanupFields) && Object.keys(industry.cleanupFields).length === 4 && ['s', 'd', 'i', 'u'].every(k => industry.cleanupFields[k] === 'omitted-requires-post-save-restore'), 'Serialized storage requires its own decoder, not replacement by guessed null');
            const statInput = key => {
                const value = industry[key];
                if (value === null) return null;
                check(isRecord(value) && Array.isArray(value.temporary) && value.temporary.length === 0 && Object.hasOwn(value, 'state'), 'Expected plain captured industry bonus stat');
                return value.state;
            };
            const restored = restoreOriginalIndustryStorage({ industryId: industry.industryId, classAlias: industry.classAlias, buildTime: industry.buildTime, supplyBonus: statInput('supplyBonus'), demandReduction: statInput('demandReduction'), supply: null, demand: null, income: null, upkeep: null });
            check(industry.improved === null || typeof industry.improved === 'boolean', 'Invalid captured improvement state');
            let runtimeReadback = null;
            if (industry.runtimeInput != null) {
                for (const key of ['industryId', 'classAlias', 'building', 'upgradeId', 'improved']) check(industry.runtimeInput[key] === industry[key], 'Conflicting captured industry runtime input: ' + key);
                runtimeReadback = readOriginalIndustryRuntime(industry.runtimeInput);
            }
            const specialItemCaptured = Object.hasOwn(industry, 'specialItem'), specialItem = specialItemCaptured ? industry.specialItem : null;
            if (specialItemCaptured) {
                check(specialItem === null ? industry.specialItemRef === null : isRecord(specialItem) && specialItem.objectRef === industry.specialItemRef, 'Conflicting special-item reference');
                if (specialItem !== null) { identifier(specialItem.id); check(specialItem.data === null || typeof specialItem.data === 'string' && specialItem.data.length <= 4096, 'Invalid captured special-item data'); }
            }
            count++;
            return { objectRef: industry.objectRef, industryId: industry.industryId, storage: restored, improvedGetter: industry.improved === true, runtimeReadback, specialItemCaptured, specialItem, unresolved: [...(runtimeReadback ? [] : ['current-disruption-memory-getter']), 'administrator-and-fromOther-modifiers', 'condition-and-industry-live-reapply', ...(!specialItemCaptured || specialItem !== null ? ['installed-item-runtime'] : [])] };
        });
        const planetCaptured=Object.hasOwn(market,'planetInput');
        const planetReadback=planetCaptured?readOriginalMarketPlanet(market.planetInput):null;
        const spoolIndustries=industries.filter(i=>i.specialItem?.id==='fullerene_spool');
        let portItemContext=null;
        if(planetReadback&&spoolIndustries.length){
            check(Array.isArray(market.conditions),'Missing native condition roster for port item');
            portItemContext={planetIsGasGiant:planetReadback.planetIsGasGiant,conditionIds:[...new Set(market.conditions.map(c=>c.id))]};
            for(const i of spoolIndustries)originalPortItemRequirements({industryId:i.industryId,itemId:'fullerene_spool',context:portItemContext});
        }
        const administratorCaptured=Object.hasOwn(market,'administratorCapture');
        let administratorReadback=null,governedSkillsDraft=null,characterIndustryStatsDraft=null;
        if(administratorCaptured){
            const c=market.administratorCapture;
            check(isRecord(c)&&isRecord(c.input)&&c.input.playerOwned===market.playerOwned,'Missing/conflicting administrator ownership capture');
            administratorReadback=readOriginalAdministrator(c.input);
            check(isRecord(c.marketModifiers)&&Object.keys(c.marketModifiers).length===2&&['combatFleetSize','groundDefenses'].every(k=>Object.hasOwn(c.marketModifiers,k)),'Missing governed dynamic modifiers');
            for(const value of Object.values(c.marketModifiers))if(value!==null)validateNativeStat({base:0,modifiers:value});
            if(administratorReadback.governedSkills!==null)governedSkillsDraft={skills:administratorReadback.governedSkills,...structuredClone(c.marketModifiers)};
            if(Object.hasOwn(c,'characterIndustryModifiers')){
                const mods=c.characterIndustryModifiers;
                check(isRecord(mods)&&Object.keys(mods).length===2&&['administrator','player'].every(k=>Object.hasOwn(mods,k)),'Missing character industry modifier capture');
                const drafts={};
                for(const role of ['administrator','player']){
                    const p=c.input[role],value=mods[role];
                    if(p===null||p.statsRef===null){check(value===null,'Missing CharacterStats cannot have captured modifiers');drafts[role]=null;continue;}
                    validateOriginalCharacterIndustryModifiers(value);
                    const d={skills:p.savedSkills,modifiers:value},signature=canonicalJSON(d);
                    check(!characterStatsByRef.has(p.statsRef)||characterStatsByRef.get(p.statsRef)===signature,'Conflicting shared CharacterStats capture');characterStatsByRef.set(p.statsRef,signature);
                    drafts[role]=d;
                }
                const selectedRole=administratorReadback.selectedPersonRef===c.input.player?.objectRef?'player':'administrator';
                characterIndustryStatsDraft={administrator:administratorReadback.selectedPersonRef===null?null:drafts[selectedRole],player:drafts.player};
            }
        }
        return { marketId: market.marketId, objectRef: market.objectRef, industries, planetReadback, portItemContext, administratorReadback, governedSkillsDraft, characterIndustryStatsDraft, unresolved: [...(!planetCaptured?['market-planet-getter']:[]),...(!administratorCaptured?['administrator-capture']:administratorReadback.unresolved),...(!characterIndustryStatsDraft?['character-industry-modifiers-capture']:[]),'full-market-reapplication'] };
    });
    return immutableJSON({ schemaVersion: 1, scope: 'native-economy-industry-storage-draft-only', source: structuredClone(capture.source), marketRoster: [...capture.marketRoster], markets, initializedIndustryCount: count, pendingMarketReapplications: markets.length, readyForAuthority: false });
}
