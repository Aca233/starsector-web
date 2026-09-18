import type { ShipModuleSpec, ShipSpec } from '../content/ShipSpec';

/**
 * Generated native hulls retain .ship local coordinates: +x forward, +y port,
 * positive angles counter-clockwise. The Web engine uses +y starboard and
 * clockwise angles. Reflect local geometry ONCE at the native-data boundary,
 * not in the renderer: refit, collision, weapons and module anchors must agree.
 * Sprite pivots are already top-left image pixels and must not be reflected.
 * Never pass runtime/refitted specs or custom Web content through this adapter.
 */
export function nativeShipToRuntime(source: ShipSpec): ShipSpec {
  const spec = structuredClone(source);
  spec.bounds = spec.bounds.map(([x, y]) => [x, -y]);
  spec.weaponSlots = spec.weaponSlots.map(slot => ({ ...slot, y: -slot.y, baseAngleDeg: -slot.baseAngleDeg }));
  spec.engineSlots = spec.engineSlots.map(slot => ({ ...slot, y: -slot.y, angleDeg: -slot.angleDeg }));
  if (spec.shieldCenterY !== undefined) spec.shieldCenterY = -spec.shieldCenterY;
  if (spec.systemWeaponSlots) spec.systemWeaponSlots = spec.systemWeaponSlots.map(slot => ({ ...slot, y: -slot.y, baseAngleDeg: -slot.baseAngleDeg }));
  if (spec.decorativeWeapons) spec.decorativeWeapons = spec.decorativeWeapons.map(slot => ({ ...slot, y: -slot.y, angleDeg: -slot.angleDeg }));
  if (spec.moduleAnchor) spec.moduleAnchor = [spec.moduleAnchor[0], -spec.moduleAnchor[1]];
  if (spec.moduleSlots) spec.moduleSlots = spec.moduleSlots.map(slot => ({ ...slot, y: -slot.y, angleDeg: -slot.angleDeg }));
  if (spec.modules) spec.modules = nativeModulesToRuntime(spec.modules);
  return spec;
}

/** Variant templates are another native-data entry point, independent of hull registration. */
export function nativeModulesToRuntime(modules: readonly ShipModuleSpec[]): ShipModuleSpec[] {
  return modules.map(module => ({ ...module, y: -module.y, angleDeg: -module.angleDeg, spec: nativeShipToRuntime(module.spec) }));
}
