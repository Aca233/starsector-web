import { tacticalSystemIds } from '../engine/extensions/ship-systems/Loadout';
import { decodeDesign, evaluate, type Design } from '../studio/DesignModel';
import type { ShipSpec } from '../engine/content/ShipSpec';
import { shipSystemDefinitions } from '../engine/extensions/ship-systems/Registry';
import { modManager } from '../engine/modding/ModManager';
import { wireDesign } from './design-wire.mjs';

export function lanHullUnavailable(spec: ShipSpec): string | null {
  if (spec.isModuleHull) return '模块必须随母舰部署';
  if (spec.hullSize === 'FIGHTER') return '舰载机不能作为玩家旗舰';
  for (const id of [...tacticalSystemIds(spec), spec.defenseSystemType ?? 'NONE']) {
    const system = shipSystemDefinitions.require(id);
    if (system.unavailable) return system.name + '，暂不能作为联机旗舰';
  }
  return null;
}

export function validateLanDesign(input: unknown): Design {
  const design = decodeDesign(wireDesign(input));
  const {spec, errors} = evaluate(design);
  const unavailable = lanHullUnavailable(spec);
  if (unavailable) errors.push(unavailable);
  if (errors.length) throw Error(errors.join('；'));
  return design;
}
/** Stable per-controller slots; no mutation of native hulls or the studio's prototype. */
export function registerLanDesign(input: unknown, seat: number): string {
  const design = validateLanDesign(input);
  const {spec} = evaluate(design);
  spec.id = 'lan-player-' + seat;
  spec.nameKey = 'lan.player.' + seat;
  spec.i18n = {zh_CN:{[spec.nameKey]:design.name},en_US:{[spec.nameKey]:design.name}};
  modManager.registerShip(spec, {allowExistingId:!!modManager.getShip(spec.id)});
  return spec.id;
}
const key = 'starsector.lan.selected-design.v5';
export function readSelectedDesign(): {design: Design | null; error: string} {
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    const raw = params.get('design');
    if (raw !== null) {
      params.delete('design');
      history.replaceState(null, '', location.pathname + location.search + (params.size ? '#' + params : ''));
      const design = validateLanDesign(JSON.parse(raw));
      try {sessionStorage.setItem(key, JSON.stringify(design));} catch { /* tab-local convenience only */ }
      return {design,error:''};
    }
    const saved = sessionStorage.getItem(key);
    return {design:saved ? validateLanDesign(JSON.parse(saved)) : null,error:''};
  } catch (e) {return {design:null,error:e instanceof Error ? e.message : '无法读取携带的联机方案'};}
}
export function rememberSelectedDesign(design: Design | null) {
  try { if (design) sessionStorage.setItem(key,JSON.stringify(design)); else sessionStorage.removeItem(key); } catch { /* Never write the design library. */ }
}
