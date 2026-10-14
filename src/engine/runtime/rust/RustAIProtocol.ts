/** Complete one-time resident AI admission; all rows are pure data. */
import type { RustBodyHandle } from './RustCoreProtocol';
import type { RustResidentActorMeta } from './RustAIAdmission';
import { validateCombatPolicy, type CombatPolicy } from '../../ai/learning/CombatPolicy';

export interface RustAIOrder {
  id: string; type: 'ENGAGE' | 'AVOID' | 'DEFEND' | 'ESCORT' | 'WAYPOINT';
  target?: RustBodyHandle; point?: readonly [number, number]; issuedTime: number;
}
export interface RustAIAdmission {
  actors: readonly (RustResidentActorMeta & { order?: RustAIOrder })[];
  policy: CombatPolicy;
}
export const RUST_AI_ADMISSION_VERSION = 1;
export const RUST_AI_TAG_FIRST = 121, RUST_AI_TAG_LAST = 130;
const WIDTH = 26, DATA = 22;
const kinds = ['NONE', 'ECLIPSE', 'ADUN_FORGE', 'ADUN_BARRIER', 'ADUN_REPAIR', 'GLORIANA_EDICT',
  'HYPERION_YAMATO', 'HYPERION_JUMP', 'ROCINANTE_ATTITUDE', 'ROCINANTE_FIRE', 'ZHEFENG',
  'GRAVITY_MANEUVER', 'GRAVITY_FIELD', 'GRAVITY_COLLAPSE'] as const;
const orders = ['ENGAGE', 'AVOID', 'DEFEND', 'ESCORT', 'WAYPOINT'] as const;
const roles = ['NONE', 'POINT_DEFENSE', 'AXIAL'] as const;
const flag = (v: boolean) => { if (typeof v !== 'boolean') throw Error('Invalid resident AI flag'); return +v; };
const integer = (v: number, max = 0xffffffff) => {
  if (!Number.isInteger(v) || v < 0 || v > max) throw Error('Invalid resident AI integer'); return v;
};
const finite = (v: number) => { if (!Number.isFinite(v)) throw Error('Invalid resident AI number'); return v; };
const text = (v: string) => { if (typeof v !== 'string' || v.length > 1_000_000) throw Error('Invalid resident AI string'); return v; };
const handleWords = (h: RustBodyHandle | undefined): number[] => h
  ? [1, integer(h.slot, 0xfffffffe), integer(h.generation)] : [0, 0, 0];
const optional = (v: number | undefined): number[] => v === undefined ? [0, 0] : [1, finite(v)];

/** id/handle identify the existing world anchor. Actor handles are explicit in
 * their admission row; no guessed Core IDs or per-step JS imports are needed. */
export function encodeRustAIAdmission(data: RustAIAdmission, id: number, handle: RustBodyHandle): number[][] {
  integer(id); integer(handle.slot, 0xfffffffe); integer(handle.generation);
  if (!handle.generation || !Array.isArray(data.actors) || !data.actors.length || !validateCombatPolicy(data.policy))
    throw Error('Invalid complete resident AI admission');
  const rows: number[][] = [], append = (tag: number, values: readonly number[]) => {
    if (values.length > DATA || values.some(v => !Number.isFinite(v))) throw Error('Invalid resident AI admission row');
    const row = Array<number>(WIDTH).fill(0); row.splice(0, 4 + values.length, tag, id, handle.slot, handle.generation, ...values); rows.push(row);
  };
  const stringRows = (actor: number, field: number, value: string) => {
    text(value); for (let offset = 0; offset < value.length; offset += DATA - 4) {
      const count = Math.min(DATA - 4, value.length - offset);
      append(123, [actor, field, offset, count, ...Array.from({ length: count }, (_, i) => value.charCodeAt(offset + i))]);
    }
  };
  const policyRows = Object.entries(data.policy.rows);
  append(121, [RUST_AI_ADMISSION_VERSION, data.actors.length, flag(data.policy.enabled), data.policy.minVisits,
    data.policy.minAdvantage, policyRows.length]);
  const admitted = new Set<string>();
  data.actors.forEach((a, actor) => {
    const h = handleWords(a.handle); if (!h[2]) throw Error('Invalid resident AI generation');
    const key = h[1] + ':' + h[2]; if (admitted.has(key)) throw Error('Duplicate resident AI actor'); admitted.add(key);
    text(a.stableId); if (!a.stableId) throw Error('Missing resident AI stable identity');
    const slot = a.attachment.slot, mode = a.systemMode;
    if (slot !== undefined) text(slot); if (mode !== undefined) text(mode);
    if (a.trainingAction !== -1) throw Error('Live resident AI cannot import training actions');
    append(122, [h[1], h[2], integer(a.localeRank), finite(a.specSpeed), finite(a.specArmor), finite(a.specHp),
      flag(a.attachedMotion) | flag(a.tacticalPresent) << 1 | flag(a.nativeForecast) << 2 | flag(a.systemDrone) << 3
      | flag(a.preventsAIVenting) << 4 | flag(a.memory) << 5,
      finite(a.doNotBackOff), -1, integer(a.fighterBays), finite(a.wingRangeMultiplier), a.mounts.length, a.systems.length, a.wings.length,
      a.stableId.length, +(slot !== undefined), slot?.length ?? 0, +(mode !== undefined), mode?.length ?? 0]);
    stringRows(actor, 0, a.stableId); if (slot !== undefined) stringRows(actor, 1, slot); if (mode !== undefined) stringRows(actor, 2, mode);
    append(124, [actor, ...handleWords(a.attachment.parent), ...optional(a.attachment.x), ...optional(a.attachment.y), ...optional(a.attachment.angleDeg)]);
    a.wings.forEach((w, i) => append(125, [actor, i, finite(w.count), ...optional(w.range)]));
    a.mounts.forEach((m, i) => {
      const role = roles.indexOf(m.role); if (role < 0) throw Error('Unknown resident mount role');
      append(126, [actor, i, integer(m.component), integer(m.localeRank), finite(m.dps), finite(m.authoredMaxSpeed),
        finite(m.positionTurnRate), finite(m.forecastTurnRate), flag(m.fixed), ...optional(m.beamDuration), role,
        flag(m.originalPointDefense), integer(m.stageFlags), integer(m.stageHints)]);
    });
    a.systems.forEach((s, i) => {
      const kind = kinds.indexOf(s.ai); if (kind < 0) throw Error('Unknown resident system AI');
      append(127, [actor, i, integer(s.id), kind, flag(s.defense), finite(s.activeSpeedFlat)]);
    });
    const order = a.order, kind = order ? orders.indexOf(order.type) : 0;
    if (kind < 0) throw Error('Unknown resident AI order'); if (order) { text(order.id); if (!order.id) throw Error('Missing resident order ID'); }
    append(128, [actor, ...handleWords(a.initialTarget), +(order !== undefined), kind, order?.id.length ?? 0,
      ...handleWords(order?.target), +(order?.point !== undefined), ...(order?.point ? order.point.map(finite) : [0, 0]),
      order ? finite(order.issuedTime) : 0]);
    if (order) stringRows(actor, 3, order.id);
  });
  policyRows.forEach(([state, row]) => append(129, [Number(state), ...row.q, ...row.visits]));
  append(130, []); return rows;
}
