export function realtimeWritable(bufferedAmount: number): boolean;
export function submitRealtimeInput<T>(options: {
  canSend: () => boolean;
  takeBudget: () => boolean;
  createInput: () => T;
  send: (input: T) => boolean;
  accepted: (input: T) => void;
}): boolean;
export class RealtimeSendGate {
  canSendSnapshot(bufferedAmount: number, now: number): boolean;
  snapshotSent(now: number): void;
  canSendInput(bufferedAmount: number, now: number): boolean;
  inputSent(now: number): void;
  reset(): void;
}
