/** One-time encounter membership and player-command data. No TS hot solver. */
import type { RustBodyHandle } from './RustCoreProtocol';
export interface RustSceneAdmission {
  readonly enemy: RustBodyHandle; readonly enabled: boolean; readonly limit: number;
  readonly simulation: boolean; readonly simulationLimit: number; readonly primaryEnemyDeployed: boolean;
  readonly multiTeam: boolean; readonly open: boolean; readonly autopilot: boolean;
  readonly map?: boolean;
  readonly commandRate: number; readonly manualWeapon: RustBodyHandle;
  readonly aiProfile: 'standard' | 'large-battle-v1' | 'large-battle-v3'; readonly multirate: boolean;
  readonly roots: readonly { readonly handle: RustBodyHandle; readonly cost: number; readonly pending: boolean; readonly station: boolean; readonly radius: number }[];
  readonly automaticTeams: readonly number[]; readonly externallyControlled: readonly RustBodyHandle[]; readonly fullRate: readonly RustBodyHandle[];
}
export type RustSceneUnit = { readonly fleet: true } | { readonly handle: RustBodyHandle };
export type RustSceneControl =
  | { readonly kind: 'simulation-limit'; readonly limit: number }
  | { readonly kind: 'toggle-map' | 'close-map' | 'clear-input' | 'stop-firing' }
  | { readonly kind: 'select'; readonly unit: RustSceneUnit | null }
  | { readonly kind: 'pilot'; readonly autopilot: boolean }
  | { readonly kind: 'cancel'; readonly unit: RustSceneUnit }
  | { readonly kind: 'target'; readonly target: RustBodyHandle | null }
  | { readonly kind: 'cancel-target'; readonly target: RustBodyHandle }
  | { readonly kind: 'order'; readonly unit: RustSceneUnit; readonly type: 'ASSAULT' | 'ENGAGE' | 'AVOID' | 'DEFEND' | 'ESCORT' | 'WAYPOINT'; readonly target?: RustBodyHandle; readonly position?: readonly [number, number] }
  | { readonly kind: 'deploy'; readonly ships: readonly RustBodyHandle[]; readonly team: number }
  | { readonly kind: 'retreat'; readonly ships: readonly RustBodyHandle[]; readonly team: number; readonly withdraw: boolean }
  | { readonly kind: 'escort'; readonly ships: readonly RustBodyHandle[]; readonly team: number; readonly target: RustBodyHandle }
  | { readonly kind: 'sample'; readonly autopilot: boolean; readonly blocked: boolean; readonly keys: number; readonly aim: readonly [number, number]; readonly firing: boolean;
      readonly mouse: boolean; readonly pointer: boolean; readonly field: boolean; readonly push: boolean };
const int = (n: number) => { if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw Error('Invalid Rust scene integer'); return n; };
const finite = (n: number) => { if (!Number.isFinite(n)) throw Error('Invalid Rust scene number'); return n; };
const bool = (n: boolean) => { if (typeof n !== 'boolean') throw Error('Invalid Rust scene flag'); return +n; };
const handle = (h: RustBodyHandle) => { if (!h) throw Error('Missing Rust scene handle'); const generation = int(h.generation); if (!generation) throw Error('Invalid Rust scene generation'); return [int(h.slot), generation]; };
const unit = (u: RustSceneUnit) => 'fleet' in u ? (bool(u.fleet) === 1 ? [0, 0, 0] : (() => { throw Error('Invalid Rust fleet unit'); })()) : [1, ...handle(u.handle)];
const target = (h: RustBodyHandle | null | undefined) => h ? [1, ...handle(h)] : [0, 0, 0];
function rowsFor(id: number, h: RustBodyHandle) { const prefix = [int(id), ...handle(h)], rows: number[][] = []; if (!id) throw Error('Invalid Rust scene body ID');
  return { rows, append: (tag: number, data: readonly number[]) => { if (data.length > 22) throw Error('Rust scene row overflow'); const row = [tag, ...prefix, ...data.map(finite)]; while (row.length < 26) row.push(0); rows.push(row); } };
}
export function encodeRustSceneAdmission(data: RustSceneAdmission, id: number, h: RustBodyHandle): number[][] {
  const { rows, append } = rowsFor(id, h);
  const profiles = ['standard', 'large-battle-v1', 'large-battle-v3']; const profile = profiles.indexOf(data.aiProfile); if (profile < 0) throw Error('Unknown Rust AI profile');
  const flags = bool(data.enabled) | bool(data.simulation) * 2 | bool(data.primaryEnemyDeployed) * 4 | bool(data.multiTeam) * 8
    | bool(data.open) * 16 | bool(data.autopilot) * 32 | bool(data.multirate) * 64 | bool(data.map ?? false) * 128;
  append(151, [...handle(data.enemy), flags, finite(data.limit), finite(data.simulationLimit), finite(data.commandRate), int(data.roots.length), int(data.automaticTeams.length),
    int(data.externallyControlled.length), int(data.fullRate.length), 0, ...handle(data.manualWeapon), profile, 0]);
  data.roots.forEach((r, i) => append(152, [...handle(r.handle), i, finite(r.cost), bool(r.pending), bool(r.station), finite(r.radius)]));
  data.automaticTeams.forEach((team, i) => append(153, [0, i, int(team), 0]));
  data.externallyControlled.forEach((h, i) => append(153, [1, i, ...handle(h)]));
  data.fullRate.forEach((h, i) => append(153, [2, i, ...handle(h)])); append(154, []); return rows;
}
export function encodeRustSceneControl(command: RustSceneControl, id: number, h: RustBodyHandle): number[][] {
  const { rows, append } = rowsFor(id, h);
  switch (command.kind) {
    case 'simulation-limit': append(197, [int(command.limit)]); break;
    case 'toggle-map': append(155, [0]); break;
    case 'close-map': append(155, [1]); break;
    case 'select': append(155, [2, ...(command.unit ? unit(command.unit) : [2, 0, 0])]); break;
    case 'clear-input': append(155, [3]); break;
    case 'stop-firing': append(155, [4]); break;
    case 'pilot': append(155, [5, bool(command.autopilot)]); break;
    case 'cancel': append(155, [6, ...unit(command.unit)]); break;
    case 'target': append(155, [7, ...target(command.target)]); break;
    case 'cancel-target': append(155, [8, ...handle(command.target)]); break;
    case 'order': {
      const types = ['ASSAULT', 'ENGAGE', 'AVOID', 'DEFEND', 'ESCORT', 'WAYPOINT']; const type = types.indexOf(command.type); if (type < 0) throw Error('Unknown Rust tactical order');
      append(156, [...unit(command.unit), type, ...target(command.target), +(command.position !== undefined), ...(command.position ?? [0, 0])]); break;
    }
    case 'deploy': case 'retreat': case 'escort': {
      if (command.ships.length > 4096) throw Error('Rust scene command list exceeds roster bound');
      const keys = command.ships.map(h => handle(h).join(':')); if (new Set(keys).size !== keys.length) throw Error('Duplicate Rust scene list handle');
      append(157, [command.kind === 'deploy' ? 0 : command.kind === 'retreat' ? 1 : 2, command.ships.length, int(command.team), command.kind === 'retreat' ? bool(command.withdraw) : 0,
        ...target(command.kind === 'escort' ? command.target : undefined)]);
      command.ships.forEach((h, i) => append(158, [i, ...handle(h)])); append(159, []); break;
    }
    case 'sample': if (command.keys > 255) throw Error('Invalid Rust flight key mask'); else {
      append(165, [bool(command.autopilot), bool(command.blocked), int(command.keys), ...command.aim, bool(command.firing), bool(command.mouse), bool(command.pointer), bool(command.field), bool(command.push), 0]); break;
    }
    default: throw Error('Unknown Rust scene control');
  } return rows;
}
