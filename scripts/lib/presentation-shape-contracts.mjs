import assert from 'node:assert/strict';

// This extends the existing render-projection scene, not a performance benchmark.
// Both encoders share the same module graph/classes, but independent mutable roots.
export function checkPresentationShapes(api) {
  const {CombatPresentationEncoder,BeforeCombatPresentationEncoder,CombatPresentationDecoder,Vector2}=api;
  const classes=[CombatPresentationEncoder,...(BeforeCombatPresentationEncoder?[BeforeCombatPresentationEncoder]:[])];
  let checks=0,packets=0,exactPackets=0;
  const reports=[];
  const snapshots=encoder=>encoder.liveEntries?new Map(encoder.liveEntries.map(row=>[row.id,row.snapshot])):encoder.snapshots;
  const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
  const ok=value=>{assert.ok(value);checks++;};
  const effective=p=>({...p,buffer:new Uint8Array(p.buffer,0,p.length*8)});
  const pair=(make,epoch=71)=>classes.map(C=>({encoder:new C(epoch,'render-strict','ui'),decoder:new CombatPresentationDecoder(epoch,'render-strict','ui'),state:make(),last:null}));
  const envelope=hud=>({kind:'lan-presentation-ui',hud,map:{},deployment:{},presence:[]});
  const payload=arm=>arm.state.ui??envelope(arm.state.root);
  const capture=arms=>{
    for(const arm of arms) {
      arm.state.reads?.splice(0);
      arm.last=arm.encoder.captureUi(payload(arm),0,arm.last?.buffer);
      arm.observed=arm.decoder.applyUi(structuredClone(arm.last)).hud;packets++;
    }
    if(arms.length===2){equal(effective(arms[0].last),effective(arms[1].last));equal(arms[0].state.reads,arms[1].state.reads);exactPackets++;}
    return arms[0].observed;
  };
  const shapes=pair(()=>{
    const records=Array.from({length:96},(_,i)=>({value:i,label:'shared'}));
    const vector=new Vector2(3,4);vector.label='vector-object';
    const root={records,left:records[0],right:records[0],cycle:null,typed:new Float64Array([-0,NaN,Infinity]),vector,plain:{x:3,y:4,label:'plain'},keys:{'20':20,'3':3,'舰船':1,'quote"\\':2},meta:api.immutableCopy({label:'ui-metadata',amount:1})};
    root.cycle=root;root.map=new Map([[records[0],records[1]]]);root.set=new Set([records[0]]);root.metaAlias=root.meta;
    const reads=[];Object.defineProperty(root,'observed',{enumerable:true,get(){reads.push('observed');return root.records[0].value;}});
    return {root,reads};
  });
  let view=capture(shapes);
  equal(view.left,view.right);equal(view.cycle,view);equal(view.map.get(view.left),view.records[1]);ok(view.set.has(view.left));equal(view.meta,view.metaAlias);
  ok(view.vector instanceof Vector2);ok(!(view.plain instanceof Vector2));
  for(let frame=0;frame<40;frame++) {
    for(const {state:{root}} of shapes){
      for(const row of root.records)row.value+=1;
      root.keys['舰船']++;root.vector.x++;root.plain.x++;root.typed[0]=frame%2?-0:0;
      if(frame%4===0)root.records[0].extra=frame;
      if(frame%4===1)delete root.records[0].extra;
      if(frame%4===2){const label=root.records[0].label;delete root.records[0].label;root.records[0].label=label;}
      if(frame%4===3){delete root.keys['20'];root.keys['20']=frame;}
    }
    view=capture(shapes);equal(view.left,view.records[0]);equal(view.observed,frame+1);equal(shapes[0].state.reads,['observed']);
    if(frame===12)for(const arm of shapes){
      const returned=arm.last.shapes.find(s=>s.keys.includes('舰船'));ok(returned);
      const cached=snapshots(arm.encoder).get(arm.encoder.identities.get(arm.state.root.keys).id)?.shape;
      if(cached)ok(cached.keys!==returned.keys);
      // Deliberately corrupt an OLD packet only after it has been consumed.
      returned.keys[0]='consumer-mutated-old-packet';
    }
  }
  const cached=shapes[0].encoder.objectShapes;
  if(cached){
    const rows=shapes[0].state.root.records;
    equal(snapshots(shapes[0].encoder).get(shapes[0].encoder.identities.get(rows[1]).id).shape,
      snapshots(shapes[0].encoder).get(shapes[0].encoder.identities.get(rows[2]).id).shape);
  }
  reports.push({scenario:'presentation-shape-ui-same-tick',frames:41,records:96,oldPacketMutation:true,cyclesAndAliases:true,exactBaseline:classes.length===2,cacheInstalled:!!cached});

  const eviction=pair(()=>({root:{items:Array.from({length:640},(_,i)=>({['field-'+i]:i})),retained:null}}),72);
  for(let frame=0;frame<4;frame++) {
    for(const arm of eviction){for(let i=0;i<640;i++)arm.state.root.items[i]['field-'+i]++;}
    capture(eviction);if(eviction[0].encoder.objectShapes)ok(eviction[0].encoder.objectShapes.size<=512);
  }
  for(const arm of eviction){arm.state.saved=arm.state.root.items;arm.state.root.retained=arm.state.saved[0];arm.state.root.items=[];}
  capture(eviction);equal(snapshots(eviction[0].encoder).size,7);
  for(const arm of eviction)arm.state.root.items=arm.state.saved.slice().reverse();
  capture(eviction);equal(eviction[0].observed.items[639],eviction[0].observed.retained);
  reports.push({scenario:'presentation-shape-eviction',uniqueShapes:640,frames:6,retirementAndReintroduction:true});

  const stringify=JSON.stringify,keys=Object.keys,iterator=Array.prototype[Symbol.iterator],some=Array.prototype.some;
  const define=Object.defineProperty,descriptor=Object.getOwnPropertyDescriptor,slice=Array.prototype.slice;
  const patch=(object,key,value)=>{
    const old=descriptor(object,key);define(object,key,{configurable:true,...value});
    return ()=>{if(old)define(object,key,old);else delete object[key];};
  };
  const hooks=[
    ['stringify-method',log=>patch(JSON,'stringify',{value:function(value){log.push(['stringify',this===JSON,slice.call(value)]);return stringify.call(this,value);},writable:true})],
    ['stringify-getter',log=>patch(JSON,'stringify',{get(){log.push('stringify-get');return stringify;}})],
    ['keys-method',log=>patch(Object,'keys',{value:function(value){log.push(['keys',this===Object]);return keys.call(this,value);},writable:true})],
    ['keys-getter',log=>patch(Object,'keys',{get(){log.push('keys-get');return keys;}})],
    ['keys-with-own-toJSON',log=>patch(Object,'keys',{value:function(value){const result=keys(value);define(result,'toJSON',{value:function(){log.push(['own-toJSON',slice.call(this)]);return this;}});return result;},writable:true})],
    ...[Array.prototype,Object.prototype].map((proto,i)=>['inherited-toJSON-'+i,log=>patch(proto,'toJSON',{get(){log.push('toJSON-get');return function(){log.push(['toJSON-call',Array.isArray(this),slice.call(this)]);return this;};}})]),
    ['iterator-method',log=>patch(Array.prototype,Symbol.iterator,{value:function(){log.push(['iterator',this.length]);return iterator.call(this);},writable:true})],
    ['iterator-self-restoring',log=>{
      const restore=patch(Array.prototype,Symbol.iterator,{value:function(){restore();define(this,'toJSON',{value:function(){log.push(['iterator-toJSON',slice.call(this)]);return this;}});return iterator.call(this);},writable:true});return restore;
    }],
    ['some-self-restoring',log=>{
      const restore=patch(Array.prototype,'some',{value:function(callback){restore();define(this,'toJSON',{value:function(){log.push(['some-toJSON',slice.call(this)]);return this;}});return some.call(this,callback);},writable:true});return restore;
    }],
  ];
  for(const [name,install] of hooks){
    const arms=pair(()=>({root:{a:{n:1,label:'first'},b:{n:2,label:'second'}}}),73);
    capture(arms); // Prime normal snapshots; callbacks must still run on changes.
    for(let frame=0;frame<3;frame++) {
      for(const arm of arms){arm.state.root.a.n++;arm.state.root.b.n++;const log=[];const restore=install(log);
        try{arm.last=arm.encoder.captureUi(payload(arm),0,arm.last.buffer);packets++;}finally{restore();}
        arm.log=log;arm.observed=arm.decoder.applyUi(structuredClone(arm.last)).hud;
      }
      if(arms.length===2){equal(effective(arms[0].last),effective(arms[1].last));equal(arms[0].log,arms[1].log);exactPackets++;}
      ok(arms[0].log.length>0);equal(arms[0].observed.a.n,frame+2);
    }
    for(const arm of arms)arm.state.root.a.n++;
    capture(arms);reports.push({scenario:'presentation-shape-callback',name,callbackCountsAndReceiversMatch:classes.length===2});
  }
  // Field getters may change the next shape. The current keys list must remain
  // the sampled one, while the next capture must discover the added field.
  const dynamic=pair(()=>{
    const root={n:0},reads=[];
    Object.defineProperty(root,'dynamic',{enumerable:true,get(){reads.push('dynamic');root.added=root.n;return root.n;}});
    return {root,reads};
  },74);
  for(let frame=0;frame<4;frame++){
    for(const arm of dynamic){arm.state.root.n=frame;if(frame===2)delete arm.state.root.added;}
    capture(dynamic);equal(dynamic[0].state.reads,['dynamic']);
  }
  reports.push({scenario:'presentation-shape-dynamic-getter',frames:4,nextFrameKeysResampled:true});

  const failures=[
    ['stringify-call',()=>patch(JSON,'stringify',{value(){throw Error('shape-signature-failure');},writable:true}),()=>{}],
    ['stringify-getter',()=>patch(JSON,'stringify',{get(){throw Error('shape-signature-failure');}}),()=>{}],
    ['keys-call',()=>patch(Object,'keys',{value(){throw Error('shape-signature-failure');},writable:true}),()=>{}],
    ['toJSON-getter',()=>patch(Array.prototype,'toJSON',{get(){throw Error('shape-signature-failure');}}),()=>{}],
    ['forbidden-key',()=>()=>{},root=>define(root.a,'__proto__',{value:1,enumerable:true})],
    ['unsupported-value',()=>()=>{},root=>{root.a.invalid=()=>{};}],
    ['identity-type',()=>()=>{},root=>Object.setPrototypeOf(root.a,Vector2.prototype)],
  ];
  for(const [name,install,mutate] of failures){
    const arms=pair(()=>({root:{a:{n:1}}}),75);capture(arms);
    for(const arm of arms){arm.state.root.a.n++;mutate(arm.state.root);const restore=install();
      try{try{arm.encoder.captureUi(payload(arm),0);}catch(error){arm.failure=error.message;}}finally{restore();}
      ok(arm.failure);assert.throws(()=>arm.encoder.captureUi({valid:1},0),/new epoch/);checks++;
    }
    if(arms.length===2)equal(arms[0].failure,arms[1].failure);
    const fresh=new CombatPresentationEncoder(76,'render-strict','ui');
    equal(new CombatPresentationDecoder(76,'render-strict','ui').applyUi(fresh.captureUi(envelope({valid:1}),0)).hud.valid,1);
    reports.push({scenario:'presentation-shape-failed-epoch',name,recoveryRequiresNewEpoch:true});
  }
  // Actual HUD/map/deployment projection, in addition to synthetic graph cases.
  const k=new api.LocalCombatKernel({playerHull:'wolf',enemyHull:'lasher',seed:971,multicore:false});
  try {
    const arms=pair(()=>({root:null}),77);
    for(const arm of arms){arm.hud=new api.CombatHudProjector();arm.map=new api.TacticalMapViewProjector();arm.deployment=new api.DeploymentViewProjector();}
    for(let frame=0;frame<8;frame++){
      if(frame)k.step({autopilot:true,blocked:false,keys:{},aim:[0,0],firing:false,mouseSteering:false,pointerActive:false});
      for(const arm of arms)arm.state.ui={kind:'lan-presentation-ui',hud:arm.hud.capture(k.engine),map:arm.map.capture(k.engine,77),deployment:arm.deployment.capture(k.engine,77),presence:[]};
      const hud=capture(arms);equal(hud.playerShip.id,k.engine.playerShip.id);ok(hud.ships.length>0);
    }
    reports.push({scenario:'presentation-shape-real-ui-projectors',frames:8,simulationSteps:7,uiRenderingVerified:false});
  } finally { k.dispose(); }
  reports.push({scenario:'presentation-shape-summary',checks,packets,exactPackets});
  return {checks,reports};
}
