/** Static-only roster extension. Constructor samples use private RNG; actual
 * identities, live resources and carrier births are committed inside Rust. */
import type { ShipSpec } from '../../content/ShipSpec';
import { immutableCopy } from '../../extensions/Immutable';
import { compileRustContent, type RustCompiledContent, type RustCompiledTemplate } from './RustContentCompiler';
import { compileRustFlightNames, rustFlightTemplateRows } from './RustFlightProtocol';
import type { RustScenePublication } from './RustScenePublication';
import type { RustCoreSnapshot, RustBodyHandle } from './RustCoreProtocol';
import { assemblyRadius } from '../../content/ModuleGeometry';
import { deploymentCost } from '../../simulation/CombatDeployment';
export interface RustDynamicEntry { readonly spec:ShipSpec; readonly isPlayer:boolean; readonly position?:readonly [number,number]; readonly facing?:number }
export interface RustDynamicDraft { readonly content:RustCompiledContent; readonly json:string; readonly nextSpecBase:number }
export function compileRustDynamicAdmission(content:RustCompiledContent, scene:RustScenePublication, snapshot:RustCoreSnapshot,
  kind:'add-ship'|'simulation-wave', entries:readonly RustDynamicEntry[], serial:number, specBase:number):RustDynamicDraft {
  if (!entries.length || entries.length > 4096) throw Error('Invalid native dynamic roster');
  const compiled = compileRustContent({seed:0,initializeWings:false,staticRootTemplates:true,staticNamespace:'dynamic:'+serial+':',templateSpecBase:specBase,
    visibilityTeams:[...new Set(scene.ships.map(ship => ship.team))],ships:entries.map((entry,index) => ({stableId:'dynamic-static:'+index,spec:entry.spec,team:entry.isPlayer ? 0 : 1,player:entry.isPlayer,
      position:[0,0],facing:0,aiMemory:false,deployment:'reserve',fireControlMode:'MANUAL'}))});
  const templates = compiled.dictionary.templates;
  const roots = entries.map(entry => { const found = templates.find(t => !t.carrierSpecKey && t.samplePlayer === entry.isPlayer && t.sourceSpecId === entry.spec.id && JSON.stringify(t.spec) === JSON.stringify(entry.spec));
    if (!found) throw Error('Missing certified dynamic root template'); return found; });
  const allTemplates = [...content.dictionary.templates,...templates], ids = new Map<string,number>();
  for (const t of allTemplates) if (t.constructor.hullSize === 0 && !ids.has(t.constructor.specId)) ids.set(t.constructor.specId,ids.size+1);
  const rows = rustFlightTemplateRows(compiled,ids).map(row => {
    const root=roots.find(template => template.key === row.key);
    return root ? {...row,cost:deploymentCost(root.spec)} : row;
  });
  const original = new Map(content.entities.map(e => [e.handle.slot+':'+e.handle.generation,e]));
  const byTemplate = new Map(allTemplates.map(t => [t.key,t]));
  const bySpec = new Map(content.dictionary.ships.map(s => [s.key,s.spec]));
  const names = scene.ships.map(ship => {
    const entity = original.get(ship.handle.slot+':'+ship.handle.generation), spec = byTemplate.get(ship.specKey)?.spec ?? (entity && bySpec.get(entity.specKey));
    if (!spec) throw Error('Unknown live dynamic collation ship');
    const initialFlight = entity && content.pending.flight.ships.find(s => s.id === entity.id);
    return {stableId:ship.stableId,wings:spec.fighterWings ?? [],bays:initialFlight?.bays ?? byTemplate.get(ship.specKey)?.constructor.bays ?? 0,mounts:spec.weaponSlots.map(slot => ({slot:slot.slotId}))};
  });
  let nextId = snapshot.random[2];
  const stable = () => { if (++nextId > Number.MAX_SAFE_INTEGER) throw Error('Native dynamic identity exhausted'); return 'ship_'+nextId.toString(36); };
  const rootIds = roots.map((_,i) => kind === 'simulation-wave' && !scene.primaryEnemyDeployed && !entries[i].isPlayer && entries.slice(0,i).every(e => e.isPlayer) ? 'enemy_ship' : stable());
  const appendTree = (template:RustCompiledTemplate,id:string) => {
    names.push({stableId:id,wings:template.spec.fighterWings ?? [],bays:template.constructor.bays,mounts:template.constructor.mounts.map(m => ({slot:m.slot}))});
    template.constructor.children.forEach((child,i) => { const t = byTemplate.get(child.template); if (!t) throw Error('Missing dynamic module template'); appendTree(t,id+':module:'+i); });
  };
  if (kind === 'simulation-wave' && !scene.primaryEnemyDeployed && entries.some(e => !e.isPlayer)) {
    if (!names.some(n => n.stableId === 'enemy_ship')) throw Error('Missing native simulation sentinel');
    for (const name of names) if (name.stableId === 'enemy_ship' || name.stableId.startsWith('enemy_ship:module:'))
      name.stableId='rust-retired-sentinel:'+scene.enemy.slot+':'+scene.enemy.generation+name.stableId.slice('enemy_ship'.length);
  }
  roots.forEach((template,index) => appendTree(template,rootIds[index]));
  const collation = compileRustFlightNames(names,allTemplates.flatMap(t => t.constructor.mounts.map(m => m.slot)));
  const dictionary = immutableCopy({...content,dictionary:{...content.dictionary,
    templates:allTemplates,weapons:[...content.dictionary.weapons,...compiled.dictionary.weapons.filter(w => w.key.startsWith('template-'))]}});
  const payload = {version:1,kind,templates:rows,collation,entries:entries.map((entry,i) => ({key:roots[i].key,cost:deploymentCost(entry.spec),radius:assemblyRadius(entry.spec),station:!!entry.spec.sourceHullTraits?.includes('STATION'),
    isPlayer:entry.isPlayer,position:entry.position,facing:entry.facing}))};
  const json = JSON.stringify(payload);
  if (json.length > 16_000_000) throw Error('Native dynamic admission exceeds bound');
  return {content:dictionary,json,nextSpecBase:specBase+templates.length};
}
export function encodeRustDynamicAdmission(json:string,id:number,handle:RustBodyHandle):Float64Array {
  const rows:number[] = [], append = (tag:number,values:readonly number[]) => { const row=Array<number>(26).fill(0); row.splice(0,4+values.length,tag,id,handle.slot,handle.generation,...values); rows.push(...row); };
  append(198,[1,json.length]);
  for(let offset=0;offset<json.length;offset+=20){const count=Math.min(20,json.length-offset);append(199,[offset,count,...Array.from({length:count},(_,i)=>json.charCodeAt(offset+i))]);}
  append(200,[]);return Float64Array.from(rows);
}
