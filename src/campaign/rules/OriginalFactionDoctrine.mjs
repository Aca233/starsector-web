/** Native Faction/FactionDoctrine readResolve state used by fleet generation; no faction-policy approximation. */
import factions from '../data/reference-factions.json' with {type:'json'};
import military from '../data/reference-military-bases.json' with {type:'json'};
import {requireThat,identifier} from '../core/Values.mjs';
const check=(v,m)=>requireThat(v,'UNSUPPORTED_FACTION_DOCTRINE',m),f=Math.fround;
export const DOCTRINE_INTS=['warships','carriers','phaseShips','officerQuality','shipQuality','numShips','shipSize','aggression','fleets'];
export const DOCTRINE_FLOATS=['autofitRandomizeProbability','combatFreighterProbability','combatFreighterCombatUseFraction','combatFreighterCombatUseFractionWhenPriority','commanderSkillsShuffleProbability','officerSkillsShuffleProbability'];
export const DOCTRINE_LISTS=['commanderSkills','officerSkills'];
export function newOriginalFactionDoctrine(objectRef){return {objectRef,warships:4,carriers:2,phaseShips:1,officerQuality:2,shipQuality:3,numShips:2,shipSize:3,aggression:3,fleets:3,...Object.fromEntries(DOCTRINE_FLOATS.map(k=>[k,0])),strictComposition:false,commanderSkills:[],officerSkills:[]};}
export function validateOriginalFactionDoctrine(d){check(d&&typeof d.objectRef==='string','Actual doctrine identity required');for(const k of DOCTRINE_INTS)check(Number.isInteger(d[k])&&d[k]>=-2147483648&&d[k]<=2147483647,'Invalid doctrine integer '+k);for(const k of DOCTRINE_FLOATS)check(Number.isFinite(d[k])&&f(d[k])===d[k],'Invalid doctrine float '+k);check(typeof d.strictComposition==='boolean','Invalid doctrine composition flag');for(const k of DOCTRINE_LISTS){check(Array.isArray(d[k]),'Invalid doctrine skill list');for(const id of d[k])identifier(id);}return d;}
function configured(factionId,objectRef){const spec=factions.definitions.find(d=>d.id===factionId);check(spec,'Actual faction definition required');const d=newOriginalFactionDoctrine(objectRef),raw=spec.raw.factionDoctrine;if(raw){for(const k of DOCTRINE_INTS){check(Object.hasOwn(raw,k)||['shipSize','aggression','fleets'].includes(k),'Missing configured doctrine '+k);d[k]=raw[k]??3;}for(const k of DOCTRINE_FLOATS)d[k]=f(raw[k]??(k==='autofitRandomizeProbability'?0.25:0));d.strictComposition=raw.strictComposition??false;for(const k of DOCTRINE_LISTS)d[k]=[...(raw[k]??[])];}return validateOriginalFactionDoctrine(d);}
export function restoreOriginalFactionDoctrines(capture){
 check(capture?.scope==='native-faction-doctrine-inputs'&&Array.isArray(capture.unresolved)&&capture.unresolved.length===0&&Array.isArray(capture.entries),'Actual faction doctrine capture required');const entries=structuredClone(capture.entries),seen=new Set(),handles=new Map();
 for(const entry of entries){identifier(entry.factionId);check(!seen.has(entry.factionId),'Duplicate faction doctrine owner');seen.add(entry.factionId);const saved=entry.doctrine??newOriginalFactionDoctrine('created-faction-doctrine:'+entry.objectRef);validateOriginalFactionDoctrine(saved);check(!handles.has(saved.objectRef),'Shared doctrine readResolve order requires a graph lifecycle adapter');handles.set(saved.objectRef,saved);
  // NPCs overwrite SAVED values with current spec on readResolve. Player keeps them.
  entry.doctrine=entry.factionId==='player'?saved:configured(entry.factionId,saved.objectRef);
 }
 return {scope:'native-current-faction-doctrines',entries};
}
export function validateOriginalFactionDoctrines(s){check(s?.scope==='native-current-faction-doctrines'&&Array.isArray(s.entries),'Current doctrines required');const ids=new Set();for(const e of s.entries){identifier(e.factionId);check(typeof e.objectRef==='string'&&!ids.has(e.factionId),'Invalid faction identity');ids.add(e.factionId);validateOriginalFactionDoctrine(e.doctrine);}return s;}
export function originalFactionShipQualityContribution(d){validateOriginalFactionDoctrine(d);const rate=military.settings.doctrineFleetQualityPerPoint;check(Number.isFinite(rate)&&rate===f(rate),'Native doctrine quality rate missing');return f(f(f(d.shipQuality)-1)*rate);}
