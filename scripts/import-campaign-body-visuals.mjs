#!/usr/bin/env node
/** Bounded visual extraction from the reviewed Corvus blueprint and native loaders; never copies assets. */
import { readFile, realpath, writeFile, rename } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseFactionText } from './import-campaign-factions.mjs';
import { createOriginalBodyVisuals } from '../src/campaign/content/OriginalBodyVisuals.mjs';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(project, 'src/campaign/data/reference-body-visuals.json');
const blueprintPath = 'src/campaign/data/reference-corvus.json';
const blueprintHash = '62c5e59073626b1fae24c775e6992a3c46b2c44a4feb29faa24c804e1285bb15';
const obf = 'starfarer_obf/com/fs/starfarer/', api = 'starfarer.api/com/fs/starfarer/api/impl/campaign/';
const reviewed = [
 ['starfarer_obf/com/fs/starfarer/loading/specs/PlanetSpec.java','3995aa714ccc1056aaa699431ece071a7427274572a233b9cdc57cd4b060870a'],
 ['starfarer_obf/com/fs/starfarer/loading/String.java','acb79d529294803898afd9ddb44699b69fbed6898b994a8cddb2da67a27c76d3'],
 ['starfarer_obf/com/fs/starfarer/loading/specs/int.java','1f25a417f940314be2bf9b2b1b90f52a0a6614174085ab9dab503aa0dc8627c8'],
 ['starfarer_obf/com/fs/starfarer/campaign/CustomCampaignEntity.java','4f21bf20ad994452c7424725cf1c642af82663b226ec324a415774c1255dcc9a'],
 ['fs.common_obf/com/fs/graphics/Sprite.java','7e1c90b38fc4cc8ad6009c68907eb89fb4ed876baa133f29916b1bdccd157e50'],
 ['starfarer.api/com/fs/starfarer/api/impl/campaign/SensorArrayEntityPlugin.java','bbbe802c33d7a9880e16e52c14f92caeea63b344c88c376c42925a2b3a4ad664'],
 ['starfarer.api/com/fs/starfarer/api/impl/campaign/CommRelayEntityPlugin.java','d697d7fd913ba1002b6b2f50cbc76f5f2173e3d84914a84c587d82c065adc24c'],
 ['starfarer.api/com/fs/starfarer/api/impl/campaign/GateEntityPlugin.java','56c7e9c28928d8d7f8a78ea8076201630b1b54f570e0ca897e41c3a1ce9354ae'],
 ['starfarer.api/com/fs/starfarer/api/impl/campaign/BaseCampaignObjectivePlugin.java','c534990e82ff6195160c2ed9d90f11d1d2781c037de4cc21f0ff33d0cba467a1'],
 ['starfarer.api/com/fs/starfarer/api/impl/campaign/BaseCustomEntityPlugin.java','87c616ed38213a7f252916de64fde0e07ae7df18db568b96461fd360da30d29c'],
];
const need = (condition, message) => { if (!condition) throw new Error(`Body visuals import: ${message}`); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const own = (v, key) => Object.hasOwn(v, key);
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Checks both lexical traversal and symlink/junction escape, under the caller-selected real root. */
export async function readRootedBodyVisualSource(root, path, expectedHash) {
  need(typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !/[\\:]/.test(path) && !path.includes('\0') && !path.split('/').some(p => !p || p === '.' || p === '..'), `unsafe source path ${path}`);
  const base = await realpath(root), actual = await realpath(resolve(base, path)), rel = relative(base, actual);
  need(rel && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel), `source escapes root: ${path}`);
  const bytes = await readFile(actual), sha256 = hash(bytes);
  need(!expectedHash || sha256 === expectedHash, `unreviewed source hash: ${path}: ${sha256}`);
  return { bytes, sha256 };
}
function loadedNumber(text, field, key = field) {
  const pattern = new RegExp('this\\.' + escape(field) + ' = \\(float\\)jSONObject\\.optDouble\\("' + escape(key) + '", (?:\\(double\\))?(-?\\d+(?:\\.\\d+)?)[fF]?\\);');
  const m = text.match(pattern); need(m, `missing loader numeric default ${field}`); return Math.fround(Number(m[1]));
}
function loadedBoolean(text, field, key = field) {
  const m = text.match(new RegExp('this\\.' + escape(field) + ' = jSONObject\\.optBoolean\\("' + escape(key) + '", (true|false)\\);'));
  need(m, `missing loader boolean default ${field}`); return m[1] === 'true';
}
/** Parsed from the constructor, NOT PlanetSpec field initializers (reverse glow differs). */
export function extractBodyPlanetDefaults(planetSource, helpersSource, settings) {
  const begin = planetSource.indexOf('public PlanetSpec(java.lang.String string2, JSONObject jSONObject)'); need(begin >= 0, 'PlanetSpec constructor missing');
  const body = planetSource.slice(begin, planetSource.indexOf('public Set<java.lang.String> getTags()', begin));
  need(helpersSource.includes('if (!jSONObject.has(string2)) {\n            return Color.white;') || helpersSource.includes('if (!jSONObject.has(string2)) {\r\n            return Color.white;'), 'missing native white color fallback');
  need(/if \(jSONArray == null\) \{\s*return new Vector3f\(\);/.test(helpersSource), 'missing zero vector fallback');
  const defaults = {};
  for (const field of ['tilt','pitch','rotation','cloudRotation','cloudAlpha','atmosphereThickness','atmosphereThicknessMin']) defaults[field] = loadedNumber(body, field);
  defaults.coronaSize = loadedNumber(body, 'coronaSize', 'starCoronaSizeMult');
  for (const field of ['planetColor','atmosphereColor','cloudColor','glowColor','coronaColor']) {
    const key = field === 'coronaColor' ? 'starCoronaColor' : field;
    need(body.includes(`this.${field} = String.cfr_renamed_2(jSONObject, "${key}");`), `color loader missing ${field}`); defaults[field] = [255,255,255,255];
  }
  for (const field of ['isStar','useReverseLightForGlow']) defaults[field] = loadedBoolean(body, field);
  for (const field of ['cloudTexture','glowTexture']) { need(body.includes(`this.${field} = jSONObject.optString("${field}", null);`), `null texture default missing ${field}`); defaults[field] = null; }
  need(body.includes('jSONObject.optString("starCoronaSprite", StarfarerSettings.cfr_renamed_8("planets", "default_sun_halo"))'), 'unreviewed corona fallback');
  defaults.coronaTexture = settings.graphics?.planets?.default_sun_halo; need(typeof defaults.coronaTexture === 'string', 'missing configured default corona');
  defaults.lightPosition = [0,0,0]; return defaults;
}
function getterDefault(source, getter, type) {
  const match = source.match(new RegExp('public ' + type + ' ' + getter + '\\(\\) \\{\\s*return this\\.([^;]+);'));
  need(match, `missing custom getter ${getter}`);
  const init = source.match(new RegExp('private ' + type + ' ' + escape(match[1]) + ' = ([^;]+);'));
  need(init, `missing custom initializer ${getter}`); return type === 'boolean' ? init[1] === 'true' : Math.fround(Number(init[1].replace(/f$/, '')));
}
export function extractBodyCustomDefaults(specSource, spriteSource) {
  need(spriteSource.includes('protected Color color = new Color(255, 255, 255);') && spriteSource.includes('private float alphaMult = 1.0f;') && /setNormalBlend\(\) \{\s*this.setBlendFunc\(770, 771\)/.test(spriteSource), 'unreviewed Sprite modulation');
  return { sprite: null, width: getterDefault(specSource, 'getSpriteWidth', 'float'), height: getterDefault(specSource, 'getSpriteHeight', 'float'),
    showInCampaign: getterDefault(specSource, 'isShowInCampaign', 'boolean'), useLightColor: getterDefault(specSource, 'isUseLightColor', 'boolean'), renderShadow: getterDefault(specSource, 'isRenderShadow', 'boolean'),
    color: [255,255,255,255], alphaMult: 1, additive: false };
}
const numericFields = ['tilt','pitch','rotation','cloudRotation','cloudAlpha','atmosphereThickness','atmosphereThicknessMin','starCoronaSizeMult'];
const fields = ['texture','planetColor','tilt','pitch','rotation','cloudTexture','cloudColor','cloudRotation','cloudAlpha','glowTexture','glowColor','useReverseLightForGlow','atmosphereColor','atmosphereThickness','atmosphereThicknessMin','starCoronaSprite','starCoronaColor','starCoronaSizeMult','lightPosition','isStar'];
const renameField = key => ({ starCoronaSprite: 'coronaTexture', starCoronaColor: 'coronaColor', starCoronaSizeMult: 'coronaSize' })[key] ?? key;
export async function importOriginalBodyVisuals({ coreRoot = resolve(project,'../starsector-core'), decompiledRoot = resolve(project,'../decompiled'), projectRoot = project } = {}) {
  const roots = { core: coreRoot, decompiled: decompiledRoot, project: projectRoot }, sources = [], cache = new Map();
  const load = async (root, path, expected) => {
    const id = `${root}:${path}`; if (cache.has(id)) return cache.get(id);
    const result = await readRootedBodyVisualSource(roots[root], path, expected);
    sources.push({ id, root, path, sha256: result.sha256, bytes: result.bytes.length }); cache.set(id,result.bytes); return result.bytes;
  };
  const blueprint = JSON.parse((await load('project',blueprintPath,blueprintHash)).toString('utf8'));
  need(Object.keys(blueprint.specs.planets).length === 6 && Object.keys(blueprint.specs.customEntities).length === 8, 'unreviewed Corvus roster');
  for (const [path, sha] of reviewed) await load('decompiled',path,sha);
  for (const path of ['loading/SpecStore.java','loading/S.java']) {
    const row = blueprint.sources.find(s => s.id === 'decompiled:' + obf + path); need(row, `missing inheritance source ${path}`); await load('decompiled', row.path, row.sha256);
  }
  const json = async path => { const row = blueprint.sources.find(s => s.id === `core:${path}`); need(row, `missing blueprint source ${path}`); return parseFactionText((await load('core',path,row.sha256)).toString('utf8'),path); };
  const planets = await json('data/config/planets.json'), customs = await json('data/config/custom_entities.json'), settings = await json('data/config/settings.json');
  const corvusSource = blueprint.sources.find(s => s.id === 'core:data/scripts/world/corvus/Corvus.java'); need(corvusSource, 'missing Corvus source'); await load('core', corvusSource.path, corvusSource.sha256);
  const text = path => cache.get('decompiled:' + path).toString('utf8');
  const defaults = extractBodyPlanetDefaults(text(obf+'loading/specs/PlanetSpec.java'),text(obf+'loading/String.java'),settings);
  const customDefaults = extractBodyCustomDefaults(text(obf+'loading/specs/int.java'),text('fs.common_obf/com/fs/graphics/Sprite.java'));
  const planetSpecs = {}, customSpecs = {}, sourceHandles = {};
  const pSources = ['core:data/config/planets.json','core:data/config/settings.json','decompiled:'+obf+'loading/specs/PlanetSpec.java','decompiled:'+obf+'loading/String.java'];
  for (const [id, spec] of Object.entries(blueprint.specs.planets)) {
    need(JSON.stringify(planets[id]) === JSON.stringify(spec.declared), `blueprint planet drift ${id}`);
    need(typeof spec.declared.texture === 'string', `required planet texture ${id}`);
    const result = { kind: 'planet', ...structuredClone(defaults) };
    for (const key of fields) if (own(spec.declared,key)) {
      let value = spec.declared[key];
      if (numericFields.includes(key)) { need(typeof value === 'number' && Number.isFinite(value), `invalid numeric field ${id}.${key}`); value = Math.fround(value); }
      if (key === 'lightPosition') value = value.map(Math.fround);
      result[renameField(key)] = value;
    }
    const supportedLayers = ['surface'];
    if (result.cloudTexture !== null) supportedLayers.push('clouds'); if (result.glowTexture !== null) supportedLayers.push('glow');
    if (result.atmosphereThickness > 0 || result.atmosphereThicknessMin > 0) supportedLayers.push('atmosphere');
    if (result.isStar && result.coronaTexture !== null && result.coronaSize > 0) supportedLayers.push('corona');
    result.audit = { supportedLayers, unsupported: ['native-shader-and-runtime-phase','runtime-light-source'], sourceIds: pSources, overriddenFields: [] };
    planetSpecs[id] = result;
  }
  for (const [id, spec] of Object.entries(blueprint.specs.customEntities)) {
    const declared = {};
    for (let i=0;i<spec.chain.length;i++) { const row = spec.chain[i]; need(JSON.stringify(customs[row.id]) === JSON.stringify(row.declared), `blueprint custom drift ${id}/${row.id}`);
      need(i === 0 ? !row.declared.baseId : row.declared.baseId === spec.chain[i-1].id, `inheritance chain mismatch ${id}`); Object.assign(declared,row.declared); }
    need(!declared.sheet, `unsupported sprite sheet ${id}`);
    const result = { kind: 'custom', ...structuredClone(customDefaults), facingOffsetDegrees: -90, nativeLayers: declared.layers ?? [], pluginClass: declared.pluginClass ?? null, pluginRender: 'none' };
    for (const [key,target] of [['sprite','sprite'],['spriteWidth','width'],['spriteHeight','height'],['showInCampaign','showInCampaign'],['useLightColor','useLightColor'],['renderShadow','renderShadow']]) if (own(declared,key)) result[target] = ['width','height'].includes(target) ? Math.fround(declared[key]) : declared[key];
    const sourceIds = ['core:data/config/custom_entities.json','decompiled:'+obf+'loading/specs/int.java','decompiled:'+obf+'loading/SpecStore.java','decompiled:'+obf+'loading/S.java','decompiled:'+obf+'campaign/CustomCampaignEntity.java','decompiled:fs.common_obf/com/fs/graphics/Sprite.java'];
    const unsupported = ['sensor-viewport-fading','campaign-indicators-and-labels'];
    if (result.sprite !== null && result.useLightColor) unsupported.push('dynamic-light-tint'); if (result.sprite !== null && result.renderShadow) unsupported.push('native-shadow-pass');
    if (result.pluginClass) {
      const name = result.pluginClass.split('.').at(-1);
      need(['SensorArrayEntityPlugin','CommRelayEntityPlugin','GateEntityPlugin'].includes(name), `unreviewed custom plugin ${result.pluginClass}`);
      sourceIds.push('decompiled:'+api+name+'.java');
      if (name === 'GateEntityPlugin') { result.pluginRender = 'partial-base-sprite'; unsupported.push('gate-plugin-stateful-effects'); }
      else { result.pluginRender = 'inherited-noop'; sourceIds.push('decompiled:'+api+'BaseCampaignObjectivePlugin.java','decompiled:'+api+'BaseCustomEntityPlugin.java'); }
    }
    result.audit = { supportedLayers: result.sprite === null ? [] : ['base-sprite'], unsupported, sourceIds, overriddenFields: [] }; customSpecs[id] = result;
  }
  for (const entity of blueprint.entities.filter(e => ['star','planet','custom'].includes(e.kind))) {
    const overrides = {}, sourceIds = ['project:'+blueprintPath, corvusSource.id];
    if (entity.kind !== 'custom') for (const key of ['glowTexture','glowColor','useReverseLightForGlow']) if (own(entity.properties,key)) {
      need(entity.properties.applySpecChanges === true, `unapplied spec override ${entity.handle}`);
      let value = entity.properties[key];
      if (key === 'glowTexture') { need(value.source.id === 'core:data/config/settings.json' && settings.graphics?.[value.category]?.[value.key] === value.path, `unresolved glow texture ${entity.handle}`); value = value.path; sourceIds.push('core:data/config/settings.json'); }
      overrides[key] = value;
    }
    sourceHandles[entity.handle] = { kind: entity.kind, nativeType: entity.planetType ?? entity.customType, overrides, sourceIds: [...new Set(sourceIds)] };
  }
  // Validate before touching graphics files, so a malformed path cannot become a source read.
  const reference = { schemaVersion: 1, id: 'reference-corvus-body-visuals-v1', sources, planetSpecs, customSpecs, sourceHandles };
  createOriginalBodyVisuals(reference);
  const paths = new Set();
  for (const spec of Object.values(planetSpecs)) for (const key of ['texture','cloudTexture','glowTexture','coronaTexture']) if (spec[key]) paths.add(spec[key]);
  for (const spec of Object.values(customSpecs)) if (spec.sprite) paths.add(spec.sprite);
  for (const entry of Object.values(sourceHandles)) if (entry.overrides.glowTexture) paths.add(entry.overrides.glowTexture);
  for (const path of [...paths].sort()) await load('core',path);
  sources.sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0); createOriginalBodyVisuals(reference); return reference;
}
export const serializeOriginalBodyVisuals = data => JSON.stringify(data,null,2) + '\n';
async function main() {
  let coreRoot, decompiledRoot, check = false; const args = process.argv.slice(2);
  while (args.length) { const arg = args.shift(); if (arg === '--check') check = true; else if (arg === '--core' || arg === '--decompiled') { need(args.length > 0 && !args[0].startsWith('--'), `missing path for ${arg}`); if (arg === '--core') coreRoot = resolve(args.shift()); else decompiledRoot = resolve(args.shift()); } else throw new Error('Usage: import-campaign-body-visuals.mjs [--core PATH] [--decompiled PATH] [--check]'); }
  const data = await importOriginalBodyVisuals({coreRoot,decompiledRoot}), output = serializeOriginalBodyVisuals(data);
  if (check) need(await readFile(destination,'utf8') === output, 'reference differs; explicitly inspect/reimport');
  else { await writeFile(destination+'.tmp',output); await rename(destination+'.tmp',destination); }
  console.log(JSON.stringify({ check, planets: Object.keys(data.planetSpecs).length, custom: Object.keys(data.customSpecs).length, handles: Object.keys(data.sourceHandles).length, sources: data.sources.length }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
