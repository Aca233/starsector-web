import {originalPersonMemoryWithoutUpdate} from './OriginalPersonAdvance.mjs';
import {setOriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
/** Native Faction.createRandomPerson + PersonNameStore; not officer skills, levels, or fleet attachment. */
import raw from '../data/reference-faction-persons.json' with {type:'json'};
import {immutableJSON,requireThat} from '../core/Values.mjs';
import {createOriginalJavaRandom,validateOriginalJavaRandom,originalJavaNextFloat,originalJavaNextDouble,originalJavaNextLong} from './OriginalJavaRandom.mjs';
import {createOriginalDefaultFleetCaptain,originalPersonnelByRef} from './OriginalMarketPersonnel.mjs';
export const ORIGINAL_FACTION_PERSONS=immutableJSON(raw);
const f=Math.fround,check=(v,m)=>requireThat(v,'UNSUPPORTED_NATIVE_FACTION_PERSON',m),own=(o,k)=>typeof k==='string'&&Object.hasOwn(o,k);
export function createOriginalFactionPersonFactory(sourceSha256,mathRandom,reference=ORIGINAL_FACTION_PERSONS){
 check(typeof sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(sourceSha256),'Actual source SHA required for explicit Web new-Random branch');
 validateOriginalJavaRandom(mathRandom);const seed=BigInt.asIntN(64,BigInt('0x'+sourceSha256.slice(32,48))).toString();
 return {scope:'native-current-faction-person-factory',names:structuredClone(reference.names),factions:structuredClone(reference.factions),generated:[],random:{scope:'web-new-java-random-seeds',sourceSha256,newRandomSeeds:createOriginalJavaRandom(seed),mathRandom}};
}
function randomFor(factory,random){return random===null?createOriginalJavaRandom(originalJavaNextLong(factory.random.newRandomSeeds)):validateOriginalJavaRandom(random);}
function pick(picker,random,mathRandom){
 check(picker&&Array.isArray(picker.items)&&Array.isArray(picker.weights)&&picker.items.length===picker.weights.length,'Actual native person picker required');
 // WeightedRandomPicker.pick(Random) temporarily installs and then restores the old reference.
 const previous=picker.random;picker.random=random;let item=null;
 if(picker.items.length){let value=random===null?f(originalJavaNextDouble(mathRandom)*picker.total):f(originalJavaNextFloat(random)*picker.total);if(value>picker.total)value=picker.total;let sum=0,index=0;for(const weight of picker.weights){sum=f(sum+weight);if(value<=sum)break;index++;}item=picker.items[Math.min(index,picker.items.length-1)];}
 picker.random=previous;return item;
}
function currentFaction(factory,id){check(factory?.scope==='native-current-faction-person-factory'&&own(factory.factions,id),'Actual current faction person inputs required');return factory.factions[id];}
function fromList(random,list){check(Array.isArray(list)&&list.length>0,'Native person-name list is empty');return list[Math.trunc(originalJavaNextDouble(random)*list.length)];}
/** FullName overload: MALE/FEMALE are actual table keys; ANY is resolved by Faction, not this store. */
export function pickOriginalFactionPersonName(factory,factionId,gender,random=null){
 const faction=currentFaction(factory,factionId),rng=randomFor(factory,random);check(['MALE','FEMALE'].includes(gender),'Actual resolved person-name gender required');
 const {FIRST:first,LAST:last}=factory.names[gender];let firstCategory=pick(faction.nameCategories,rng);
 if(!own(first.lists,firstCategory))firstCategory=fromList(rng,first.order);
 const selectedLast=pick(faction.nameCategories,rng);let lastCategory=selectedLast;
 // Bytecode repeats the FIRST category check here; do not reinterpret it as lastCategory.
 if(!own(first.lists,firstCategory))firstCategory=fromList(rng,first.order);
 if(!own(last.lists,lastCategory))lastCategory=fromList(rng,last.order);
 const firstName=fromList(rng,first.lists[firstCategory]);let lastName=null,attempts=0;
 do{lastName=fromList(rng,last.lists[lastCategory]);}while(firstName!==null&&firstName===lastName&&++attempts<10);
 return {first:firstName,last:lastName,gender};
}
export function pickOriginalFactionVoice(factory,factionId,importance,random=null){
 const faction=currentFaction(factory,factionId);if(random!==null)validateOriginalJavaRandom(random);check(['VERY_LOW','LOW','MEDIUM','HIGH','VERY_HIGH'].includes(importance),'Actual person importance required');
 const category=['VERY_LOW','LOW'].includes(importance)?'LOW':['VERY_HIGH','HIGH'].includes(importance)?'HIGH':'MEDIUM';return pick(faction.voices[category],random,factory.random.mathRandom);
}
/** isInSectorGen must come from actual world context; it is not inNewGameAdvance. */
export function createOriginalFactionPerson(factory,player,factionId,{gender=null,random=null,isInSectorGen}={}){
 const faction=currentFaction(factory,factionId);check(typeof isInSectorGen==='boolean','Actual isInSectorGen required for portrait exclusion');check(gender===null||['ANY','MALE','FEMALE'].includes(gender),'Invalid requested person gender');
 if(!isInSectorGen)check(player?.player&&(player.player.portraitSprite===null||typeof player.player.portraitSprite==='string'),'Actual player portrait required for exclusion');
 const rng=randomFor(factory,random);if(gender===null||gender==='ANY')gender=originalJavaNextFloat(rng)>0.5?'FEMALE':'MALE';
 const person=createOriginalDefaultFleetCaptain(player);person.nativeConstruction='random-faction-person';
 let portrait=null;for(let attempt=0;attempt<5;attempt++){portrait=pick(faction.portraits[gender],rng);if(isInSectorGen||portrait!==player.player.portraitSprite)break;}
 person.portraitSprite=portrait;person.name={objectRef:'created-faction-name:'+person.objectRef,...pickOriginalFactionPersonName(factory,factionId,gender,rng)};person.factionId=factionId;
 const voice=pickOriginalFactionVoice(factory,factionId,person.importance,rng);
 person.memory.entries.$voice={key:'$voice',present:voice!==null,value:voice===null?null:{type:'st',text:voice},expires:[]};if(voice!==null)setOriginalCampaignMemory(originalPersonMemoryWithoutUpdate(person),'$voice',voice);
 factory.generated.push(person);return person;
}
function validatePicker(p){
 check(p&&Array.isArray(p.items)&&Array.isArray(p.weights)&&p.items.length===p.weights.length&&p.items.every(v=>typeof v==='string')&&p.weights.every(v=>Number.isFinite(v)&&f(v)===v&&v>0)&&Number.isFinite(p.total)&&p.total===f(p.total)&&p.total>=0,'Invalid current native person picker');if(p.random!==null)validateOriginalJavaRandom(p.random);
}
export function validateOriginalFactionPersonFactory(factory,player,mathRandom){
 check(factory?.scope==='native-current-faction-person-factory'&&factory.names&&factory.factions&&Array.isArray(factory.generated)&&factory.random?.scope==='web-new-java-random-seeds'&&/^[a-f0-9]{64}$/.test(factory.random.sourceSha256),'Invalid current faction person factory');validateOriginalJavaRandom(factory.random.newRandomSeeds);validateOriginalJavaRandom(factory.random.mathRandom);check(factory.random.mathRandom===mathRandom,'Lost shared global person voice random');
 for(const gender of ['MALE','FEMALE'])for(const usage of ['FIRST','LAST']){const t=factory.names[gender]?.[usage];check(t&&Array.isArray(t.order)&&new Set(t.order).size===t.order.length&&t.lists&&Object.keys(t.lists).length===t.order.length&&t.order.every(key=>own(t.lists,key)&&Array.isArray(t.lists[key])&&t.lists[key].every(v=>typeof v==='string')),'Invalid current native name tables/order');}
 for(const faction of Object.values(factory.factions)){validatePicker(faction.nameCategories);for(const gender of ['MALE','FEMALE'])validatePicker(faction.portraits?.[gender]);for(const importance of ['LOW','MEDIUM','HIGH'])validatePicker(faction.voices?.[importance]);}
 const seen=new Set();for(const person of factory.generated){check(person.nativeConstruction==='random-faction-person'&&!seen.has(person.objectRef)&&player&&originalPersonnelByRef(player,person.objectRef)===person,'Lost shared generated faction person');seen.add(person.objectRef);check(person.stats?.nativeCharacterStatsVersion===1&&person.memory?.entries?.$voice,'Incomplete generated native person state');}
 return factory;
}
