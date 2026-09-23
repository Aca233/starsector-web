import raw from '../data/reference-market-planets.json' with { type: 'json' };
import { immutableJSON, identifier, requireThat, isRecord } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
export const ORIGINAL_MARKET_PLANETS=immutableJSON(raw);
const check=(v,message)=>requireThat(v,'UNSUPPORTED_MARKET_PLANET',message);
const identity=v=>check(typeof v==='string'&&/^\d+$/.test(v)&&v.length<=256,'Expected captured object identity');
/** The gas getter dependency slice only, not graphics or all planet readResolve effects. */
export function readOriginalMarketPlanet(input) {
    economyShape(input,['primaryEntityRef','connectedEntities'],'market planet capture');
    if(input.primaryEntityRef!==null)identity(input.primaryEntityRef);
    check(Array.isArray(input.connectedEntities)&&input.connectedEntities.length<=512,'Expected ordered connected entity set');
    const seen=new Set();let first=null;const unrestoredPlanetDiffs=[];
    for(const e of input.connectedEntities) {
        economyShape(e,['objectRef','classAlias','planet'],'connected entity');identity(e.objectRef);identifier(e.classAlias);
        check(!seen.has(e.objectRef),'Connected entity set contains duplicate identities');seen.add(e.objectRef);
        check(Object.hasOwn(ORIGINAL_MARKET_PLANETS.entityClasses,e.classAlias),'Unknown connected entity class');
        if(!ORIGINAL_MARKET_PLANETS.entityClasses[e.classAlias].planet){check(e.planet===null,'Non-planet cannot carry a planet capture');continue;}
        const p=e.planet;economyShape(p,['type','gasGiantOverride','otherDiffKeys'],'saved planet gas getter');identifier(p.type);
        check(Object.hasOwn(ORIGINAL_MARKET_PLANETS.types,p.type),'Unknown planet type cannot default to non-gas');
        check(p.gasGiantOverride===null||typeof p.gasGiantOverride==='boolean','Expected absent or boolean gas diff');
        check(Array.isArray(p.otherDiffKeys)&&p.otherDiffKeys.length<=128&&new Set(p.otherDiffKeys).size===p.otherDiffKeys.length,'Expected unique unrelated spec diff keys');
        for(const key of p.otherDiffKeys){identifier(key);check(ORIGINAL_MARKET_PLANETS.specFields.includes(key),'Unknown PlanetSpec diff field');check(key!=='isGasGiant','Gas diff must use its explicit boolean capture');}
        if(p.otherDiffKeys.length)unrestoredPlanetDiffs.push({entityRef:e.objectRef,fields:[...p.otherDiffKeys]});
        if(first===null)first=e;
    }
    const p=first?.planet;
    return immutableJSON({scope:'market-planet-gas-getter-only',planetEntityRef:first?.objectRef??null,planetType:p?.type??null,planetIsGasGiant:p?(p.gasGiantOverride??ORIGINAL_MARKET_PLANETS.types[p.type].isGasGiant):null,gasSource:p?(p.gasGiantOverride===null?'type-default':'saved-diff'):'no-connected-planet',unrestoredPlanetDiffs});
}
/** Validate the JSON dependency relevant to isGasGiant; do not pretend to restore visual diff fields. */
export function projectOriginalPlanetGasDiff(diff) {
    check(isRecord(diff)&&Object.keys(diff).length<=128,'Expected bounded native PlanetSpecDiff JSON object');
    for(const key of Object.keys(diff)){identifier(key);check(ORIGINAL_MARKET_PLANETS.specFields.includes(key),'Unknown PlanetSpec diff field');}
    const present=Object.hasOwn(diff,'isGasGiant');
    check(!present||typeof diff.isGasGiant==='boolean','Native reflection requires boolean isGasGiant, not a coerced value');
    return immutableJSON({gasGiantOverride:present?diff.isGasGiant:null,otherDiffKeys:Object.keys(diff).filter(k=>k!=='isGasGiant')});
}
