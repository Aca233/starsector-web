/** Self-contained display-v2 definitions. Content strings are the exact revision
 * identity, not peer-supplied hashes. Frame-local indices never need a prior ACK. */
export const DISPLAY_DEFINITION_LIMITS = Object.freeze({
  entries: 1024, characters: 1048576, nodes: 200000, depth: 32, key: 256,
  string: 65536, cacheEntries: 256, cacheCharacters: 2097152, cacheNodes: 400000,
});
export const forbiddenDefinitionKey = (key: string): boolean =>
  key === '__proto__' || key === 'constructor' || key === 'prototype';
// Lossless JSON grammar: primitives; [0, [[key,node],...]] object;
// [1, [node,...]] array; [2] undefined. User keys cannot masquerade as tags.
export interface DefinitionFragment { text: string; nodes: number; height: number }
