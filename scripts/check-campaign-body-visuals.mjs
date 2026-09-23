/** Only source/data resolver behavior; this does not validate the client's WebGL appearance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, realpath, rm, symlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { createOriginalBodyVisuals } from '../src/campaign/content/OriginalBodyVisuals.mjs';
import { importOriginalBodyVisuals, serializeOriginalBodyVisuals, extractBodyPlanetDefaults, extractBodyCustomDefaults, readRootedBodyVisualSource } from './import-campaign-body-visuals.mjs';
import { parseFactionText } from './import-campaign-factions.mjs';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = { core: resolve(project,'../starsector-core'), decompiled: resolve(project,'../decompiled'), project };
const raw = await readFile(join(project,'src/campaign/data/reference-body-visuals.json'),'utf8'), data = JSON.parse(raw), visuals = createOriginalBodyVisuals(data);
const blueprint = JSON.parse(await readFile(join(project,'src/campaign/data/reference-corvus.json'),'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const getPlanet = (nativeType,sourceHandle=null) => visuals.resolve({kind:'planet',nativeType,sourceHandle});
const getCustom = nativeType => visuals.resolve({kind:'custom',nativeType});
const source = async suffix => { const row = data.sources.find(s=>s.path.endsWith(suffix)); assert.ok(row,suffix); const read = await readRootedBodyVisualSource(root[row.root],row.path,row.sha256); return read.bytes.toString('utf8'); };
async function temp(fn) {
  const base = await realpath(tmpdir()), dir = await mkdtemp(join(base,'campaign-body-visuals-'));
  try { return await fn(dir); } finally {
    // Before this recursive removal, verify the real absolute target is the same private directory under tmp.
    const actual = await realpath(dir), rel = relative(base,actual);
    assert.equal(actual,dir); assert.ok(rel.startsWith('campaign-body-visuals-') && !rel.includes('/') && !rel.includes('\\') && !isAbsolute(rel));
    await rm(actual,{recursive:true,force:true});
  }
}

test('bounded catalogue: six planet, eight custom, fourteen source identities',()=>{
  assert.equal(Object.keys(data.planetSpecs).length,6); assert.equal(Object.keys(data.customSpecs).length,8); assert.equal(Object.keys(data.sourceHandles).length,14);
  for(const e of blueprint.entities.filter(e=>['star','planet','custom'].includes(e.kind))) {
    const result=visuals.resolve({kind:e.kind,nativeType:e.planetType??e.customType,sourceHandle:e.handle}); assert.ok(result,e.handle);
    assert.equal(result.kind,e.kind==='custom'?'custom':'planet'); if(e.kind!=='custom')assert.equal(result.isStar,e.kind==='star');
  }
});
test('native constructor defaults, not pre-constructor initializers',async()=>{
  const text=await source('PlanetSpec.java'), helpers=await source('loading/String.java'), settings=parseFactionText(await source('settings.json'));
  assert.ok(text.includes('public boolean useReverseLightForGlow = true;'));
  const defaults=extractBodyPlanetDefaults(text,helpers,settings);
  assert.equal(defaults.useReverseLightForGlow,false); assert.equal(defaults.atmosphereThickness,Math.fround(0.1)); assert.equal(defaults.atmosphereThicknessMin,10);
  assert.equal(defaults.cloudAlpha,255); assert.equal(defaults.cloudTexture,null); assert.equal(defaults.glowTexture,null); assert.equal(defaults.coronaSize,0);
  assert.equal(defaults.coronaTexture,'graphics/planets/sun_halo.png'); assert.deepEqual(defaults.lightPosition,[0,0,0]);
  for(const key of ['planetColor','cloudColor','atmosphereColor','glowColor','coronaColor'])assert.deepEqual(defaults[key],[255,255,255,255]);
  assert.throws(()=>extractBodyPlanetDefaults(text.replace('optBoolean("useReverseLightForGlow", false)','unsupportedLoader()'),helpers,settings),/missing loader/);
});
test('byte colors and Java floats survive normalization; star corona is distinct from fallback',()=>{
  const star=visuals.resolve({kind:'star',nativeType:'star_yellow',sourceHandle:'star'});
  assert.equal(star.kind,'planet'); assert.equal(star.isStar,true); assert.equal(star.coronaTexture,'graphics/fx/star_halo.png'); assert.equal(star.coronaSize,Math.fround(5.12));
  assert.deepEqual(star.coronaColor,[255,255,150,60]); assert.deepEqual(star.lightPosition,[0,0,10]);
  const jungle=getPlanet('jungle'); assert.equal(jungle.rotation,Math.fround(-2.6)); assert.equal(jungle.cloudAlpha,255); assert.equal(jungle.cloudColor[3],235);
  assert.equal(jungle.coronaTexture,'graphics/planets/sun_halo.png'); assert.equal(jungle.coronaSize,0); assert.ok(!jungle.audit.supportedLayers.includes('corona'));
  assert.equal(getPlanet('barren').cloudTexture,null);
});
test('exact source glow overrides apply to Asharu and Jangala without polluting base specs',()=>{
  const a=getPlanet('desert','corvusI'), j=getPlanet('jungle','corvusII');
  assert.equal(a.glowTexture,'graphics/planets/asharu_sparse_glow.png'); assert.equal(j.glowTexture,'graphics/planets/volturn_glow.png');
  for(const result of [a,j]) { assert.deepEqual(result.glowColor,[255,255,255,255]); assert.equal(result.useReverseLightForGlow,true); assert.ok(result.audit.supportedLayers.includes('glow')); assert.deepEqual(result.audit.overriddenFields,['glowColor','glowTexture','useReverseLightForGlow']); }
  assert.equal(getPlanet('desert').glowTexture,null); assert.equal(getPlanet('jungle').useReverseLightForGlow,false); assert.deepEqual(getPlanet('desert').audit.overriddenFields,[]);
});
test('unknown kinds/types, inherited object keys and mismatched source handles fail closed',()=>{
  const invalid=[{kind:'jump',nativeType:'star_yellow'},{kind:'planet',nativeType:'unknown'},{kind:'custom',nativeType:'toString'},{kind:'custom',nativeType:'constructor'},
    {kind:'planet',nativeType:'star_yellow'},{kind:'star',nativeType:'desert'},{kind:'planet',nativeType:'desert',sourceHandle:'missing'},
    {kind:'planet',nativeType:'desert',sourceHandle:'corvusII'},{kind:'custom',nativeType:'station_side06',sourceHandle:'relay'},
    {kind:'planet',nativeType:'desert',sourceHandle:'star'},{kind:'planet',nativeType:'desert',sourceHandle:''},{kind:'planet',nativeType:'desert',sourceHandle:0},
    {kind:'planet',nativeType:'desert',sourceHandle:null,override:true},null,[],{}];
  for(const q of invalid)assert.equal(visuals.resolve(q),null,JSON.stringify(q));
});
test('custom spec inheritance and sprite sizes are not planet radii or image pixel sizes',async()=>{
  const defaults=extractBodyCustomDefaults(await source('loading/specs/int.java'),await source('graphics/Sprite.java'));
  assert.deepEqual(defaults,{sprite:null,width:64,height:64,showInCampaign:true,useLightColor:true,renderShadow:true,color:[255,255,255,255],alphaMult:1,additive:false});
  assert.equal(getCustom('sensor_array_makeshift').width,86); assert.equal(getCustom('sensor_array_makeshift').sprite,'graphics/ships/sensor_array_makeshift.png');
  const relay=getCustom('comm_relay'); assert.equal(relay.width,89); assert.equal(relay.height,48); assert.equal(relay.facingOffsetDegrees,-90);
  assert.deepEqual(relay.nativeLayers,['STATIONS']); assert.equal(relay.additive,false); assert.equal(relay.alphaMult,1); assert.deepEqual(relay.color,[255,255,255,255]);
  assert.equal(getCustom('station_jangala_type').renderShadow,false); assert.equal(getCustom('station_lowtech1').width,66); assert.equal(getCustom('station_lowtech1').height,80);
});
test('stable location has no invented scene sprite; maps and indicators are not body layers',()=>{
  const stable=getCustom('stable_location'); assert.equal(stable.sprite,null); assert.equal(stable.width,64); assert.equal(stable.height,64);
  assert.equal(stable.showInCampaign,true); assert.deepEqual(stable.audit.supportedLayers,[]); assert.ok(stable.audit.unsupported.includes('campaign-indicators-and-labels'));
});
test('plugin partials retain their true base sprite and disclose omitted rendering',()=>{
  const gate=getCustom('inactive_gate'); assert.equal(gate.sprite,'graphics/stations/gate.png'); assert.equal(gate.width,192); assert.equal(gate.height,192);
  assert.equal(gate.pluginRender,'partial-base-sprite'); assert.ok(gate.audit.supportedLayers.includes('base-sprite')); assert.ok(gate.audit.unsupported.includes('gate-plugin-stateful-effects'));
  for(const id of ['comm_relay','sensor_array_makeshift'])assert.equal(getCustom(id).pluginRender,'inherited-noop');
  assert.equal(getCustom('station_side06').pluginRender,'none'); assert.ok(getCustom('station_side06').audit.unsupported.includes('dynamic-light-tint'));
});
test('returned arrays, nested audit and descriptors are deeply immutable and source-isolated',()=>{
  const input=structuredClone(data), resolver=createOriginalBodyVisuals(input), original=resolver.resolve({kind:'planet',nativeType:'desert',sourceHandle:'corvusI'});
  input.planetSpecs.desert.planetColor[0]=0; input.sourceHandles.corvusI.overrides.glowTexture=null;
  assert.equal(original.planetColor[0],255); assert.notEqual(original.glowTexture,null); assert.ok(Object.isFrozen(original.audit)); assert.ok(Object.isFrozen(resolver));
  assert.throws(()=>original.planetColor.push(0),TypeError); assert.throws(()=>original.audit.supportedLayers.push('invented'),TypeError); assert.throws(()=>original.glowTexture=null,TypeError);
  assert.equal(resolver.resolve({kind:'planet',nativeType:'desert',sourceHandle:'corvusI'}),original);
});
test('invalid data rejects nonfinite fields, wrong colors, unsafe assets, unsupported overrides and missing audit',()=>{
  const mutations=[d=>d.planetSpecs.desert.tilt=NaN,d=>d.planetSpecs.desert.cloudColor=[1,2,3],d=>d.planetSpecs.desert.planetColor[0]=256,
    d=>d.planetSpecs.desert.texture='graphics/../secret.png',d=>d.planetSpecs.desert.texture='https://example.com/planet.png',d=>d.customSpecs.comm_relay.width=0,
    d=>d.sourceHandles.corvusI.overrides.sprite='graphics/planet.png',d=>d.sourceHandles.corvusI.nativeType='unavailable',d=>d.sourceHandles.star.kind='planet',
    d=>d.sourceHandles.relay.overrides.glowColor=[255,255,255,255],d=>d.sources[0].sha256='bad',d=>d.sources[0].path='../escape',
    d=>d.customSpecs.inactive_gate.audit.unsupported=[],d=>delete d.planetSpecs.desert.audit,d=>d.planetSpecs.desert.extra='unknown'];
  for(const mutation of mutations){const d=structuredClone(data);mutation(d);assert.throws(()=>createOriginalBodyVisuals(d));}
});
test('all provenance and referenced graphic files remain inside declared roots and hash-match',async()=>{
  for(const row of data.sources){const result=await readRootedBodyVisualSource(root[row.root],row.path,row.sha256);assert.equal(result.bytes.length,row.bytes);assert.equal(result.sha256,row.sha256);}
  const paths=new Set();for(const row of [...Object.values(data.planetSpecs),...Object.values(data.customSpecs)])for(const k of ['texture','cloudTexture','glowTexture','coronaTexture','sprite'])if(row[k])paths.add(row[k]);
  for(const row of Object.values(data.sourceHandles))if(row.overrides.glowTexture)paths.add(row.overrides.glowTexture);
  for(const path of paths){assert.ok(data.sources.some(s=>s.id==='core:'+path));await readFile(join(project,'public/game-assets',path));}
});
test('source reader rejects lexical traversal, absolute/drive paths and hash drift',async()=>{
  for(const path of ['../outside','/absolute','C:/absolute','data/../file','data\\file','data//file','./file','data/file:stream','data/\0file'])await assert.rejects(()=>readRootedBodyVisualSource(root.core,path),/unsafe source/);
  await temp(async dir=>{await writeFile(join(dir,'file.txt'),'source');const result=await readRootedBodyVisualSource(dir,'file.txt',sha('source'));assert.equal(result.bytes.toString(),'source');await writeFile(join(dir,'file.txt'),'changed');await assert.rejects(()=>readRootedBodyVisualSource(dir,'file.txt',sha('source')),/unreviewed source hash/);});
});
test('source reader rejects directory symlink/junction escapes after realpath',async()=>{
  await temp(async dir=>{const inside=join(dir,'inside'),outside=join(dir,'outside'),link=join(inside,'link');await mkdir(inside);await mkdir(outside);await writeFile(join(outside,'file.txt'),'outside');
    await symlink(outside,link,process.platform==='win32'?'junction':'dir');
    try{await assert.rejects(()=>readRootedBodyVisualSource(inside,'link/file.txt'),/source escapes root/);}finally{if(process.platform==='win32')await rmdir(link);else await rm(link);}
  });
});
test('import is deterministic and --check leaves reference bytes untouched',async()=>{
  const rebuilt=await importOriginalBodyVisuals();assert.equal(serializeOriginalBodyVisuals(rebuilt),raw);
  const p=spawnSync(process.execPath,['scripts/import-campaign-body-visuals.mjs','--check'],{cwd:project,encoding:'utf8'});assert.equal(p.status,0,p.stdout+p.stderr);assert.equal(await readFile(join(project,'src/campaign/data/reference-body-visuals.json'),'utf8'),raw);
});
test('reviewed blueprint hash drift is rejected before using its specs or overrides',async()=>{
  await temp(async dir=>{await mkdir(join(dir,'src/campaign/data'),{recursive:true});await writeFile(join(dir,'src/campaign/data/reference-corvus.json'),'{}');await assert.rejects(()=>importOriginalBodyVisuals({projectRoot:dir}),/unreviewed source hash/);});
});
test('browser bundle has no Node runtime imports, performs no I/O, and resolves imported JSON',async()=>{
  const result=await build({stdin:{contents:"import data from './src/campaign/data/reference-body-visuals.json'; import {createOriginalBodyVisuals} from './src/campaign/content/OriginalBodyVisuals.mjs'; export const visuals=createOriginalBodyVisuals(data);",resolveDir:project,loader:'js'},bundle:true,platform:'browser',format:'esm',write:false,metafile:true});
  assert.ok(Object.keys(result.metafile.inputs).every(p=>!p.startsWith('node:')&&!p.includes('scripts/')));
  const bundled=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  assert.equal(bundled.visuals.resolve({kind:'star',nativeType:'star_yellow',sourceHandle:'star'}).isStar,true);
});
