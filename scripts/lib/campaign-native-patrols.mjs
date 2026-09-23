/** Data-only native route-manager and MilitaryBase tracker capture. Unimplemented spawners remain explicit object refs. */
const check=(v,m)=>{if(!v)throw Error('NATIVE_PATROL_CAPTURE: '+m);};
export function captureNativePatrols(g,r,markets){
 const ref=n=>n?r.ref(n):null,kind=n=>n?(n.attributes.cl??n.name):null;
 const field=(n,k)=>r.attr(n,k)??r.value(n,k),num=(n,k,fallback)=>{const text=field(n,k);if(text===null&&fallback!==undefined)return fallback;const v=Number(text);check(text!==null&&text!==''&&Number.isFinite(v),'Missing/invalid numeric patrol field '+k);return Math.fround(v);};
 const integer=(n,k,fallback)=>{const text=field(n,k),v=text===null?fallback:Number(text);check(Number.isInteger(v)&&v>=-2147483648&&v<=2147483647,'Invalid patrol integer '+k);return v;};
 const memory=g.child(g.root,'memory');let manager=null;for(const entry of r.members(g.child(memory,'d'))){if(g.resolve(entry.children[0]).text==='$core_routeManager'){check(manager===null,'Duplicate route manager');manager=g.resolve(entry.children[1]);}}
 // RouteManager.getInstance replaces a non-RouteManager entry too, unlike ShipQuality.getInstance.
 if(kind(manager)!=='RouteManager')manager=null;
 const nativeMarkets=new Map(markets.map(m=>[m.objectRef,m.marketId])),unresolved=[],industries=[],marketInputs=[];
 for(const saved of markets){const m=g.objects.get(saved.objectRef);check(m,'Missing native market object');
  let spawnRate=null;for(const entry of r.members(g.child(g.child(g.child(m,'stats'),'dynamic'),'stats')))if(g.resolve(entry.children[0]).text==='combat_fleet_spawn_rate_mult'){const value=r.stat(g.resolve(entry.children[1]));check(!value.temporary.length,'Patrol spawn rate is not a temporary stat');spawnRate=value.state;}
  marketInputs.push({marketId:saved.marketId,marketRef:saved.objectRef,primaryEntityRef:ref(g.child(m,'primaryEntity')),spawnRate:spawnRate??{base:1,modifiers:{flat:[],percent:[],mult:[]}}});
  for(const savedIndustry of saved.industries){if(savedIndustry.classAlias!=='MilitaryBase')continue;const n=g.objects.get(savedIndustry.objectRef),t=g.child(n,'tracker');let tracker=null;
   if(!t)unresolved.push('missing-military-patrol-tracker');else {const flag=field(t,'ie');check(flag==='true'||flag==='false','Missing interval flag');tracker={objectRef:ref(t),minInterval:num(t,'i'),maxInterval:num(t,'a'),currInterval:num(t,'c'),elapsed:num(t,'e'),intervalElapsed:flag==='true',randomRef:ref(g.child(t,'random'))};if(tracker.randomRef!==null)unresolved.push('custom-patrol-tracker-random');}
   industries.push({objectRef:ref(n),marketId:saved.marketId,marketRef:saved.objectRef,industryId:savedIndustry.industryId,tracker,returningPatrolValue:num(n,'returningPatrolValue',0)});
  }
 }
 const segments=new Map();function segment(n){const id=ref(n);if(segments.has(id))return segments.get(id);check(kind(n)==='RtSeg'||n.name==='r','Unexpected route segment');const value={objectRef:id,id:field(n,'i')===null?null:integer(n,'i'),elapsed:num(n,'e',0),daysMax:num(n,'d'),fromRef:ref(g.child(n,'f')),toRef:ref(g.child(n,'t')),customRef:ref(g.child(n,'custom'))};segments.set(id,value);return value;}
 const routes=r.members(g.child(manager,'r')).map(n=>{check(kind(n)==='RouteData'||!n.attributes.cl&&n.name==='r','Unsupported route record');const extra=g.child(n,'x'),custom=g.child(n,'c'),spawner=g.child(n,'p'),market=g.child(n,'m'),rows=r.members(g.child(n,'e')).map(segment),current=g.child(n,'r');
  const nullable=(n,k)=>field(n,k)===null?null:num(n,k);
  return {objectRef:ref(n),source:field(n,'o'),marketId:nativeMarkets.get(ref(market))??null,marketRef:ref(market),seed:field(n,'s'),timestamp:field(n,'t'),delay:num(n,'a',0),daysSinceSeenByPlayer:num(n,'d',0),elapsed:num(n,'elapsed',0),activeFleetRef:ref(g.child(n,'f')),spawnerRef:ref(spawner),spawnerKind:kind(spawner),custom:custom?kind(custom)==='MPFD'?{objectRef:ref(custom),kind:'military-patrol',type:field(custom,'t'),spawnFP:integer(custom,'fp',0)}:{objectRef:ref(custom),kind:'other',className:kind(custom)}:null,extra:extra?{objectRef:ref(extra),strength:nullable(extra,'s'),quality:nullable(extra,'q'),fp:nullable(extra,'fp'),factionId:field(extra,'f'),fleetType:field(extra,'t'),damage:nullable(extra,'d')}:null,segments:rows,current:current?segment(current):null};
 });
 const simMode=r.value(g.child(g.root,'economy'),'simMode');check(simMode===null||simMode==='true'||simMode==='false','Invalid native economy simMode');
 return {scope:'native-patrol-route-state',simMode:simMode==='true',schemaVersion:1,objectRef:manager?ref(manager):'created-sector-route-manager',nextObjectId:0,markets:marketInputs,industries,routes,unresolved:[...new Set(unresolved)]};
}
