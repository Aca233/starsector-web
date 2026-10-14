import type { CombatReplayCheckpoint } from './CombatReplayCheckpoint';
import type { CombatPresentationPacket } from './CombatPresentationWire';
import type { CombatControlSample } from '../CombatControl';
import type { CommandResult } from '../CombatCommands';
import type { CombatOutcome } from '../../game/GameState';
import type { LocalCombatConfig, LocalCombatCommand } from './LocalCombatContracts';
import type { LocalCombatRequestWire, LocalCombatAckWire, LocalCombatFailure, LocalCombatReplayProgress } from '../../contracts/LocalCombatWire';
export { LOCAL_COMBAT_PROTOCOL } from '../../contracts/LocalCombatWire';
export type { CombatAudioEvent, LocalCombatFailure, LocalCombatReplayProgress } from '../../contracts/LocalCombatWire';

/** Domain-specialized public protocol. Envelopes and telemetry have one strict,
 * data-only source; no ReturnType path through the authoritative Kernel. */
export type LocalCombatRequest = LocalCombatRequestWire<LocalCombatConfig, CombatReplayCheckpoint, CombatControlSample, LocalCombatCommand>;
export type LocalCombatAck = LocalCombatAckWire<CombatPresentationPacket, CommandResult, CombatOutcome>;
export type LocalCombatResponse = LocalCombatAck | LocalCombatFailure | LocalCombatReplayProgress;
