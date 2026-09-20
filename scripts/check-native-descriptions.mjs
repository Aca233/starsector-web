import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { formatNativeDescription, nativeHighlightParameters } from '../src/shared/native-description-format.mjs';
const catalog=JSON.parse(await readFile(new URL('../src/engine/data/generated/native-catalog.json',import.meta.url),'utf8'));
const compiled=await build({entryPoints:['src/studio/NativeCatalogDescriptions.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {hullModDescription,weaponCustomDescription,readableDescriptionStats,shipDescriptionId,nativeHullSizes}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('native template substitution preserves percent values, ordering and literal replacement text',()=>{
  assert.deepEqual(formatNativeDescription('提高 {%s}，另有 {%s}；100%%。',['50%','$&']),{text:'提高 50%，另有 $&；100%。',complete:true,missing:0});
  assert.equal(formatNativeDescription('%2$s / %1$s / %2$s',['A','B']).text,'B / A / B');
  assert.equal(formatNativeDescription('%s / %s',['%s','25%']).text,'%s / 25%','never recursively interpolate a value');
  assert.equal(formatNativeDescription('{不造成伤害}；效率 50%').text,'不造成伤害；效率 50%');
  assert.equal(formatNativeDescription('%s',['250','extra highlight']).text,'250');
  assert.deepEqual(nativeHighlightParameters(' 碎片集群 | 6 | 不造成伤害 '),['碎片集群','6','不造成伤害']);
});
test('unresolved or unsupported parameters are explicit, never zero, null or a guessed number',()=>{
  assert.deepEqual(formatNativeDescription('%s + %s',['10']),{text:'10 + 【参数待核实】',complete:false,missing:1});
  assert.equal(formatNativeDescription('%s',[null]).complete,false);
  assert.equal(formatNativeDescription('%d',['10']).complete,false);
});
test('all native hullmod desc and S-mod templates resolve for every hull size without mutating raw data',()=>{
  let templates=0;
  for(const row of catalog.hullmods){
    const before=JSON.stringify(row);
    for(const field of ['desc','sModDesc']){
      if((row[field]??'').includes('%s'))templates++;
      for(const [size] of nativeHullSizes){
        const result=hullModDescription(row,field,size);
        assert.equal(result.complete,true,`${row.id} ${field} ${size}`);
        assert.doesNotMatch(result.text,/%s|\{[^{}]*\}/,row.id);
        assert.equal(readableDescriptionStats('hullmods',row,size)[field]??'',result.text);
      }
    }
    assert.equal(JSON.stringify(row),before);
  }
  assert.equal(templates,132);
});
test('sensitive native values come from original getters, and stale templates fail closed',()=>{
  const get=id=>catalog.hullmods.find(row=>row.id===id);
  assert.match(hullModDescription(get('advancedshieldemitter'),'desc','FRIGATE').text,/100%.*100%/);
  assert.match(hullModDescription(get('adaptive_coils'),'desc','FRIGATE').text,/50%.*50%.*75%/s);
  assert.equal(hullModDescription(get('assault_package'),'desc','CRUISER').complete,true);
  assert.equal(hullModDescription({...get('advancedshieldemitter'),desc:'changed %s'},'desc','FRIGATE').complete,false);
  assert.equal(hullModDescription({...get('advancedshieldemitter'),script:'another.Script'},'desc','FRIGATE').complete,false);
});
test('all weapon special descriptions resolve, including extra highlighter literals',()=>{
  let affected=0;
  for(const weapon of catalog.weapons){
    const before=JSON.stringify(weapon.stats);
    if(JSON.stringify(weapon.stats).includes('%s'))affected++;
    for(const field of ['customPrimary','customAncillary']){
      const result=weaponCustomDescription(weapon.stats,field);
      assert.equal(result.complete,true,`${weapon.id} ${field}`);
      assert.doesNotMatch(result.text,/%s|\{[^{}]*\}/,weapon.id);
    }
    assert.equal(JSON.stringify(weapon.stats),before);
  }
  assert.equal(affected,38);
  assert.match(weaponCustomDescription(catalog.weapons.find(w=>w.id==='breach').stats,'customPrimary').text,/250/);
  assert.match(weaponCustomDescription(catalog.weapons.find(w=>w.id==='ioncannon_fighter').stats,'customPrimary').text,/25%/);
  assert.match(weaponCustomDescription(catalog.weapons.find(w=>w.id==='devouring_swarm').stats,'customPrimary').text,/碎片集群.*6.*不造成伤害/);
});
test('skin descriptions use explicit description id or base, never an unrelated same-id description type',()=>{
  for(const id of ['onslaught_xiv','brawler_LG']){
    const hull=catalog.ships.find(s=>s.id===id);
    const descriptionId=shipDescriptionId(id,hull.spec,hull.baseHullId);
    assert.equal(descriptionId,hull.baseHullId);
    assert.ok(catalog.descriptions.some(d=>d.id===descriptionId&&d.type==='SHIP'));
    assert.ok(hull.spec.descriptionPrefix);
  }
  assert.equal(shipDescriptionId('skin',{descriptionId:'explicit'},'base'),'explicit');
  assert.equal(shipDescriptionId('base',{},null),'base');
});
