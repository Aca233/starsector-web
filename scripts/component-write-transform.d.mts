/** Pre-transform for eligible TypeScript sources; deliberately conservative invalidation. */
export function componentWriteVitePlugin(): import('vite').Plugin;
export function componentWriteEsbuildPlugin(): import('esbuild').Plugin;
/**
 * Returns null for excluded files or when no safely instrumentable write is found.
 * Preserves native expression/receiver semantics; does not intercept dynamic aliases,
 * spread-hidden builtin targets, or receivers inside continuous optional chains.
 */
export function transformComponentWrites(code: string, file: string): string | null;
