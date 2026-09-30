export type PresentationReceiptStatus = 'consumed' | 'discarded';
export type PresentationReceiptLane = 'state' | 'visual' | 'motion' | 'combat';
/** Local correlation only. Never carries server sequence/identity supplied by a Worker. */
export interface PresentationReceiptToken { readonly owner: string; readonly epoch: number; readonly id: number }
export interface PresentationReceipt {
  /** Must be called synchronously before the listener returns. Cancel must revoke
   * the external task (its Worker owner/epoch); a successful post is not completion. */
  defer(cancel: () => void): PresentationReceiptToken;
  complete(status: PresentationReceiptStatus): boolean;
  reject(error: unknown): void;
}
interface Entry {
  lane: PresentationReceiptLane;
  token: PresentationReceiptToken;
  units: number;
  delivered: boolean;
  deferred: boolean;
  status: PresentationReceiptStatus | null;
  deadline: number;
  cancel: (() => void) | null;
  acknowledge: (status: PresentationReceiptStatus) => boolean;
}
interface Lane {
  entries: Map<number, Entry>;
  units: number;
}
interface Limit { count: number; units: number }
/** Bounded ownership ledger, not a payload queue or a decoder. Ordered completion
 * is mandatory: LAN state ACKs cumulatively release earlier server sequences.
 * Entries retain only correlation/accounting and callbacks, never the message.
 * Main-thread synchronous consumers create no timers or microtask wait. */
export class PresentationReceipts {
  // Cross-instance correlation matters too: a newly created connection can have
  // the same epoch/id as a disposed one whose Worker reply is still in transit.
  private readonly owner = Array.from(crypto.getRandomValues(new Uint8Array(16)),
    value => value.toString(16).padStart(2, '0')).join('');
  private epoch = 0;
  private nextId = 0;
  private readonly lanes: Record<PresentationReceiptLane, Lane> = {
    state: { entries: new Map(), units: 0 }, visual: { entries: new Map(), units: 0 },
    motion: { entries: new Map(), units: 0 }, combat: { entries: new Map(), units: 0 },
  };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private barrier: { key: string; finish: () => void } | null = null;
  private flushing = false;
  private cancelling = false;
  private cancellationErrors = 0;

  constructor(private readonly onError: (error: unknown) => void,
    private readonly limits: Readonly<Record<'state' | 'visual', Limit> & Partial<Record<'motion' | 'combat', Limit>>>,
    private readonly timeoutMs = 5000) {}

  get stats() {
    return { epoch: this.epoch, pending: this.pending, state: this.lanes.state.entries.size,
      visual: this.lanes.visual.entries.size, motion: this.lanes.motion.entries.size, combat: this.lanes.combat.entries.size,
      units: Object.values(this.lanes).reduce((sum, lane) => sum + lane.units, 0),
      terminalPending: !!this.barrier, cancellationErrors: this.cancellationErrors };
  }
  private get pending(): number { return this.lanes.state.entries.size + this.lanes.visual.entries.size + this.lanes.motion.entries.size + this.lanes.combat.entries.size; }
  private current(entry: Entry): boolean {
    return entry.token.epoch === this.epoch &&
      this.lanes[entry.lane].entries.get(entry.token.id) === entry;
  }

  deliver(laneName: PresentationReceiptLane, units: number,
    acknowledge: Entry['acknowledge'], dispatch: (receipt: PresentationReceipt) => void): void {
    const lane = this.lanes[laneName], limit = this.limits[laneName];
    if (this.cancelling) throw Error('Presentation cancellation cannot admit another delivery');
    if (!limit || this.barrier || !Number.isSafeInteger(units) || units <= 0 || units > limit.units - lane.units ||
        lane.entries.size >= limit.count || !Number.isSafeInteger(this.nextId + 1)) {
      this.fail(Error('Presentation consumption capacity or terminal ordering exceeded')); return;
    }
    const entry: Entry = { lane: laneName, token: Object.freeze({ owner: this.owner, epoch: this.epoch, id: ++this.nextId }), units,
      delivered: false, deferred: false, status: null, deadline: performance.now() + this.timeoutMs,
      cancel: null, acknowledge };
    lane.entries.set(entry.token.id, entry); lane.units += units;
    const receipt: PresentationReceipt = {
      defer: cancel => {
        if (!this.current(entry) || entry.delivered || entry.deferred || entry.status !== null || typeof cancel !== 'function')
          throw Error('Presentation receipt cannot be deferred');
        entry.deferred = true; entry.cancel = cancel; return entry.token;
      },
      complete: status => this.complete(entry.token, status),
      reject: error => { if (this.current(entry)) this.fail(error); },
    };
    try { dispatch(receipt); }
    catch (error) { if (this.current(entry)) this.fail(error); return; }
    if (!this.current(entry)) return;
    entry.delivered = true;
    // No presentation consumer is a discard, not a visual baseline-ready grant.
    if (!entry.deferred && entry.status === null) entry.status = 'discarded';
    this.flush();
  }

  /** Safe entry point for an actual Worker reply. It can only finish an existing
   * locally-issued receipt; it cannot choose which server sequence to ACK. */
  complete(token: PresentationReceiptToken, status: PresentationReceiptStatus): boolean {
    if (!token || token.owner !== this.owner || !Number.isSafeInteger(token.epoch) || token.epoch !== this.epoch || !Number.isSafeInteger(token.id) ||
        (status !== 'consumed' && status !== 'discarded')) return false;
    const entry = this.lanes.state.entries.get(token.id) ?? this.lanes.visual.entries.get(token.id)
      ?? this.lanes.motion.entries.get(token.id) ?? this.lanes.combat.entries.get(token.id);
    if (!entry || entry.status !== null) return false;
    entry.status = status; entry.cancel = null;
    if (entry.delivered) this.flush();
    return true;
  }

  /** Terminal reports must not overtake the final asynchronous retain. There is
   * one bounded callback, not an unbounded control-message or payload queue. */
  afterPending(key: string, callback: () => void): void {
    if (this.barrier) {
      if (this.barrier.key !== key) this.fail(Error('Conflicting pending presentation terminal'));
      return; // The relay may resend the same terminal while retaining its result.
    }
    if (this.retainedAll()) { callback(); return; }
    this.barrier = { key, finish: callback };
    this.schedule();
  }

  private retainedAll(): boolean {
    for (const lane of Object.values(this.lanes)) for (const entry of lane.entries.values())
      if (!entry.delivered || entry.status === null) return false;
    return true;
  }

  reset(): void {
    const wasCancelling = this.cancelling;
    const cancel: Array<() => void> = [];
    // Revoke tokens and clear all accounting BEFORE calling external cancellers.
    this.epoch++; this.barrier = null;
    clearTimeout(this.timer); this.timer = undefined;
    for (const lane of Object.values(this.lanes)) {
      for (const entry of lane.entries.values()) if (entry.cancel) cancel.push(entry.cancel);
      lane.entries.clear(); lane.units = 0;
    }
    this.cancelling = true;
    try { for (const callback of cancel) { try { callback(); } catch { this.cancellationErrors++; } } }
    finally { this.cancelling = wasCancelling; }
  }

  /** Component fallback discards only visual work, not unrelated full-state
   * credits. Already-consumed replies waiting on an earlier entry keep their status. */
  discardVisual(): void {
    const callbacks: Array<() => void> = [];
    for (const entry of this.lanes.visual.entries.values()) if (entry.status === null) {
      entry.status = 'discarded';
      if (entry.cancel) callbacks.push(entry.cancel);
      entry.cancel = null;
    }
    for (const cancel of callbacks) { try { cancel(); } catch { this.cancellationErrors++; } }
    this.flush();
  }

  private fail(error: unknown): void { this.reset(); this.onError(error); }

  private flush(): void {
    if (this.flushing) return;
    this.flushing = true;
    const epoch = this.epoch;
    try {
      for (const lane of Object.values(this.lanes)) {
        // Never skip an unfinished predecessor, even if later replies arrive first.
        for (const [id, entry] of lane.entries) {
          if (!entry.delivered || entry.status === null) break;
          const sent = entry.acknowledge(entry.status);
          if (epoch !== this.epoch) return; // Send/cancel hooks may re-enter.
          if (!sent) break;
          lane.entries.delete(id); lane.units -= entry.units;
        }
      }
      if (this.barrier && this.retainedAll()) {
        // Unsent ACKs need not delay an already-retained final world: ending
        // resets remote credits anyway. Never bypass actual consumption.
        const finish = this.barrier.finish; this.barrier = null; finish();
      }
    } catch (error) { if (epoch === this.epoch) this.fail(error); }
    finally { this.flushing = false; this.schedule(); }
  }

  private schedule(): void {
    clearTimeout(this.timer); this.timer = undefined;
    if (!this.pending) return;
    let deadline = Infinity, retry = false;
    for (const lane of Object.values(this.lanes)) {
      const first = lane.entries.values().next().value as Entry | undefined;
      if (first?.delivered && first.status !== null) retry = true;
      for (const entry of lane.entries.values()) deadline = Math.min(deadline, entry.deadline);
    }
    const epoch = this.epoch;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.epoch !== epoch) return;
      if (performance.now() >= deadline) { this.fail(Error('Presentation consumption timed out')); return; }
      this.flush();
    }, Math.max(0, Math.min(deadline - performance.now(), retry ? 50 : Infinity)));
  }
}
