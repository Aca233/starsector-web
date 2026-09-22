import type { AIPhaseBatch } from '../ai/multicore/Types';

export interface CombatTickRequest {
  /** Sample input and publish optional predictions without suspending the authoritative tick. */
  prepare(): Promise<AIPhaseBatch> | null;
  /** Synchronous, original-order authoritative execution. */
  commit(batch?: AIPhaseBatch): void;
  discard(): void;
  failed(error: unknown): void;
}
type PendingTick = {
  promise: Promise<void | false>;
  finish(batch?: AIPhaseBatch): void;
  discard(): void;
};

/** Bounded host transaction: at most one sampled tick and one speculative batch.
 * Inline and AI-worker paths share exactly the same commit callback. Flush commits
 * the already sampled input serially; discard never replays it into a new epoch.
 * This host does NOT pretend the whole simulation runs off the UI thread.
 */
export class CombatTickHost {
  private pending: PendingTick | null = null;
  private executing = false;
  private disposed = false;
  private _epoch = 1;
  get epoch(): number { return this._epoch; }
  get hasPendingTick(): boolean { return this.pending !== null; }
  get pendingPromise(): Promise<void | false> | null { return this.pending?.promise ?? null; }

  run(request: CombatTickRequest): void | false | Promise<void | false> {
    if (this.disposed) return false;
    if (this.pending) return this.pending.promise;
    if (this.executing) throw new Error('Reentrant combat host transaction');
    const epoch = this._epoch;
    let prediction: Promise<AIPhaseBatch> | null;
    this.executing = true;
    try {
      prediction = request.prepare();
      // prepare may synchronously cause a scene reset/disposal through an input hook.
      if (epoch !== this._epoch || this.disposed) {
        void prediction?.then(batch => batch.finish(), () => {});
        request.discard(); return false;
      }
      if (!prediction) { request.commit(); return; }
    } finally { this.executing = false; }

    let resolve!: (value: void | false) => void, reject!: (error: unknown) => void;
    const promise = new Promise<void | false>((ok, fail) => { resolve = ok; reject = fail; });
    let done = false;
    const finish = (batch?: AIPhaseBatch) => {
      if (done) { batch?.finish(); return; }
      done = true; this.pending = null;
      if (epoch !== this._epoch || this.disposed) {
        batch?.finish(); request.discard(); resolve(false); return;
      }
      this.executing = true;
      try { request.commit(batch); resolve(); }
      catch (error) { reject(error); request.failed(error); }
      finally { this.executing = false; }
    };
    this.pending = { promise, finish, discard: () => {
      if (!done) { done = true; this.pending = null; request.discard(); resolve(false); }
    } };
    void prediction.then(finish, () => finish());
    return promise;
  }
  flush(): void { this.pending?.finish(); }
  discard(): void { this._epoch++; this.pending?.discard(); }
  dispose(): void { this.disposed = true; this.discard(); }
}
