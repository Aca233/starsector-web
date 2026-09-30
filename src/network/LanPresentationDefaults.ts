/** Shared with the real battle page: a Worker must not obtain an apparent
 * speedup by omitting identification or requesting cheaper context attributes. */
export const LAN_PRESENTATION_LAYERS: ReadonlySet<string> = new Set([
  'background', 'nebula', 'asteroid', 'trail', 'hull', 'weapon', 'beam', 'shield', 'explosion', 'identification',
]);
export const LAN_PRESENTATION_CONTEXT: Readonly<WebGLContextAttributes> = Object.freeze({
  alpha: false, antialias: true, powerPreference: 'high-performance',
});
