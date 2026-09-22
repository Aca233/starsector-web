// Headless native replica for the existing real-transport room benchmark.
// Decoder and restore MUST share this bundle (PackedSnapshotNumbers identity).
import fs from 'node:fs/promises';
import path from 'node:path';
import { assetManager } from '../../src/engine/assets/AssetResolver';
import { createLanWorld } from '../../src/network/LanWorld';
import { decodeBinaryState } from '../../src/network/BinarySnapshot.mjs';
import { applyCombatSnapshots } from '../../src/network/CombatSnapshot';
import type { Match } from '../../src/network/protocol';

export async function createHeadlessReplica(assetRoot: string) {
  const root = path.resolve(assetRoot);
  globalThis.fetch = async (input: any) => {
    const file = path.resolve(root, String(input).replace(/^\//, ''));
    if (!file.startsWith(root + path.sep)) throw Error('Outside benchmark assets');
    return new Response(await fs.readFile(file));
  };
  await assetManager.ensureManifestLoaded();
  let engine: ReturnType<typeof createLanWorld>['engine'] | undefined;
  let reset = true;
  return {
    initialize(match: Match) { engine = createLanWorld(match).engine; reset = true; },
    decode: decodeBinaryState,
    reset() { reset = true; },
    apply(frame: any) {
      if (!engine) throw Error('Replica not initialized');
      applyCombatSnapshots(engine, [frame], reset, undefined, { nativeTargeting: true, nativeProjection: true });
      reset = false;
    },
  };
}
