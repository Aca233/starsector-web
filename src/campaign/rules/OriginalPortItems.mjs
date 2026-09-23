import raw from '../data/reference-port-items.json' with { type: 'json' };
import { identifier, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { bool, stat, put } from './OriginalIndustryState.mjs';
export const ORIGINAL_PORT_ITEMS = immutableJSON(raw);
const R=ORIGINAL_PORT_ITEMS,check=(v,message)=>requireThat(v,'UNSUPPORTED_PORT_ITEM',message);
export function isSupportedOriginalPortItem(industryId,itemId) { return typeof itemId==='string' && Object.hasOwn(R.items,itemId) && R.items[itemId].industryIds.includes(industryId); }
function spec(industryId,itemId) { identifier(industryId);identifier(itemId);check(isSupportedOriginalPortItem(industryId,itemId),'Unknown or incompatible port item');return R.items[itemId]; }
export function originalPortItemRequirements(input) {
    economyShape(input,['industryId','itemId','context'],'port item requirements');
    const item=spec(input.industryId,input.itemId),c=input.context;
    economyShape(c,['planetIsGasGiant','conditionIds'],'port item native getter context');
    if(c.planetIsGasGiant!==null)bool(c.planetIsGasGiant,'actual planet gas-giant getter');
    check(Array.isArray(c.conditionIds)&&c.conditionIds.length<=128&&new Set(c.conditionIds).size===c.conditionIds.length,'Expected exact unique market condition IDs');
    for(const id of c.conditionIds)identifier(id);
    const failed={NOT_A_GAS_GIANT:c.planetIsGasGiant===true,NOT_EXTREME_WEATHER:c.conditionIds.includes('extreme_weather'),NOT_EXTREME_TECTONIC_ACTIVITY:c.conditionIds.includes('extreme_tectonic_activity')};
    return immutableJSON(item.requirements.filter(key=>failed[key]).map(key=>R.requirementNames[key]));
}
/** BaseIndustry's installed-item subphase only; not an installation command or a functional-port check. */
export function applyOriginalPortItemAccessibility(input) {
    economyShape(input,['industryId','itemId','action','context','accessibility'],'port installed-item phase');
    const item=spec(input.industryId,input.itemId);
    check(['apply','unapply'].includes(input.action),'Unknown port item callback');
    stat({base:0,modifiers:input.accessibility});
    if(input.action==='unapply')check(input.context===null,'Unapply must not infer or inspect requirements');
    const unmetRequirements=input.action==='apply'?originalPortItemRequirements({industryId:input.industryId,itemId:input.itemId,context:input.context}):[];
    const applied=input.action==='apply'&&unmetRequirements.length===0,accessibility=structuredClone(input.accessibility);
    put({modifiers:accessibility},'flat',input.itemId,item.accessibilityBonus,!applied);
    return immutableJSON({scope:'port-installed-item-accessibility-only',accessibility,applied,unmetRequirements});
}
