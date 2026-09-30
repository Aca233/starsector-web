// Architecture screening only: never imported by production. It starts AFTER the
// real decoder, so its costs are optimistic; no claim of protocol equivalence.
import {classes, prototypes, typed, behaviorKeys, forbidden, LIMIT} from '../../src/engine/runtime/local/CombatPresentationWire';
const TYPED=16, CLASS=32, MAX_UNITS=24_000_000;
const fail=message=>{throw Error('Native clone probe: '+message);};
const integer=n=>Number.isSafeInteger(n)&&n>=0;
function sourceType(value) {
  const proto=Object.getPrototypeOf(value);
  if(proto===Object.prototype)return 0;
  if(proto===null)return 1;
  if(proto===Array.prototype&&Array.isArray(value))return 2;
  if(proto===Map.prototype&&value instanceof Map)return 3;
  if(proto===Set.prototype&&value instanceof Set)return 4;
  const type=prototypes.get(proto);if(type!==undefined)return CLASS+type;
  const index=typed.findIndex(C=>proto===C.prototype&&value instanceof C);if(index>=0)return TYPED+index;
  return fail('unsupported prototype');
}
function supported(type) {return integer(type)&&(type<=4||type>=TYPED&&type<TYPED+typed.length||type>=CLASS&&!!classes[type-CLASS]);}
function nativeTypeMatches(node,type) {
  const proto=Object.getPrototypeOf(node);
  if(type<=1||type>=CLASS)return proto===Object.prototype;
  if(type===2)return Array.isArray(node)&&proto===Array.prototype;
  if(type===3)return node instanceof Map&&proto===Map.prototype;
  if(type===4)return node instanceof Set&&proto===Set.prototype;
  return node instanceof typed[type-TYPED]&&proto===typed[type-TYPED].prototype;
}
function addUnits(stats,n) {stats.units+=n;if(stats.units>MAX_UNITS)fail('data budget');}
function scan(node,type,visit,stats) {
  const keys=Object.keys(node);addUnits(stats,4);
  if(type===3||type===4){
    if(keys.length)fail('native collection would drop own fields');
    if(type===3)for(const[k,v]of node){visit(k);visit(v);}
    else for(const v of node)visit(v);
    return;
  }
  if(type>=TYPED&&type<CLASS){
    if(keys.length!==node.length)fail('native typed clone would drop own fields');
    for(let i=0;i<keys.length;i++)if(keys[i]!==String(i))fail('typed keys');
    addUnits(stats,node.length);stats.scalars+=node.length;return;
  }
  for(const key of keys){
    if(forbidden.has(key)||type>=CLASS&&behaviorKeys[type-CLASS].has(key))fail('unsafe property');
    const d=Object.getOwnPropertyDescriptor(node,key);if(!d||!('value'in d))fail('accessor');
    addUnits(stats,key.length);visit(d.value);
  }
}
function scalar(value,stats) {
  if(value===null||value===undefined||['number','string','boolean'].includes(typeof value)){
    addUnits(stats,typeof value==='string'?value.length+1:1);stats.scalars++;return true;
  }
  if(typeof value!=='object')fail('unsupported scalar');return false;
}
export function prepareNativeCloneGraph(root) {
  if(!root||typeof root!=='object')fail('root');
  const nodes=[],seen=new Set(),stats={units:0,scalars:0};
  const visit=value=>{
    if(scalar(value,stats))return;
    stats.edges=(stats.edges??0)+1;
    if(seen.has(value))return;
    if(nodes.length>=LIMIT)fail('node budget');seen.add(value);
    nodes.push([value,sourceType(value),Object.isFrozen(value)]);
  };
  visit(root);for(let i=0;i<nodes.length;i++)scan(nodes[i][0],nodes[i][1],visit,stats);
  return{root,nodes};
}
export function restoreNativeCloneGraph(envelope) {
  if(!envelope||!Array.isArray(envelope.nodes)||!envelope.nodes.length||envelope.nodes.length>LIMIT)fail('node table');
  const byNode=new Map(),stats={units:0,scalars:0,edges:0};
  for(const row of envelope.nodes){
    if(!Array.isArray(row)||row.length!==3||!row[0]||typeof row[0]!=='object'||!supported(row[1])||typeof row[2]!=='boolean'||byNode.has(row[0]))fail('node declaration');
    if(!nativeTypeMatches(row[0],row[1]))fail('clone kind');byNode.set(row[0],row);
  }
  if(!byNode.has(envelope.root))fail('root declaration');
  const reachable=new Set([envelope.root]);
  const visit=value=>{if(scalar(value,stats))return;stats.edges++;if(!byNode.has(value))fail('undeclared edge');reachable.add(value);};
  for(const node of reachable)scan(node,byNode.get(node)[1],visit,stats);
  if(reachable.size!==byNode.size)fail('unreachable declaration');
  // Stage all checks before mutating any cloned node. Do not revive arbitrary constructors.
  for(const[node,type]of envelope.nodes){if(type===1)Object.setPrototypeOf(node,null);else if(type>=CLASS)Object.setPrototypeOf(node,classes[type-CLASS].prototype);}
  for(const[node,,frozen]of envelope.nodes)if(frozen)Object.freeze(node);
  return{root:envelope.root,stats:{...stats,nodes:byNode.size,frozen:envelope.nodes.filter(r=>r[2]).length}};
}
export function screenNativeCloneGraph(root) {
  const start=performance.now(),envelope=prepareNativeCloneGraph(root),prepared=performance.now();
  const clone=structuredClone(envelope),copied=performance.now();
  const restored=restoreNativeCloneGraph(clone),end=performance.now();
  return{root:restored.root,timing:{prepareMs:prepared-start,cloneMs:copied-prepared,validateReviveMs:end-copied,totalMs:end-start},stats:restored.stats};
}
