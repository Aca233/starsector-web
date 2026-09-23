// Headless native replica for the existing real-transport room benchmark.
// Decoder and restore MUST share this bundle (PackedSnapshotNumbers identity).
import fs from 'node:fs/promises';
import path from 'node:path';
import { assetManager } from '../../src/engine/assets/AssetResolver';
import { createLanDisplayWorld } from '../../src/network/LanDisplayBootstrap';
import { decodeBinaryState } from '../../src/network/BinarySnapshot.mjs';
import { applyLanDisplaySnapshot } from '../../src/network/LanDisplaySnapshot';
import type { Match } from '../../src/network/protocol';

export async function createHeadlessReplica(assetRoot: string) {
  const root = path.resolve(assetRoot);
  globalThis.fetch = async (input: any) => {
    const file = path.resolve(root, String(input).replace(/^\//, ''));
    if (!file.startsWith(root + path.sep)) throw Error('Outside benchmark assets');
    return new Response(await fs.readFile(file));
  };
  await assetManager.ensureManifestLoaded();
  let engine: ReturnType<typeof createLanDisplayWorld>['world'] | undefined;
  let roster: Match | undefined;
  let reset = true;
  return {
    initialize(match: Match) { roster = match; engine = undefined; reset = true; },
    decode: decodeBinaryState,
    reset() { reset = true; },
    apply(frame: any) {
      if (!roster) throw Error('Replica not initialized');
      if (!engine) engine = createLanDisplayWorld(roster, 0, frame).world;
      else applyLanDisplaySnapshot(engine, frame, reset);
      reset = false;
    },
  };
}
