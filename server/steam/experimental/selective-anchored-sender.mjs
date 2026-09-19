// Offline scheduling adapter: decide anchor/delta/full with the OLD codec costs,
// THEN choose a smaller representation for the full envelope. Commit the original
// logical choice, so encoding alone cannot lower the checkpoint threshold or
// change delta-vs-full selection. Native/application credit still uses ACTUAL
// packet bytes; this does NOT fabricate ACKs or reserve reference-size credit.
import { SteamAnchoredSender } from '../anchored-snapshots.mjs';
export class SteamSelectiveAnchoredSender extends SteamAnchoredSender {
  #originals = new WeakMap();
  prepare(text, encoder, codec, now = Date.now()) {
    const original = super.prepare(text, encoder, codec, now);
    if (!['anchor', 'snapshot'].includes(original.kind) || original.delta === true || typeof codec.selectFull !== 'function') return original;
    const prepared = codec.selectFull(original.prepared);
    if (prepared === original.prepared) return original;
    // Do not mutate the original choice or target.full shared by other peers.
    const wireChoice = { ...original, prepared };
    this.#originals.set(wireChoice, original);
    return wireChoice;
  }
  commit(choice) {
    const original = this.#originals.get(choice);
    if (!original) return super.commit(choice);
    this.#originals.delete(choice);
    // Parent checks WeakSet ownership, generation/revision, pending anchor and
    // one-time commit. Old choices still fail after reset or an anchor ACK.
    return super.commit(original);
  }
}
