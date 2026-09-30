import assert from 'node:assert/strict';
const ids=['web_adun_solar_lance','web_adun_phase_disruptor','web_adun_ion_repeater','web_adun_interception_prism'];
export function checkRetiredAdunArmory(m,test){
  const seed=()=>{
    const queen=m.createDesign('web_gloriana');queen.name='Keep my queen';
    const xl=m.baseHull(queen.hullId).weaponSlots.find(s=>s.slotSize==='EXTRA_LARGE');queen.weapons[xl.slotId]=ids[0];
    const ark=m.createAdunDesign();ark.name='Keep my Ark';
    ark.modules=Object.fromEntries(m.baseHull(ark.hullId).modules.map(part=>[part.slotId,m.designFromModule(part.spec)]));const replacements=[];
    for(const [size,id] of [['LARGE',ids[1]],['MEDIUM',ids[2]],['SMALL',ids[3]]]){
      const part=Object.values(ark.modules).find(d=>m.baseHull(d.hullId).weaponSlots.some(s=>s.slotSize===size));
      const slot=m.baseHull(part.hullId).weaponSlots.find(s=>s.slotSize===size);part.weapons[slot.slotId]=id;replacements.push({hull:part.hullId,slot:slot.slotId});
    }
    return {queen,ark,xl:xl.slotId,replacements};
  };
  test('retired armory: old IDs absent from runtime, refit, metadata; current Ark remains fully equipped',()=>{
    for(const id of ids){assert.equal(m.contentRegistry.getWeapon(id),undefined);assert.equal(m.data.weapons[id],undefined);assert.equal(m.nativeRefit.weaponStatus[id],undefined);assert(!m.weapons.some(w=>w.id===id));}
    const fit=m.evaluate(m.createAdunDesign());assert.deepEqual(fit.errors,[]);
    let count=0;
    for(const part of fit.spec.modules)for(const slot of part.spec.weaponSlots){assert(slot.defaultWeaponId.startsWith('web_ark_'));assert(m.contentRegistry.getWeapon(slot.defaultWeaponId));count++;}
    assert.equal(count,13);assert.equal(m.contentRegistry.getWeapon(m.ARK_WEAPONS.lance).range,3800);
  });
  test('retired armory: copy-on-write removal handles four old weapons and nested modules, never new ones',()=>{
    const {queen,ark,xl,replacements}=seed();
    for(const [d,n] of [[queen,1],[ark,3]]){
      const before=JSON.stringify(d),result=m.removeRetiredAdunWeapons(d);assert.equal(result.removed,n);assert.equal(JSON.stringify(d),before);
      m.decodeDesign(result.value);assert.deepEqual(m.evaluate(result.value).errors,[]);
      assert.equal(result.value.name,d.name);assert.equal(m.removeRetiredAdunWeapons(result.value).value,result.value);
      assert.equal(m.removeRetiredAdunWeapons(result.value).removed,0);
      if(d===queen)assert.equal(result.value.weapons[xl],null);
      else for(const {hull,slot} of replacements){const part=Object.values(result.value.modules).find(d=>d.hullId===hull);assert.equal(part.weapons[slot],null);assert(part.groups.every(g=>!g.weaponSlotIds.includes(slot)));}
    }
    const current=m.createAdunDesign();assert.equal(m.removeRetiredAdunWeapons(current).value,current);
  });
  test('retired armory: library backup, baseline, idempotence and failed-backup protection',()=>{
    const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),store=new Map();let fail=false;
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');store.set(k,v);}}});
    try{
      const {queen,ark,xl}=seed(),fresh=m.createAdunDesign();
      const raw=JSON.stringify({version:1,draft:queen,baseline:queen,designs:[queen,ark,fresh]}),prefix=m.storageKey+':removed:web_adun_armory';store.set(m.storageKey,raw);
      const r=m.readLibrary();assert.equal(r.protected,false,r.error);assert.match(r.error,/旧版亚顿军械已下架/);
      assert.equal(store.get(prefix),raw);assert.equal(store.get(m.storageKey),raw);assert.equal(r.observedRaw,raw);
      assert.equal(r.library.draft.weapons[xl],null);assert.equal(r.library.baseline.weapons[xl],null);assert.equal(r.library.designs[0].weapons[xl],null);
      assert.deepEqual(r.library.designs[2],fresh);assert.equal(r.library.designs.length,3);
      m.readLibrary();assert.equal(store.size,2);store.set(prefix,'older original');m.readLibrary();assert.equal(store.get(prefix),'older original');assert.equal(store.get(prefix+':1'),raw);
      m.writeLibrary(r.library,r.observedRaw);assert.equal(m.readLibrary().error,null);
      store.clear();store.set(m.storageKey,raw);fail=true;assert.equal(m.readLibrary().protected,true);assert.equal(store.get(m.storageKey),raw);fail=false;
      const corrupt=structuredClone(queen);corrupt.weapons[xl]='unknown_nonretired_weapon';const bad=JSON.stringify({version:1,draft:corrupt,designs:[]});store.clear();store.set(m.storageKey,bad);
      assert.equal(m.readLibrary().protected,true);assert.equal(store.get(m.storageKey),bad);assert.equal(store.size,1);
      assert.throws(()=>m.decodeDesign(queen),/不兼容武器/);
      // Compose safely with the preceding Gloriana tier migration in the same library.
      const roci=m.createDesign('web_expanse_rocinante');roci.weapons.TORP_1='web_gloriana_torpedo';roci.groups[1].weaponSlotIds.push('TORP_1');
      const mixed=JSON.stringify({version:1,draft:queen,baseline:queen,designs:[queen,roci]});store.clear();store.set(m.storageKey,mixed);
      const combined=m.readLibrary();assert.equal(combined.protected,false,combined.error);
      assert.equal(combined.library.designs[0].weapons[xl],null);assert.equal(combined.library.designs[1].weapons.TORP_1,null);
      assert.equal(store.get(prefix),mixed);assert.equal(store.get(m.storageKey+':backup:gloriana-weapon-tiers-20260929'),mixed);

    }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
  });
}

/** Isolated browser fixture: real picker and refresh path, no player profile access. */
export async function checkRetiredAdunArmoryBrowser(page,out){
  const seeded=await page.evaluate(async()=>{
    const m=await import('/src/studio/DesignModel.ts'),d=m.createDesign('web_gloriana');
    const slot=m.baseHull(d.hullId).weaponSlots.find(s=>s.slotSize==='EXTRA_LARGE');
    d.name='Keep player queen';d.weapons[slot.slotId]='web_adun_solar_lance';
    const raw=JSON.stringify({version:1,draft:d,baseline:d,designs:[structuredClone(d)]});localStorage.setItem(m.storageKey,raw);
    return {raw,key:m.storageKey,slot:slot.slotId};
  });
  await page.reload();await page.locator(`[data-slot-id="${seeded.slot}"]`).waitFor();
  const result=await page.evaluate(async({raw,key,slot})=>{
    const m=await import('/src/studio/DesignModel.ts'),{contentRegistry}=await import('/src/engine/content/ContentRegistry.ts');
    const read=m.readLibrary();return {backup:localStorage.getItem(key+':removed:web_adun_armory')===raw,protected:read.protected,
      name:read.library.draft.name,weapon:read.library.draft.weapons[slot],baseline:read.library.baseline.weapons[slot],saved:read.library.designs[0].weapons[slot],
      retiredRuntime:contentRegistry.getAllWeapons().filter(w=>w.id.startsWith('web_adun_')).map(w=>w.id),
      retiredPicker:m.weapons.filter(w=>w.id.startsWith('web_adun_')).map(w=>w.id),
      current:contentRegistry.getAllWeapons().filter(w=>w.id.startsWith('web_ark_')).map(w=>w.id)};
  },seeded);
  assert.equal(result.backup,true);assert.equal(result.protected,false);assert.equal(result.name,'Keep player queen');
  assert.equal(result.weapon,null);assert.equal(result.baseline,null);assert.equal(result.saved,null);
  assert.deepEqual(result.retiredRuntime,[]);assert.deepEqual(result.retiredPicker,[]);assert.equal(result.current.length,6);
  await page.locator(`[data-slot-id="${seeded.slot}"]`).click();await page.locator('.source-weapon-picker').waitFor();
  assert.equal(await page.locator('[data-weapon-choice="web_adun_solar_lance"]').count(),0);
  assert.equal(await page.locator('[data-weapon-choice="web_gloriana_lance"]').count(),1);
  result.picker=await page.locator('.refit-weapon-result-count').innerText();
  const {writeFile}=await import('node:fs/promises'),{resolve}=await import('node:path');
  await writeFile(resolve(out,'retired-armory-browser.json'),JSON.stringify({scope:'retired-armory-catalog-and-save-refit',...result},null,2));
  console.log('PASS retired armory browser registry, live XL picker, exact backup and refresh migration');
}
