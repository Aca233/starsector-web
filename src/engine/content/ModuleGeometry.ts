import type { ShipSpec, ShipModuleSpec } from './ShipSpec';

/** Native slot.computePosition(parent, moduleAnchor): subtract the rotated anchor. */
export function moduleOffset(module: ShipModuleSpec): { x: number; y: number } {
  const a = module.angleDeg * Math.PI / 180, [x, y] = module.spec.moduleAnchor ?? [0, 0];
  return { x: module.x - x * Math.cos(a) + y * Math.sin(a), y: module.y - x * Math.sin(a) - y * Math.cos(a) };
}
export interface AssemblyPart { spec: ShipSpec; x: number; y: number; angle: number; key: string }
export function assemblyParts(spec: ShipSpec): AssemblyPart[] {
  const parts: AssemblyPart[] = [];
  const visit = (part: AssemblyPart, depth: number) => {
    if (depth > 8 || parts.length >= 128) throw new Error('Invalid module assembly');
    parts.push(part);
    for (const [i, module] of (part.spec.modules ?? []).entries()) {
      const o = moduleOffset(module), c = Math.cos(part.angle), s = Math.sin(part.angle);
      visit({spec:module.spec, x:part.x + o.x*c-o.y*s, y:part.y+o.x*s+o.y*c, angle:part.angle+module.angleDeg*Math.PI/180, key:part.key+'/'+i}, depth+1);
    }
  };
  visit({spec,x:0,y:0,angle:0,key:'root'},0);
  return parts;
}

/** Conservative spawn envelope includes every attached module, not only the core. */
export function assemblyRadius(spec: ShipSpec): number {
  return Math.max(...assemblyParts(spec).map(part => Math.hypot(part.x, part.y) + part.spec.collisionRadius));
}

/** Stable runtime identities, including nested modules; never matches another root by prefix. */
export function assemblyShipIds(rootId: string, spec: ShipSpec): string[] {
  return assemblyParts(spec).map(part => rootId + part.key.split('/').slice(1).map(index => ':module:' + index).join(''));
}

/** Bow-up sprite extent; unlike collision bounds this includes every visible pixel. */
export function assemblySpriteLayout(spec: ShipSpec) {
  const parts = assemblyParts(spec);
  const corners = parts.flatMap(part => {
    const hull = part.spec, c = Math.cos(part.angle), s = Math.sin(part.angle);
    return [-hull.pivotX, hull.spriteWidth-hull.pivotX].flatMap(x => [-hull.pivotY, hull.spriteHeight-hull.pivotY].map(y => ({
      x: part.y+x*c-y*s, y: -part.x+x*s+y*c,
    })));
  });
  const minX = Math.min(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y));
  return {parts, minX, minY, width: Math.max(1, ...corners.map(p => p.x-minX)), height: Math.max(1, ...corners.map(p => p.y-minY))};
}
