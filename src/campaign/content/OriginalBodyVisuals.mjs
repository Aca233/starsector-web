/** Browser-safe, data-only resolver. No asset loading, runtime simulation or native plugin execution. */
import { immutableJSON, isRecord, requireThat } from '../core/Values.mjs';
const fail = (condition, message) => requireThat(condition, 'INVALID_BODY_VISUALS', message);
const has = (obj, key) => Object.hasOwn(obj, key);
const get = (obj, key) => has(obj, key) ? obj[key] : undefined;
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
const path = value => typeof value === 'string' && /^graphics\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg)$/i.test(value) && !value.split('/').some(p => p === '.' || p === '..');
const number = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e7;
const rgba = value => Array.isArray(value) && value.length === 4 && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
const shape = (v, keys, name) => fail(isRecord(v) && Object.keys(v).length === keys.length && keys.every(k => has(v, k)), `Unexpected ${name} shape`);
const strings = value => Array.isArray(value) && value.length <= 128 && value.every(v => typeof v === 'string' && v.length > 0 && v.length <= 1024) && new Set(value).size === value.length;
const planetKeys = ['kind', 'isStar', 'texture', 'planetColor', 'tilt', 'pitch', 'rotation', 'cloudTexture', 'cloudColor', 'cloudRotation', 'cloudAlpha', 'glowTexture', 'glowColor', 'useReverseLightForGlow', 'atmosphereColor', 'atmosphereThickness', 'atmosphereThicknessMin', 'coronaTexture', 'coronaColor', 'coronaSize', 'lightPosition', 'audit'];
const customKeys = ['kind', 'sprite', 'width', 'height', 'color', 'alphaMult', 'additive', 'showInCampaign', 'useLightColor', 'renderShadow', 'facingOffsetDegrees', 'nativeLayers', 'pluginClass', 'pluginRender', 'audit'];
function audit(value, sourceIds) {
  shape(value, ['supportedLayers', 'unsupported', 'sourceIds', 'overriddenFields'], 'visual audit');
  for (const key of Object.keys(value)) fail(strings(value[key]), `Invalid audit ${key}`);
  fail(value.sourceIds.length > 0 && value.sourceIds.every(s => sourceIds.has(s)), 'Missing audit source');
  fail(value.overriddenFields.every(s => ['glowTexture', 'glowColor', 'useReverseLightForGlow'].includes(s)), 'Unsupported override audit');
}
function descriptor(value, kind, sourceIds) {
  shape(value, kind === 'planet' ? planetKeys : customKeys, 'render descriptor'); fail(value.kind === kind, 'Descriptor kind mismatch'); audit(value.audit, sourceIds);
  if (kind === 'planet') {
    fail(typeof value.isStar === 'boolean' && path(value.texture), 'Invalid planet identity/texture');
    for (const key of ['cloudTexture', 'glowTexture', 'coronaTexture']) fail(value[key] === null || path(value[key]), `Invalid ${key}`);
    for (const key of ['planetColor', 'cloudColor', 'glowColor', 'atmosphereColor', 'coronaColor']) fail(rgba(value[key]), `Invalid ${key}`);
    for (const key of ['tilt', 'pitch', 'rotation', 'cloudRotation', 'cloudAlpha', 'atmosphereThickness', 'atmosphereThicknessMin', 'coronaSize']) fail(number(value[key]), `Invalid ${key}`);
    fail(value.cloudAlpha >= 0 && value.cloudAlpha <= 255 && value.atmosphereThickness >= 0 && value.atmosphereThicknessMin >= 0 && value.coronaSize >= 0, 'Invalid render range');
    fail(typeof value.useReverseLightForGlow === 'boolean' && Array.isArray(value.lightPosition) && value.lightPosition.length === 3 && value.lightPosition.every(number), 'Invalid lighting');
  } else {
    fail(value.sprite === null || path(value.sprite), 'Invalid custom sprite');
    for (const key of ['width', 'height']) fail(number(value[key]) && value[key] > 0, `Invalid ${key}`);
    fail(rgba(value.color) && number(value.alphaMult) && value.alphaMult >= 0 && value.alphaMult <= 1, 'Invalid custom modulation');
    for (const key of ['additive', 'showInCampaign', 'useLightColor', 'renderShadow']) fail(typeof value[key] === 'boolean', `Invalid ${key}`);
    fail(value.facingOffsetDegrees === -90 && strings(value.nativeLayers), 'Invalid custom orientation/layers');
    fail(value.pluginClass === null || typeof value.pluginClass === 'string' && /^com\.fs\.[\w.]+$/.test(value.pluginClass), 'Invalid plugin class');
    fail(['none', 'inherited-noop', 'partial-base-sprite'].includes(value.pluginRender), 'Invalid plugin support');
    fail((value.pluginClass === null) === (value.pluginRender === 'none'), 'Plugin support mismatch');
    if (value.pluginRender === 'partial-base-sprite') fail(value.audit.unsupported.includes('gate-plugin-stateful-effects'), 'Missing partial plugin audit');
  }
}
function withOverride(base, entry) {
  const next = structuredClone(base);
  for (const [key, value] of Object.entries(entry.overrides)) next[key] = value;
  next.audit.sourceIds = [...new Set([...next.audit.sourceIds, ...entry.sourceIds])];
  next.audit.overriddenFields = Object.keys(entry.overrides).sort();
  if (next.kind === 'planet' && next.glowTexture !== null && !next.audit.supportedLayers.includes('glow')) next.audit.supportedLayers.push('glow');
  return next;
}
/** Invalid data throws; unknown/malformed query or mismatched non-null source handle returns null. */
export function createOriginalBodyVisuals(data) {
  // Copies before validation; rejects accessors/cycles/prototype keys and isolates callers' mutations.
  const reference = immutableJSON(data);
  shape(reference, ['schemaVersion', 'id', 'sources', 'planetSpecs', 'customSpecs', 'sourceHandles'], 'body visual reference');
  fail(reference.schemaVersion === 1 && reference.id === 'reference-corvus-body-visuals-v1', 'Unknown reference schema');
  fail(Array.isArray(reference.sources) && reference.sources.length > 0 && reference.sources.length <= 256, 'Invalid sources');
  const sourceIds = new Set();
  for (const s of reference.sources) {
    shape(s, ['id', 'root', 'path', 'sha256', 'bytes'], 'source');
    fail(['core', 'decompiled', 'project'].includes(s.root) && typeof s.path === 'string' && s.path.length > 0 && !s.path.includes('\\') && !s.path.split('/').some(v => !v || v === '..' || v === '.') && !s.path.includes(':') && !s.path.includes('\0'), 'Unsafe provenance path');
    fail(s.id === `${s.root}:${s.path}` && !sourceIds.has(s.id) && /^[a-f0-9]{64}$/.test(s.sha256) && Number.isSafeInteger(s.bytes) && s.bytes > 0, 'Invalid source identity/hash'); sourceIds.add(s.id);
  }
  for (const [table, kind] of [['planetSpecs', 'planet'], ['customSpecs', 'custom']]) {
    fail(isRecord(reference[table]) && Object.keys(reference[table]).length > 0 && Object.keys(reference[table]).length <= 64, 'Invalid spec table');
    for (const [key, value] of Object.entries(reference[table])) { fail(id(key), 'Invalid native type'); descriptor(value, kind, sourceIds); }
  }
  fail(isRecord(reference.sourceHandles) && Object.keys(reference.sourceHandles).length <= 256, 'Invalid source handles');
  const resolved = new Map();
  for (const [handle, entry] of Object.entries(reference.sourceHandles)) {
    fail(id(handle), 'Invalid source handle'); shape(entry, ['kind', 'nativeType', 'overrides', 'sourceIds'], 'source handle');
    fail(['planet', 'star', 'custom'].includes(entry.kind) && id(entry.nativeType), 'Invalid source identity');
    const base = get(entry.kind === 'custom' ? reference.customSpecs : reference.planetSpecs, entry.nativeType);
    fail(base && (entry.kind === 'custom' || base.isStar === (entry.kind === 'star')), 'Handle type/kind mismatch');
    fail(strings(entry.sourceIds) && entry.sourceIds.length > 0 && entry.sourceIds.every(s => sourceIds.has(s)), 'Unknown handle source');
    fail(isRecord(entry.overrides) && Object.keys(entry.overrides).every(k => ['glowTexture', 'glowColor', 'useReverseLightForGlow'].includes(k)), 'Unsupported override');
    fail(entry.kind !== 'custom' || Object.keys(entry.overrides).length === 0, 'Planet override on custom');
    const result = withOverride(base, entry); descriptor(result, entry.kind === 'custom' ? 'custom' : 'planet', sourceIds); resolved.set(handle, immutableJSON(result));
  }
  return Object.freeze({ resolve(input) {
    if (!isRecord(input) || !Object.keys(input).every(k => ['kind', 'nativeType', 'sourceHandle'].includes(k)) || !['star', 'planet', 'custom'].includes(input.kind) || !id(input.nativeType)) return null;
    const base = get(input.kind === 'custom' ? reference.customSpecs : reference.planetSpecs, input.nativeType);
    if (!base || input.kind !== 'custom' && base.isStar !== (input.kind === 'star')) return null;
    if (input.sourceHandle === null || input.sourceHandle === undefined) return base;
    if (!id(input.sourceHandle)) return null;
    const entry = get(reference.sourceHandles, input.sourceHandle);
    return entry && entry.kind === input.kind && entry.nativeType === input.nativeType ? resolved.get(input.sourceHandle) : null;
  } });
}
