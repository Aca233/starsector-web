import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiDesignSignature, registerAiLoadout } from '../src/network/ai-loadouts.mjs';

const design = () => ({ version: 1, id: 'saved', name: '标准', hullId: 'onslaught', weapons: {}, hullMods: [], capacitors: 0, vents: 0, groups: [], updatedAt: 0 });
test('saved fits with different tactical or right-click systems never share an AI loadout', () => {
  const variants = [design(), {...design(), systemTypes: []}, {...design(), systemTypes: ['BURN_DRIVE']}, {...design(), rightClickSystemType: 'NONE'}];
  assert.equal(new Set(variants.map(aiDesignSignature)).size, variants.length);
  let options = { aiHulls: [[], []] };
  const keys = variants.map(d => { const result = registerAiLoadout(options, d); options = result.options; return result.key; });
  assert.equal(new Set(keys).size, variants.length);
  for (const [i, key] of keys.entries()) assert.equal(aiDesignSignature(options.aiLoadouts[key]), aiDesignSignature(variants[i]));
});
test('system slot order and module system edits are significant; cosmetic save identity is not', () => {
  const original = {...design(), systemTypes: ['ONE', 'TWO'], modules: {slot: design()}};
  assert.notEqual(aiDesignSignature(original), aiDesignSignature({...original, systemTypes: ['TWO', 'ONE']}));
  assert.notEqual(aiDesignSignature(original), aiDesignSignature({...original, modules: {slot: {...design(), systemTypes: []}}}));
  assert.notEqual(aiDesignSignature(original), aiDesignSignature({...original, modules: {slot: {...design(), rightClickSystemType: 'NONE'}}}));
  assert.equal(aiDesignSignature(original), aiDesignSignature({...original, id: 'another', name: '不同名称', updatedAt: 12}));
});
