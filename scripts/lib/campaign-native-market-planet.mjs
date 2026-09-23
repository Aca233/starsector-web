import { parseFactionText } from '../import-campaign-factions.mjs';
import { ORIGINAL_MARKET_PLANETS, projectOriginalPlanetGasDiff, readOriginalMarketPlanet } from '../../src/campaign/rules/OriginalMarketPlanet.mjs';
const ensure=(v,message)=>{if(!v)throw Error('NATIVE_SAVE_PLANET: '+message);};
/** Decode only the getter dependencies, never instantiate saved classes or expand back-links. */
export function captureNativeMarketPlanet(graph,reader,market) {
    const {child}=graph,primary=child(market,'primaryEntity'),seen=new Set(),connectedEntities=[];
    for(const entity of reader.members(child(market,'connectedEntities'))) {
        if(entity.name==='null'&&!entity.attributes.cl&&!entity.children.length)continue;
        const objectRef=reader.ref(entity);if(seen.has(objectRef))continue;seen.add(objectRef);
        const classAlias=entity.attributes.cl??entity.name;
        ensure(Object.hasOwn(ORIGINAL_MARKET_PLANETS.entityClasses,classAlias),'Unreviewed connected entity class '+classAlias);
        let planet=null;
        if(ORIGINAL_MARKET_PLANETS.entityClasses[classAlias].planet) {
            ensure(!child(entity,'spec')&&!child(entity,'graphics'),'Unexpected serialized transient planet spec/graphics');
            const type=reader.value(entity,'type',true),diff=child(entity,'diff');
            ensure(!diff||!diff.attributes.cl||diff.attributes.cl==='PSDiff','Unexpected planet diff class');
            ensure(!child(diff,'data'),'PlanetSpecDiff.data is transient, not a serialized map');
            const text=reader.value(diff,'j');
            ensure(text===null||text.length<=1048576,'Oversized PlanetSpecDiff JSON');
            const projected=projectOriginalPlanetGasDiff(text===null?{}:parseFactionText(text,'PlanetSpecDiff.j'));
            planet={type,...projected};
        }
        connectedEntities.push({objectRef,classAlias,planet});
    }
    const input={primaryEntityRef:primary?reader.ref(primary):null,connectedEntities};
    readOriginalMarketPlanet(input);
    return input;
}
