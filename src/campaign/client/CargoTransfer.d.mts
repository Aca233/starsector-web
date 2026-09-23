export type CargoSide = 'hold' | 'discard';
export type TransferStack = { id: string; quantity: number };
export type CargoTransferState = {
  baseline: Record<string, number>;
  hold: (TransferStack | null)[];
  discard: (TransferStack | null)[];
  held: { stack: TransferStack; source: CargoSide; index: number; remainder?: TransferStack | null; selectionTotal?: number } | null;
};

/** Copies positive finite own entries; missing cargo initializes an empty state. */
export function createCargoTransfer(cargo?: Readonly<Record<string, number>> | null): CargoTransferState;
/** Whole-stack gestures; indices must be 0..4095 (Web allocation guard). Limits/precision failures are no-ops. */
export function clickCargoSlot(state: CargoTransferState, side: CargoSide, index: number): CargoTransferState;
/** Shift-left starts a split or adds one at the surviving source; Shift-right returns one there. */
export function shiftCargoSlot(state: CargoTransferState, side: CargoSide, index: number, button?: 'left' | 'right'): CargoTransferState;
/** Only during a drag. Zero is temporary, and release of zero clears the held stack. */
export function setCargoSelection(state: CargoTransferState, quantity: number): CargoTransferState;
export function finishCargoSelection(state: CargoTransferState): CargoTransferState;
/** Merges into the surviving source remainder; otherwise returns to the source container's first empty slot (or appends); slot/ID limits retain held cargo. */
export function returnHeldCargo(state: CargoTransferState): CargoTransferState;
/** A held stack or nonempty discard container is pending; hold-only rearrangement is not. */
export function cargoTransferPending(state: CargoTransferState): boolean;
/** Fresh aggregate of hold only, excluding held/discard cargo; safe for prototype-named IDs. */
export function cargoTransferRetained(state: CargoTransferState): Record<string, number>;
/** Fresh aggregate of discard only, excluding held cargo; safe for prototype-named IDs. */
export function cargoTransferItems(state: CargoTransferState): Record<string, number>;
/** Compares the complete positive snapshot with baseline; missing snapshots never match. */
export function cargoTransferMatches(state: CargoTransferState, cargo?: Readonly<Record<string, number>> | null): boolean;
/** Consolidates/sorts one side using CargoSort; no-op while holding or if sums cannot conserve quantities. */
export function sortCargoTransfer(
  state: CargoTransferState,
  side: CargoSide,
  commodities: ReadonlyMap<string, { readonly order?: number }>,
): CargoTransferState;

/** Return all staged items without resetting hold layout; no-op with held cargo or on precision/slot failure. */
export function cancelCargoTransfer(state: CargoTransferState): CargoTransferState;

/** Apply a server-quoted cross-container amount, merging/using first empty slot; no held cursor. */
export function quickCargoTransfer(state: CargoTransferState, side: CargoSide, index: number, amount: number): CargoTransferState;
