/** Read-only spatial closure for native RouteManager; no fleet construction, movement, or sensor guesses. */
const check=(v,m)=>{if(!v)throw Error('NATIVE_ROUTE_SPACE: '+m);};
export function captureNativeRouteSpace(g,r,patrols){
 const unresolved=[],entities=[],locations=[],entityMap=new Map(),locationMap=new Map(),vectors=new Map();
 const hyper=g.child(g.root,'hyperspace'),playerNode=g.child(g.root,'playerFleet'),player=playerNode?.attributes.z?playerNode:null,ref=n=>n?r.ref(n):null;
 if(playerNode&&!player)unresolved.push('missing-player-spatial-identity');
 const type=n=>n?.attributes.cl??n?.name;
 if(!hyper)unresolved.push('missing-sector-hyperspace');
 function vector(n){if(!n)return {positionRef:null,position:null};const id=ref(n);if(vectors.has(id))return {positionRef:id,position:vectors.get(id)};
  check(!n.children.length,'Unsupported native route vector');const pieces=n.text.trim().split('|');check(pieces.length===2&&pieces.every(s=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)),'Invalid route vector');const values=pieces.map(s=>Math.fround(Number(s)));check(values.every(Number.isFinite),'Nonfinite route vector');const position={x:values[0],y:values[1]};vectors.set(id,position);return {positionRef:id,position};
 }
 function location(n){if(!n)return null;const id=ref(n);if(locationMap.has(id))return locationMap.get(id);const kind=n===hyper?'Hyperspace':type(n);
  const row={objectRef:id,classAlias:kind,...vector(g.child(n,'l')),centerRef:kind==='Sstm'?ref(g.child(n,'ce')):null};locations.push(row);locationMap.set(id,row);
  if(!['Sstm','Hyperspace'].includes(kind))unresolved.push('unreviewed-route-location-class');if(!row.position)unresolved.push('missing-route-location-vector');return row;
 }
 function entity(n){if(!n)return null;const id=ref(n);if(entityMap.has(id))return entityMap.get(id);const kind=n===player?'Flt':type(n),where=g.child(n,kind==='LocationToken'?'where':'cL');
  const row={objectRef:id,classAlias:kind,...vector(g.child(n,'loc')),locationRef:location(where)?.objectRef??null,fleet:null};entities.push(row);entityMap.set(id,row);
  if(!['Plnt','CCEnt','Flt','LocationToken','JumpPoint'].includes(kind))unresolved.push('unreviewed-route-entity-class');if(!row.position)unresolved.push('missing-route-entity-vector');
  if(kind==='Flt'){const text=r.attr(n,'noAutoDespawn')??r.value(n,'noAutoDespawn');check(text===null||text==='true'||text==='false','Invalid noAutoDespawn flag');const listeners=g.child(n,'dL');row.fleet={battleRef:ref(g.child(n,'b')),noAutoDespawn:text===null?null:text==='true',wasMousedOverByPlayer:null,eventListenerRefs:listeners?r.members(listeners).map(ref):null};}
  return row;
 }
 if(hyper)location(hyper);if(player)entity(player);
 const refs=new Set([...patrols.markets.map(m=>m.primaryEntityRef),...patrols.routes.flatMap(route=>[route.activeFleetRef,...route.segments.flatMap(s=>[s.fromRef,s.toRef])])].filter(Boolean));
 for(const id of refs){const n=g.objects.get(id);if(!n){unresolved.push('missing-route-entity-object');continue;}entity(n);}
 return {scope:'native-route-spatial-closure',schemaVersion:1,hyperspaceRef:ref(hyper),playerFleetRef:ref(player),entities,locations,unresolved:[...new Set(unresolved)]};
}
