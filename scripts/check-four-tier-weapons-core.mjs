/** Pure production size/component logic. This does not substitute for registry/Worker acceptance. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('artifacts/four-tier-weapons');await mkdir(out,{recursive:true});const file=resolve(out,'core.mjs');
await build({stdin:{loader:'ts',resolveDir:process.cwd(),contents:"export * from './src/engine/content/WeaponSizes';export {weaponHealthProfile} from './src/engine/simulation/systems/weapon/WeaponComponentHealth';"},outfile:file,format:'esm',platform:'node',bundle:true,logLevel:'warning'});
const m=await import(pathToFileURL(file).href);const checks=[];
function test(name,fn){fn();checks.push(name);console.log('PASS '+name);}
test('all sixteen size pairs require exact tiers; both up- and down-fitting are rejected',()=>{
 assert.deepEqual(m.WEAPON_SIZES,['SMALL','MEDIUM','LARGE','EXTRA_LARGE']);
 for(let i=0;i<4;i++)for(let j=0;j<4;j++)assert.equal(m.weaponFitsSlotSize(m.WEAPON_SIZES[i],m.WEAPON_SIZES[j]),j===i);
});
test('invalid/missing/prototype-like sizes are refused',()=>{
 for(const invalid of [null,undefined,{},4,'UNKNOWN','XL','large','constructor','__proto__','toString']){
  assert(!m.isWeaponSize(invalid));assert(!m.weaponFitsSlotSize(invalid,'SMALL'));assert(!m.weaponFitsSlotSize('EXTRA_LARGE',invalid));
 }
});
test('all four labels/markers and authored-size fallback are present',()=>{
 assert.equal(m.WEAPON_SIZE_LABELS.EXTRA_LARGE,'超大型');assert.equal(m.WEAPON_SIZE_MARKERS.EXTRA_LARGE,'IV');
 assert.deepEqual(m.WEAPON_SIZES.map(s=>m.WEAPON_SIZE_FALLBACK_PIXELS[s]),[24,42,68,96]);
 assert(m.WEAPON_SIZES.every(s=>m.WEAPON_SIZE_LABELS[s]&&m.WEAPON_SIZE_MARKERS[s]));
});
test('native component HP/repair unchanged, XL explicitly inherits large rather than small',()=>{
 for(const [size,hp,seconds] of [['SMALL',250,10],['MEDIUM',500,15],['LARGE',800,20],['EXTRA_LARGE',800,20]]){
  assert.deepEqual(m.weaponHealthProfile(size,'TURRET'),{health:hp,repairDuration:seconds});
  assert.deepEqual(m.weaponHealthProfile(size,'HARDPOINT',1.5),{health:hp*3,repairDuration:seconds+5});
 }
 assert.equal(m.weaponSizeBaseline('EXTRA_LARGE'),'LARGE');
});
// Guard wiring statically; registry and Worker checks live in the companion scripts. Not a visual proof.
const integrationFiles=['src/studio/ShipStage.tsx','src/studio/DesignModel.ts','src/engine/modding/ContentValidation.ts','src/engine/simulation/systems/CombatShipStatusSystem.ts','src/engine/render/webgl/passes/WebGLShipPass.ts'];
const texts=await Promise.all(integrationFiles.map(p=>readFile(p,'utf8')));
test('runtime/UI consumers reference shared production definitions (static check)',()=>{
 assert(texts[0].includes('WEAPON_SIZE_MARKERS[slot.slotSize]'));assert(texts[1].includes('weaponFitsSlotSize(slot.slotSize, weapon.mountSize)'));
 assert(texts[2].includes('weaponFitsSlotSize(slot.slotSize, weapon.mountSize)'));assert(texts[3].includes('weaponSizeBaseline(mount.spec.mountSize)'));
 assert(texts[4].includes('WEAPON_SIZE_FALLBACK_PIXELS[mount.spec.mountSize]'));
});
await writeFile(resolve(out,'core-check.json'),JSON.stringify({passed:checks,scope:'production pure size/component functions plus static wiring; not full game/Worker acceptance'},null,2)+'\n');
