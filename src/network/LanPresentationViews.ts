import { CombatHudProjector, liveCombatHudView, type CombatHudView } from '../engine/runtime/CombatHudView';
import { engineTacticalMapSource, type TacticalMapSource, type TacticalMapSnapshot } from '../engine/runtime/TacticalMapView';
import { engineDeploymentView, type DeploymentViewSource, type DeploymentView } from '../engine/runtime/DeploymentView';
import { applyTacticalViewCommand, type TacticalCommand } from '../engine/runtime/TacticalControl';
import type { CommandResult } from '../engine/runtime/CombatCommands';
import { lanTeamPresence, type LanTeamPresence } from './LanBattleRoster';
import type { LanDisplayWorld } from './LanDisplayWorld';
import type { Match } from './protocol';

/** Data selected by the actual presentation owner; no render world or authority. */
export interface LanPresentationUiSnapshot {
  readonly kind: 'lan-presentation-ui';
  readonly hud: CombatHudView;
  readonly map: TacticalMapSnapshot;
  readonly deployment: DeploymentView;
  readonly presence: readonly LanTeamPresence[];
}
export type LanPresentationReadViews = Pick<LanPresentationViews, 'hud' | 'map' | 'deployment' | 'presence'>;
export interface LanPresentationLocalViews extends LanPresentationViews {
  tactical(command: TacticalCommand): CommandResult;
  setMapOpen(open: boolean): CommandResult;
  invalidateCommands(): void;
  /** Sample immediately before encoding, never retain this live graph as history. */
  captureForTransfer(): LanPresentationUiSnapshot;
}

/** UI capabilities only. No world, renderer, prediction controller or authority is
 * reachable through this interface. Local commands complete inline; remote
 * commands complete only after owner execution and the corresponding UI revision. */
export interface LanPresentationViews {
  readonly hud: CombatHudView;
  readonly map: TacticalMapSource;
  readonly deployment: DeploymentViewSource;
  presence(): readonly LanTeamPresence[];
  readonly commandEpoch: number;
  tactical(command: TacticalCommand): CommandResult | Promise<CommandResult>;
  setMapOpen(open: boolean): CommandResult | Promise<CommandResult>;
  dispose(): void;
}

/** The LAN receive world has synchronous, native display readers (no authority
 * hooks). Deduplicate projection work inside a capture only, never across live
 * frames. Preserve the existing microtask lifetime for RAF/HUD readers. */
export function createLanPresentationViews(match: Match, source: LanDisplayWorld): LanPresentationLocalViews {
  let world: LanDisplayWorld | null = source;
  let commandEpoch = 0;
  let mapSource: TacticalMapSource | null = engineTacticalMapSource(source);
  let deploymentSource: DeploymentViewSource | null = engineDeploymentView(source);
  const projector = new CombatHudProjector();
  let snapshot: CombatHudView | undefined;
  const current = () => {
    if (!world) throw Error('LAN presentation views are closed');
    return world;
  };
  const hud = liveCombatHudView(() => {
    const engine = current();
    if (!snapshot) {
      snapshot = projector.captureReadonly(engine);
      queueMicrotask(() => { snapshot = undefined; });
    }
    return snapshot;
  });
  return {
    hud,
    get commandEpoch() { return commandEpoch; },
    invalidateCommands() { commandEpoch++; },
    setMapOpen(open) {
      if (!world) return { accepted: false, reason: '战场呈现已关闭。' };
      if (open) { world.isTacticalMap = true; return { accepted: true }; }
      return applyTacticalViewCommand(world, { action: 'close' });
    },
    captureForTransfer() {
      const engine = current();
      return { kind: 'lan-presentation-ui', hud: projector.captureReadonly(engine), map: mapSource!.read(),
        deployment: deploymentSource!.read(), presence: lanTeamPresence(match, engine) };
    },
    map: { read: () => { current(); return mapSource!.read(); } },
    deployment: { read: () => { current(); return deploymentSource!.read(); } },
    presence: () => lanTeamPresence(match, current()),
    tactical(command) {
      if (!world) return { accepted: false, reason: '战场呈现已关闭。' };
      return applyTacticalViewCommand(world, command);
    },
    dispose() { commandEpoch++; world = null; mapSource = null; deploymentSource = null; snapshot = undefined; },
  };
}
