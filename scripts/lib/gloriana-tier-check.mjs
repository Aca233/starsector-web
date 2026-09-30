import assert from 'node:assert/strict';

/** Runs inside the existing real-content armory fixture, without touching player storage. */
export function checkGlorianaTiers(m, test) {
  const W=m.GLORIANA_WEAPONS, getWeapon=id=>m.contentRegistry.getWeapon(id);
  const migrate=d=>m.migrateGlorianaWeaponTiers(d,m.baseHull,getWeapon);
  const oldRoci=()=>{const d=m.createRocinanteSkirmish();d.name='Player custom fit';d.weapons.TORP_1=d.weapons.TORP_2=W.torpedo;return d;};
  test('tiers: six shipborne weapons and all 48 mounts promoted together',()=>{
    const expected={macro:'EXTRA_LARGE',lance:'EXTRA_LARGE',siege:'LARGE',torpedo:'LARGE',bolter:'MEDIUM',interceptor:'MEDIUM'};
    for(const [kind,size] of Object.entries(expected))assert.equal(getWeapon(W[kind]).mountSize,size);
    const counts={EXTRA_LARGE:0,LARGE:0,MEDIUM:0},ships=m.glorianaShips();assert.equal(ships.length,9);
    for(const hull of ships)for(const slot of hull.weaponSlots){counts[slot.slotSize]++;assert.equal(m.compatibility(slot,getWeapon(slot.defaultWeaponId)),null);}
    assert.deepEqual(counts,{EXTRA_LARGE:14,LARGE:14,MEDIUM:20});
    const core=m.baseHull(m.GLORIANA_HULL_ID);
    assert.deepEqual(['EXTRA_LARGE','LARGE','MEDIUM'].map(size=>core.weaponSlots.filter(s=>s.slotSize===size).length),[2,4,6]);
    for(const id of ['M12','M13'])assert.equal(core.weaponSlots.find(s=>s.slotId===id).slotSize,'LARGE');
  });
  test('tiers: both complete presets survive decode with unchanged 260/260 core OP',()=>{
    for(const [create,op] of [[m.createGlorianaArsenalDesign,260],[m.createGlorianaAviationDesign,260]]){
      const d=create(),fit=m.evaluate(d),loaded=m.decodeDesign(JSON.parse(JSON.stringify(d)));
      assert.deepEqual(fit.errors,[]);assert.equal(fit.op.used,op);assert.deepEqual(m.evaluate(loaded).errors,[]);
      assert.equal(migrate(d).value,d);assert.equal(migrate(d).removed,0);
      assert.equal(m.assemblyParts(fit.spec).length,9);
      for(const {spec} of m.assemblyParts(fit.spec))for(const slot of spec.weaponSlots)
        assert.equal(getWeapon(slot.defaultWeaponId).mountSize,slot.slotSize);
    }
  });
  test('tiers: Rocinante retains its M torpedoes and rejects queen L torpedoes',()=>{
    for(const d of [m.createRocinanteSkirmish(),m.createRocinanteHunter()]){
      const hull=m.baseHull(d.hullId);assert.deepEqual(m.evaluate(d).errors,[]);
      for(const id of ['TORP_1','TORP_2']){
        const slot=hull.weaponSlots.find(s=>s.slotId===id);assert.equal(slot.slotSize,'MEDIUM');
        assert.equal(m.compatibility(slot,getWeapon(d.weapons[id])),null);
        assert.match(m.compatibility(slot,getWeapon(W.torpedo)),/尺寸不符/);
      }
      assert.equal(hull.weaponSlots.filter(s=>s.slotSize==='SMALL').length,6);
      assert.equal(hull.weaponSlots.filter(s=>s.slotSize==='MEDIUM').length,3);
    }
    for(const craft of m.glorianaAircraft)for(const slot of craft.weaponSlots){
      assert.equal(slot.slotSize,'SMALL');assert.equal(getWeapon(slot.defaultWeaponId).mountSize,'SMALL');
    }
  });
  test('tiers: actual assembly keeps ordnance bonuses on XL main guns, not promoted L support guns',()=>{
    const ship=new m.Ship('tier-check',m.evaluate(m.createGlorianaArsenalDesign()).spec,true,new m.Vector2(),0);
    const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
    let total=0,heavy=0;
    for(const part of ship.assemblyShips)for(const mount of part.weapons){
      const base=getWeapon(mount.spec.id),boosted=[W.macro,W.lance].includes(base.id);total++;if(boosted)heavy++;
      near(part.getWeaponDisplayRange(mount.spec),base.range*(boosted?1.2:1));
      near(mount.spec.fluxPerShot,base.fluxPerShot*(boosted?1.15:1));
      if(base.turnRateDegPerSec!==undefined)near(mount.spec.turnRateDegPerSec,base.turnRateDegPerSec*(boosted?.75:1));
      assert.equal(mount.spec.damagePerShot,base.damagePerShot);assert.equal(mount.spec.maxAmmo,base.maxAmmo);
    }
    assert.equal(total,48);assert.equal(heavy,14);
  });
  test('tiers: old cross-ship fit unloads only invalid queen weapons, immutably and idempotently',()=>{
    const old=oldRoci(),snapshot=JSON.stringify(old);assert.throws(()=>m.decodeDesign(old),/不兼容武器/);
    const migrated=migrate(old);assert.equal(migrated.removed,2);assert.equal(JSON.stringify(old),snapshot);
    const expected=structuredClone(old);expected.weapons.TORP_1=expected.weapons.TORP_2=null;
    expected.groups=expected.groups.map(g=>({...g,weaponSlotIds:g.weaponSlotIds.filter(id=>!['TORP_1','TORP_2'].includes(id))}));
    assert.deepEqual(migrated.value,expected);assert.deepEqual(m.evaluate(m.decodeDesign(migrated.value)).errors,[]);
    assert.equal(migrate(migrated.value).removed,0);assert.equal(migrate(migrated.value).value,migrated.value);
  });
  test('tiers: old-tier replacements unload on core and modules, unrelated corruption stays rejected',()=>{
    const d=m.createGlorianaArsenalDesign(),oldTier={EXTRA_LARGE:'LARGE',LARGE:'MEDIUM',MEDIUM:'SMALL'};
    const selected=[], external=new Map();
    for(const part of [d,d.modules.P1]){
      const hull=m.baseHull(part.hullId);
      for(const size of ['EXTRA_LARGE','LARGE','MEDIUM']){
        const slot=hull.weaponSlots.find(s=>s.slotSize===size);
        // Core uses real registered refit weapons. The current bundle has no removable
        // non-queen ballistic guns: simulate a previously installed third-party mod on P1.
        const candidate=part===d
          ? Object.keys(m.nativeRefit.weapons).map(getWeapon).find(w=>w&&!Object.values(W).includes(w.id)&&!m.compatibility({...slot,slotSize:oldTier[size]},w))
          : {...getWeapon(W.macro),id:'external_old_'+size,mountSize:oldTier[size]};
        assert(candidate,'old '+size+' replacement');
        if(part!==d)external.set(candidate.id,candidate);
        part.weapons[slot.slotId]=candidate.id;selected.push([part,slot.slotId]);
      }
    }
    const original=JSON.stringify(d),migrated=m.migrateGlorianaWeaponTiers(d,m.baseHull,id=>external.get(id)??getWeapon(id));assert.equal(migrated.removed,6);assert.equal(JSON.stringify(d),original);
    m.decodeDesign(migrated.value);
    for(const [part,id] of selected){const result=part===d?migrated.value:migrated.value.modules.P1;assert.equal(result.weapons[id],null);}
    const corrupt=oldRoci();corrupt.weapons.TORP_1='missing_weapon';assert.throws(()=>m.decodeDesign(migrate(corrupt).value),/不兼容武器/);
    const alreadyWrong=m.createGlorianaArsenalDesign();alreadyWrong.weapons.M12=W.macro;
    assert.equal(migrate(alreadyWrong).removed,0);assert.throws(()=>m.decodeDesign(alreadyWrong),/不兼容武器/);
    const wrongType=oldRoci();wrongType.weapons.TORP_1=W.macro;
    assert.equal(migrate(wrongType).value.weapons.TORP_1,W.macro);
  });
  test('tiers: readLibrary backs up exact bytes, preserves originals and handles quota/conflicts safely',()=>{
    const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
    const library={version:1,draft:oldRoci(),designs:[oldRoci(),m.createGlorianaArsenalDesign()]};library.baseline=structuredClone(library.draft);
    const raw=JSON.stringify(library),prefix=m.storageKey+':backup:gloriana-weapon-tiers-20260929';
    const map=new Map([[m.storageKey,raw]]);let rejectBackup=false;
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>map.get(key)??null,setItem:(key,value)=>{if(rejectBackup&&key!==m.storageKey)throw Error('Quota exceeded');map.set(key,value);}}});
    try{
      const read=m.readLibrary();assert.equal(read.protected,false,read.error);assert.match(read.error,/完整备份/);
      assert.equal(read.observedRaw,raw);assert.equal(map.get(m.storageKey),raw);assert.equal(map.get(prefix),raw);
      assert.equal(read.library.draft.weapons.TORP_1,null);assert.equal(read.library.baseline.weapons.TORP_2,null);
      assert.equal(read.library.designs[0].weapons.TORP_1,null);assert.deepEqual(read.library.designs[1],library.designs[1]);
      m.readLibrary();assert.equal(map.size,2,'no repeated backup');
      map.set(prefix,'older backup');m.readLibrary();assert.equal(map.get(prefix),'older backup');assert.equal(map.get(prefix+':1'),raw);
      map.set(m.storageKey,'another tab write');assert.throws(()=>m.writeLibrary(read.library,read.observedRaw));assert.equal(map.get(m.storageKey),'another tab write');
      map.set(m.storageKey,raw);const saved=m.writeLibrary(read.library,raw);assert.equal(map.get(m.storageKey),saved);
      const again=m.readLibrary();assert.equal(again.protected,false);assert.equal(again.error,null);
      map.clear();map.set(m.storageKey,raw);rejectBackup=true;
      const failed=m.readLibrary();assert.equal(failed.protected,true);assert.match(failed.error,/Quota/);assert.equal(map.get(m.storageKey),raw);
    }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
  });
}
